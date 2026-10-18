/**
 * Usurpador — Usurpar (lançar magia divina com Enganação) e Poder Capturado.
 * Estado: flags['t20-toolkit'].usurpador = { capture: { god, power, itemId, day, uses } };
 * preferências do teste em flags['t20-toolkit'].usurpadorTeste = { skill, extra, fx, text }.
 * Magias usurpadas ficam na ficha com flags['t20-toolkit'].learnedBy = 'usurpar' para poder
 * usar a rolagem do próprio sistema (aprimoramentos, dano, PM); não contam como aprendidas.
 *
 * Usurpar abre um painel na própria janela: a pessoa marca os aprimoramentos (custo e CD saem deles),
 * escolhe a perícia do teste (Enganação ou a que um poder põe no lugar) e os bônus. Depois de passar,
 * a janela de conjuração do sistema abre já com os mesmos aprimoramentos marcados.
 */
import { replaceKeepingPlace } from '../ui/render.js';
import { MODULE_ID } from '../../constants.js';
import { postCard, chatFlavor } from '../ui/chat.js';
import { SPELL_SCHOOLS, escapeHtml, fold, actorClasses, actorSpells, plainText } from '../core/t20.js';
import { buildCasterProfiles } from '../core/caster-rules.js';
import { getSpellCatalog } from '../core/spells/spell-catalog.js';
import { filterSpells, filterOptions, EMPTY_FILTERS } from '../core/spells/spell-filter.js';
import { spellFilterPanel, bindSpellFilterPanel, viaTags } from '../ui/spell-filter-panel.js';
import { getSpellIndex, getGrantedPowerIndex } from '../core/spell-index.js';
import {
  GRANTED_POWERS, POWER_ALIASES, usurpDC, captureDC, divineTheft, divineTheftEffect,
  TEST_SKILL, castCost, effectCost, skillSubstitutes, textBonuses, testParts, fixedBonus, testFormula, chanceOf
} from './usurpador-rules.js';
import { today } from '../grimorio/grimorio-app.js';
import { toolFrame, onNavigate, switchTheme, reopen } from '../ui/frame.js';
import { cardHTML } from '../ui/components.js';
import { enrichDescription } from '../ui/enrich.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const TEST_FLAG = 'usurpadorTeste';
const sign = n => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const showValue = v => (typeof v === 'number' ? sign(v) : String(v));
const localize = s => (typeof s === 'string' && globalThis.game?.i18n?.localize ? game.i18n.localize(s) : String(s ?? ''));
/** Efeito "no uso" vale para este item? (flag `items` do sistema: lista de nomes separada por ;) */
const forItem = (ef, name) => {
  const list = String(ef.flags?.tormenta20?.items ?? '').split(';').map(s => s.trim()).filter(Boolean);
  return !list.length || list.includes(name);
};

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
      castBack: UsurpadorApp.#onCastBack,
      castRoll: UsurpadorApp.#onCastRoll,
      enhToggle: UsurpadorApp.#onEnhToggle,
      enhStep: UsurpadorApp.#onEnhStep,
      testSkill: UsurpadorApp.#onTestSkill,
      testAllSkills: UsurpadorApp.#onTestAllSkills,
      testFx: UsurpadorApp.#onTestFx,
      testText: UsurpadorApp.#onTestText,
      testExtraStep: UsurpadorApp.#onTestExtraStep,
      testHoly: UsurpadorApp.#onTestHoly,
      testZero: UsurpadorApp.#onTestZero,
      pickGod: UsurpadorApp.#onPickGod,
      togglePower: UsurpadorApp.#onTogglePower,
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
    this.view = { tab: 'usurpar', holySymbol: false, god: '', godQuery: '', openPower: '', allSkills: false };
    this.sf = { ...EMPTY_FILTERS, panel: false };
    this.cast = null;
    this.descCache = new Map();
    this._hooks = [];
    const saved = actor?.getFlag?.(MODULE_ID, TEST_FLAG) ?? {};
    this.test = { skill: saved.skill || TEST_SKILL, extra: Number(saved.extra) || 0, zero: !!saved.zero, fx: { ...(saved.fx ?? {}) }, text: { ...(saved.text ?? {}) } };
  }

  get title() { return this.actor ? `Usurpador — ${this.actor.name}` : 'Usurpador'; }

  async _prepareContext() {
    if (!this.index || !this.catalog || !this.powers) [this.index, this.catalog, this.powers] = await Promise.all([getSpellIndex(), getSpellCatalog(), getGrantedPowerIndex()]);
    this.sfOptions ??= filterOptions(this.catalog.spells.filter(s => ['div', 'uni'].includes(s.type)), this.catalog.packs);
    const actor = this.actor;
    const profile = buildCasterProfiles({ classes: actorClasses(actor) }).find(p => p.id === 'usurpador') ?? null;
    const state = actor?.getFlag?.(MODULE_ID, 'usurpador') ?? {};
    const capture = state.capture ?? null;
    const day = today();
    this.ctxData = {
      profile, day, capture,
      captureActive: !!capture && capture.day === day,
      usesToday: capture?.day === day ? (capture.uses ?? 0) : 0,
      armorPenalty: Number(actor?.pda) || Number(actor?.system?.attributes?.defesa?.pda) || 0,
      pm: (Number(actor?.system?.attributes?.pm?.value) || 0) + (Number(actor?.system?.attributes?.pm?.temp) || 0),
      borrowed: actorSpells(actor).filter(s => s.learnedBy === 'usurpar')
    };
    return this.ctxData;
  }

  /* ---------- teste ---------- */

  /** Perícias da ficha: [{ key, label, value }]. */
  #skills() {
    return Object.entries(this.actor?.system?.pericias ?? {})
      .filter(([, p]) => p && typeof p === 'object')
      .map(([key, p]) => ({ key, label: localize(p.label) || key, value: Number(p.value) || 0 }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  /** Poderes da ficha com o texto e se algum efeito permanente deles já soma na perícia `skill`. */
  #sheetPowers(skill) {
    const touches = new RegExp(`pericias\\.(${skill}|\\*)\\.`);
    return [...(this.actor?.items ?? [])].filter(i => i.type === 'poder').map(i => ({
      uuid: i.id, name: i.name, description: plainText(i.system?.description?.value ?? ''),
      onSheet: [...(i.effects ?? [])].some(e => !e.flags?.tormenta20?.onuse && (e.changes ?? []).some(c => touches.test(c.key ?? '')))
    }));
  }

  /** Efeitos "no uso" da ficha que valem para testes da perícia (os mesmos que a janela do sistema mostra). */
  #skillEffects(label) {
    return [...(this.actor?.effects ?? [])].filter(e => {
      const f = e.flags?.tormenta20 ?? {};
      return f.onuse && (f.skill || f.pericia) && forItem(e, label);
    }).map(e => {
      const f = e.flags.tormenta20;
      const adds = (e.changes ?? []).filter(c => Number(c.mode) === 2 && ['roll', 'pericia', 'bonus'].includes(c.key)).map(c => c.value);
      return { id: e.id, name: e.name, cost: Number(f.custo) || 0, aumenta: !!f.aumenta, adds };
    });
  }

  /** Monta o teste com as escolhas atuais: perícia, partes, fórmula, bônus fixo e PM dos efeitos. */
  #testSetup({ holySymbol = false } = {}) {
    const skills = this.#skills();
    const enga = skills.find(s => s.key === TEST_SKILL) ?? { key: TEST_SKILL, label: 'Enganação', value: 0 };
    const powers = this.#sheetPowers(this.test.skill);
    const substitutes = skillSubstitutes(powers, skills);
    const skill = skills.find(s => s.key === this.test.skill) ?? enga;
    const effects = this.#skillEffects(skill.label);
    const texts = textBonuses(this.#sheetPowers(skill.key), skill.key === TEST_SKILL ? 'Enganação' : skill.label);
    const extras = [];
    let pmCost = 0;
    for (const ef of effects) {
      const qty = Number(this.test.fx[ef.id]) || 0;
      if (!qty) continue;
      pmCost += ef.cost * qty;
      for (const v of ef.adds) extras.push({ label: ef.name, value: Number(v) ? Number(v) * qty : v });
    }
    for (const t of texts) if (this.test.text[t.id] && !t.onSheet) extras.push({ label: t.source, value: t.value });
    if (this.test.extra) extras.push({ label: 'Outros', value: this.test.extra });
    const parts = testParts({ skillLabel: skill.label, skillValue: skill.value, armorPenalty: this.ctxData.armorPenalty, holySymbol, extras });
    return { skill, skills, substitutes, effects, texts, parts, bonus: fixedBonus(parts), fixed: parts.every(p => typeof p.value === 'number' || /^[+-]?\d+$/.test(String(p.value).trim())), formula: testFormula(parts), pmCost: Math.max(0, pmCost) };
  }

  /** Chance do teste: escolhendo 10 é tudo ou nada; rolando, a do d20. */
  /** "Escolher 0": resultado = só o bônus (sem crítico nem falha crítica). Só vale quando o bônus já alcança a CD. */
  #canZero(dc, setup) { return setup.fixed && setup.bonus >= dc; }
  #zero(dc, setup) { return !!this.test.zero && this.#canZero(dc, setup); }

  async #saveTest() {
    if (this.actor?.isOwner) await this.actor.setFlag(MODULE_ID, TEST_FLAG, foundry.utils.deepClone(this.test));
  }

  /** Rola o teste montado (ou escolhe 0) e posta no chat. */
  async #rollTest(setup, dc, title) {
    let roll;
    let success;
    if (this.#zero(dc, setup)) {
      success = true;
      roll = { total: setup.bonus };
      await postCard(this.actor, { tool: 'usurpador', tone: 'success', title, subtitle: 'escolheu 0: sucesso', rows: [['Resultado', `${setup.bonus} (só o bônus de ${setup.skill.label})`], ['CD', String(dc)]], note: 'Sem rolar o d20: não há acerto crítico nem falha crítica.' });
    } else {
      roll = await new Roll(setup.formula).evaluate();
      success = roll.total >= dc;
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: chatFlavor({ tool: 'usurpador', title, result: `${setup.skill.label} CD ${dc} · ${success ? 'sucesso' : 'falha'}`, tone: success ? 'success' : 'error' })
      });
    }
    if (setup.pmCost && typeof this.actor.spendMana === 'function') await this.actor.spendMana(setup.pmCost, 0, false);
    return { roll, success };
  }

  /* ---------- poderes concedidos ---------- */

  /** Poderes do deus: nome do livro → item do compêndio (com apelidos). */
  powersOf(god) {
    const byKey = new Map(this.powers.map(p => [p.key, p]));
    return (GRANTED_POWERS[god] ?? []).map(name => {
      const found = byKey.get(fold(POWER_ALIASES[name] ?? name)) ?? byKey.get(fold(name)) ?? null;
      const owned = [...(this.actor?.items ?? [])].some(i => i.type === 'poder' && fold(i.name) === fold(found?.name ?? name));
      return { god, name, found, owned };
    });
  }

  async #description(uuid, html, relativeTo) {
    if (!this.descCache.has(uuid)) {
      try { this.descCache.set(uuid, await enrichDescription(html, relativeTo)); }
      catch { this.descCache.set(uuid, `<p>${escapeHtml(plainText(html))}</p>`); }
    }
    return this.descCache.get(uuid);
  }

  /* ---------- render ---------- */

  async _renderHTML() {
    const c = this.ctxData;
    const frame = { tool: 'usurpador', extra: 't20tk-us', actor: this.actor, who: c?.profile ? `Usurpador ${c.profile.level} · até ${c.profile.maxCircle}º círculo` : (this.actor ? 'sem a classe Usurpador' : ''), eyebrow: 'Mecânicas especiais', title: 'Usurpador', subtitle: 'Lance magias divinas com Enganação e capture poderes concedidos.' };
    if (!this.actor) return toolFrame(frame, '');
    const setup = this.#testSetup();
    const warn = c.profile ? '' : `<p class="t20tk-bz-warn">A ficha não tem a classe <b>Usurpador</b> (Heróis de Arton). ${game.user.isGM ? 'Como mestre, você ainda pode usar esta janela.' : ''}</p>`;
    const summary = `<section class="t20tk-bz-profiles"><div class="t20tk-bz-profile">
      <div class="t20tk-bz-profile-head"><strong>Usurpador</strong> <span>Heróis de Arton p. 40</span></div>
      <div class="t20tk-bz-facts">
        <span>${escapeHtml(setup.skill.label)} <b>${sign(setup.skill.value)}</b></span>
        <span>Penalidade de armadura <b>${c.armorPenalty}</b></span>
        <span>PM <b>${c.pm}</b></span>
        ${c.profile && c.profile.level >= 20 ? '<span><b>Roubo Divino</b> ativo</span>' : ''}
        ${c.borrowed.length ? `<span>${c.borrowed.length} magia(s) usurpada(s) na ficha <button type="button" class="t20tk-bz-link" data-action="cleanup">remover</button></span>` : ''}
      </div>${warn}</div></section>`;
    const tabs = `<nav class="t20tk-es-tabs">
      <button type="button" data-action="switchView" data-view="usurpar" aria-pressed="${this.view.tab === 'usurpar'}">Usurpar</button>
      <button type="button" data-action="switchView" data-view="capturado" aria-pressed="${this.view.tab === 'capturado'}">Poder Capturado</button>
    </nav>`;
    let body;
    if (this.cast) body = this.#renderCast();
    else if (this.view.tab === 'usurpar') {
      body = `${spellFilterPanel(this.sf, this.sfOptions, { maxCircle: c.profile?.maxCircle ?? 0, packs: this.catalog.packs, placeholder: 'Buscar magia divina…', extra: `<label class="t20tk-bz-check"><input type="checkbox" name="holySymbol" ${this.view.holySymbol ? 'checked' : ''}> Símbolo sagrado visível (−5)</label>` })}
        <ol class="t20tk-bz-list t20tk-es-list" data-region="results">${this.#renderSpells()}</ol>`;
    } else body = this.#renderCapture();
    return toolFrame(frame, `${summary}${tabs}${body}`);
  }

  #renderSpells() {
    const c = this.ctxData;
    const max = c.profile?.maxCircle ?? (game.user.isGM ? 5 : 0);
    const res = filterSpells(this.catalog.spells.filter(s => (s.type === 'div' || s.type === 'uni') && s.circle && s.circle <= max), this.sf);
    const viaOf = new Map(res.results.map(r => [r.spell.uuid, r.via]));
    const rows = res.results.map(r => r.spell);
    if (!rows.length) return `<li class="t20tk-bz-empty">Nenhuma magia divina disponível.</li>`;
    const setup = this.#testSetup({ holySymbol: this.view.holySymbol });
    return rows.map(s => {
      const dc = usurpDC(s.cost);
      return cardHTML({
        img: s.img, name: s.name, status: 'allowed', action: 'openSpell', uuid: s.uuid,
        metaHtml: `${escapeHtml(SPELL_SCHOOLS[s.school] ?? '')} • ${s.cost ?? '?'} PM • <b>CD ${dc}</b> sem aprimoramentos`,
        source: s.book || s.packLabel, metaExtra: viaTags(viaOf.get(s.uuid)),
        side: `<span class="t20tk-pill">${s.circle}º</span><span class="t20tk-bz-status" title="Chance no d20 com ${escapeHtml(setup.skill.label)} ${sign(setup.bonus)}">${chanceOf(dc, setup.bonus)}%</span>${this.actor.isOwner ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="usurp" data-uuid="${s.uuid}">Usurpar…</button>` : ''}`
      });
    }).join('');
  }

  /** Bloco do teste: perícia (chips), modificadores marcáveis e ajuste livre. */
  #renderTest(setup, { holy = false } = {}) {
    const cur = setup.skill.key;
    const enga = setup.skills.find(s => s.key === TEST_SKILL);
    const main = [
      { key: TEST_SKILL, label: `${enga?.label ?? 'Enganação'} ${sign(enga?.value ?? 0)}`, note: 'padrão' },
      ...setup.substitutes.map(s => ({ key: s.key, label: `${s.label} ${sign(setup.skills.find(k => k.key === s.key)?.value ?? 0)}`, note: `por ${s.source}` }))
    ];
    if (!main.some(m => m.key === cur)) main.push({ key: cur, label: `${setup.skill.label} ${sign(setup.skill.value)}`, note: 'escolhida' });
    const chip = (key, label, title = '') => `<button type="button" class="t20tk-chip ${key === cur ? 'is-on' : ''}" data-action="testSkill" data-value="${escapeHtml(key)}" ${title ? `title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</button>`;
    const all = this.view.allSkills ? `<div class="t20tk-wz-chips">${setup.skills.map(s => chip(s.key, `${s.label} ${sign(s.value)}`)).join('')}</div>` : '';
    const toggle = (action, id, on, label, extra = '') => `<li class="t20tk-us-mod ${on ? 'is-on' : ''}"><button type="button" class="t20tk-chip ${on ? 'is-on' : ''}" data-action="${action}" data-id="${escapeHtml(id)}">${on ? 'Usando' : 'Usar'}</button><span>${label}</span>${extra}</li>`;
    const fx = setup.effects.map(e => {
      const qty = Number(this.test.fx[e.id]) || 0;
      const what = `<b>${escapeHtml(e.name)}</b>${e.adds.length ? ` <small>${escapeHtml(e.adds.map(showValue).join(', '))}</small>` : ''}${e.cost ? ` <small>· ${e.cost} PM</small>` : ''}`;
      if (!e.aumenta) return toggle('testFx', e.id, qty > 0, what);
      return `<li class="t20tk-us-mod ${qty ? 'is-on' : ''}"><span class="t20tk-us-step"><button type="button" data-action="testFx" data-id="${escapeHtml(e.id)}" data-step="-1">−</button><b>${qty}</b><button type="button" data-action="testFx" data-id="${escapeHtml(e.id)}" data-step="1">+</button></span><span>${what}</span></li>`;
    }).join('');
    const texts = setup.texts.map(t => t.onSheet
      ? `<li class="t20tk-us-mod"><span class="t20tk-us-auto">Já na ficha</span><span><b>${escapeHtml(t.source)}</b> <small>${escapeHtml(t.text)}</small></span></li>`
      : toggle('testText', t.id, !!this.test.text[t.id], `<b>${escapeHtml(t.source)}</b> <small>${escapeHtml(t.text)} (confira se vale aqui)</small>`)).join('');
    const holyRow = holy ? toggle('testHoly', 'holy', this.view.holySymbol, '<b>Símbolo sagrado visível</b> <small>−5</small>') : '';
    return `<div class="t20tk-wz-field t20tk-us-test"><span>Teste</span>
      <div class="t20tk-wz-chips">${main.map(m => chip(m.key, m.label, m.note)).join('')}<button type="button" class="t20tk-chip ${this.view.allSkills ? 'is-on' : ''}" data-action="testAllSkills">Outra perícia…</button></div>
      ${setup.substitutes.length ? `<p class="t20tk-bz-note">${setup.substitutes.map(s => `<b>${escapeHtml(s.source)}</b> deixa usar ${escapeHtml(s.label)}`).join(' · ')}.</p>` : ''}
      ${all}
      <ul class="t20tk-us-mods">${holyRow}${fx}${texts}</ul>
      <label class="t20tk-us-extra">Outros bônus ou penalidades
        <span class="t20tk-us-step"><button type="button" data-action="testExtraStep" data-step="-1">−</button><input type="number" name="testExtra" value="${this.test.extra}" step="1"><button type="button" data-action="testExtraStep" data-step="1">+</button></span></label>
      <p class="t20tk-bz-meta">${setup.parts.map((p, i) => `${i ? ' ' : ''}${escapeHtml(p.label)} ${escapeHtml(showValue(p.value))}`).join(' ·')}</p>
    </div>`;
  }

  #renderCast() {
    const k = this.cast;
    const back = `<button type="button" class="t20tk-bz-link" data-action="castBack">← Voltar à lista</button>`;
    if (k.loading) return `<section class="t20tk-us-cast">${back}<p class="t20tk-bz-note">Carregando…</p></section>`;
    if (k.error) return `<section class="t20tk-us-cast">${back}<p class="t20tk-bz-warn">${escapeHtml(k.error)}</p></section>`;
    const c = this.ctxData;
    const usurp = k.kind === 'usurp';
    const setup = this.#testSetup({ holySymbol: usurp && this.view.holySymbol });
    let enh = '';
    let cost = 0;
    let dc;
    if (usurp) {
      cost = castCost(k.base, k.enh.map(e => ({ cost: e.cost, qty: k.picks[e.key] ?? 0 })));
      dc = usurpDC(cost);
      const costLabel = e => (e.cost === 'Truque' ? 'Truque' : Number(e.cost) ? `${Number(e.cost) > 0 ? '+' : ''}${e.cost} PM` : 'Especial');
      const rows = k.enh.map(e => {
        const qty = k.picks[e.key] ?? 0;
        const ctl = e.aumenta
          ? `<span class="t20tk-us-step"><button type="button" data-action="enhStep" data-key="${escapeHtml(e.key)}" data-step="-1">−</button><b>${qty}</b><button type="button" data-action="enhStep" data-key="${escapeHtml(e.key)}" data-step="1">+</button></span>`
          : `<button type="button" class="t20tk-chip ${qty ? 'is-on' : ''}" data-action="enhToggle" data-key="${escapeHtml(e.key)}">${qty ? 'Usando' : 'Usar'}</button>`;
        return `<li class="t20tk-us-enh ${qty ? 'is-on' : ''}">${ctl}<span class="t20tk-enh-cost">${escapeHtml(costLabel(e))}</span><span>${escapeHtml(e.text)}${e.fromSheet ? ' <small>(da sua ficha)</small>' : ''}</span></li>`;
      }).join('');
      enh = `<div class="t20tk-wz-field"><span>Aprimoramentos</span>
        ${rows ? `<ul class="t20tk-us-enhs">${rows}</ul>` : '<p class="t20tk-bz-note">Esta magia não tem aprimoramentos cadastrados.</p>'}
        ${c.profile?.level >= 20 ? '<p class="t20tk-bz-note">Roubo Divino entra depois do teste: −1 PM e +1 na CD da magia a cada 10 pontos.</p>' : ''}</div>`;
    } else dc = captureDC(c.usesToday);
    const totalPM = cost + setup.pmCost;
    const zero = this.#zero(dc, setup);
    const head = `<header class="t20tk-us-cast-head">${k.img ? `<img src="${escapeHtml(k.img)}" alt="">` : ''}<span><small>${usurp ? 'Usurpar' : `Capturar de ${escapeHtml(k.god)}`}</small><b>${escapeHtml(k.name)}</b>${usurp ? `<em>${k.circle}º círculo · ${k.base} PM sem aprimoramentos</em>` : `<em>1 hora · +5 na CD a cada uso no mesmo dia</em>`}</span>${back}</header>`;
    const desc = `<details class="t20tk-disclosure" data-key="desc" ${usurp ? '' : 'open'}><summary>Descrição</summary><div class="t20tk-disclosure-body t20tk-bz-description">${k.html || '<p>Sem descrição.</p>'}</div></details>`;
    const lacks = totalPM > c.pm ? `<p class="t20tk-bz-warn">Você tem ${c.pm} PM e esta conjuração gasta ${totalPM}.</p>` : '';
    const sum = `<div class="t20tk-us-sum">
      ${usurp ? `<span><small>PM</small><b>${cost}</b></span>` : ''}
      ${setup.pmCost ? `<span><small>PM do teste</small><b>${setup.pmCost}</b></span>` : ''}
      <span><small>CD</small><b>${dc}</b></span>
      <span><small>Teste</small><b>${escapeHtml(zero ? `0 + ${setup.bonus}` : setup.formula)}</b></span>
      <span><small>Chance</small><b>${zero ? 100 : chanceOf(dc, setup.bonus)}%</b></span>
      ${this.#canZero(dc, setup) ? `<button type="button" class="t20tk-chip ${zero ? 'is-on' : ''}" data-action="testZero" title="O resultado é só o bônus (${setup.bonus}): passa sem rolar, mas sem chance de acerto crítico">Escolher 0</button>` : ''}
      <button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="castRoll">${zero ? 'Escolher 0' : 'Rolar'} ${escapeHtml(setup.skill.label)}${usurp ? ' e lançar' : ''}</button>
    </div>`;
    const rule = usurp
      ? `<p class="t20tk-bz-note">CD 20 + custo final em PM (com os aprimoramentos). Falhou: a magia é perdida e os PM são gastos. Não pode escolher 10. Quando o bônus já alcança a CD, dá para escolher 0 (passa sem rolar, sem crítico). Depois de passar, a janela de conjuração do sistema abre com estes aprimoramentos já marcados.</p>`
      : `<p class="t20tk-bz-note">Passou: você conta como devoto de ${escapeHtml(k.god)} e recebe este poder até o fim do dia. Confira os pré-requisitos do poder.</p>`;
    return `<section class="t20tk-us-cast">${head}${desc}${enh}${this.#renderTest(setup, { holy: usurp })}${rule}${lacks}${sum}</section>`;
  }

  #renderCapture() {
    const c = this.ctxData;
    const lvl = c.profile?.level ?? 0;
    if (lvl < 4 && !game.user.isGM) return `<p class="t20tk-bz-empty">Poder Capturado chega no 4º nível de Usurpador.</p>`;
    const status = c.captureActive
      ? `<p class="t20tk-bz-note">Hoje: devoto de <b>${escapeHtml(c.capture.god)}</b>, com <b>${escapeHtml(c.capture.power)}</b>. Usos hoje: ${c.usesToday}. <button type="button" class="t20tk-bz-link" data-action="endCapture">encerrar</button></p>`
      : c.capture?.power ? `<p class="t20tk-bz-warn">O poder capturado de ontem (${escapeHtml(c.capture.power)}) expirou. <button type="button" class="t20tk-bz-link" data-action="endCapture">remover da ficha</button></p>` : '';
    const q = fold(this.view.godQuery);
    const godMatch = g => !q || fold(g).includes(q) || this.powersOf(g).some(p => fold(p.found?.name ?? p.name).includes(q));
    const gods = Object.keys(GRANTED_POWERS).filter(godMatch);
    const chips = `<div class="t20tk-wz-chips">${gods.map(g => `<button type="button" class="t20tk-chip ${this.view.god === g ? 'is-on' : ''}" data-action="pickGod" data-value="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('') || '<span class="t20tk-bz-note">Nenhum deus ou poder com esse nome.</span>'}</div>`;
    let list = [];
    if (this.view.god) list = this.powersOf(this.view.god);
    else if (q) list = Object.keys(GRANTED_POWERS).flatMap(g => this.powersOf(g)).filter(p => fold(p.found?.name ?? p.name).includes(q) || fold(p.god).includes(q));
    const setup = this.#testSetup();
    const dc = captureDC(c.usesToday);
    const rows = list.map(p => {
      const ok = p.found && !p.owned;
      const key = `${p.god}::${p.found?.uuid ?? p.name}`;
      const open = this.view.openPower === key;
      const card = cardHTML({
        img: p.found?.img, name: p.found?.name ?? p.name, status: ok ? 'allowed' : 'blocked',
        meta: p.found ? `${this.view.god ? '' : `${p.god} · `}${p.found.packLabel}` : 'Não está nos compêndios instalados',
        sub: p.owned ? 'Já está na ficha' : (p.found ? (open ? 'Clique para fechar a descrição' : 'Clique para ver o que o poder faz') : ''),
        action: p.found ? 'togglePower' : '', uuid: key, selected: open,
        side: `<span class="t20tk-bz-status" title="Chance no d20 com ${escapeHtml(setup.skill.label)} ${sign(setup.bonus)}">${ok ? `${chanceOf(dc, setup.bonus)}%` : '—'}</span>${ok && this.actor.isOwner ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="capture" data-uuid="${p.found.uuid}" data-god="${escapeHtml(p.god)}">Capturar…</button>` : ''}`
      });
      const desc = open ? `<li class="t20tk-us-desc t20tk-bz-description">${this.descCache.get(p.found.uuid) ?? `<p>${escapeHtml(plainText(p.found.description))}</p>`}</li>` : '';
      return card + desc;
    }).join('');
    const empty = !this.view.god && !q ? '<p class="t20tk-bz-note">Escolha um deus ou busque um poder pelo nome.</p>' : (!rows ? '<p class="t20tk-bz-empty">Nenhum poder encontrado.</p>' : '');
    return `<section class="t20tk-us-capture">
      <p class="t20tk-bz-note">Escolha um deus, gaste 1 hora e faça ${escapeHtml(setup.skill.label)} <b>CD ${dc}</b> (+5 a cada uso no mesmo dia). Passou: você conta como devoto desse deus e recebe um poder concedido dele até o fim do dia (confira os pré-requisitos). Não precisa seguir as Obrigações & Restrições.</p>
      ${status}
      <label class="t20tk-wz-field"><span>Buscar deus ou poder</span><input type="search" name="godq" value="${escapeHtml(this.view.godQuery)}" placeholder="Ex.: Khalmyr, Coragem Total…"></label>
      <div class="t20tk-wz-field"><span>Deus</span>${chips}</div>
      ${empty}<ol class="t20tk-bz-list t20tk-es-list">${rows}</ol>
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
    let timer = null;
    root.querySelector('[name="godq"]')?.addEventListener('input', ev => {
      clearTimeout(timer);
      timer = setTimeout(() => { this.view.godQuery = ev.target.value; if (this.view.godQuery) this.view.god = ''; this.render(); }, 200);
    });
    root.querySelector('[name="testExtra"]')?.addEventListener('change', ev => { this.test.extra = Number(ev.target.value) || 0; this.render(); });
  }

  _onFirstRender() {
    const refresh = (doc) => { const a = doc?.parent ?? doc; if (a === this.actor && this.rendered) this.render(); };
    for (const hook of ['createItem', 'deleteItem', 'updateItem', 'updateActor', 'createActiveEffect', 'deleteActiveEffect', 'updateActiveEffect']) this._hooks.push([hook, Hooks.on(hook, refresh)]);
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  /** Substitui (não mescla) o registro do poder capturado. */
  async #saveCapture(capture) {
    await this.actor.unsetFlag(MODULE_ID, 'usurpador');
    if (capture) await this.actor.setFlag(MODULE_ID, 'usurpador', { capture });
  }

  /** Aprimoramentos da magia (os da própria magia e os da ficha que valem para ela), como o sistema os lista. */
  #enhancementsOf(doc) {
    const out = [];
    const seen = new Map();
    for (const e of doc.effects ?? []) {
      const f = e.flags?.tormenta20 ?? {};
      if (!f.onuse || !f.self) continue;
      const n = (seen.get(e.name) ?? 0) + 1;
      seen.set(e.name, n);
      out.push({ key: `i:${e.name}${n > 1 ? `#${n}` : ''}`, text: e.name, cost: effectCost(f), aumenta: !!f.aumenta });
    }
    for (const e of this.actor?.effects ?? []) {
      const f = e.flags?.tormenta20 ?? {};
      if (!f.onuse || !(f.spell || f.magia) || e.flags?.[MODULE_ID]?.temp || !forItem(e, doc.name)) continue;
      out.push({ key: `a:${e.id}`, text: e.name, cost: effectCost(f, { spell: false }), aumenta: !!f.aumenta, fromSheet: true });
    }
    return out;
  }

  static #onSwitch(event, target) { this.view.tab = target.dataset.view; this.cast = null; this.render(); }
  static #onCastBack() { this.cast = null; this.render(); }

  static async #onUsurp(event, target) {
    const spell = this.index.spells.find(s => s.uuid === target.dataset.uuid);
    if (!spell || !this.actor?.isOwner) return;
    this.cast = { kind: 'usurp', uuid: spell.uuid, name: spell.name, img: spell.img, circle: spell.circle, loading: true };
    await this.render();
    try {
      const owned = this.actor.items.find(i => i.type === 'magia' && fold(i.name) === spell.key);
      const doc = owned ?? await fromUuid(spell.uuid);
      if (!doc) throw new Error('Magia não encontrada no compêndio.');
      const html = await this.#description(spell.uuid, doc.system?.description?.value ?? '', doc);
      Object.assign(this.cast, { loading: false, base: Number(doc.system?.ativacao?.custo) || 0, enh: this.#enhancementsOf(doc), picks: {}, html });
    } catch (error) {
      Object.assign(this.cast, { loading: false, error: `Não foi possível abrir a magia: ${error.message}` });
    }
    this.render();
  }

  static async #onCapture(event, target) {
    const power = this.powers.find(p => p.uuid === target.dataset.uuid);
    if (!power || !this.actor?.isOwner) return;
    const html = await this.#description(power.uuid, power.description, null);
    this.cast = { kind: 'capture', uuid: power.uuid, name: power.name, img: power.img, god: target.dataset.god, html };
    this.render();
  }

  static #onEnhToggle(event, target) {
    const k = target.dataset.key;
    this.cast.picks[k] = this.cast.picks[k] ? 0 : 1;
    this.render();
  }

  static #onEnhStep(event, target) {
    const k = target.dataset.key;
    this.cast.picks[k] = Math.max(0, (this.cast.picks[k] ?? 0) + Number(target.dataset.step));
    this.render();
  }

  static #onTestSkill(event, target) { this.test.skill = target.dataset.value; this.view.allSkills = false; this.render(); }
  static #onTestAllSkills() { this.view.allSkills = !this.view.allSkills; this.render(); }
  static #onTestFx(event, target) {
    const id = target.dataset.id;
    const cur = Number(this.test.fx[id]) || 0;
    this.test.fx[id] = target.dataset.step ? Math.max(0, cur + Number(target.dataset.step)) : (cur ? 0 : 1);
    this.render();
  }
  static #onTestText(event, target) { const id = target.dataset.id; this.test.text[id] = !this.test.text[id]; this.render(); }
  static #onTestExtraStep(event, target) { this.test.extra = (Number(this.test.extra) || 0) + Number(target.dataset.step); this.render(); }
  static #onTestZero() { this.test.zero = !this.test.zero; this.render(); }
  static #onTestHoly() { this.view.holySymbol = !this.view.holySymbol; this.render(); }

  static #onPickGod(event, target) {
    const g = target.dataset.value;
    this.view.god = this.view.god === g ? '' : g;
    this.view.openPower = '';
    this.render();
  }

  static async #onTogglePower(event, target) {
    const key = target.dataset.uuid;
    if (this.view.openPower === key) { this.view.openPower = ''; return this.render(); }
    this.view.openPower = key;
    const uuid = key.split('::')[1];
    const power = this.powers.find(p => p.uuid === uuid);
    if (power) await this.#description(power.uuid, power.description, null);
    this.render();
  }

  static async #onCastRoll() {
    const k = this.cast;
    if (!k || k.loading || k.error || !this.actor?.isOwner) return;
    await this.#saveTest();
    if (k.kind === 'usurp') await this.#castUsurp(k);
    else await this.#castCapture(k);
  }

  async #castUsurp(k) {
    const actor = this.actor;
    const spell = this.index.spells.find(s => s.uuid === k.uuid);
    const cost = castCost(k.base, k.enh.map(e => ({ cost: e.cost, qty: k.picks[e.key] ?? 0 })));
    const dc = usurpDC(cost);
    const stale = actor.effects?.filter(e => e.getFlag?.(MODULE_ID, 'temp') === 'roubo-divino').map(e => e.id) ?? [];
    if (stale.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stale);
    const setup = this.#testSetup({ holySymbol: this.view.holySymbol });
    const { roll, success } = await this.#rollTest(setup, dc, `Usurpar: ${k.name}`);
    if (!success) {
      if (cost > 0 && typeof actor.spendMana === 'function') await actor.spendMana(cost, 0, false);
      await postCard(actor, { tool: 'usurpador', tone: 'error', title: 'Magia perdida', items: [{ name: k.name, img: k.img, note: `${cost} PM gastos mesmo assim` }] });
      this.cast = null;
      return this.render();
    }
    const theft = divineTheft(this.ctxData.profile?.level ?? 0, roll.total);
    let theftEffect = null;
    let hook = null;
    try {
      let item = actor.items.find(i => i.type === 'magia' && fold(i.name) === (spell?.key ?? fold(k.name)));
      if (!item) {
        const doc = await fromUuid(k.uuid);
        const data = game.items.fromCompendium(doc);
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.learnedBy`, 'usurpar');
        [item] = await actor.createEmbeddedDocuments('Item', [data]);
      }
      if (theft) {
        [theftEffect] = await actor.createEmbeddedDocuments('ActiveEffect', [divineTheftEffect(theft, item.name, item.img)]);
        await postCard(actor, { tool: 'usurpador', tone: 'success', title: 'Roubo Divino', rows: [['Magia', item.name], ['Custo', `−${theft} PM`], ['CD', `+${theft}`]], note: 'Já vem marcado na janela de conjuração.' });
      }
      hook = Hooks.on('renderAbilityUseDialog', (app, html) => prefillCastDialog(app, html, { name: item.name, picks: k.picks, cost: Math.max(theft ? 1 : 0, cost - theft) }));
      this.cast = null;
      this.render();
      await item.roll();
    } catch (error) {
      console.error('[T20 Toolkit] Usurpar:', error);
      ui.notifications.error(`Não foi possível lançar a magia: ${error.message}`);
    } finally {
      if (hook !== null) Hooks.off('renderAbilityUseDialog', hook);
      if (theftEffect) await theftEffect.delete().catch(() => {});
    }
  }

  async #castCapture(k) {
    const actor = this.actor;
    const c = this.ctxData;
    const dc = captureDC(c.usesToday);
    const setup = this.#testSetup();
    const { success } = await this.#rollTest(setup, dc, `Poder Capturado: ${k.name} (${k.god})`);
    const uses = c.usesToday + 1;
    this.cast = null;
    if (!success) {
      // Falhou: mantém o poder de hoje (se houver) e só conta o uso.
      await this.#saveCapture(c.captureActive ? { ...c.capture, uses } : { day: c.day, uses });
      return this.render();
    }
    if (c.capture?.itemId) await actor.items.get(c.capture.itemId)?.delete();
    const doc = await fromUuid(k.uuid);
    const data = game.items.fromCompendium(doc);
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.capturedBy`, 'usurpador');
    const [item] = await actor.createEmbeddedDocuments('Item', [data]);
    await this.#saveCapture({ god: k.god, power: k.name, itemId: item.id, day: c.day, uses });
    await postCard(actor, { tool: 'usurpador', tone: 'success', title: 'Poder Capturado', subtitle: `devoto de ${k.god} até o fim do dia`, items: [{ name: k.name, img: item.img }] });
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

/**
 * Marca na janela de conjuração do sistema (AbilityUseDialog) os aprimoramentos escolhidos no Usurpador.
 * Os campos são `aprs.<id do efeito>.aplica` (caixa ou número). O Roubo Divino (efeito temporário) fica marcado.
 * Exportada para testes.
 */
export function prefillCastDialog(app, html, { name, picks = {}, cost = 0 }) {
  if (app?.item?.name !== name) return false;
  const root = html?.[0] ?? html;
  if (!root?.querySelectorAll) return false;
  const seen = new Map();
  for (const input of root.querySelectorAll('input[name^="aprs."][name$=".aplica"]')) {
    const id = input.name.split('.')[1];
    const own = app.item.effects?.get?.(id);
    const fromActor = own ? null : app.item.actor?.effects?.get?.(id);
    let qty = 0;
    if (own) {
      const n = (seen.get(own.name) ?? 0) + 1;
      seen.set(own.name, n);
      qty = picks[`i:${own.name}${n > 1 ? `#${n}` : ''}`] ?? 0;
    } else if (fromActor) qty = fromActor.flags?.[MODULE_ID]?.temp === 'roubo-divino' ? 1 : (picks[`a:${fromActor.id}`] ?? 0);
    if (input.type === 'checkbox') input.checked = qty > 0;
    else input.value = String(qty);
  }
  try { app._onInputChange?.(html); } catch { /* o total é só visual */ }
  root.querySelector('form')?.insertAdjacentHTML('afterbegin', `<p class="notes">Usurpador: aprimoramentos já marcados (${cost} PM). Confira e lance.</p>`);
  return true;
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
