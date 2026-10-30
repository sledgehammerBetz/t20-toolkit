/**
 * Buscador de Magias — janela ApplicationV2 (Foundry V13).
 * Lê o índice dos compêndios, avalia cada magia contra as classes da ficha
 * e adiciona a magia escolhida à ficha com seus aprimoramentos.
 */
import { watchActor } from '../ui/live-refresh.js';
import { enrichDescription } from '../ui/enrich.js';
import { replaceKeepingPlace } from '../ui/render.js';
import { MODULE_ID } from '../../constants.js';
import { SPELL_TYPES, SPELL_SCHOOLS, CIRCLES, fold, escapeHtml, actorClasses, arcanistPaths, actorSpells, actorPowers } from '../core/t20.js';
import { buildCasterProfiles, evaluateSpell, learningCapacity, necromancerRatioOk, CASTER_CLASSES } from '../core/caster-rules.js';
import { getSpellCatalog } from '../core/spells/spell-catalog.js';
import { readSchools, casterContext } from '../core/caster-context.js';
import { refreshCompendiumIndex } from '../core/spell-index.js';
import { filterSpells, filterOptions, EMPTY_FILTERS } from '../core/spells/spell-filter.js';
import { spellFilterPanel, bindSpellFilterPanel, viaTags } from '../ui/spell-filter-panel.js';
import { toolFrame, onNavigate, switchTheme, reopen } from '../ui/frame.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
/** Rótulo traduzido de uma lista do CONFIG.T20 (ex.: timePeriods.inst → "Instantânea"). */
function t20Label(map, key) {
  if (!key) return '';
  const raw = globalThis.CONFIG?.T20?.[map]?.[key];
  const text = typeof raw === 'string' ? raw : raw?.label;
  return text ? game.i18n.localize(text) : key;
}
const STATUS_LABEL = { allowed: 'Pode aprender', review: 'Conferir', blocked: 'Fora da regra', owned: 'Na ficha' };

export { readSchools, casterContext };

