/**
 * Escriba Arcano — copiar magias de pergaminhos (do inventário) ou de grimórios de outros magos (compêndios).
 * Cria a magia na ficha com flags['t20-toolkit'].learnedBy = 'escriba', que o Buscador não conta no limite do nível.
 * Pergaminhos do sistema: item `consumivel` com system.tipo 'scroll' e flags.core.sourceId apontando para a magia.
 */
import { replaceKeepingPlace } from '../ui/render.js';
import { MODULE_ID } from '../../constants.js';
import { SPELL_SCHOOLS, SPELL_TYPES, escapeHtml, fold, actorClasses, arcanistPaths, actorSpells, hasPower, trainedSkillMatching } from '../core/t20.js';
import { buildCasterProfiles } from '../core/caster-rules.js';
import { getSpellCatalog, classifySpell } from '../core/spells/spell-catalog.js';
import { filterSpells, filterOptions, EMPTY_FILTERS } from '../core/spells/spell-filter.js';
import { spellFilterPanel, bindSpellFilterPanel, viaTags } from '../ui/spell-filter-panel.js';
import { getSpellIndex } from '../core/spell-index.js';
import { copyCost, checkRequirements, canCopy } from './escriba-rules.js';
import { toolFrame, onNavigate, switchTheme, reopen } from '../ui/frame.js';
import { cardHTML } from '../ui/components.js';
import { postCard } from '../ui/chat.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const money = n => `T$ ${Number(n).toLocaleString('pt-BR')}`;

