/**
 * Planejador de Personagem (fase 1: subir de nível e planejar níveis futuros).
 * Plano:    flags['t20-toolkit'].plan.levels[N] = { cls, picks: { [gainId]: uuid } }
 * Histórico: flags['t20-toolkit'].history[N] = { classId, classCreated, created: [itemIds], cls }
 * Aplicar um nível: sobe system.niveis da classe (ou cria a classe), adiciona as habilidades
 * do nível pela tabela do livro e os poderes escolhidos. PV/PM o próprio sistema recalcula.
 */
import { replaceKeepingPlace } from '../ui/render.js';
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, fold, actorClasses, arcanistPaths } from '../core/t20.js';
import { buildCasterProfiles } from '../core/caster-rules.js';
import { getPlannerIndex } from '../core/spell-index.js';
import { devotionCheck, mustBeDevout } from '../core/gods.js';
import { BASE_CLASSES, progressionFor, classInfo, gainsAt, buildTimeline, prerequisiteText, evaluatePrerequisites } from './planner-rules.js';
import { toolFrame, onNavigate, switchTheme, reopen } from '../ui/frame.js';
import { postCard } from '../ui/chat.js';
import { disclosure } from '../ui/components.js';
import { getTableRules } from '../core/table-rules.js';
import { skillLabels } from './creation-view.js';
import { applyCreation, rollCreationAttributes, undoCreation, stepCreationAttribute } from './creation-view.js';
import { renderWizard, bindWizard, WIZARD_ACTIONS } from './creation-wizard.js';
import { renderLevelEditor, bindLevelEditor, LEVEL_ACTIONS, renderExtraPage, aumentoAttr, intSkillGain } from './level-view.js';
import { renderDoneLevel, RETRAIN_ACTIONS } from './retrain-view.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const MARK = { ok: '✔', missing: '✘', review: '?', none: '' };
const norm = v => fold(v).replace(/[^a-z0-9º ]+/g, ' ').replace(/\s+/g, ' ').trim();

