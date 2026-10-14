/**
 * Usurpador — Usurpar (lançar magia divina com Enganação) e Poder Capturado.
 * Estado: flags['t20-toolkit'].usurpador = { capture: { god, power, itemId, day, uses } }.
 * Magias usurpadas ficam na ficha com flags['t20-toolkit'].learnedBy = 'usurpar' para poder
 * usar a rolagem do próprio sistema (aprimoramentos, dano, PM); não contam como aprendidas.
 */
import { replaceKeepingPlace } from '../ui/render.js';
import { MODULE_ID } from '../../constants.js';
import { postCard, chatFlavor } from '../ui/chat.js';
import { SPELL_SCHOOLS, escapeHtml, fold, actorClasses, actorSpells } from '../core/t20.js';
import { buildCasterProfiles } from '../core/caster-rules.js';
import { getSpellCatalog, classifySpell } from '../core/spells/spell-catalog.js';
import { filterSpells, filterOptions, EMPTY_FILTERS } from '../core/spells/spell-filter.js';
import { spellFilterPanel, bindSpellFilterPanel, viaTags } from '../ui/spell-filter-panel.js';
import { getSpellIndex, getGrantedPowerIndex } from '../core/spell-index.js';
import { GRANTED_POWERS, POWER_ALIASES, usurpDC, captureDC, divineTheft, divineTheftEffect, usurpBonus } from './usurpador-rules.js';
import { today } from '../grimorio/grimorio-app.js';
import { toolFrame, onNavigate, switchTheme, reopen } from '../ui/frame.js';
import { cardHTML } from '../ui/components.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};