export class BuscadorApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app'],
    tag: 'section',
    window: { title: 'Buscador de Magias', icon: 'fa-solid fa-book-open', resizable: true },
    position: { width: 1000, height: 720 },
    actions: {
      add: BuscadorApp.#onAdd,
      select: BuscadorApp.#onSelect,
      theme: BuscadorApp.#onTheme,
      t20nav: onNavigate,
      saveSchools: BuscadorApp.#onSaveSchools,
      saveDuplo: BuscadorApp.#onSaveDuplo,
      reload: BuscadorApp.#onReload,
      openSheet: BuscadorApp.#onOpenSheet,
      circle: BuscadorApp.#onCircle,
      toggleFilters: BuscadorApp.#onToggleFilters,
      clearFilters: BuscadorApp.#onClearFilters
    }
  };

  constructor({ actor = null, ...options } = {}) {
    super({ id: `t20tk-buscador-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this.filters = { ...EMPTY_FILTERS, panel: false, onlyAllowed: !!actor, hideOwned: false, selected: null };
    this.index = null;
    this.details = new Map();
    this._hooks = [];
  }

  get title() { return this.actor ? `Buscador de Magias — ${this.actor.name}` : 'Buscador de Magias'; }

  /* ---------- dados ---------- */

  async _prepareContext() {
    this.index ??= await getSpellCatalog();
    this.sfOptions ??= filterOptions(this.index.spells, this.index.packs);
    const ctx = this.actor ? casterContext(this.actor) : { classes: [], profiles: [], known: [], capacity: null };
    this.ctx = ctx;
    this._rows = null;
    return ctx;
  }

  /** Status de cada magia do índice para o personagem atual. */
  rows() {
    if (this._rows?.index === this.index) return this._rows.list;
    const ownedKeys = new Set(this.ctx.known.map(s => s.key));
    const ownedUuids = new Set(this.ctx.known.map(s => s.sourceUuid).filter(Boolean));
    const rows = this.index.spells.map(spell => {
      const owned = ownedUuids.has(spell.uuid) || ownedKeys.has(spell.key);
      const ev = this.actor ? evaluateSpell(spell, this.ctx.profiles) : { status: 'review', reasons: [] };
      if (this.actor && ev.status === 'allowed' && !necromancerRatioOk(this.ctx.capacity, spell)) {
        ev.status = 'review';
        ev.reasons = ['Necromante: com esta magia, menos da metade das suas magias seria de necromancia.'];
      }
      return { spell, owned, ...ev, status: owned ? 'owned' : ev.status };
    });
    this._rows = { index: this.index, list: rows, byUuid: new Map(rows.map(r => [r.spell.uuid, r])) };
    return rows;
  }

  /** Linha de uma magia (sem percorrer a lista). */
  row(uuid) {
    this.rows();
    return this._rows.byUuid.get(uuid);
  }

  /** Resultado dos filtros; o mesmo redesenho pede várias vezes (contagem, lista), então fica guardado até algo mudar. */
  filtered() {
    const st = this.filters;
    const rows = this.rows();
    const key = JSON.stringify({ ...st, selected: null, profileOpen: null, panel: null });
    if (this._filtered?.rows === rows && this._filtered.key === key) return this._filtered.list;
    const byUuid = this._rows.byUuid;
    const res = filterSpells(rows.map(r => r.spell), st);
    this.filterError = res.error || res.warning;
    const list = res.results.map(({ spell, via }) => ({ ...byUuid.get(spell.uuid), via })).filter(({ status, owned }) => {
      if (st.hideOwned && owned) return false;
      if (st.onlyAllowed && this.actor && !['allowed', 'review', 'owned'].includes(status)) return false;
      return true;
    });
    this._filtered = { rows, key, list };
    return list;
  }

  /* ---------- render ---------- */

  async _renderHTML(context) {
    const who = this.actor ? (this.ctx.classes.map(c => `${escapeHtml(c.name)} ${c.level}`).join(' / ') || 'sem classe') : '';
    return toolFrame({
      tool: 'buscador', actor: this.actor, who,
      eyebrow: 'Consulta', title: 'Buscador de Magias',
      subtitle: this.actor ? 'Veja o que o personagem pode aprender e adicione à ficha.' : 'Explore o catálogo. Abra pela ficha para conferir a classe.'
    }, `${this.#renderProfiles()}
      ${this.#renderFilters()}
      <div class="t20tk-bz-body">
        <ol class="t20tk-bz-list" data-region="results">${this.#renderResults()}</ol>
        <aside class="t20tk-bz-detail" data-region="detail">${this.#renderDetail()}</aside>
      </div>`);
  }

  _replaceHTML(result, content) {
    replaceKeepingPlace(content, result);
  }

  _onRender(context, options) {
    const root = this.element;
    root.querySelector('[data-region="profile"]')?.addEventListener('toggle', ev => { this.filters.profileOpen = ev.target.open; });
    bindSpellFilterPanel(root, this.filters, kind => (kind === 'query' ? this.#updateResults() : this.render()));
    for (const el of root.querySelectorAll('[data-filter]')) {
      el.addEventListener('change', () => {
        const key = el.dataset.filter;
        this.filters[key] = el.type === 'checkbox' ? el.checked : el.value;
        this.#updateResults();
      });
    }
  }

  _onFirstRender() {
    watchActor(this, { hooks: ['createItem', 'deleteItem', 'updateItem'] });
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  #updateResults() {
    const list = this.element?.querySelector('[data-region="results"]');
    if (list) list.innerHTML = this.#renderResults();
    const count = this.element?.querySelector('[data-sf-count]');
    if (count) count.textContent = this.#countText();
  }

  #renderProfiles() {
    if (!this.actor) return '';
    const { profiles, capacity } = this.ctx;
    if (!profiles.length) {
      return `<section class="t20tk-bz-profiles"><p class="t20tk-bz-warn">Nenhuma classe conjuradora reconhecida na ficha. Classes conhecidas: ${Object.values(CASTER_CLASSES).map(c => c.label).join(', ')}.</p>${this.#renderDuploPicker()}</section>`;
    }
    const cards = profiles.map(p => {
      const schools = p.schoolsRequired ? this.#renderSchoolPicker(p) : '';
      return `<div class="t20tk-bz-profile">
        <div class="t20tk-bz-profile-head"><strong>${escapeHtml(p.label)}</strong> <span>nível ${p.level}</span></div>
        <div class="t20tk-bz-facts">
          <span>Até o <b>${p.maxCircle}º</b> círculo</span>
          <span>Magias ${p.tradition === 'arc' ? 'arcanas' : 'divinas'}</span>
          ${p.usurper ? '' : `<span><b>${p.known}</b> magias pela regra</span>`}
          <span class="t20tk-bz-source">${escapeHtml(p.source)}</span>
        </div>
        ${p.warnings.map(w => `<p class="t20tk-bz-warn">${escapeHtml(w)}</p>`).join('')}
        ${p.notes.map(n => `<p class="t20tk-bz-note">${escapeHtml(n)}</p>`).join('')}
        ${schools}
      </div>`;
    }).join('');
    const cap = capacity;
    const capClass = cap.remaining < 0 ? 'is-over' : cap.remaining === 0 ? 'is-full' : '';
    const capText = cap.allowed
      ? `<b>${cap.current}</b> de <b>${cap.allowed}</b> magias na ficha · ${cap.remaining > 0 ? `${cap.remaining} para escolher` : cap.remaining === 0 ? 'lista completa' : `${-cap.remaining} acima da regra`}`
      : `<b>${cap.current}</b> magias na ficha`;
    const extraText = cap.extra ? ` · +${cap.extra} copiada${cap.extra > 1 ? 's' : ''} com Escriba Arcano (não conta${cap.extra > 1 ? 'm' : ''})` : '';
    const open = this.filters.profileOpen ?? profiles.some(p => p.warnings.length || (p.schoolsRequired && !p.schools));
    const summary = profiles.map(p => `${escapeHtml(p.label)} ${p.level} · até ${p.maxCircle}º`).join(' / ');
    return `<details class="t20tk-disclosure t20tk-profile-box" data-region="profile" ${open ? 'open' : ''}>
      <summary><span class="t20tk-profile-sum"><b>${summary}</b><span class="t20tk-bz-capacity ${capClass}">${capText}</span></span></summary>
      <div class="t20tk-disclosure-body"><section class="t20tk-bz-profiles">${cards}${this.#renderDuploPicker()}
        <div class="t20tk-bz-capacity ${capClass}">${extraText ? extraText.replace(/^ · /, '') + ' · ' : ''}<small>Magias ganhas por poderes ou raça também contam aqui; o mestre decide nesses casos.</small></div>
      </section></div>
    </details>`;
  }

  /** Duplo Feérico (Atlas de Arton p. 472): de que classe é a habilidade de 1º nível (só Magias vira perfil). */
  #renderDuploPicker() {
    if (!actorPowers(this.actor).some(p => fold(p.name) === 'duplo feerico')) return '';
    const cur = fold(this.actor.getFlag(MODULE_ID, 'duploFeericoClass') ?? '');
    const own = new Set(this.ctx.classes.map(c => c.key));
    const opts = Object.entries(CASTER_CLASSES).filter(([k, d]) => !own.has(k) && !d.usurper)
      .map(([k, d]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>Magias (${escapeHtml(d.label)})</option>`).join('');
    return `<fieldset class="t20tk-bz-schools"><legend>Duplo Feérico: habilidade de 1º nível de outra classe</legend>
      <div><select name="duplo-feerico"><option value="">Outra habilidade (sem magias)</option>${opts}</select></div>
      <button type="button" class="t20tk-ui-button" data-action="saveDuplo">Salvar</button></fieldset>`;
  }

  #renderSchoolPicker(p) {
    const chosen = new Set(p.schools ?? []);
    const boxes = Object.entries(SPELL_SCHOOLS).map(([k, v]) =>
      `<label><input type="checkbox" name="school-${p.id}" value="${k}" ${chosen.has(k) ? 'checked' : ''}> ${v}</label>`).join('');
    return `<fieldset class="t20tk-bz-schools"><legend>Escolas do ${escapeHtml(p.label)} (escolha ${p.schoolsRequired})</legend>
      <div>${boxes}</div>
      <button type="button" class="t20tk-ui-button" data-action="saveSchools" data-profile="${p.id}">Salvar escolas</button></fieldset>`;
  }

  #renderFilters() {
    const st = this.filters;
    const maxCircle = Math.max(0, ...(this.ctx?.profiles ?? []).map(p => p.maxCircle ?? 0));
    const extra = `${this.actor ? `<label class="t20tk-bz-check"><input type="checkbox" data-filter="onlyAllowed" ${st.onlyAllowed ? 'checked' : ''}> Só o que posso aprender</label>` : ''}
      <label class="t20tk-bz-check"><input type="checkbox" data-filter="hideOwned" ${st.hideOwned ? 'checked' : ''}> Ocultar as que já tenho</label>
      <button type="button" class="t20tk-ui-button" data-action="reload" title="Baixa os compêndios de novo do servidor (use se o mestre mudou algum compêndio)">Recarregar compêndios</button>`;
    return spellFilterPanel(st, this.sfOptions, { count: this.#countText(), maxCircle: this.actor && st.onlyAllowed ? maxCircle : 0, extra, packs: this.index.packs })
      + (this.filterError ? `<p class="t20tk-bz-warn t20tk-sf-error">${escapeHtml(this.filterError)}</p>` : '');
  }

  #countText() {
    const n = this.filtered().length;
    return `${n} magia${n === 1 ? '' : 's'}`;
  }

  #renderResults() {
    const rows = this.filtered();
    if (!this.index.spells.length) return `<li class="t20tk-bz-empty">Nenhuma magia encontrada nos compêndios. Confira se o sistema Tormenta20 está ativo.</li>`;
    if (!rows.length) return `<li class="t20tk-bz-empty">Nenhuma magia com esses filtros.</li>`;
    return rows.map(({ spell, status, reasons, via }) => {
      const selected = this.filters.selected === spell.uuid;
      const canAdd = this.actor?.isOwner && status !== 'owned' && (status !== 'blocked' || game.user.isGM);
      const addLabel = status === 'allowed' ? 'Adicionar' : 'Adicionar…';
      const line1 = [SPELL_TYPES[spell.type] ?? spell.type, SPELL_SCHOOLS[spell.school] ?? spell.school, spell.cost ? `${spell.cost} PM` : '', t20Label('abilityActivationTypes', spell.execution)].filter(Boolean).join(' • ');
      const line2 = [t20Label('distanceUnits', spell.range), spell.durationUnits ? t20Label('timePeriods', spell.durationUnits) : '', spell.resistance || 'Sem resistência'].filter(Boolean).join(' • ');
      return `<li class="t20tk-bz-row t20tk-card ${selected ? 'is-selected' : ''}" data-status="${status}">
        <button type="button" class="t20tk-bz-main" data-action="select" data-uuid="${spell.uuid}" aria-pressed="${selected}">
          <img src="${escapeHtml(spell.img)}" alt="" loading="lazy">
          <span class="t20tk-card-copy">
            <span class="t20tk-bz-name">${escapeHtml(spell.name)}</span>
            <span class="t20tk-card-meta">${escapeHtml(line1)}</span>
            <span class="t20tk-card-sub">${escapeHtml(line2)}</span>
            <span class="t20tk-card-source">${escapeHtml(spell.book || spell.packLabel)}</span>
            ${viaTags(via)}
          </span>
        </button>
        <span class="t20tk-card-side">
          <span class="t20tk-pill">${spell.circle ?? '?'}º</span>
          <span class="t20tk-bz-status" title="${escapeHtml(reasons.join(' '))}">${STATUS_LABEL[status]}</span>
          ${canAdd ? `<button type="button" class="t20tk-ui-button ${status === 'allowed' ? 't20tk-ui-button--primary' : ''}" data-action="add" data-uuid="${spell.uuid}">${addLabel}</button>` : ''}
        </span>
      </li>`;
    }).join('');
  }

  #renderDetail() {
    const uuid = this.filters.selected;
    if (!uuid) return `<p class="t20tk-bz-empty">Escolha uma magia na lista para ver a descrição e os aprimoramentos.</p>`;
    const d = this.details.get(uuid);
    if (!d) return `<p class="t20tk-bz-empty">Carregando…</p>`;
    if (d.error) return `<p class="t20tk-bz-warn">${escapeHtml(d.error)}</p>`;
    const row = this.row(uuid);
    const reasons = row?.reasons?.length ? `<ul class="t20tk-bz-reasons">${row.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '';
    const s = d.system;
    const metric = (k, v) => `<div class="t20tk-metric"><span>${k}</span><strong>${escapeHtml(v || '—')}</strong></div>`;
    const duration = s.duracao?.special || [s.duracao?.value, t20Label('timePeriods', s.duracao?.units)].filter(Boolean).join(' ');
    const more = [['Alvo', s.alvo], ['Área', s.area], ['Efeito', s.efeito], ['Fonte', s.source || d.pack]].map(([k, v]) => metric(k, v)).join('');
    const enh = d.enhancements.length
      ? `<div class="t20tk-enh">${d.enhancements.map(e => `<div class="t20tk-enh-row"><span class="t20tk-enh-cost">${e.cost ? `+${escapeHtml(e.cost)} PM` : 'Especial'}</span><div>${escapeHtml(e.text)}</div></div>`).join('')}</div>`
      : '<p class="t20tk-bz-note">Sem aprimoramentos cadastrados.</p>';
    return `<div class="t20tk-detail-head"><img src="${escapeHtml(d.img ?? row?.spell?.img ?? '')}" alt=""><div>
        <p class="t20tk-eyebrow">Detalhes da magia</p><h3>${escapeHtml(d.name)}</h3>
        <div class="t20tk-pills"><span class="t20tk-pill">${Number(s.circulo)}º círculo</span>${s.ativacao?.custo ? `<span class="t20tk-pill">${escapeHtml(s.ativacao.custo)} PM</span>` : ''}<span class="t20tk-pill">${escapeHtml(SPELL_TYPES[s.tipo] ?? s.tipo)}</span><span class="t20tk-pill">${escapeHtml(SPELL_SCHOOLS[s.escola] ?? s.escola)}</span></div>
      </div></div>
      ${reasons}
      <div class="t20tk-metrics">${metric('Execução', t20Label('abilityActivationTypes', s.ativacao?.execucao))}${metric('Alcance', t20Label('distanceUnits', s.alcance))}${metric('Duração', duration)}${metric('Resistência', s.resistencia?.txt || 'Sem resistência')}</div>
      <details class="t20tk-disclosure" open><summary>Descrição da magia</summary><div class="t20tk-disclosure-body t20tk-bz-description">${d.html}</div></details>
      <details class="t20tk-disclosure"><summary>Aprimoramentos <span class="t20tk-count">${d.enhancements.length}</span></summary><div class="t20tk-disclosure-body">${enh}</div></details>
      <details class="t20tk-disclosure"><summary>Mais características</summary><div class="t20tk-disclosure-body"><div class="t20tk-metrics">${more}</div></div></details>`;
  }

  async #loadDetail(uuid) {
    if (this.details.has(uuid)) return;
    try {
      const doc = await fromUuid(uuid);
      if (!doc) throw new Error('Magia não encontrada no compêndio.');
      const html = await enrichDescription(doc.system?.description?.value ?? '', doc);
      const enhancements = [...(doc.effects ?? [])]
        .filter(e => e.flags?.tormenta20?.onuse)
        .map(e => ({ cost: e.flags.tormenta20.custo, text: e.name }));
      this.details.set(uuid, { name: doc.name, img: doc.img, system: doc.system, html, enhancements, pack: doc.pack ?? '' });
    } catch (error) {
      this.details.set(uuid, { error: `Não foi possível abrir a magia: ${error.message}` });
    }
  }

  /** Abre o Buscador já na magia (usado pelo Usurpador e outras janelas). */
  async focusSpell(uuid, name = '') {
    Object.assign(this.filters, { ...EMPTY_FILTERS, panel: false, onlyAllowed: false, hideOwned: false, query: name, selected: uuid });
    await this.#loadDetail(uuid);
    await this.render({ force: true });
    this.bringToFront?.();
    this.element?.querySelector('.t20tk-bz-row.is-selected')?.scrollIntoView?.({ block: 'nearest' });
  }

  /* ---------- ações ---------- */

  static async #onSelect(event, target) {
    const uuid = target.dataset.uuid;
    this.filters.selected = uuid;
    this.element.querySelectorAll('.t20tk-bz-row').forEach(r => r.classList.toggle('is-selected', r.querySelector('[data-uuid]')?.dataset.uuid === uuid));
    const detail = this.element.querySelector('[data-region="detail"]');
    detail.innerHTML = this.#renderDetail();
    await this.#loadDetail(uuid);
    if (this.filters.selected === uuid) detail.innerHTML = this.#renderDetail();
  }

  static async #onAdd(event, target) {
    const uuid = target.dataset.uuid;
    const actor = this.actor;
    if (!actor?.isOwner) return ui.notifications.warn('Você não tem permissão para alterar esta ficha.');
    const row = this.row(uuid);
    if (!row || row.status === 'owned') return;
    const isGM = game.user.isGM;
    const warnings = [];
    if (row.status === 'blocked') {
      if (!isGM) return ui.notifications.warn(`${row.spell.name}: ${row.reasons.join(' ')} Peça ao mestre se houver exceção.`);
      warnings.push(...row.reasons);
    }
    if (row.status === 'review') warnings.push(...row.reasons);
    if (this.ctx.capacity.allowed && this.ctx.capacity.remaining <= 0) warnings.push(`A ficha já tem ${this.ctx.capacity.current} magias e a regra permite ${this.ctx.capacity.allowed}.`);
    if (warnings.length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: `Adicionar ${row.spell.name}?` },
        content: `<p>Confira antes de adicionar:</p><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul><p>Adicionar mesmo assim?</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    target.disabled = true;
    try {
      const doc = await fromUuid(uuid);
      if (!doc) throw new Error('Magia não encontrada no compêndio.');
      const data = game.items.fromCompendium(doc);
      const [created] = await actor.createEmbeddedDocuments('Item', [data]);
      ui.notifications.info(`${created?.name ?? row.spell.name} adicionada a ${actor.name}.`);
    } catch (error) {
      console.error('[T20 Toolkit] Falha ao adicionar magia:', error);
      ui.notifications.error(`Não foi possível adicionar a magia: ${error.message}`);
      target.disabled = false;
    }
  }

  static async #onSaveSchools(event, target) {
    const id = target.dataset.profile;
    const boxes = [...this.element.querySelectorAll(`input[name="school-${id}"]:checked`)].map(b => b.value);
    const def = CASTER_CLASSES[id];
    if (def?.schools && boxes.length !== def.schools) return ui.notifications.warn(`Escolha exatamente ${def.schools} escolas.`);
    const all = { ...readSchools(this.actor), [id]: boxes };
    await this.actor.setFlag(MODULE_ID, 'casting.schools', all);
    ui.notifications.info('Escolas salvas.');
    this.render();
  }

  static async #onSaveDuplo() {
    const value = this.element.querySelector('select[name="duplo-feerico"]')?.value ?? '';
    await this.actor.setFlag(MODULE_ID, 'duploFeericoClass', value);
    this.render();
  }

  static #onCircle(event, target) {
    this.filters.circle = target.dataset.circle ?? '';
    this.element.querySelectorAll('.t20tk-chip[data-action="circle"]').forEach(b => b.classList.toggle('is-on', b.dataset.circle === this.filters.circle));
    this.#updateResults();
  }

  static #onToggleFilters(event, target) {
    this.filters.panel = !this.filters.panel;
    target.setAttribute('aria-expanded', String(this.filters.panel));
    this.element.querySelector('.t20tk-filter-panel')?.toggleAttribute('hidden', !this.filters.panel);
  }

  static #onClearFilters() {
    Object.assign(this.filters, { query: '', circle: '', type: '', school: '', pack: '', hideOwned: false });
    this.render();
  }

  static async #onTheme(event, target) {
    await switchTheme(target.dataset.themeValue);
  }

  static async #onReload(event, target) {
    if (target) target.disabled = true;
    [this.index] = await Promise.all([getSpellCatalog({ refresh: true }), refreshCompendiumIndex()]);
    this.sfOptions = filterOptions(this.index.spells, this.index.packs);
    ui.notifications.info('Compêndios recarregados. Outras janelas do Toolkit já abertas veem a mudança quando forem reabertas.');
    this.render();
  }

  static #onOpenSheet() { this.actor?.sheet?.render(true); }
}

/** Abre (ou traz para frente) o Buscador do personagem. */
export async function openBuscador({ actor = null, focus = null, focusName = '' } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-buscador-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) {
    if (focus) { await existing.focusSpell(focus, focusName); return existing; }
    return reopen(existing);
  }
  const app = new BuscadorApp({ actor });
  if (focus) {
    await app.render({ force: true });
    await app.focusSpell(focus, focusName);
    return app;
  }
  await app.render({ force: true });
  return app;
}