export class PlannerApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-planner-app'],
    tag: 'section',
    window: { title: 'Planejador de Personagem', icon: 'fa-solid fa-route', resizable: true },
    position: { width: 1040, height: 760 },
    actions: {
      pickLevel: PlannerApp.#onPickLevel,
      apply: PlannerApp.#onApply,
      undo: PlannerApp.#onUndo,
      clearLevel: PlannerApp.#onClearLevel,
      rollAttributes: PlannerApp.#onRollAttributes,
      attrStep: PlannerApp.#onAttrStep,
      addExtra: PlannerApp.#onAddExtra,
      removeExtra: PlannerApp.#onRemoveExtra,
      applyCreation: PlannerApp.#onApplyCreation,
      openBuscador: PlannerApp.#onOpenBuscador,
      theme: PlannerApp.#onTheme,
      t20nav: onNavigate,
      openSheet: PlannerApp.#onOpenSheet,
      ...WIZARD_ACTIONS,
      ...LEVEL_ACTIONS,
      ...RETRAIN_ACTIONS
    }
  };

  constructor({ actor = null, ...options } = {}) {
    super({ id: `t20tk-planner-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this.selected = null;
    this._hooks = [];
  }

  get title() { return this.actor ? `Planejador — ${this.actor.name}` : 'Planejador de Personagem'; }

  /* ---------- dados ---------- */

  async _prepareContext() {
    this.index ??= await getPlannerIndex();
    const actor = this.actor;
    const classes = actorClasses(actor);
    const current = classes.reduce((s, c) => s + c.level, 0);
    const plan = actor?.getFlag?.(MODULE_ID, 'plan')?.levels ?? {};
    const history = actor?.getFlag?.(MODULE_ID, 'history') ?? {};
    const timeline = buildTimeline(classes.map(c => ({ name: c.name, level: c.level })), plan);
    // Níveis já aplicados também podem ser abertos (ver o que entrou e retreinar).
    if (this.selected === null || !(this.selected >= 1 && this.selected <= 20)) this.selected = Math.min(current + 1, 20);
    const lastApplied = Math.max(0, ...Object.keys(history).map(Number).filter(n => n <= current));
    this.ctxData = { classes, current, plan, history, timeline, lastApplied };
    return this.ctxData;
  }

  /** Contexto de pré-requisitos no nível de personagem `level` (ficha + o que foi planejado antes). */
  prereqContext(level) {
    const c = this.ctxData;
    const actor = this.actor;
    const classLevels = Object.fromEntries(c.classes.map(x => [x.key, x.level]));
    const powers = new Set([...(actor?.items ?? [])].filter(i => i.type === 'poder').map(i => fold(i.name)));
    for (const row of c.timeline) {
      if (row.done || row.level > level || !row.cls) continue;
      classLevels[fold(row.cls)] = row.classLevel;
      const p = c.plan[row.level]?.picks ?? {};
      for (const uuid of Object.values(p)) { const pw = this.index.powers.find(x => x.uuid === uuid); if (pw && row.level < level) powers.add(pw.key); }
      for (const g of gainsAt(row.cls, row.classLevel).gains) if (g.kind === 'ability' && row.level < level) powers.add(fold(g.item));
    }
    const skills = new Set();
    for (const [key, sk] of Object.entries(actor?.system?.pericias ?? {})) {
      if (!sk?.treinado) continue;
      const label = sk.label || globalThis.CONFIG?.T20?.pericias?.[key]?.label || key;
      skills.add(norm(game.i18n?.localize?.(label) ?? label));
    }
    // Perícias de Inteligência planejadas em níveis anteriores também contam.
    for (const row of c.timeline) {
      if (row.done || row.level >= level) continue;
      for (const key of c.plan[row.level]?.intSkills ?? []) {
        const label = globalThis.CONFIG?.T20?.pericias?.[key]?.label ?? key;
        skills.add(norm(game.i18n?.localize?.(label) ?? label));
      }
    }
    const attributes = Object.fromEntries(Object.entries(actor?.system?.atributos ?? {}).map(([k, v]) => [k, Number(v?.value) || 0]));
    // Aumento de Atributo planejado em níveis anteriores já conta para os pré-requisitos.
    for (const row of c.timeline) {
      if (row.done || row.level >= level) continue;
      for (const uuid of Object.values(c.plan[row.level]?.picks ?? {})) {
        const a = aumentoAttr(this.index.powers.find(x => x.uuid === uuid)?.name ?? '');
        if (a) attributes[a] = (attributes[a] ?? 0) + 1;
      }
    }
    const profiles = buildCasterProfiles({ classes: Object.entries(classLevels).map(([k, lv]) => ({ name: k, level: lv })), arcanistPaths: arcanistPaths(actor) });
    return {
      attributes, classLevels, totalLevel: level, powers, skills, maxCircle: Math.max(0, ...profiles.map(p => p.maxCircle)),
      knownPowerNames: new Set(this.index.powers.map(p => p.key))
    };
  }

  /** Poderes que podem ocupar "Poder de <classe>": da classe + gerais. */
  /** Poderes que podem ocupar "Poder de <classe>": da classe indicada na tabela + gerais. */
  powerOptions(cls, powerClass) {
    const key = fold(powerClass || cls);
    return {
      // "Aumento de Atributo" é poder de classe com subtipo "Geral": vale para qualquer classe.
      cls: this.index.powers.filter(p => p.tipo === 'classe' && (p.subtipo === key || p.subtipo === 'geral')),
      general: this.index.powers.filter(p => p.tipo === 'geral'),
      distinction: getTableRules().distinctions ? this.index.powers.filter(p => p.tipo === 'distincao') : []
    };
  }

  /** Habilidade de classe pelo nome: primeiro na própria classe, depois na classe básica da variante. */
  findAbility(cls, name) {
    const keys = [fold(cls), fold(classInfo(cls)?.variantOf ?? '')].filter(Boolean);
    for (const k of keys) {
      const hit = this.index.powers.find(p => p.tipo === 'ability' && p.key === fold(name) && p.subtipo === k);
      if (hit) return hit;
    }
    return this.index.powers.find(p => p.tipo === 'ability' && p.key === fold(name)) ?? null;
  }

  ownsPower(name) {
    return [...(this.actor?.items ?? [])].some(i => i.type === 'poder' && fold(i.name) === fold(name));
  }

  /* ---------- render ---------- */

  async _renderHTML() {
    const c = this.ctxData;
    const who = this.actor ? `Nível ${c.current}${c.classes.length ? ' · ' + c.classes.map(x => `${escapeHtml(x.name)} ${x.level}`).join(' / ') : ''}` : '';
    const frame = { tool: 'planner', extra: 't20tk-pl', actor: this.actor, who, eyebrow: 'Personagem', title: 'Planejador', subtitle: c?.current ? 'Planeje os próximos níveis e aplique um por vez.' : 'Crie o personagem do zero e planeje os próximos níveis.' };
    if (!this.actor) return toolFrame(frame, '');
    if (this.#creating()) return toolFrame({ ...frame, extra: 't20tk-pl t20tk-pl--wz' }, renderWizard(this));
    return toolFrame({ ...frame, extra: 't20tk-pl t20tk-pl--wz' }, `<div class="t20tk-wz">
      <nav class="t20tk-wz-nav" aria-label="Níveis"><p class="t20tk-wz-navtitle">Níveis</p><ol class="t20tk-lv-nav">${this.#renderLevelNav()}</ol>${this.#renderExtraNav()}</nav>
      <section class="t20tk-wz-main"><div class="t20tk-wz-body t20tk-pl-editor">${this.#renderEditor()}</div></section>
    </div>`);
  }

  #creating() { return this.selected === 1 && this.ctxData.current === 0; }

  /** Lista de níveis à esquerda (estilo PF2e Leveler): número, classe, o que ganha e se falta escolha. */
  #renderLevelNav() {
    const c = this.ctxData;
    const KIND = { power: 'Poder', path: 'Caminho', ability: 'Habilidade', spells: 'Magias', note: 'Nota' };
    return c.timeline.map(r => {
      const sel = r.level === this.selected && this.page !== 'extra';
      const hist = c.history[r.level];
      const creation = r.level === 1 && c.current === 0;
      let title, sub = '', status = '';
      if (r.done) { title = hist?.creation ? 'Criação' : hist?.cls ? `${hist.cls}${hist.classLevel ? ` ${hist.classLevel}` : ''}` : 'Na ficha'; sub = hist?.creation && hist?.cls ? `${hist.cls} · na ficha` : 'na ficha'; status = 'done'; }
      else if (creation) { title = 'Criação'; sub = 'raça, origem, classe…'; status = 'next'; }
      else if (r.cls) {
        const g = gainsAt(r.cls, r.classLevel);
        title = `${r.cls} ${r.classLevel}`;
        sub = [...new Set(g.gains.map(x => KIND[x.kind]).filter(Boolean))].join(', ') || 'só o nível';
        const picks = c.plan[r.level]?.picks ?? {};
        const ig = intSkillGain(this, r.level);
        const missing = g.gains.some(x => ['power', 'path'].includes(x.kind) && !picks[x.id]) || ig.picks.length < ig.want;
        status = missing ? 'missing' : 'ok';
      } else { title = 'Sem classe'; sub = r.level === c.current + 1 ? 'próximo nível' : 'sem plano'; status = r.level === c.current + 1 ? 'next' : 'empty'; }
      return `<li><button type="button" data-action="pickLevel" data-level="${r.level}" aria-current="${sel ? 'step' : 'false'}" data-state="${status}">
        <span class="t20tk-wz-dot">${String(r.level).padStart(2, '0')}</span><span class="t20tk-lv-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(sub)}</small></span><i class="t20tk-lv-status" data-state="${status}"></i></button></li>`;
    }).join('');
  }

  #renderExtraNav() {
    if (getTableRules().extraGains === 'off') return '';
    const n = (this.actor.getFlag(MODULE_ID, 'extraGains') ?? []).length;
    return `<button type="button" class="t20tk-wz-navlink t20tk-xg-nav ${this.page === 'extra' ? 'is-on' : ''}" data-action="lvExtraPage">★ Ganhos extras${n ? ` <span class="t20tk-count">${n}</span>` : ''}</button>`;
  }

  #renderEditor() {
    if (this.page === 'extra') return renderExtraPage(this);
    const c = this.ctxData;
    const level = this.selected;
    const row = c.timeline.find(r => r.level === level);
    if (!row) return '';
    if (level === 1 && c.current === 0) return '';
    if (row.done) return renderDoneLevel(this);
    return renderLevelEditor(this);
  }

  devotionNoteHtml(clsName) { return this.#devotionNote(clsName); }

  /** Velho/ancião (Idades Variadas): Aumento de Atributo não pode ir para atributos físicos. */
  #physicalNote(power) {
    if (!power || !/^aumento de atributo/i.test(power.name)) return '';
    return this.actor?.getFlag?.(MODULE_ID, 'creationRules')?.noPhysicalIncrease
      ? '<p class="t20tk-bz-warn">Pela idade do personagem, o Aumento de Atributo não pode ir para Força, Destreza ou Constituição.</p>' : '';
  }

  /* ---------- ganhos fora da progressão (regra da mesa) ---------- */

  canExtraGain() {
    const mode = getTableRules().extraGains;
    return mode === 'all' ? !!this.actor?.isOwner : mode === 'gm' ? !!game.user?.isGM : false;
  }

  /** Ao entrar numa classe nova: devoção obrigatória (clérigo, druida, paladino) ou proibida (usurpador). */
  #devotionNote(clsName) {
    const god = this.actor.system?.detalhes?.divindade ?? '';
    const race = this.actor.items.find(i => i.type === 'race')?.name ?? '';
    const classes = [...actorClasses(this.actor).map(c => c.name), clsName].map(n => ({ name: n, variantOf: classInfo(n)?.variantOf ?? null }));
    const required = mustBeDevout([{ name: clsName, variantOf: classInfo(clsName)?.variantOf ?? null }]);
    if (fold(clsName) === 'usurpador' && god) return `<p class="t20tk-bz-warn">Usurpador não pode ter devoção: o personagem é devoto de ${escapeHtml(god)}.</p>`;
    if (required && !god) return `<p class="t20tk-bz-warn">${escapeHtml(required)} precisa ser devoto: escolha um deus na ficha (campo Divindade) e um poder concedido.</p>`;
    if (god && required) {
      const r = devotionCheck({ god, race, classes, rules: getTableRules() });
      if (r.level === 'block') return `<p class="t20tk-bz-warn">${escapeHtml(r.reason)}</p>`;
    }
    return '';
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onRender() {
    const root = this.element;
    if (this.#creating()) { bindWizard(this, root); return; }
    bindLevelEditor(this, root);
    root.querySelector('[aria-pressed="true"][data-action="pickLevel"]')?.scrollIntoView?.({ block: 'nearest' });
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

  async #clear(level) {
    await this.actor.update({ [`flags.${MODULE_ID}.plan.levels.-=${level}`]: null });
  }

  /* ---------- ações ---------- */

  static async #onAddExtra() {
    if (!this.canExtraGain()) return;
    const actor = this.actor;
    const x = this.extra ?? {};
    const reason = this.element.querySelector('input[name="extraReason"]')?.value ?? x.reason ?? '';
    const KIND = { geral: 'Poder geral', classe: 'Poder de classe', concedido: 'Poder concedido', distincao: 'Poder de distinção', pericia: 'Perícia treinada', atributo: '+1 em atributo' };
    const level = actorClasses(actor).reduce((s, c) => s + c.level, 0);
    let entry = null;
    if (x.type === 'pericia') {
      const label = skillLabels()[x.value] ?? x.value;
      await actor.update({ [`system.pericias.${x.value}.treinado`]: true });
      entry = { type: 'pericia', key: x.value, label };
    } else if (x.type === 'atributo') {
      const cur = Number(actor.system?.atributos?.[x.value]?.base) || 0;
      await actor.update({ [`system.atributos.${x.value}.base`]: cur + 1 });
      entry = { type: 'atributo', key: x.value, label: `+1 em ${x.value.toUpperCase()}` };
    } else {
      const doc = await fromUuid(x.value);
      if (!doc) return;
      const data = game.items.fromCompendium(doc);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.extraGain`, true);
      const [item] = await actor.createEmbeddedDocuments('Item', [data]);
      entry = { type: x.type, itemId: item?.id, label: doc.name, img: doc.img };
    }
    entry = { ...entry, kindLabel: KIND[x.type], reason, level, by: game.user?.name ?? '' };
    const list = [...(actor.getFlag(MODULE_ID, 'extraGains') ?? []), entry];
    await actor.setFlag(MODULE_ID, 'extraGains', list);
    await postCard(actor, { tool: 'planner', tone: 'success', title: 'Ganho fora da progressão', subtitle: `${actor.name} · ${KIND[x.type]}`, items: [{ name: entry.label, img: entry.img }], note: reason ? `Motivo: ${reason}` : '' });
    this.extra = { type: x.type, value: '', reason: '' };
    this.render();
  }

  static async #onRemoveExtra(event, target) {
    if (!this.canExtraGain()) return;
    const actor = this.actor;
    const list = [...(actor.getFlag(MODULE_ID, 'extraGains') ?? [])];
    const [g] = list.splice(Number(target.dataset.index), 1);
    if (!g) return;
    if (g.itemId) await actor.items.get(g.itemId)?.delete();
    if (g.type === 'pericia') await actor.update({ [`system.pericias.${g.key}.treinado`]: false });
    if (g.type === 'atributo') await actor.update({ [`system.atributos.${g.key}.base`]: (Number(actor.system?.atributos?.[g.key]?.base) || 0) - 1 });
    await actor.setFlag(MODULE_ID, 'extraGains', list);
    this.render();
  }

  static #onPickLevel(event, target) { this.selected = Number(target.dataset.level); this.browse = null; this.page = null; this.render(); }

  static async #onClearLevel(event, target) { await this.#clear(Number(target.dataset.level)); }

  static async #onApply(event, target) {
    const actor = this.actor;
    const c = this.ctxData;
    const level = Number(target.dataset.level);
    if (!actor?.isOwner || level !== c.current + 1) return;
    const row = c.timeline.find(r => r.level === level);
    const entry = c.plan[level] ?? {};
    const g = gainsAt(row.cls, row.classLevel);
    const missing = g.gains.filter(x => (x.kind === 'power' || x.kind === 'path') && !entry.picks?.[x.id]).map(x => x.label);
    const ig = intSkillGain(this, level);
    if (ig.picks.length < ig.want) missing.push(`${ig.want - ig.picks.length} perícia(s) por Inteligência`);
    const summary = [];
    const ctx = this.prereqContext(level);
    const unmet = Object.values(entry.picks ?? {}).filter(Boolean).map(u => this.index.powers.find(p => p.uuid === u))
      .filter(p => p && evaluatePrerequisites(prerequisiteText(p.description), ctx).status === 'missing');
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Aplicar ${level}º nível` },
      content: `<p>Subir <b>${escapeHtml(actor.name)}</b> para o ${level}º nível como <b>${escapeHtml(row.cls)} ${row.classLevel}</b>?</p>
        ${missing.length ? `<p>Ainda sem escolha: ${missing.map(x => escapeHtml(x)).join(', ')}. Você pode adicionar depois pela ficha.</p>` : ''}
        ${unmet.length ? `<p><b>Pré-requisitos não cumpridos:</b> ${unmet.map(p => escapeHtml(p.name)).join(', ')}. Confirme com o mestre.</p>` : ''}`,
      rejectClose: false
    });
    if (!ok) return;
    const created = [];
    let classId = null, classCreated = false;
    try {
      // 1) Classe
      const existing = c.classes.find(x => fold(x.name) === fold(row.cls));
      if (existing) {
        await existing.item.update({ 'system.niveis': existing.level + 1 });
        classId = existing.id;
      } else {
        const ref = this.index.classes.find(x => x.key === fold(row.cls));
        if (!ref) throw new Error(`Classe ${row.cls} não encontrada nos compêndios.`);
        const data = game.items.fromCompendium(await fromUuid(ref.uuid));
        foundry.utils.setProperty(data, 'system.niveis', 1);
        foundry.utils.setProperty(data, 'system.inicial', c.classes.length === 0);
        const [cls] = await actor.createEmbeddedDocuments('Item', [data]);
        classId = cls.id; classCreated = true;
      }
      summary.push(`${row.cls} ${row.classLevel}`);
      // 2) Habilidades do nível e escolhas
      const toCreate = [];
      for (const gain of g.gains) {
        let uuid = null;
        if (gain.kind === 'ability' && !this.ownsPower(gain.item)) uuid = this.findAbility(row.cls, gain.item)?.uuid;
        if ((gain.kind === 'power' || gain.kind === 'path') && entry.picks?.[gain.id]) uuid = entry.picks[gain.id];
        if (!uuid) continue;
        const doc = await fromUuid(uuid);
        if (!doc) continue;
        const data = game.items.fromCompendium(doc);
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.plannerLevel`, level);
        toCreate.push(data);
      }
      if (toCreate.length) {
        const docs = await actor.createEmbeddedDocuments('Item', toCreate);
        created.push(...docs.map(d => d.id));
        summary.push(...docs.map(d => d.name));
      }
      // 3) Perícias novas pelo Aumento de Atributo (Inteligência)
      const trained = ig.picks.filter(k => !actor.system?.pericias?.[k]?.treinado);
      if (trained.length) {
        await actor.update(Object.fromEntries(trained.map(k => [`system.pericias.${k}.treinado`, true])));
        const labels = skillLabels();
        summary.push(...trained.map(k => `Treinado em ${labels[k] ?? k}`));
      }
      await actor.update({
        [`flags.${MODULE_ID}.history.${level}`]: { cls: row.cls, classLevel: row.classLevel, classId, classCreated, created, trained },
        [`flags.${MODULE_ID}.plan.levels.-=${level}`]: null
      });
      const createdDocs = created.map(id => actor.items.get(id)).filter(Boolean);
      await postCard(actor, {
        tool: 'planner', tone: 'success', title: `${level}º nível`, subtitle: `${actor.name} · ${row.cls} ${row.classLevel}`,
        itemsTitle: 'Adicionado à ficha', items: [...createdDocs, ...trained.map(k => ({ name: `Treinado em ${skillLabels()[k] ?? k}` }))].map(d => ({ name: d.name, img: d.img })),
        note: g.gains.some(x => x.kind === 'spells') ? 'Escolha as magias novas no Buscador.' : ''
      });
      this.selected = Math.min(level + 1, 20);
      if (g.gains.some(x => x.kind === 'spells')) game.t20Toolkit?.buscador?.open({ actor });
    } catch (error) {
      console.error('[T20 Toolkit] Planejador:', error);
      ui.notifications.error(`Não foi possível aplicar o nível: ${error.message}`);
    }
  }

  static async #onUndo(event, target) {
    const actor = this.actor;
    const level = Number(target.dataset.level);
    const h = this.ctxData.history[level];
    if (!h || !actor?.isOwner) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Desfazer ${level}º nível` },
      content: h.creation ? '<p>Desfazer a criação? Remove raça, classe e poderes adicionados e volta atributos e perícias.</p>' : `<p>Remover os itens adicionados no ${level}º nível e voltar ${escapeHtml(h.cls)} um nível?</p>`,
      rejectClose: false
    });
    if (!ok) return;
    if (h.creation) {
      await undoCreation(actor, h);
      await actor.update({ [`flags.${MODULE_ID}.history.-=${level}`]: null });
      this.selected = 1;
      return;
    }
    const ids = (h.created ?? []).filter(id => actor.items.get(id));
    if (h.classCreated && actor.items.get(h.classId)) ids.push(h.classId);
    if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
    if (h.trained?.length) await actor.update(Object.fromEntries(h.trained.map(k => [`system.pericias.${k}.treinado`, false])));
    if (!h.classCreated) {
      const cls = actor.items.get(h.classId);
      if (cls) await cls.update({ 'system.niveis': Math.max(1, (parseInt(cls.system.niveis) || 1) - 1) });
    }
    await actor.update({ [`flags.${MODULE_ID}.history.-=${level}`]: null });
    this.selected = level;
  }

  static async #onRollAttributes() { await rollCreationAttributes(this.actor); }

  static async #onApplyCreation() {
    await applyCreation(this);
    this.selected = 2;
  }

  static #onOpenBuscador() { game.t20Toolkit?.buscador?.open({ actor: this.actor }); }
  static async #onAttrStep(event, target) { await stepCreationAttribute(this.actor, target.dataset.attr, target.dataset.delta); }
  static async #onTheme(event, target) { await switchTheme(target.dataset.themeValue); }
  static #onOpenSheet() { this.actor?.sheet?.render(true); }
}

export async function openPlanner({ actor = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-planner-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) return reopen(existing);
  const app = new PlannerApp({ actor });
  await app.render({ force: true });
  return app;
}