export class EscribaApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-escriba-app'],
    tag: 'section',
    window: { title: 'Escriba Arcano', icon: 'fa-solid fa-feather', resizable: true },
    position: { width: 860, height: 720 },
    actions: {
      copy: EscribaApp.#onCopy,
      switchView: EscribaApp.#onTab,
      theme: EscribaApp.#onTheme,
      t20nav: onNavigate,
      openSheet: EscribaApp.#onOpenSheet
    }
  };

  constructor({ actor = null, ...options } = {}) {
    super({ id: `t20tk-escriba-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this.view = { tab: 'scrolls', query: '' };
    this.sf = { ...EMPTY_FILTERS, panel: false };
    this.index = null;
    this._hooks = [];
  }

  get title() { return this.actor ? `Escriba Arcano — ${this.actor.name}` : 'Escriba Arcano'; }

  async _prepareContext() {
    this.index ??= await getSpellIndex();
    this.catalog ??= await getSpellCatalog();
    this.sfOptions ??= filterOptions(this.catalog.spells.filter(s => ['arc', 'uni'].includes(s.type)), this.catalog.packs);
    const actor = this.actor;
    const classes = actorClasses(actor);
    const paths = arcanistPaths(actor);
    const arc = buildCasterProfiles({ classes, arcanistPaths: paths }).find(p => p.id === 'arcanista');
    const owned = actorSpells(actor);
    const req = checkRequirements({
      isMago: paths.includes('mago'),
      hasPower: hasPower(actor, 'Escriba Arcano'),
      scribeSkill: trainedSkillMatching(actor, 'escriba')
    });
    const byUuid = new Map(this.index.spells.map(s => [s.uuid, s]));
    const byKey = new Map(this.index.spells.map(s => [s.key, s]));
    const scrolls = [...(actor?.items ?? [])]
      .filter(i => i.type === 'consumivel' && i.system?.tipo === 'scroll')
      .map(i => {
        const spell = this.#scrollSpell(i, byUuid, byKey);
        return { item: i, spell };
      });
    this.ctxData = {
      arc, req, scrolls,
      maxCircle: arc?.maxCircle ?? 0,
      ownedKeys: new Set(owned.map(s => s.key)),
      gold: Number(actor?.system?.dinheiro?.tp) || 0,
      copied: owned.filter(s => s.learnedBy === 'escriba')
    };
    return this.ctxData;
  }

  /**
   * Descobre a magia de um pergaminho. O sistema cria o pergaminho a partir da magia da FICHA:
   * flags.core.sourceId = "Actor.x.Item.y" (a magia da ficha), e o nome vira "Pergaminho de <magia>".
   * Ordem: sourceId direto no compêndio → origem da magia da ficha → nome.
   */
  #scrollSpell(item, byUuid, byKey) {
    const src = item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? null;
    if (src && byUuid.has(src)) return byUuid.get(src);
    if (src) {
      let origin = null;
      try { origin = fromUuidSync(src); } catch { origin = null; }
      const originSrc = origin?._stats?.compendiumSource ?? origin?.flags?.core?.sourceId;
      if (originSrc && byUuid.has(originSrc)) return byUuid.get(originSrc);
      if (origin?.name && byKey.has(fold(origin.name))) return byKey.get(fold(origin.name));
    }
    const name = fold(item.name).replace(/^pergaminho\s*(de|da|do|:)?\s*/, '');
    if (byKey.has(name)) return byKey.get(name);
    // Último recurso: a magia de nome mais longo contido no nome do pergaminho.
    let best = null;
    for (const [key, sp] of byKey) if (name.endsWith(key) && (!best || key.length > best.key.length)) best = sp;
    return best;
  }

  async _renderHTML() {
    const c = this.ctxData;
    const frame = { tool: 'escriba', extra: 't20tk-es', actor: this.actor, who: c?.arc ? `${escapeHtml(c.arc.label)} ${c.arc.level} · até ${c.maxCircle}º círculo` : 'sem Arcanista', eyebrow: 'Magias e estudo', title: 'Escriba Arcano', subtitle: 'Copie magias de pergaminhos e grimórios para a ficha.' };
    if (!this.actor) return toolFrame({ ...frame, who: '' }, '<p class="t20tk-bz-empty">Abra pela ficha (botão Toolkit).</p>');
    const req = c.req.items.map(i => `<li data-ok="${i.ok}">${i.ok === true ? '✔' : i.ok === false ? '✘' : '?'} ${escapeHtml(i.label)}${i.note && i.ok !== true ? ` <small>${escapeHtml(i.note)}</small>` : ''}</li>`).join('');
    const reqNote = c.req.status === 'blocked'
      ? `<p class="t20tk-bz-warn">Faltam pré-requisitos. ${game.user.isGM ? 'Como mestre, você ainda pode copiar.' : 'Fale com o mestre.'}</p>` : '';
    return toolFrame(frame, `
      <section class="t20tk-bz-profiles"><div class="t20tk-bz-profile">
        <div class="t20tk-bz-profile-head"><strong>Escriba Arcano</strong> <span>JdA p. 38</span></div>
        <p class="t20tk-bz-note">Copie magias de pergaminhos e grimórios de outros magos: <b>1 dia de trabalho e T$ 250 por PM</b> da magia. Magias copiadas não ocupam as escolhas de nível.</p>
        <ul class="t20tk-es-req">${req}</ul>${reqNote}
        <div class="t20tk-bz-facts"><span>Dinheiro: <b>${money(c.gold)}</b></span><span>Já copiadas: <b>${c.copied.length}</b></span></div>
      </div></section>
      <nav class="t20tk-es-tabs">
        <button type="button" data-action="switchView" data-view="scrolls" aria-pressed="${this.view.tab === 'scrolls'}">Pergaminhos no inventário (${c.scrolls.length})</button>
        <button type="button" data-action="switchView" data-view="grimoire" aria-pressed="${this.view.tab === 'grimoire'}">Grimório de outro mago</button>
      </nav>
      ${this.view.tab === 'grimoire' ? spellFilterPanel(this.sf, this.sfOptions, { count: `${this.#rows().length} magias`, packs: this.catalog.packs }) : ''}
      <ol class="t20tk-bz-list t20tk-es-list" data-region="results">${this.#renderRows()}</ol>`);
  }

  #rows() {
    const c = this.ctxData;
    if (this.view.tab === 'scrolls') return c.scrolls.map(({ item, spell }) => ({ spell, label: item.name, scroll: item }));
    const res = filterSpells(this.catalog.spells.filter(s => ['arc', 'uni'].includes(s.type)), this.sf);
    return res.results.map(({ spell, via }) => ({ spell, via, label: spell.name }));
  }

  #renderRows() {
    const c = this.ctxData;
    const rows = this.#rows();
    if (!rows.length) return `<li class="t20tk-bz-empty">${this.view.tab === 'scrolls' ? 'Nenhum pergaminho no inventário. Pergaminhos são consumíveis do tipo "pergaminho".' : 'Nenhuma magia encontrada.'}</li>`;
    return rows.map(({ spell, label, scroll, via }) => {
      if (!spell) return `<li class="t20tk-bz-row" data-status="review"><span class="t20tk-bz-main" style="grid-template-columns: minmax(0,1fr)"><span class="t20tk-bz-name">${escapeHtml(label)}</span><span class="t20tk-bz-meta">Não encontrei a magia deste pergaminho nos compêndios.</span></span><span></span><span></span></li>`;
      const can = canCopy(spell, c);
      const cost = copyCost(spell.circle);
      const status = can.ok ? 'allowed' : 'blocked';
      const canClick = this.actor.isOwner && (can.ok || (game.user.isGM && !c.ownedKeys.has(spell.key)));
      return cardHTML({
        img: spell.img, status, nameHtml: `${escapeHtml(spell.name)}${scroll ? ' <small>(pergaminho)</small>' : ''}`,
        metaHtml: `${escapeHtml(SPELL_TYPES[spell.type] ?? '')} • ${escapeHtml(SPELL_SCHOOLS[spell.school] ?? '')}${cost ? ` • <b>${cost.days} dia${cost.days > 1 ? 's' : ''}</b> • <b>${money(cost.tibares)}</b>` : ''}`,
        sub: can.ok ? '' : can.reason, source: spell.book || spell.packLabel, metaExtra: viaTags(via),
        side: `<span class="t20tk-pill">${spell.circle}º</span><span class="t20tk-bz-status">${can.ok ? 'Pode copiar' : 'Fora da regra'}</span>${canClick ? `<button type="button" class="t20tk-ui-button ${can.ok ? 't20tk-ui-button--primary' : ''}" data-action="copy" data-uuid="${spell.uuid}" ${scroll ? `data-scroll="${scroll.id}"` : ''}>Copiar…</button>` : ''}`
      });
    }).join('');
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onRender() {
    bindSpellFilterPanel(this.element, this.sf, kind => {
      if (kind !== 'query') return this.render();
      this.element.querySelector('[data-region="results"]').innerHTML = this.#renderRows();
      const c = this.element.querySelector('[data-sf-count]'); if (c) c.textContent = `${this.#rows().length} magias`;
    });
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

  static #onTab(event, target) { this.view.tab = target.dataset.view; this.render(); }

  static async #onCopy(event, target) {
    const actor = this.actor;
    const c = this.ctxData;
    if (!actor?.isOwner) return ui.notifications.warn('Você não tem permissão para alterar esta ficha.');
    const spell = this.index.spells.find(s => s.uuid === target.dataset.uuid);
    if (!spell) return;
    const cost = copyCost(spell.circle);
    if (!cost) return ui.notifications.warn('Círculo da magia não identificado.');
    const can = canCopy(spell, c);
    const gm = game.user.isGM;
    if (!can.ok && !gm) return ui.notifications.warn(can.reason);
    if (c.req.status === 'blocked' && !gm) return ui.notifications.warn('Faltam pré-requisitos do Escriba Arcano.');
    const enough = c.gold >= cost.tibares;
    const warn = [...(can.ok ? [] : [can.reason]), ...c.req.items.filter(i => i.ok !== true).map(i => `${i.label}: ${i.ok === false ? 'não atende' : 'conferir'}`)];
    const content = `<p>Copiar <b>${escapeHtml(spell.name)}</b> (${spell.circle}º círculo, ${cost.pm} PM).</p>
      <p>Custo: <b>${cost.days} dia${cost.days > 1 ? 's' : ''} de trabalho</b> e <b>${money(cost.tibares)}</b> em matérias-primas.</p>
      ${warn.length ? `<ul>${warn.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="pay" ${enough ? 'checked' : 'disabled'}> Descontar ${money(cost.tibares)} do dinheiro (T$ ${c.gold} disponíveis)</label>
      ${gm ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="advance"> Avançar ${cost.days} dia${cost.days > 1 ? 's' : ''} no relógio do mundo</label>` : ''}
      ${enough ? '' : '<p><small>Dinheiro insuficiente em T$. Acerte o pagamento com o mestre.</small></p>'}`;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: 'Escriba Arcano' },
      content,
      buttons: [
        { action: 'ok', label: 'Copiar magia', default: true, callback: (ev, button) => ({ pay: !!button.form.elements.pay?.checked, advance: !!button.form.elements.advance?.checked }) },
        { action: 'cancel', label: 'Cancelar' }
      ],
      rejectClose: false
    });
    if (!choice || choice === 'cancel') return;
    try {
      const doc = await fromUuid(spell.uuid);
      if (!doc) throw new Error('Magia não encontrada no compêndio.');
      const data = game.items.fromCompendium(doc);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.learnedBy`, 'escriba');
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.learnedFrom`, target.dataset.scroll ? 'pergaminho' : 'grimorio');
      await actor.createEmbeddedDocuments('Item', [data]);
      if (choice.pay && enough) await actor.update({ 'system.dinheiro.tp': c.gold - cost.tibares });
      if (choice.advance && gm) await game.time.advance(cost.days * 86400);
      await postCard(actor, {
        tool: 'escriba', tone: 'success', title: `${spell.name} copiada`, subtitle: `${actor.name} · ${target.dataset.scroll ? 'de um pergaminho' : 'de um grimório'}`,
        items: [{ name: spell.name, img: spell.img, note: `${spell.circle}º círculo · ${SPELL_SCHOOLS[spell.school] ?? ''}` }],
        rows: [['Trabalho', `${cost.days} dia${cost.days > 1 ? 's' : ''}`], ['Custo', `${money(cost.tibares)}${choice.pay && enough ? ' (pago)' : ' (a acertar)'}`]],
        note: 'Magia copiada com Escriba Arcano: não ocupa as escolhas de nível.'
      });
      ui.notifications.info(`${spell.name} copiada para o grimório.`);
    } catch (error) {
      console.error('[T20 Toolkit] Escriba Arcano:', error);
      ui.notifications.error(`Não foi possível copiar: ${error.message}`);
    }
  }

  static async #onTheme(event, target) { await switchTheme(target.dataset.themeValue); }
  static #onOpenSheet() { this.actor?.sheet?.render(true); }
}

export async function openEscriba({ actor = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-escriba-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) return reopen(existing);
  const app = new EscribaApp({ actor });
  await app.render({ force: true });
  return app;
}
