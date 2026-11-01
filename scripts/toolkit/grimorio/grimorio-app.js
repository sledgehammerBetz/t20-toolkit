/**
 * Grimório do Mago — janela ApplicationV2 (Foundry V13).
 * Usa o campo nativo `system.preparada` das magias e a flag nativa `flags.tormenta20.mago`,
 * que fazem a ficha do Tormenta20 mostrar o sol de "preparada" em cada magia.
 * Estado próprio: flags['t20-toolkit'].grimorio = { lastStudyDay, lastStudyTime, memorized[] }.
 */
import { watchActor, COMBAT_PATHS } from '../ui/live-refresh.js';
import { replaceKeepingPlace } from '../ui/render.js';
import { getSpellCatalog, classifySpell } from '../core/spells/spell-catalog.js';
import { filterSpells, filterOptions, EMPTY_FILTERS } from '../core/spells/spell-filter.js';
import { spellFilterPanel, bindSpellFilterPanel, viaTags } from '../ui/spell-filter-panel.js';
import { MODULE_ID } from '../../constants.js';
import { postCard } from '../ui/chat.js';
import { SPELL_SCHOOLS, escapeHtml, actorSpells, arcanistPaths, actorClasses } from '../core/t20.js';
import { magoSpells, memorizationLimit, dayKey, validateStudy } from './grimorio-rules.js';
import { toolFrame, onNavigate, onTheme, reopen } from '../ui/frame.js';
import { readGrimorio, isMago } from './grimorio-state.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};

export function today() {
  return dayKey(game.time?.components, game.time?.worldTime);
}

export { readGrimorio, isMago };