export class UsurpadorApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-usurpador-app'],
    tag: 'section',
    window: { title: 'Usurpador', icon: 'fa-solid fa-hand-sparkles', resizable: true },
    position: { width: 880, height: 740 },
    actions: {
      switchView: UsurpadorApp.#onSwitch,
      usurp: UsurpadorApp.#onUsurp,
      capture: UsurpadorApp.#onCapture,
      endCapture: UsurpadorApp.#onEndCapture,
      cleanup: UsurpadorApp.#onCleanup,
      theme: UsurpadorApp.#onTheme,
      t20nav: onNavigate,
      openSheet: UsurpadorApp.#onOpenSheet,
      openSpell: UsurpadorApp.#onOpenSpell
    }
  };

  constructor({ actor = null, ...options } = {}) {
    super({ id: `t20tk-usurpador-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this.view = { tab: 'usurpar', query: '', circle: '', holySymbol: false, god: '' };
    this.sf = { ...EMPTY_FILTERS, panel: false };
    this._hooks = [];
  }

  get title() { return this.actor ? `Usurpador — ${this.actor.name}` : 'Usurpador'; }

  async _prepareContext() {
    this.index ??= await getSpellIndex();
    this.catalog ??= await getSpellCatalog();
    this.sfOptions ??= filterOptions(this.catalog.spells.filter(s => ['div', 'uni'].includes(s.type)), this.catalog.packs);
    this.powers ??= await getGrantedPowerIndex();
    const actor = this.actor;
    const profile = buildCasterProfiles({ classes: actorClasses(actor) }).find(p => p.id === 'usurpador') ?? null;
    const state = actor?.getFlag?.(MODULE_ID, 'usurpador') ?? {};
    const capture = state.capture ?? null;
    const day = today();
    this.ctxData = {
      profile, day, capture,
      captureActive: !!capture && capture.day === day,
      usesToday: capture?.day === day ? (capture.uses ?? 0) : 0,
      skill: Number(actor?.system?.pericias?.enga?.value) || 0,
      armorPenalty: Number(actor?.pda) || 0,
      borrowed: actorSpells(actor).filter(s => s.learnedBy === 'usurpar')
    };
    return this.ctxData;
  }

  /** Poderes do deus: nome do livro → item do compêndio (com apelidos). */
  powersOf(god) {
    const byKey = new Map(this.powers.map(p => [p.key, p]));
    return (GRANTED_POWERS[god] ?? []).map(name => {
      const found = byKey.get(fold(POWER_ALIASES[name] ?? name)) ?? byKey.get(fold(name)) ?? null;
      const owned = [...(this.actor?.items ?? [])].some(i => i.type === 'poder' && fold(i.name) === fold(found?.name ?? name));
      return { name, found, owned };
    });
  }

  async _renderHTML() {
    const c = this.ctxData;
    const frame = { tool: 'usurpador', extra: 't20tk-us', actor: this.actor, who: c?.profile ? `Usurpador ${c.profile.level} · até ${c.profile.maxCircle}º círculo` : (this.actor ? 'sem a classe Usurpador' : ''), eyebrow: 'Mecânicas especiais', title: 'Usurpador', subtitle: 'Lance magias divinas com Enganação e capture poderes concedidos.' };
    if (!this.actor) return toolFrame(frame, '');
    const warn = c.profile ? '' : `<p class="t20tk-bz-warn">A ficha não tem a classe <b>Usurpador</b> (Heróis de Arton). ${game.user.isGM ? 'Como mestre, você ainda pode usar esta janela.' : ''}</p>`;
    const summary = `<section class="t20tk-bz-profiles"><div class="t20tk-bz-profile">
      <div class="t20tk-bz-profile-head"><strong>Usurpador</strong> <span>Heróis de Arton p. 40</span></div>
      <div class="t20tk-bz-facts">
        <span>Enganação <b>${c.skill >= 0 ? '+' : ''}${c.skill}</b></span>
        <span>Penalidade de armadura <b>${c.armorPenalty}</b></span>
        ${c.profile && c.profile.level >= 20 ? '<span><b>Roubo Divino</b> ativo</span>' : ''}
        ${c.borrowed.length ? `<span>${c.borrowed.length} magia(s) usurpada(s) na ficha <button type="button" class="t20tk-bz-link" data-action="cleanup">remover</button></span>` : ''}
      </div>${warn}</div></section>`;
    const tabs = `<nav class="t20tk-es-tabs">
      <button type="button" data-action="switchView" data-view="usurpar" aria-pressed="${this.view.tab === 'usurpar'}">Usurpar</button>
      <button type="button" data-action="switchView" data-view="capturado" aria-pressed="${this.view.tab === 'capturado'}">Poder Capturado</button>
    </nav>
    ${this.view.tab === 'usurpar' ? spellFilterPanel(this.sf, this.sfOptions, { maxCircle: this.ctxData.profile?.maxCircle ?? 0, packs: this.catalog.packs, placeholder: 'Buscar magia divina…', extra: `<label class="t20tk-bz-check"><input type="checkbox" name="holySymbol" ${this.view.holySymbol ? 'checked' : ''}> Símbolo sagrado visível (−5)</label>` }) : ''}`;
    const body = this.view.tab === 'usurpar'
      ? `<ol class="t20tk-bz-list t20tk-es-list" data-region="results">${this.#renderSpells()}</ol>`
      : this.#renderCapture();
    return toolFrame(frame, `${summary}${tabs}${body}`);
  }

  #renderSpells() {
    const c = this.ctxData;
    const max = c.profile?.maxCircle ?? (game.user.isGM ? 5 : 0);
    const res = filterSpells(this.catalog.spells.filter(s => (s.type === 'div' || s.type === 'uni') && s.circle && s.circle <= max), this.sf);
    const viaOf = new Map(res.results.map(r => [r.spell.uuid, r.via]));
    const rows = res.results.map(r => r.spell);
    if (!rows.length) return `<li class="t20tk-bz-empty">Nenhuma magia divina disponível.</li>`;
    const bonus = usurpBonus({ skill: c.skill, armorPenalty: c.armorPenalty, holySymbol: this.view.holySymbol });
    return rows.map(s => {
      const dc = usurpDC(s.cost);
      const need = dc - bonus;
      const chance = Math.max(0, Math.min(20, 21 - need)) * 5;
      return cardHTML({
        img: s.img, name: s.name, status: 'allowed', action: 'openSpell', uuid: s.uuid,
        metaHtml: `${escapeHtml(SPELL_SCHOOLS[s.school] ?? '')} • ${s.cost ?? '?'} PM • <b>CD ${dc}</b>`,
        source: s.book || s.packLabel, metaExtra: viaTags(viaOf.get(s.uuid)),
        side: `<span class="t20tk-pill">${s.circle}º</span><span class="t20tk-bz-status" title="Chance no d20 com Enganação ${bonus >= 0 ? '+' : ''}${bonus}">${chance}%</span>${this.actor.isOwner ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="usurp" data-uuid="${s.uuid}">Usurpar…</button>` : ''}`
      });
    }).join('');
  }

  #renderCapture() {
    const c = this.ctxData;
    const lvl = c.profile?.level ?? 0;
    if (lvl < 4 && !game.user.isGM) return `<p class="t20tk-bz-empty">Poder Capturado chega no 4º nível de Usurpador.</p>`;
    const status = c.captureActive
      ? `<p class="t20tk-bz-note">Hoje: devoto de <b>${escapeHtml(c.capture.god)}</b>, com <b>${escapeHtml(c.capture.power)}</b>. Usos hoje: ${c.usesToday}. <button type="button" class="t20tk-bz-link" data-action="endCapture">encerrar</button></p>`
      : c.capture ? `<p class="t20tk-bz-warn">O poder capturado de ontem (${escapeHtml(c.capture.power)}) expirou. <button type="button" class="t20tk-bz-link" data-action="endCapture">remover da ficha</button></p>` : '';
    const gods = Object.keys(GRANTED_POWERS).map(g => `<option value="${g}" ${this.view.god === g ? 'selected' : ''}>${g}</option>`).join('');
    const powers = this.view.god ? this.powersOf(this.view.god).map(p => {
      const ok = p.found && !p.owned;
      return cardHTML({
        img: p.found?.img, name: p.found?.name ?? p.name, status: ok ? 'allowed' : 'blocked',
        meta: p.found ? p.found.packLabel : 'Não está nos compêndios instalados', sub: p.owned ? 'Já está na ficha' : '',
        side: `<span class="t20tk-bz-status">${ok ? 'Disponível' : '—'}</span>${ok && this.actor.isOwner ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="capture" data-uuid="${p.found.uuid}">Capturar…</button>` : ''}`
      });
    }).join('') : '';
    return `<section class="t20tk-us-capture">
      <p class="t20tk-bz-note">Escolha um deus, gaste 1 hora e faça Enganação <b>CD ${captureDC(c.usesToday)}</b> (+5 a cada uso no mesmo dia). Passou: você conta como devoto desse deus e recebe um poder concedido dele até o fim do dia (confira os pré-requisitos). Não precisa seguir as Obrigações & Restrições.</p>
      ${status}
      <label class="t20tk-bz-check">Deus: <select name="god"><option value="">— escolha —</option>${gods}</select></label>
      <ol class="t20tk-bz-list t20tk-es-list">${powers}</ol>
    </section>`;
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onRender() {
    const root = this.element;
    bindSpellFilterPanel(root, this.sf, kind => (kind === 'query' ? (root.querySelector('[data-region="results"]').innerHTML = this.#renderSpells()) : this.render()));
    root.querySelector('[name="holySymbol"]')?.addEventListener('change', ev => {
      this.view.holySymbol = ev.target.checked;
      root.querySelector('[data-region="results"]').innerHTML = this.#renderSpells();
    });
    root.querySelector('[name="god"]')?.addEventListener('change', ev => { this.view.god = ev.target.value; this.render(); });
  }

  _onFirstRender() {
    const refresh = (doc) => { const a = doc?.parent ?? doc; if (a === this.actor && this.rendered) this.render(); };
    for (const hook of ['createItem', 'deleteItem', 'updateItem', 'updateActor']) this._hooks.push([hook, Hooks.on(hook, refresh)]);
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  /** Rola Enganação com o bônus da ficha (sem escolher 10). */
  async #rollDeception(dc, flavor) {
    const c = this.ctxData;
    const bonus = usurpBonus({ skill: c.skill, armorPenalty: c.armorPenalty, holySymbol: this.view.tab === 'usurpar' && this.view.holySymbol });
    const roll = await new Roll(`1d20 ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`).evaluate();
    const success = roll.total >= dc;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: chatFlavor({ tool: 'usurpador', title: flavor, result: `Enganação CD ${dc} · ${success ? 'sucesso' : 'falha'}`, tone: success ? 'success' : 'error' })
    });
    return { roll, success };
  }

  /** Substitui (não mescla) o registro do poder capturado. */
  async #saveCapture(capture) {
    await this.actor.unsetFlag(MODULE_ID, 'usurpador');
    if (capture) await this.actor.setFlag(MODULE_ID, 'usurpador', { capture });
  }

  static #onSwitch(event, target) { this.view.tab = target.dataset.view; this.render(); }

  static async #onUsurp(event, target) {
    const actor = this.actor;
    if (!actor?.isOwner) return;
    const spell = this.index.spells.find(s => s.uuid === target.dataset.uuid);
    if (!spell) return;
    const stale = actor.effects?.filter(e => e.getFlag?.(MODULE_ID, 'temp') === 'roubo-divino').map(e => e.id) ?? [];
    if (stale.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stale);
    const extra = await foundry.applications.api.DialogV2.wait({
      window: { title: `Usurpar ${spell.name}` },
      content: `<p>Enganação CD 20 + custo em PM. Se falhar, a magia é perdida e os PM são gastos.</p>
        <label style="display:flex;gap:6px;align-items:center">PM extras de aprimoramentos que pretende usar: <input type="number" name="extra" value="0" min="0" style="width:60px"></label>`,
      buttons: [
        { action: 'ok', label: 'Rolar Enganação', default: true, callback: (ev, button) => Number(button.form.elements.extra.value) || 0 },
        { action: 'cancel', label: 'Cancelar' }
      ],
      rejectClose: false
    });
    if (extra === null || extra === 'cancel' || extra === undefined) return;
    const cost = (spell.cost ?? 0) + extra;
    const dc = usurpDC(spell.cost, extra);
    const { roll, success } = await this.#rollDeception(dc, `Usurpar: ${spell.name}`);
    if (!success) {
      if (cost > 0 && typeof actor.spendMana === 'function') await actor.spendMana(cost);
      await postCard(actor, { tool: 'usurpador', tone: 'error', title: 'Magia perdida', items: [{ name: spell.name, img: spell.img, note: `${cost} PM gastos mesmo assim` }] });
      return;
    }
    const theft = divineTheft(this.ctxData.profile?.level ?? 0, roll.total);
    let theftEffect = null;
    try {
      let item = actor.items.find(i => i.type === 'magia' && fold(i.name) === spell.key);
      if (!item) {
        const doc = await fromUuid(spell.uuid);
        const data = game.items.fromCompendium(doc);
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.learnedBy`, 'usurpar');
        [item] = await actor.createEmbeddedDocuments('Item', [data]);
      }
      if (theft) {
        [theftEffect] = await actor.createEmbeddedDocuments('ActiveEffect', [divineTheftEffect(theft, item.name, item.img)]);
        await postCard(actor, { tool: 'usurpador', tone: 'success', title: 'Roubo Divino', rows: [['Magia', item.name], ['Custo', `−${theft} PM`], ['CD', `+${theft}`]], note: 'Já vem marcado na janela de conjuração.' });
      }
      await item.roll();
    } catch (error) {
      console.error('[T20 Toolkit] Usurpar:', error);
      ui.notifications.error(`Não foi possível lançar a magia: ${error.message}`);
    } finally {
      if (theftEffect) await theftEffect.delete().catch(() => {});
    }
  }

  static async #onCapture(event, target) {
    const actor = this.actor;
    const c = this.ctxData;
    const power = this.powers.find(p => p.uuid === target.dataset.uuid);
    if (!actor?.isOwner || !power) return;
    const dc = captureDC(c.usesToday);
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Poder Capturado' },
      content: `<p>Gastar 1 hora para capturar <b>${escapeHtml(power.name)}</b> de <b>${escapeHtml(this.view.god)}</b>? Enganação CD ${dc}.</p><p><small>Confira os pré-requisitos do poder.</small></p>`,
      rejectClose: false
    });
    if (!ok) return;
    const { success } = await this.#rollDeception(dc, `Poder Capturado: ${power.name} (${this.view.god})`);
    const uses = c.usesToday + 1;
    if (!success) {
      // Falhou: mantém o poder de hoje (se houver) e só conta o uso.
      await this.#saveCapture(c.captureActive ? { ...c.capture, uses } : { day: c.day, uses });
      return;
    }
    if (c.capture?.itemId) await actor.items.get(c.capture.itemId)?.delete();
    const doc = await fromUuid(power.uuid);
    const data = game.items.fromCompendium(doc);
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.capturedBy`, 'usurpador');
    const [item] = await actor.createEmbeddedDocuments('Item', [data]);
    await this.#saveCapture({ god: this.view.god, power: power.name, itemId: item.id, day: c.day, uses });
    await postCard(actor, { tool: 'usurpador', tone: 'success', title: 'Poder Capturado', subtitle: `devoto de ${this.view.god} até o fim do dia`, items: [{ name: power.name, img: item.img }] });
  }

  static async #onEndCapture() {
    const c = this.ctxData;
    if (c.capture?.itemId) await this.actor.items.get(c.capture.itemId)?.delete();
    await this.#saveCapture(c.captureActive ? { day: c.day, uses: c.usesToday } : null);
  }

  static async #onCleanup() {
    const ids = this.ctxData.borrowed.map(s => s.id);
    if (ids.length) await this.actor.deleteEmbeddedDocuments('Item', ids);
  }

  static async #onTheme(event, target) { await switchTheme(target.dataset.themeValue); }
  static #onOpenSheet() { this.actor?.sheet?.render(true); }

  /** Clique na magia: abre o Buscador nela (descrição e aprimoramentos). */
  static async #onOpenSpell(event, target) {
    const spell = this.catalog?.byUuid?.get(target.dataset.uuid);
    const { openBuscador } = await import('../buscador/buscador-app.js');
    await openBuscador({ actor: this.actor, focus: target.dataset.uuid, focusName: spell?.name ?? '' });
  }
}

export async function openUsurpador({ actor = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-usurpador-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) return reopen(existing);
  const app = new UsurpadorApp({ actor });
  await app.render({ force: true });
  return app;
}
