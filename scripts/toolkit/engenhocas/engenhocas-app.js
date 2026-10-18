/**
 * Engenhocas — janela do Toolkit (feita do zero na 0.6.0).
 * Bancada: engenhocas da ficha (ativar, consertar, novo dia, desmontar).
 * Oficina: fabricar engenhocas a partir das magias dos compêndios.
 * Aparatos: instalar e remover aparatos (Heróis de Arton).
 */
import { watchActor } from '../ui/live-refresh.js';
import { enrichDescription } from '../ui/enrich.js';
import { replaceKeepingPlace } from '../ui/render.js';
import { SPELL_TYPES, SPELL_SCHOOLS, CIRCLES, escapeHtml, fold } from '../core/t20.js';
import { getSpellCatalog } from '../core/spells/spell-catalog.js';
import { filterSpells, filterOptions, EMPTY_FILTERS } from '../core/spells/spell-filter.js';
import { spellFilterPanel, bindSpellFilterPanel, viaTags } from '../ui/spell-filter-panel.js';
import { toolFrame, onNavigate, switchTheme } from '../ui/frame.js';
import { metric, pill } from '../ui/components.js';
import { APARATOS, APARATO_BY_ID, CRAFTABLE_TYPES, craftCheck, activationDC, aparatoBlocker, engenhocaState } from './engenhocas-rules.js';
import { actorInventor, actorEngenhocas, craftEngenhoca, activateEngenhoca, repairEngenhoca, newDay, newScene, dismantleEngenhoca, installAparato, removeAparato, couplingArmors, automatoUsed, coupleEngenhoca, uncoupleEngenhoca, syncEngenhocas, activationSubstitutes } from './engenhocas-actions.js';
import { COUPLE_PRICE, coupleBlocker } from './engenhocas-rules.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};

function t20Label(map, key) {
  if (!key) return '';
  const raw = globalThis.CONFIG?.T20?.[map]?.[key];
  const text = typeof raw === 'string' ? raw : raw?.label;
  return text ? game.i18n.localize(text) : key;
}

const VIEWS = [['bancada', 'Bancada'], ['oficina', 'Oficina'], ['aparatos', 'Aparatos']];