export class GrimorioApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-grimorio-app'],
    tag: 'section',
    window: { title: 'Grimório', icon: 'fa-solid fa-book', resizable: true },
    position: { width: 720, height: 720 },
    actions: {
      study: GrimorioApp.#onStudy,
      release: GrimorioApp.#onRelease,
      t20nav: onNavigate,
      theme: onTheme,
      openSheet: GrimorioApp.#onOpenSheet,
      openBuscador: GrimorioApp.#onOpenBuscador
    }
  };

  constructor({ actor = null, ...options } = {}) {
    super({ id: `t20tk-grimorio-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this._hooks = [];
    this.sf = { ...EMPTY_FILTERS, panel: false };
  }

  get title() { return this.actor ? `Grimório — ${this.actor.name}` : 'Grimório'; }

  async _prepareContext() {
    const actor = this.actor;
    const all = actor ? actorSpells(actor).filter(s => s.type !== 'eng') : [];
    const known = magoSpells(all);
    const other = all.filter(s => !known.includes(s));
    const data = readGrimorio(actor);
    const day = today();
    this.ctxData = {
      known, other, data, day,
      limit: memorizationLimit(known.length),
      prepared: known.filter(s => s.prepared).length,
      studiedToday: data.lastStudyDay === day,
      mago: isMago(actor),
      level: actorClasses(actor).find(c => c.key === 'arcanista')?.level ?? null
    };
    return this.ctxData;
  }

  async _renderHTML() {
    const c = this.ctxData;
    const who = this.actor ? (c.mago ? `Arcanista (Mago)${c.level ? ` ${c.level}` : ''}` : 'não é Mago') : '';
    return toolFrame({ tool: 'grimorio', extra: 't20tk-gr', actor: this.actor, who, eyebrow: 'Magias e estudo', title: 'Grimório', subtitle: 'Escolha as magias memorizadas do dia (Arcanista Mago).' },
      this.actor ? this.#renderBody() : '');
  }

  #renderBody() {
    const c = this.ctxData;
    const notes = [];
    if (!c.mago) notes.push(`<p class="t20tk-bz-warn">O Grimório segue a regra do Arcanista <b>Mago</b>. Adicione o poder "Caminho do Arcanista: Mago" à ficha. ${game.user.isGM ? 'Como mestre, você ainda pode usar esta janela.' : ''}</p>`);
    if (!c.known.length) notes.push(`<p class="t20tk-bz-warn">Nenhuma magia arcana na ficha. <button type="button" class="t20tk-bz-link" data-action="openBuscador">Abrir o Buscador de Magias</button></p>`);
    const last = c.data.lastStudyDay
      ? (c.studiedToday ? '<b>Já estudou hoje.</b> Nova memorização só amanhã (no relógio do mundo).' : 'Pode estudar hoje.')
      : 'Ainda não estudou o grimório.';
    const status = `<section class="t20tk-bz-profiles">
      <div class="t20tk-bz-profile">
        <div class="t20tk-bz-profile-head"><strong>Memorização diária</strong> <span>JdA p. 37</span></div>
        <div class="t20tk-bz-facts">
          <span>Conhece <b>${c.known.length}</b> magias arcanas</span>
          <span>Pode memorizar <b>${c.limit}</b></span>
          <span>Memorizadas agora: <b>${c.prepared}</b></span>
        </div>
        <p class="t20tk-bz-note">Estude por 1 hora, uma vez por dia, e escolha metade das magias que conhece. Só as memorizadas podem ser lançadas. ${last}</p>
        ${notes.join('')}
      </div></section>`;

    const byCircle = new Map();
    for (const s of c.known) {
      const k = s.circle ?? 0;
      if (!byCircle.has(k)) byCircle.set(k, []);
      byCircle.get(k).push(s);
    }
    const locked = c.studiedToday && !game.user.isGM;
    // filtros compartilhados: as linhas fora do filtro ficam escondidas (não somem), para não perder a seleção
    const classified = c.known.map(s => classifySpell({ ...(s.item.toObject?.() ?? s.item), uuid: s.id }));
    this.sfOptions ??= filterOptions(classified, []);
    const res = filterSpells(classified, this.sf);
    const shown = new Map(res.results.map(r => [r.spell.uuid, r.via]));
    const isOn = s => (this.pending ? this.pending.has(s.id) : s.prepared);
    const groups = [...byCircle.entries()].sort((a, b) => a[0] - b[0]).map(([circle, list]) => {
      const visible = list.some(s => shown.has(s.id));
      const rows = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(s => `
        <li class="t20tk-bz-row t20tk-gr-row" data-status="${isOn(s) ? 'allowed' : 'owned'}" ${shown.has(s.id) ? '' : 'hidden'}>
          <label class="t20tk-gr-pick">
            <input type="checkbox" name="memorize" value="${s.id}" ${isOn(s) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <img src="${escapeHtml(s.item.img)}" alt="">
            <span class="t20tk-bz-name">${escapeHtml(s.name)}</span>
            <span class="t20tk-bz-meta">${escapeHtml(SPELL_SCHOOLS[s.school] ?? s.school ?? '')}${s.item.system?.ativacao?.custo ? ` · ${s.item.system.ativacao.custo} PM` : ''}</span>
          </label>
          ${viaTags(shown.get(s.id))}<span class="t20tk-bz-status">${s.prepared ? 'Memorizada' : ''}</span>
        </li>`).join('');
      return `<li class="t20tk-gr-group" ${visible ? '' : 'hidden'}><h4>${circle ? `${circle}º círculo` : 'Círculo não identificado'}</h4><ol class="t20tk-gr-list">${rows}</ol></li>`;
    }).join('');
    const other = c.other.length
      ? `<li class="t20tk-gr-group"><h4>Não entram na memorização</h4><p class="t20tk-bz-note">${c.other.map(s => escapeHtml(s.name)).join(', ')} (magias divinas de outra classe).</p></li>` : '';

    const gm = game.user.isGM;
    const footer = `<footer class="t20tk-gr-footer">
      <span data-region="counter" class="t20tk-gr-counter"></span>
      ${gm ? `<label class="t20tk-bz-check"><input type="checkbox" name="advanceTime"> Avançar 1 hora no relógio do mundo</label>` : ''}
      ${gm && c.studiedToday ? `<button type="button" class="t20tk-ui-button" data-action="release">Liberar novo estudo hoje</button>` : ''}
      <button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="study" ${locked || !this.actor.isOwner ? 'disabled' : ''}>Estudar grimório (1 hora)</button>
    </footer>`;
    const panel = c.known.length ? spellFilterPanel(this.sf, this.sfOptions, { count: `${res.results.length} de ${c.known.length} magias` }) + (res.error ? `<p class="t20tk-bz-warn t20tk-sf-error">${escapeHtml(res.error)}</p>` : '') : '';
    return `${status}${panel}<ol class="t20tk-gr-body">${groups}${other}</ol>${footer}`;
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onRender() {
    const root = this.element;
    const update = () => {
      const boxes = [...root.querySelectorAll('input[name="memorize"]')];
      this.pending = new Set(boxes.filter(b => b.checked).map(b => b.value));
      const n = this.pending.size;
      const limit = this.ctxData.limit;
      const counter = root.querySelector('[data-region="counter"]');
      if (counter) {
        counter.textContent = `Selecionadas: ${n} de ${limit}`;
        counter.classList.toggle('is-over', n > limit);
      }
      const full = n >= limit;
      const locked = this.ctxData.studiedToday && !game.user.isGM;
      for (const b of boxes) if (!locked) b.disabled = !b.checked && full;
    };
    root.querySelectorAll('input[name="memorize"]').forEach(b => b.addEventListener('change', update));
    update();
    bindSpellFilterPanel(root, this.sf, () => this.render());
  }

  _onFirstRender() {
    watchActor(this, { ignore: COMBAT_PATHS });
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  static async #onStudy() {
    const actor = this.actor;
    if (!actor?.isOwner) return ui.notifications.warn('Você não tem permissão para alterar esta ficha.');
    const c = this.ctxData;
    const selectedIds = [...this.element.querySelectorAll('input[name="memorize"]:checked')].map(b => b.value);
    const check = validateStudy({ selectedIds, known: c.known, lastStudyDay: c.data.lastStudyDay, today: c.day, isGM: game.user.isGM });
    if (!check.ok) return ui.notifications.warn(check.errors.join(' '));
    if (selectedIds.length < check.limit) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Memorizar menos magias?' },
        content: `<p>Você escolheu ${selectedIds.length} de ${check.limit} magias. Só poderá trocar amanhã. Continuar?</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    if (c.studiedToday && game.user.isGM) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Estudar de novo hoje?' },
        content: '<p>Este personagem já estudou hoje. Como mestre, você pode registrar um novo estudo. Continuar?</p>',
        rejectClose: false
      });
      if (!ok) return;
    }
    const chosen = new Set(selectedIds);
    const updates = c.known
      .filter(s => s.prepared !== chosen.has(s.id))
      .map(s => ({ _id: s.id, 'system.preparada': chosen.has(s.id) }));
    try {
      const flagUpdate = {
        [`flags.${MODULE_ID}.grimorio`]: { lastStudyDay: c.day, lastStudyTime: game.time.worldTime, memorized: selectedIds }
      };
      if (!actor.getFlag('tormenta20', 'mago')) flagUpdate['flags.tormenta20.mago'] = true; // liga o sol de "preparada" na ficha
      await Promise.all([updates.length ? actor.updateEmbeddedDocuments('Item', updates) : null, actor.update(flagUpdate)]);
      this.pending = null;
      const advance = this.element.querySelector('input[name="advanceTime"]')?.checked;
      if (advance && game.user.isGM) await game.time.advance(3600);
      const names = c.known.filter(s => chosen.has(s.id)).map(s => s.name);
      const memo = c.known.filter(s => chosen.has(s.id));
      await postCard(actor, {
        tool: 'grimorio', tone: 'success', title: 'Estudo do grimório', subtitle: `${actor.name} · 1 hora`,
        itemsTitle: `Memorizadas (${memo.length})`, items: memo.map(s => ({ name: s.name, img: s.item?.img, note: s.circle ? `${s.circle}º círculo` : '' })),
        note: memo.length ? '' : 'Nenhuma magia memorizada.'
      });
      ui.notifications.info(`${names.length} magia(s) memorizada(s).`);
    } catch (error) {
      console.error('[T20 Toolkit] Falha ao registrar o estudo:', error);
      ui.notifications.error(`Não foi possível registrar o estudo: ${error.message}`);
    }
  }

  static async #onRelease() {
    if (!game.user.isGM) return;
    await this.actor.update({ [`flags.${MODULE_ID}.grimorio.lastStudyDay`]: null });
    ui.notifications.info('Novo estudo liberado para hoje.');
  }


  static #onOpenSheet() { this.actor?.sheet?.render(true); }

  static #onOpenBuscador() { game.t20Toolkit?.buscador?.open({ actor: this.actor }); }
}

export async function openGrimorio({ actor = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-grimorio-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) return reopen(existing);
  const app = new GrimorioApp({ actor });
  await app.render({ force: true });
  return app;
}