export class EngenhocasApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-engenhocas-app'],
    tag: 'section',
    window: { title: 'Engenhocas', icon: 'fa-solid fa-gears', resizable: true },
    position: { width: 1040, height: 760 },
    actions: {
      view: EngenhocasApp.#onView,
      select: EngenhocasApp.#onSelect,
      circle: EngenhocasApp.#onCircle,
      toggleFilters: EngenhocasApp.#onToggleFilters,
      clearFilters: EngenhocasApp.#onClearFilters,
      craft: EngenhocasApp.#onCraft,
      activate: EngenhocasApp.#onActivate,
      repair: EngenhocasApp.#onRepair,
      dismantle: EngenhocasApp.#onDismantle,
      newDay: EngenhocasApp.#onNewDay,
      newScene: EngenhocasApp.#onNewScene,
      pickAparato: EngenhocasApp.#onPickAparato,
      install: EngenhocasApp.#onInstall,
      removeAparato: EngenhocasApp.#onRemoveAparato,
      openItem: EngenhocasApp.#onOpenItem,
      couple: EngenhocasApp.#onCouple,
      uncouple: EngenhocasApp.#onUncouple,
      theme: EngenhocasApp.#onTheme,
      t20nav: onNavigate,
      openSheet: EngenhocasApp.#onOpenSheet
    }
  };

  constructor({ actor = null, view = null, ...options } = {}) {
    super({ id: `t20tk-engenhocas-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this.sf = { ...EMPTY_FILTERS, panel: false };
    this.ui = { view: view ?? (actor && actorEngenhocas(actor).length ? 'bancada' : 'oficina'), hideMade: false, spell: null, item: null, aparato: null, targets: [], name: '', mode: 'hand', pay: true, roll: true };
    this.index = null;
    this.details = new Map();
    this._hooks = [];
  }

  get title() { return this.actor ? `Engenhocas — ${this.actor.name}` : 'Engenhocas'; }

  async _prepareContext() {
    this.index ??= await getSpellCatalog();
    this.sfOptions ??= filterOptions(this.index.spells.filter(s => CRAFTABLE_TYPES.includes(s.type)), this.index.packs);
    return {};
  }

  /* ---------- dados ---------- */

  inv() { return this.actor ? actorInventor(this.actor) : null; }
  items() { return this.actor ? actorEngenhocas(this.actor) : []; }

  spells() {
    const inv = this.inv();
    const made = new Set(this.items().map(i => fold(engenhocaState(i).spellName)));
    const craftable = (this.index?.spells ?? []).filter(s => CRAFTABLE_TYPES.includes(s.type));
    const res = filterSpells(craftable, this.sf);
    this.filterError = res.error || res.warning;
    return res.results.filter(({ spell }) => !(this.ui.hideMade && made.has(spell.key)))
      .map(({ spell, via }) => ({ spell, via, check: craftCheck(spell, { inventorLevel: inv?.level ?? 0, goblinoide: inv?.goblinoide, owned: this.items().length, limit: inv?.limit ?? 0 }), made: made.has(spell.key) }));
  }

  /* ---------- render ---------- */

  async _renderHTML() {
    const inv = this.inv();
    const who = inv ? (inv.level ? `Inventor ${inv.level}` : 'sem nível de inventor') : '';
    const seg = `<div class="t20tk-es-tabs" role="tablist">${VIEWS.map(([id, label]) => `<button type="button" role="tab" data-action="view" data-view="${id}" aria-pressed="${this.ui.view === id}">${label}${id === 'bancada' && this.actor ? ` <span class="t20tk-count">${this.items().length}</span>` : ''}</button>`).join('')}${this.ui.view === 'bancada' && this.actor ? '<span class="t20tk-eng-tools"><button type="button" class="t20tk-ui-button" data-action="newDay" title="Zera as ativações do dia e a refrigeração">☀ Novo dia</button><button type="button" class="t20tk-ui-button" data-action="newScene" title="Libera os Supressores de Segurança">Nova cena</button></span>' : ''}</div>`;
    const body = this.ui.view === 'oficina' ? this.#renderOficina() : this.ui.view === 'aparatos' ? this.#renderAparatos() : this.#renderBancada();
    return toolFrame({
      tool: 'engenhocas', extra: 't20tk-eng', actor: this.actor, who,
      eyebrow: 'Mecânicas especiais', title: 'Engenhocas',
      subtitle: 'Fabrique, ative e mantenha as invenções do inventor (Engenhoqueiro, JdA p. 70).'
    }, `${this.#renderStatus(inv)}${seg}${body}`);
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onRender() {
    const root = this.element;
    bindSpellFilterPanel(root, this.sf, kind => {
      if (kind !== 'query') return this.render();
      const list = root.querySelector('[data-region="results"]');
      if (list) list.innerHTML = this.#renderSpellRows();
      const c = root.querySelector('[data-sf-count]'); if (c) c.textContent = `${this.spells().length} magias`;
    });
    for (const el of root.querySelectorAll('[data-ui]')) {
      el.addEventListener('change', () => {
        const key = el.dataset.ui;
        if (key === 'target') {
          const set = new Set(this.ui.targets);
          el.checked ? set.add(el.value) : set.delete(el.value);
          this.ui.targets = [...set];
        } else this.ui[key] = el.type === 'checkbox' ? el.checked : el.value;
        if (['hideMade', 'target', 'mode'].includes(key)) this.render();
      });
    }
  }

  _onFirstRender() {
    watchActor(this);
    syncEngenhocas(this.actor).catch(error => console.warn('[T20 Toolkit] Não deu para acertar as engenhocas da ficha:', error));
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  #renderStatus(inv) {
    if (!this.actor) return '<p class="t20tk-bz-warn t20tk-eng-status">Abra pela ficha de um inventor (botão Toolkit) para fabricar e ativar. Sem personagem, a Oficina mostra só o catálogo.</p>';
    const warns = [];
    if (!inv.level) warns.push('A ficha não tem nível de inventor.');
    if (!inv.engenhoqueiro) warns.push('Falta o poder Engenhoqueiro.');
    if (!inv.skillTrained && !activationSubstitutes(this.actor).length) warns.push('Ofício (engenhoqueiro) não está treinado.');
    const n = this.items().length;
    const pm = this.actor.system?.attributes?.pm ?? {};
    const powers = [['chutes', 'Chutes e Palavrões'], ['potente', 'Invenção Potente'], ['maestria', 'Maestria em Perícia'], ['manutencao', 'Manutenção Eficiente'], ['personalizado', 'Aparato Personalizado'], ['mecanizada', 'Armadura Mecanizada'], ['avancada', 'Armadura Avançada'], ['automatoEng', 'Autômato Engenhocado'], ['calibrar', 'Forçar a Calibragem'], ['rapida', 'Ativação Rápida'], ['goblinoide', 'Engenhocaria Goblinoide']].filter(([k]) => inv[k]).map(([, l]) => l)
    for (const sub of activationSubstitutes(this.actor)) if (!powers.includes(sub.source)) powers.push(`${sub.source} (usa ${sub.label} para fabricar e ativar)`);
    return `<section class="t20tk-eng-status">
      <div class="t20tk-metrics">
        ${metric('Círculo máximo', inv.maxCircle ? `${inv.maxCircle}º` : '—')}
        ${metric('Engenhocas', `${n} de ${inv.limit}`)}
        ${metric('Ofício (eng.)', `${Number(this.actor.system?.pericias?.enge?.value) >= 0 ? '+' : ''}${Number(this.actor.system?.pericias?.enge?.value) || 0}`)}
        ${metric('PM', `${pm.value ?? 0}/${pm.max ?? 0}`)}
        ${metric('Dinheiro', `T$ ${Number(this.actor.system?.dinheiro?.tp) || 0}`)}
      </div>
      ${powers.length ? `<p class="t20tk-bz-note">Poderes considerados: ${powers.map(p => `<b>${escapeHtml(p)}</b>`).join(', ')}.</p>` : ''}
      ${warns.map(w => `<p class="t20tk-bz-warn">${escapeHtml(w)}</p>`).join('')}
    </section>`;
  }

  /* ----- Bancada ----- */

  #renderBancada() {
    if (!this.actor) return '<p class="t20tk-bz-empty">Sem personagem.</p>';
    const items = this.items();
    const inv = this.inv();
    const tools = '';
    if (!items.length) return `${tools}<p class="t20tk-bz-empty">Nenhuma engenhoca na ficha. Fabrique uma na <button type="button" class="t20tk-bz-link" data-action="view" data-view="oficina">Oficina</button>.</p>`;
    const selected = this.ui.item && items.find(i => i.id === this.ui.item) ? this.ui.item : items[0].id;
    this.ui.item = selected;
    const rows = items.map(item => {
      const st = engenhocaState(item);
      const dc = activationDC(st, { personalizado: inv.personalizado }).dc;
      const isSel = item.id === selected;
      const state = st.jammed ? '<span class="t20tk-bz-status" data-tone="error">Enguiçada</span>' : '<span class="t20tk-bz-status" data-tone="ok">Pronta</span>';
      const btn = st.jammed
        ? `<button type="button" class="t20tk-ui-button" data-action="repair" data-id="${item.id}">Consertar</button>`
        : `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="activate" data-id="${item.id}">Ativar</button>`;
      return `<li class="t20tk-bz-row t20tk-card ${isSel ? 'is-selected' : ''}" data-status="${st.jammed ? 'blocked' : 'allowed'}">
        <button type="button" class="t20tk-bz-main" data-action="select" data-id="${item.id}" aria-pressed="${isSel}">
          <img src="${escapeHtml(item.img)}" alt="" loading="lazy">
          <span class="t20tk-card-copy">
            <span class="t20tk-bz-name">${escapeHtml(item.name)}</span>
            <span class="t20tk-card-meta">${escapeHtml(st.spellName)} · ${escapeHtml(this.#formLabel(st))}</span>
            <span class="t20tk-card-sub">Próxima CD ${dc}${st.usesToday ? ` · ${st.usesToday} ativação(ões) hoje` : ''}${st.aparatos.length ? ` · ${st.aparatos.map(a => APARATO_BY_ID.get(a)?.label).join(', ')}` : ''}</span>
          </span>
        </button>
        <span class="t20tk-card-side"><span class="t20tk-pill">${st.circle}º</span>${state}${btn}</span>
      </li>`;
    }).join('');
    return `${tools}<div class="t20tk-bz-body">
      <ol class="t20tk-bz-list" data-region="bench">${rows}</ol>
      <aside class="t20tk-bz-detail" data-region="detail">${this.#renderItemDetail(items.find(i => i.id === selected), inv)}</aside>
    </div>`;
  }

  #renderItemDetail(item, inv) {
    if (!item) return '';
    const st = engenhocaState(item);
    const dc = activationDC(st, { personalizado: inv.personalizado });
    const sys = st.snapshot?.system ?? {};
    const aparatos = st.aparatos.length
      ? `<ul class="t20tk-pl-gains">${st.aparatos.map(a => { const d = APARATO_BY_ID.get(a); return `<li data-kind="power"><b>${escapeHtml(d.label)}</b> <span class="t20tk-bz-meta">${escapeHtml(d.text)}</span> <button type="button" class="t20tk-bz-link" data-action="removeAparato" data-id="${item.id}" data-type="${a}">remover</button></li>`; }).join('')}</ul>`
      : '<p class="t20tk-bz-note">Sem aparatos. Instale na aba Aparatos (até dois por engenhoca).</p>';
    const duration = sys.duracao?.special || [sys.duracao?.value, t20Label('timePeriods', sys.duracao?.units)].filter(Boolean).join(' ');
    return `<div class="t20tk-detail-head"><img src="${escapeHtml(item.img)}" alt=""><div>
        <p class="t20tk-eyebrow">Engenhoca</p><h3>${escapeHtml(item.name)}</h3>
        <div class="t20tk-pills">${pill(`${st.circle}º círculo`)}${pill(this.#formLabel(st, true))}${pill(`PV ${item.system?.pv?.value ?? '—'}/${item.system?.pv?.max ?? '—'}`)}${pill('Defesa 15 · RD 5')}</div>
      </div></div>
      ${st.jammed ? '<p class="t20tk-bz-warn">Enguiçada: consertar leva 1 hora de trabalho.</p>' : ''}
      <div class="t20tk-metrics">${metric('Próxima CD', String(dc.dc))}${metric('Ativações hoje', String(st.usesToday))}${metric('Execução', t20Label('abilityActivationTypes', sys.ativacao?.execucao) || 'padrão')}${metric('Alcance', t20Label('distanceUnits', sys.alcance))}${metric('Duração', duration)}${metric('Resistência', sys.resistencia?.txt || 'Sem resistência')}</div>
      <p class="t20tk-bz-note">CD = ${dc.parts.map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' + ')}. Aprimoramentos somam +1 por PM (limite ${inv.int} PM).</p>
      <div class="t20tk-eng-actions">
        ${st.jammed ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="repair" data-id="${item.id}">Consertar</button>` : `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="activate" data-id="${item.id}">Ativar</button>`}
        <button type="button" class="t20tk-ui-button" data-action="openItem" data-id="${item.id}">Abrir item</button>
        <button type="button" class="t20tk-ui-button" data-action="dismantle" data-id="${item.id}">Desmontar</button>
      </div>
      ${this.#renderCouple(item, st, inv)}
      <details class="t20tk-disclosure" open data-key="aparatos"><summary>Aparatos <span class="t20tk-count">${st.aparatos.length}/2</span></summary><div class="t20tk-disclosure-body">${aparatos}</div></details>
      <details class="t20tk-disclosure" data-key="efeito"><summary>Efeito simulado: ${escapeHtml(st.spellName)}</summary><div class="t20tk-disclosure-body t20tk-bz-description">${sys.description?.value ?? '<p>Sem descrição.</p>'}</div></details>`;
  }

  /** Forma da engenhoca: empunhada, vestida ou acoplada (na armadura ou no autômato). */
  #formLabel(st, cap = false) {
    let t = st.mode === 'body' ? 'vestida' : 'empunhada';
    if (st.coupled?.kind === 'armor') t = `acoplada em ${this.actor?.items.get(st.coupled.id)?.name ?? 'armadura'}`;
    else if (st.coupled?.kind === 'automato') t = 'acoplada no autômato';
    return cap ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  /** Acoplar na armadura (Armadura Mecanizada) ou no autômato (Autômato Engenhocado). */
  #renderCouple(item, st, inv) {
    if (!inv.mecanizada && !inv.automatoEng && !st.coupled) return '';
    if (st.coupled) {
      const where = st.coupled.kind === 'armor' ? this.actor.items.get(st.coupled.id) : null;
      const lost = st.coupled.kind === 'armor' && !where;
      return `<details class="t20tk-disclosure" open data-key="acoplar"><summary>Acoplada</summary><div class="t20tk-disclosure-body">
        <p>${st.coupled.kind === 'armor' ? `Na armadura <b>${escapeHtml(where?.name ?? 'removida da ficha')}</b>: não conta como vestida e não precisa ser empunhada.${inv.avancada && where ? ` Armadura Avançada soma +${couplingArmors(this.actor).find(a => a.item.id === where.id)?.upgrades ?? 0} no teste.` : ''}` : 'No autômato: 1× por rodada, +2 PM para ativar com ação de movimento, com o autômato como origem (alcance curto).'}</p>
        ${lost ? '<p class="t20tk-bz-warn">A armadura não está mais na ficha.</p>' : ''}
        <button type="button" class="t20tk-ui-button" data-action="uncouple" data-id="${item.id}">Desacoplar</button>
      </div></details>`;
    }
    const rows = [];
    if (inv.mecanizada) {
      const armors = couplingArmors(this.actor);
      if (!armors.length) rows.push('<p class="t20tk-bz-note">Armadura Mecanizada: a ficha não tem armadura leve ou pesada.</p>');
      for (const a of armors) {
        const why = coupleBlocker(st, { kind: 'armor', tipo: a.tipo, used: a.used }, inv);
        rows.push(`<li><button type="button" class="t20tk-ui-button" data-action="couple" data-id="${item.id}" data-target="${a.item.id}" ${why && !game.user.isGM ? 'disabled' : ''}>Acoplar</button> <b>${escapeHtml(a.item.name)}</b> <span class="t20tk-bz-meta">${a.tipo === 'pesada' ? 'pesada' : 'leve'} · ${a.used}/${a.capacity}${inv.avancada ? ` · ${a.upgrades} melhoria(s)` : ''}${why ? ` · ${escapeHtml(why)}` : ''}</span></li>`);
      }
    }
    if (inv.automatoEng) {
      const why = coupleBlocker(st, { kind: 'automato', used: automatoUsed(this.actor) }, inv);
      rows.push(`<li><button type="button" class="t20tk-ui-button" data-action="couple" data-id="${item.id}" data-target="automato" ${why && !game.user.isGM ? 'disabled' : ''}>Acoplar</button> <b>Autômato</b> <span class="t20tk-bz-meta">${why ? escapeHtml(why) : '1º círculo, alvo 1 criatura ou objeto, ou área'}</span></li>`);
    }
    return `<details class="t20tk-disclosure" data-key="acoplar"><summary>Acoplar</summary><div class="t20tk-disclosure-body">
      <ul class="t20tk-eng-couple">${rows.join('')}</ul>
      <label class="t20tk-bz-check"><input type="checkbox" data-ui="pay" ${this.ui.pay ? 'checked' : ''}> Descontar T$ ${COUPLE_PRICE} da ficha (1 dia de trabalho)</label>
    </div></details>`;
  }

  /* ----- Oficina ----- */

  #renderOficina() {
    const inv = this.inv();
    const extra = `<label class="t20tk-bz-check"><input type="checkbox" data-ui="hideMade" ${this.ui.hideMade ? 'checked' : ''}> Ocultar já fabricadas</label>`;
    const filters = spellFilterPanel(this.sf, this.sfOptions, { count: `${this.spells().length} magias`, maxCircle: inv?.maxCircle ?? 0, extra, packs: this.index.packs })
      + (this.filterError ? `<p class="t20tk-bz-warn t20tk-sf-error">${escapeHtml(this.filterError)}</p>` : '');
    return `${filters}<div class="t20tk-bz-body">
      <ol class="t20tk-bz-list" data-region="results">${this.#renderSpellRows()}</ol>
      <aside class="t20tk-bz-detail" data-region="detail">${this.#renderCraftDetail()}</aside>
    </div>`;
  }

  #renderSpellRows() {
    const rows = this.spells();
    if (!this.index?.spells?.length) return '<li class="t20tk-bz-empty">Nenhuma magia nos compêndios.</li>';
    if (!rows.length) return '<li class="t20tk-bz-empty">Nenhuma magia com esses filtros.</li>';
    return rows.map(({ spell, check, made, via }) => {
      const sel = this.ui.spell === spell.uuid;
      const line1 = [SPELL_TYPES[spell.type], SPELL_SCHOOLS[spell.school], t20Label('abilityActivationTypes', spell.execution)].filter(Boolean).join(' • ');
      const line2 = `T$ ${check.price} · fabricar CD ${check.dc} · ativar CD ${15 + check.pm}`;
      const status = made ? 'owned' : check.ok ? 'allowed' : 'blocked';
      return `<li class="t20tk-bz-row t20tk-card ${sel ? 'is-selected' : ''}" data-status="${status}">
        <button type="button" class="t20tk-bz-main" data-action="select" data-uuid="${spell.uuid}" aria-pressed="${sel}">
          <img src="${escapeHtml(spell.img)}" alt="" loading="lazy">
          <span class="t20tk-card-copy">
            <span class="t20tk-bz-name">${escapeHtml(spell.name)}</span>
            <span class="t20tk-card-meta">${escapeHtml(line1)}</span>
            <span class="t20tk-card-sub">${escapeHtml(line2)}</span>
            <span class="t20tk-card-source">${escapeHtml(spell.book || spell.packLabel)}</span>
            ${viaTags(via)}
          </span>
        </button>
        <span class="t20tk-card-side"><span class="t20tk-pill">${spell.circle ?? '?'}º</span>${made ? '<span class="t20tk-bz-status">Já fabricada</span>' : check.ok ? '' : `<span class="t20tk-bz-status" title="${escapeHtml(check.reason)}">Fora do limite</span>`}</span>
      </li>`;
    }).join('');
  }

  #renderCraftDetail() {
    const uuid = this.ui.spell;
    if (!uuid) return '<p class="t20tk-bz-empty">Escolha uma magia para ver o custo e fabricar a engenhoca.</p>';
    const d = this.details.get(uuid);
    if (!d) return '<p class="t20tk-bz-empty">Carregando…</p>';
    if (d.error) return `<p class="t20tk-bz-warn">${escapeHtml(d.error)}</p>`;
    const s = d.system;
    const inv = this.inv();
    const check = craftCheck({ circle: Number(s.circulo), type: s.tipo }, { inventorLevel: inv?.level ?? 0, goblinoide: inv?.goblinoide, owned: this.items().length, limit: inv?.limit ?? 0 });
    const pv = Math.floor((inv?.maxPV ?? 0) / 2);
    const name = this.ui.name || `${d.name} (engenhoca)`;
    const canCraft = this.actor?.isOwner && (check.ok || game.user.isGM);
    const form = this.actor ? `<section class="t20tk-eng-craft">
        <label class="t20tk-pl-field">Nome da engenhoca <input type="text" data-ui="name" value="${escapeHtml(name)}"></label>
        <div class="t20tk-seg t20tk-seg--small" role="radiogroup" aria-label="Forma">
          <label><input type="radio" name="engMode" data-ui="mode" value="hand" ${this.ui.mode !== 'body' ? 'checked' : ''}><span>Empunhada</span></label>
          <label><input type="radio" name="engMode" data-ui="mode" value="body" ${this.ui.mode === 'body' ? 'checked' : ''}><span>Vestida</span></label>
        </div>
        ${this.ui.mode === 'body' ? '<p class="t20tk-bz-note">Vestida conta no limite de itens vestidos, mas não ocupa o lugar da armadura: dá para vestir várias.</p>' : ''}
        <label class="t20tk-bz-check"><input type="checkbox" data-ui="roll" ${this.ui.roll ? 'checked' : ''}> Fazer o teste de fabricação contra CD ${check.dc} (Ofício ou a perícia que um poder libera)</label>
        <label class="t20tk-bz-check"><input type="checkbox" data-ui="pay" ${this.ui.pay ? 'checked' : ''}> Descontar T$ ${check.price} da ficha</label>
        ${check.ok ? '' : `<p class="t20tk-bz-warn">${escapeHtml(check.reason)}${game.user.isGM ? ' (o mestre pode criar mesmo assim)' : ''}</p>`}
        <button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="craft" ${canCraft ? '' : 'disabled'}>Fabricar engenhoca</button>
      </section>` : '';
    return `<div class="t20tk-detail-head"><img src="${escapeHtml(d.img)}" alt=""><div>
        <p class="t20tk-eyebrow">Oficina</p><h3>${escapeHtml(d.name)}</h3>
        <div class="t20tk-pills">${pill(`${Number(s.circulo)}º círculo`)}${pill(`${check.pm} PM`)}${pill(SPELL_TYPES[s.tipo] ?? s.tipo)}${pill(SPELL_SCHOOLS[s.escola] ?? s.escola)}</div>
      </div></div>
      ${form}
      <div class="t20tk-metrics">${metric('Preço', `T$ ${check.price}`)}${metric('CD fabricar', String(check.dc))}${metric('CD ativar', String(15 + check.pm))}${metric('PV do item', String(pv))}${metric('Espaço', inv?.manutencao ? '0,5' : '1')}${metric('Execução', t20Label('abilityActivationTypes', s.ativacao?.execucao))}</div>
      <details class="t20tk-disclosure" data-key="efeito"><summary>Descrição da magia</summary><div class="t20tk-disclosure-body t20tk-bz-description">${d.html}</div></details>
      <details class="t20tk-disclosure" data-key="aprimoramentos"><summary>Aprimoramentos <span class="t20tk-count">${d.enhancements.length}</span></summary><div class="t20tk-disclosure-body">${d.enhancements.length ? `<div class="t20tk-enh">${d.enhancements.map(e => `<div class="t20tk-enh-row"><span class="t20tk-enh-cost">${e.cost ? `+${escapeHtml(e.cost)} PM` : 'Especial'}</span><div>${escapeHtml(e.text)}</div></div>`).join('')}</div><p class="t20tk-bz-note">Na ativação, cada PM de aprimoramento soma +1 na CD.</p>` : '<p class="t20tk-bz-note">Sem aprimoramentos.</p>'}</div></details>`;
  }

  async #loadDetail(uuid) {
    if (this.details.has(uuid)) return;
    try {
      const doc = await fromUuid(uuid);
      if (!doc) throw new Error('Magia não encontrada.');
      const html = await enrichDescription(doc.system?.description?.value ?? '', doc);
      const enhancements = [...(doc.effects ?? [])].filter(e => e.flags?.tormenta20?.onuse).map(e => ({ cost: e.flags.tormenta20.custo, text: e.name }));
      this.details.set(uuid, { name: doc.name, img: doc.img, system: doc.system, html, enhancements });
    } catch (error) {
      this.details.set(uuid, { error: `Não foi possível abrir a magia: ${error.message}` });
    }
  }

  /* ----- Aparatos ----- */

  #renderAparatos() {
    const items = this.items();
    const sel = this.ui.aparato;
    const cards = APARATOS.map(a => {
      const installed = items.filter(i => engenhocaState(i).aparatos.includes(a.id));
      const isSel = sel === a.id;
      return `<li class="t20tk-bz-row t20tk-card ${isSel ? 'is-selected' : ''}" data-status="${installed.length ? 'owned' : 'allowed'}">
        <button type="button" class="t20tk-bz-main" data-action="pickAparato" data-type="${a.id}" aria-pressed="${isSel}">
          <span class="t20tk-card-noimg" aria-hidden="true">⚙</span>
          <span class="t20tk-card-copy">
            <span class="t20tk-bz-name">${escapeHtml(a.label)}</span>
            <span class="t20tk-card-meta">${escapeHtml(a.text)}</span>
            ${installed.length ? `<span class="t20tk-card-sub">Em: ${escapeHtml(installed.map(i => i.name).join(', '))}</span>` : ''}
          </span>
        </button>
        <span class="t20tk-card-side"><span class="t20tk-pill">T$ ${a.price}</span>${a.auto ? '<span class="t20tk-bz-status" title="O Toolkit aplica na ativação">automático</span>' : ''}</span>
      </li>`;
    }).join('');
    return `<p class="t20tk-bz-note t20tk-eng-intro">Aparatos (Heróis de Arton, p. 235): até dois por engenhoca. Um aparato soma +2 na CD de ativação; dois somam +5${this.inv()?.personalizado ? ' (Aparato Personalizado: o primeiro não conta)' : ''}. Os marcados como automático entram sozinhos na ativação; os outros ficam anotados para a mesa.</p>
      <div class="t20tk-bz-body">
        <ol class="t20tk-bz-list">${cards}</ol>
        <aside class="t20tk-bz-detail" data-region="detail">${this.#renderInstall(items)}</aside>
      </div>`;
  }

  #renderInstall(items) {
    const def = APARATO_BY_ID.get(this.ui.aparato);
    if (!def) return '<p class="t20tk-bz-empty">Escolha um aparato para instalar.</p>';
    if (!this.actor) return '<p class="t20tk-bz-empty">Abra pela ficha para instalar.</p>';
    if (!items.length) return '<p class="t20tk-bz-empty">Nenhuma engenhoca na ficha.</p>';
    const targets = new Set(this.ui.targets);
    const list = items.map(i => {
      const st = engenhocaState(i);
      const why = aparatoBlocker(st, def.id);
      return `<label class="t20tk-bz-check ${why ? 'is-off' : ''}"><input type="checkbox" data-ui="target" value="${i.id}" ${targets.has(i.id) ? 'checked' : ''} ${why ? 'disabled' : ''}> <b>${escapeHtml(i.name)}</b> <span class="t20tk-bz-meta">${st.aparatos.length}/2${why ? ` · ${escapeHtml(why)}` : ''}</span></label>`;
    }).join('');
    const ready = this.ui.targets.length === def.targets;
    return `<div class="t20tk-detail-head"><span class="t20tk-card-noimg t20tk-card-noimg--big" aria-hidden="true">⚙</span><div>
        <p class="t20tk-eyebrow">Aparato</p><h3>${escapeHtml(def.label)}</h3>
        <div class="t20tk-pills">${pill(`T$ ${def.price}`)}${pill(def.targets > 1 ? `${def.targets} engenhocas` : '1 engenhoca')}${def.auto ? pill('automático') : ''}</div>
      </div></div>
      <p>${escapeHtml(def.text)}</p>
      <p class="t20tk-eyebrow">Instalar em ${def.targets > 1 ? `exatamente ${def.targets}` : 'uma'} engenhoca${def.targets > 1 ? 's' : ''}</p>
      <div class="t20tk-eng-targets">${list}</div>
      <label class="t20tk-bz-check"><input type="checkbox" data-ui="pay" ${this.ui.pay ? 'checked' : ''}> Descontar T$ ${def.price} da ficha</label>
      <div class="t20tk-eng-actions"><button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="install" ${ready ? '' : 'disabled'}>Instalar ${escapeHtml(def.label)}</button></div>`;
  }

  /* ---------- ações ---------- */

  static #onView(event, target) { this.ui.view = target.dataset.view; this.render(); }

  static async #onSelect(event, target) {
    if (target.dataset.id) { this.ui.item = target.dataset.id; return this.render(); }
    const uuid = target.dataset.uuid;
    this.ui.spell = uuid; this.ui.name = '';
    this.element.querySelectorAll('[data-region="results"] .t20tk-bz-row').forEach(r => r.classList.toggle('is-selected', r.querySelector('[data-uuid]')?.dataset.uuid === uuid));
    const detail = this.element.querySelector('[data-region="detail"]');
    if (detail) detail.innerHTML = this.#renderCraftDetail();
    await this.#loadDetail(uuid);
    if (this.ui.spell === uuid) this.render();
  }

  static #onCircle(event, target) { this.ui.circle = target.dataset.circle; this.render(); }
  static #onToggleFilters() { this.ui.panel = !this.ui.panel; this.render(); }
  static #onClearFilters() { Object.assign(this.ui, { query: '', circle: '', type: '', school: '', hideMade: false }); this.render(); }

  static async #onCraft() {
    const name = this.element.querySelector('[data-ui="name"]')?.value ?? this.ui.name;
    const created = await craftEngenhoca(this.actor, { uuid: this.ui.spell, name, mode: this.ui.mode, roll: this.ui.roll, pay: this.ui.pay });
    if (created) { this.ui.view = 'bancada'; this.ui.item = created.id; this.render(); }
  }

  #item(target) { return this.actor?.items.get(target.dataset.id); }
  static async #onActivate(event, target) { const i = this.#item(target); if (i) await activateEngenhoca(i); }
  static async #onRepair(event, target) { const i = this.#item(target); if (i) await repairEngenhoca(i); }
  static async #onDismantle(event, target) { const i = this.#item(target); if (i && await dismantleEngenhoca(i)) { this.ui.item = null; this.render(); } }
  static async #onNewDay() { if (this.actor) await newDay(this.actor); }
  static async #onNewScene() { if (this.actor) await newScene(this.actor); }
  static #onOpenItem(event, target) { this.#item(target)?.sheet?.render(true); }
  static async #onCouple(event, target) { const i = this.#item(target); if (i) await coupleEngenhoca(this.actor, i, target.dataset.target, { pay: this.ui.pay }); }
  static async #onUncouple(event, target) { const i = this.#item(target); if (i) await uncoupleEngenhoca(i); }
  static #onPickAparato(event, target) { this.ui.aparato = target.dataset.type; this.ui.targets = []; this.render(); }

  static async #onInstall() {
    const targets = this.ui.targets.map(id => this.actor.items.get(id)).filter(Boolean);
    await installAparato(this.actor, this.ui.aparato, targets, { pay: this.ui.pay });
    this.ui.targets = [];
    this.render();
  }

  static async #onRemoveAparato(event, target) {
    const item = this.#item(target);
    if (item) await removeAparato(this.actor, item, target.dataset.type);
  }

  static async #onTheme(event, target) { await switchTheme(target.dataset.themeValue); }
  static #onOpenSheet() { this.actor?.sheet?.render(true); }
}

export async function openEngenhocas({ actor = null, view = null } = {}) {
  const id = `t20tk-engenhocas-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) {
    if (view) existing.ui.view = view;
    await existing.render({ force: true });
    existing.bringToFront?.();
    return existing;
  }
  return new EngenhocasApp({ actor, view }).render({ force: true });
}
