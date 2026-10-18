/**
 * Criação do personagem do zero (1º nível), dentro do Planejador.
 * Estado: flags['t20-toolkit'].plan.creation
 *  { method: 'points'|'roll'|'classic'|'epic'|'khalmyr'|'nimb', base: {for..car}, rolls: [{total,value}], rollMethod, assign: {for: idx},
 *    race, raceMap: {i: atributo},                                     ← Raças Abertas
 *    ageRule ('off'|'jda'|'herois'), age, ageComps: [nome], adultPower, agePower,                      ← Idade (regra da mesa)
 *    origin, originPicks: [ 'skill:Nome' | 'power:uuid' | 'generic:…' ], originCraft, originChoice, originItems: {iN: uuid},
 *    extraOrigins: { 1: { origin, picks, craft, choice, items } },     ← várias origens (homebrew)
 *    raceChoices: { habilidade: { vaga: {mode, value} } }, racePool: { banco: [uuid] },   ← escolhas dentro da raça
 *    cls, classOneOf: {i: nome}, classCraft, path,
 *    skillPicks: { class: [chave], race: [chave], int: [chave] }       ← grade única de perícias (antigos: classSkills/intSkills)
 *    complication, complicationPower,                                  ← Complicações (Heróis de Arton)
 *    god, godPower }
 * As regras opcionais vêm de getTableRules() (janela Regras da mesa).
 */
import { MODULE_ID } from '../../constants.js';
import { planFlag, draftUpdate } from './plan-draft.js';
import { postCard, chatFlavor } from '../ui/chat.js';
import { escapeHtml, fold } from '../core/t20.js';
import { ATTRS, ATTR_LABELS, POINT_COST, stepPoint, validatePoints, parseClassSkills, skillKeyFor, intBonusSkills } from './creation-rules.js';
import { ORIGINS } from './origins.js';
import { ORIGIN_ITEMS, originItemChoices, weaponOptions, findGear } from './origin-items.js';
import { gainsAt, classSkills, classInfo } from './planner-rules.js';
import { devotionCheck, mustBeDevout } from '../core/gods.js';
import { GRANTED_POWERS, POWER_ALIASES } from '../usurpador/usurpador-rules.js';
import { raceAbilityChoices, racePools, raceSkillSlots, raceAttrBonus, raceChoiceProblems, powerGroupFilter } from './race-choices.js';
import { skillPlan, keysForName } from './skill-plan.js';
import { getTableRules, ATTRIBUTE_METHODS, enabledMethods, convertRoll, rollToValue, valkariaScores, remapRacial, racialModifiers, ageEffects, ageRuleFor, allowedAgeRules, AGE_JDA, AGE_HEROIS, AGE_COMPLICATIONS, ageComplicationItem, addAttrs } from '../core/table-rules.js';

const FLAG = `flags.${MODULE_ID}.plan.creation`;
const CORE_CRAFTS = ['alfa', 'alqu', 'arme', 'arte', 'cozi', 'enge'];
const KEY_BY_CLASS = { bardo: 'car', clerigo: 'sab', druida: 'sab', mistico: 'sab' };
const PATH_KEY = { mago: 'int', bruxo: 'int', feiticeiro: 'car' };

/** Rótulos das perícias do sistema (chave → "Misticismo", "Ofício: Alquimista"). */
export function skillLabels() {
  const out = {};
  for (const [key, cfg] of Object.entries(globalThis.CONFIG?.T20?.pericias ?? {})) {
    const label = typeof cfg.label === 'string' ? game.i18n.localize(cfg.label) : key;
    out[key] = label;
  }
  return out;
}

export function readCreation(actor) {
  const cr = planFlag(actor).creation ?? {};
  if (!cr.skillPicks && (cr.classSkills?.length || cr.intSkills?.length)) {
    // formato antigo: nomes das perícias da classe + chaves de Inteligência
    const labels = skillLabels();
    const cls = cr.classSkills ?? [];
    return { ...cr, skillPicks: { class: cls.flatMap(n => { const k = keysForName(n, labels); return k.length > 1 ? (cr.classCraft ? [cr.classCraft] : []) : k; }), race: [], int: (cr.intSkills ?? []).filter(Boolean) } };
  }
  return cr;
}

/* ---------- atributos à escolha da raça (atributosDinamicos do sistema) ---------- */

const COUNT_WORDS = { um: 1, uma: 1, outro: 1, dois: 2, duas: 2, tres: 3 };

/**
 * Atributos à escolha da raça, lidos de system.atributosDinamicos (lista permitida + texto "+1 em dois atributos").
 * Kallyanach: "+2 em um atributo ou +1 em dois". "Outro" (Meio-Orc): não pode ser um atributo que a raça já aumenta.
 * @returns {null | { count:number, allowed:string[], kally:boolean, text:string }}
 */
export function raceDynamic(race) {
  if (!race?.dynamic?.length) return null;
  const text = race.dynamicText || '';
  const t = fold(text);
  const kally = /\+2 em um .*ou \+1 em dois/.test(t);
  const m = t.match(/\+1 em (um|uma|outro|dois|duas|tres)\b/);
  const count = kally ? 2 : (m ? COUNT_WORDS[m[1]] : 1);
  let allowed = race.dynamic.filter(a => ATTRS.includes(a));
  if (/\boutro\b/.test(t)) allowed = allowed.filter(a => !(Number(race.atributos?.[a]) > 0));
  return { count, allowed, kally, text };
}

/** Escolhas feitas: cr.raceDyn = { picks: [atributo], mode: 'two'|'one' (Kallyanach) }. */
export function dynamicState(race, cr) {
  const d = raceDynamic(race);
  if (!d) return { d: null, picks: [], want: 0, bonus: {}, mode: 'two' };
  const mode = d.kally ? (cr.raceDyn?.mode ?? 'two') : 'each';
  const want = d.kally ? (mode === 'one' ? 1 : 2) : d.count;
  const picks = [...new Set(cr.raceDyn?.picks ?? [])].filter(a => d.allowed.includes(a)).slice(0, want);
  const step = d.kally && mode === 'one' ? 2 : 1;
  return { d, picks, want, mode, bonus: Object.fromEntries(picks.map(a => [a, step])) };
}

/** Raça escolhida, habilidades, escolhas internas e bancos. */
export function raceInfo(idx, cr) {
  const race = idx.races.find(r => r.uuid === cr.race) ?? null;
  if (!race) return { race: null, abilities: [], choices: [], pools: [], attrBonus: {}, skillSlots: 0, noOrigin: false, problems: [], poolChosen: [], dyn: dynamicState(null, cr), attrSlots: [] };
  const racial = idx.powers.filter(p => p.tipo === 'racial');
  const abilities = (race.grants ?? []).map(u => racial.find(p => p.uuid === u)).filter(Boolean);
  const pools = racePools(race, racial);
  const poolChosen = pools.flatMap(pl => (cr.racePool?.[pl.id] ?? []).map(u => pl.options.find(o => o.uuid === u)).filter(Boolean));
  const dyn = dynamicState(race, cr);
  // Com atributos à escolha no sistema, os "+1 em atributo" das habilidades raciais já estão neles (não somar duas vezes).
  const choices = raceAbilityChoices([...abilities, ...poolChosen].map(p => p.name))
    .map(c => (dyn.d ? { ...c, slots: c.slots.map(s => (s.kind === 'attr' ? { ...s, kind: 'attrDyn' } : s)) } : c));
  const picks = cr.raceChoices ?? {};
  const attrSlots = choices.flatMap(c => c.slots.map((s, i) => ({ c, s, i })).filter(x => x.s.kind === 'attr'));
  return {
    race, abilities, pools, poolChosen, choices, dyn, attrSlots,
    attrBonus: addAttrs(raceAttrBonus(choices, picks), dyn.bonus),
    skillSlots: raceSkillSlots(choices, picks),
    noOrigin: choices.some(c => c.noOrigin),
    problems: raceChoiceProblems(choices, picks, pools, cr.racePool ?? {})
  };
}

/* ---------- outras fontes de atributo (origens, efeitos de poderes) ---------- */

/** Origens que aumentam atributo sem efeito no item: o Toolkit aplica na base. */
export const ORIGIN_ATTR = Object.freeze({
  'Aspirante a herói': { choose: 1, label: '+1 em um atributo à sua escolha' }
});

/** Efeitos de atributo dos itens (transfer, ligados): uuid → {atributo: n}. Carregado sob demanda. */
const FX = new Map();
const FX_KEY = /^system\.atributos\.(for|des|con|int|sab|car)\.(bonus|value|base|racial)$/;
export function attrEffectsOf(doc) {
  const out = {};
  for (const e of doc?.effects ?? []) {
    if (e.disabled || e.transfer === false) continue;
    for (const c of e.changes ?? []) {
      const m = String(c.key ?? '').match(FX_KEY);
      if (m && Number(c.mode) === 2) out[m[1]] = (out[m[1]] ?? 0) + (Number(c.value) || 0);
    }
  }
  return out;
}

/** Itens que a criação vai pôr na ficha e que podem ter efeito em atributo. */
export function fxUuids(idx, cr, rules = getTableRules(), info = raceInfo(idx, cr)) {
  const out = [...info.abilities.map(a => a.uuid), ...info.poolChosen.map(p => p.uuid)];
  for (const c of info.choices) c.slots.forEach((s, i) => {
    const p = cr.raceChoices?.[c.key]?.[i] ?? {};
    if (p.value && (s.kind === 'power' || (['skillOrPower', 'bonusOrPower'].includes(s.kind) && p.mode === 'power'))) out.push(p.value);
  });
  for (const k of originSlots(cr, rules, info.noOrigin)) {
    const S = originSlot(cr, k);
    const o = ORIGINS.find(x => x.name === S.origin);
    if (!o) continue;
    if (o.fixed) { const pw = idx.powers.find(x => x.tipo === 'origem' && x.key === fold(o.fixed.power)); if (pw) out.push(pw.uuid); }
    S.picks.filter(x => x.startsWith('power:')).forEach(x => out.push(x.slice(6)));
    if (S.choice) out.push(S.choice);
  }
  for (const u of [cr.path, cr.godPower, cr.complicationPower, cr.agePower]) if (u) out.push(u);
  return [...new Set(out.filter(Boolean))];
}

/** Carrega os efeitos que faltam. Devolve true se algo novo entrou (para redesenhar). */
export async function loadAttrEffects(uuids) {
  let changed = false;
  for (const u of uuids) {
    if (FX.has(u)) continue;
    FX.set(u, {});
    try { const doc = await fromUuid(u); FX.set(u, attrEffectsOf(doc)); if (Object.keys(FX.get(u)).length) changed = true; } catch { /* sem efeito */ }
  }
  return changed;
}

/**
 * Atributos que não vêm da base nem da raça: idade, origem (aplicados na base pelo Toolkit)
 * e efeitos de poderes (aplicados pelo próprio item na ficha).
 * @returns {{ total, toBase, parts: Array<{label, attrs, how}>, needs: Array<{origin, choose}> }}
 */
export function otherAttributes(idx, cr, rules = getTableRules(), info = raceInfo(idx, cr)) {
  const parts = [];
  const age = ageFor(cr, rules);
  if (Object.values(age.attrs).some(Boolean)) parts.push({ label: `Idade (${age.label || 'idade'})`, attrs: age.attrs, how: 'base' });
  const needs = [];
  for (const k of originSlots(cr, rules, info.noOrigin)) {
    const name = originSlot(cr, k).origin;
    const rule = ORIGIN_ATTR[name];
    if (!rule) continue;
    const pick = cr.originAttr?.[name];
    needs.push({ origin: name, ...rule, pick });
    if (pick) parts.push({ label: name, attrs: { [pick]: 1 }, how: 'base' });
  }
  for (const u of fxUuids(idx, cr, rules, info)) {
    const fx = FX.get(u);
    if (fx && Object.keys(fx).length) parts.push({ label: idx.powers.find(p => p.uuid === u)?.name ?? 'Poder', attrs: fx, how: 'efeito' });
  }
  const total = addAttrs(...parts.map(p => p.attrs));
  const toBase = addAttrs(...parts.filter(p => p.how === 'base').map(p => p.attrs));
  return { total, toBase, parts, needs };
}

/* ---------- regras aplicadas ---------- */

/** Método de atributos em uso (o escolhido, se a mesa permite; senão o primeiro permitido). */
export function currentMethod(cr, rules = getTableRules()) {
  const list = enabledMethods(rules);
  return list.includes(cr.method) ? cr.method : list[0];
}

/** Resultados para distribuir: rolados (do método atual) ou o conjunto fixo (Khalmyr). */
export function rollsFor(cr, method) {
  const m = ATTRIBUTE_METHODS[method];
  if (m?.fixed) return m.fixed.map(v => ({ total: null, value: v }));
  return (cr.rollMethod ?? 'roll') === method ? (cr.rolls ?? []) : [];
}

export function baseAttributes(cr, rules = getTableRules()) {
  const method = currentMethod(cr, rules);
  if (method === 'points') return Object.fromEntries(ATTRS.map(a => [a, Number(cr.base?.[a] ?? 0)]));
  if (method === 'valkaria') return valkariaScores(cr.vDice ?? [], cr.vAssign ?? {}, ATTRS).value;
  const rolls = rollsFor(cr, method);
  return Object.fromEntries(ATTRS.map(a => [a, rolls[cr.assign?.[a]]?.value ?? 0]));
}

/** Modificadores raciais efetivos (com Raças Abertas, redistribuídos). */
export function racialAttributes(race, cr, rules = getTableRules(), bonus = {}) {
  const atributos = race?.atributos ?? {};
  const base = rules.openRaces ? remapRacial(atributos, cr.raceMap ?? {}).atributos : Object.fromEntries(ATTRS.map(a => [a, Number(atributos[a]) || 0]));
  return Object.fromEntries(ATTRS.map(a => [a, (base[a] ?? 0) + (bonus[a] ?? 0)]));
}

export function ageFor(cr, rules = getTableRules()) {
  const rule = ageRuleFor(cr.ageRule, rules);
  if (rule === 'off') return ageEffects('off');
  return ageEffects(rule, cr.age || 'jovem', { adultPower: !!cr.adultPower });
}

/**
 * Atributos finais previstos: base + raça (fixos, à escolha e de habilidades) + outros
 * (idade, origem, efeitos de poderes — `other` vem de otherAttributes().total; sem ele, só a idade).
 */
export function finalAttributes(cr, race, rules = getTableRules(), bonus = {}, other = null) {
  const base = baseAttributes(cr, rules);
  const total = addAttrs(base, racialAttributes(race, cr, rules, bonus), other ?? ageFor(cr, rules).attrs);
  return Object.fromEntries(ATTRS.map(a => [a, total[a] ?? 0]));
}

/* ---------- origens (uma ou várias) ---------- */

/** Caminhos das flags de cada origem: a 1ª usa as chaves antigas; as extras ficam em extraOrigins.N. */
export function slotPaths(k) {
  return k === 0
    ? { origin: 'origin', picks: 'originPicks', craft: 'originCraft', choice: 'originChoice', items: 'originItems' }
    : { origin: `extraOrigins.${k}.origin`, picks: `extraOrigins.${k}.picks`, craft: `extraOrigins.${k}.craft`, choice: `extraOrigins.${k}.choice`, items: `extraOrigins.${k}.items` };
}
export function originSlot(cr, k) {
  if (k === 0) return { origin: cr.origin, picks: cr.originPicks ?? [], craft: cr.originCraft, choice: cr.originChoice, items: cr.originItems ?? {} };
  const x = cr.extraOrigins?.[k] ?? {};
  return { origin: x.origin, picks: x.picks ?? [], craft: x.craft, choice: x.choice, items: x.items ?? {} };
}
export function originSlots(cr, rules = getTableRules(), noOrigin = false) {
  const age = ageFor(cr, rules);
  if (age.originBenefits === 0 || noOrigin) return [];
  return Array.from({ length: rules.originsCount }, (_, k) => k);
}

/* ---------- HTML ---------- */

/** Grupo de chips que grava um campo da criação (ação wzSet; clicar de novo limpa). */
export function chipField(field, options, current, { num = false } = {}) {
  return `<div class="t20tk-wz-chips">${options.map(o => `<button type="button" class="t20tk-chip ${String(current ?? '') === String(o.value) ? 'is-on' : ''}" data-action="wzSet" data-field="${escapeHtml(field)}" data-value="${escapeHtml(o.value)}" ${num ? 'data-num="1"' : ''} ${o.disabled ? `disabled title="${escapeHtml(o.reason ?? '')}"` : ''}>${escapeHtml(o.label)}</button>`).join('')}</div>`;
}

/**
 * Vaga que abre o buscador do assistente (em vez de menu suspenso): mostra o escolhido e "Escolher…/Trocar…".
 * `pool` = grupo de poderes (veja powerGroupFilter) ou 'spell'; `type`/`school` filtram magias.
 */
export function pickButton({ path, pool, title, item = null, type = '', school = '', asNote = false }) {
  const attrs = `data-action="wzPickOpen" data-path="${escapeHtml(path)}" data-pool="${escapeHtml(pool)}" data-title="${escapeHtml(title)}" data-type="${escapeHtml(type)}" data-school="${escapeHtml(school)}"`;
  return `<div class="t20tk-wz-pickslot ${item ? 'is-done' : ''}">${item ? `${item.img ? `<img src="${escapeHtml(item.img)}" alt="">` : '<span class="t20tk-wz-noimg">✦</span>'}<b>${escapeHtml(item.name)}</b>` : '<span class="t20tk-lv-empty">Não escolhido</span>'}${asNote && item ? '<small class="t20tk-bz-meta">anotada no chat, não vira magia na ficha</small>' : ''}
    <button type="button" class="t20tk-ui-button ${item ? '' : 't20tk-ui-button--primary'}" ${attrs}>${item ? 'Trocar…' : 'Escolher…'}</button></div>`;
}
export const sign = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

/**
 * Página de Atributos: método (pontos, rolagens, Khalmyr, Nimb, Valkaria), base + raça + outros = total,
 * e todas as escolhas de bônus no mesmo lugar (atributos à escolha da raça, "+1" de habilidades raciais,
 * origens como Aspirante a herói), além do que vem pronto (idade, efeitos de poderes).
 * `ex` = { info: raceInfo(), other: otherAttributes() }.
 */
export function renderAttributes(cr, rules, race, age, bonus = {}, ex = {}) {
  const method = currentMethod(cr, rules);
  const methods = enabledMethods(rules);
  const base = baseAttributes(cr, rules);
  const v = validatePoints(cr.base ?? {}, rules.pointBudget);
  const racial = racialAttributes(race, cr, rules, bonus);
  const other = ex.other ?? { total: age.attrs, parts: Object.values(age.attrs).some(Boolean) ? [{ label: 'Idade', attrs: age.attrs, how: 'base' }] : [], needs: [] };
  const rolls = rollsFor(cr, method);
  const used = new Set(Object.values(cr.assign ?? {}).map(String));
  const vk = method === 'valkaria' ? valkariaScores(cr.vDice ?? [], cr.vAssign ?? {}, ATTRS) : null;
  const rows = ATTRS.map(a => {
    let baseCell;
    if (method === 'points') baseCell = `<div class="t20tk-ac-step"><button type="button" data-action="attrStep" data-attr="${a}" data-delta="1" aria-label="Aumentar ${ATTR_LABELS[a]}" ${Number(cr.base?.[a] ?? 0) >= 4 ? 'disabled' : ''}>▲</button><output>${sign(base[a]) || '0'}</output><button type="button" data-action="attrStep" data-attr="${a}" data-delta="-1" aria-label="Diminuir ${ATTR_LABELS[a]}" ${Number(cr.base?.[a] ?? 0) <= -1 ? 'disabled' : ''}>▼</button></div>`;
    else if (vk) baseCell = `<output title="${vk.score[a]} na escala de 3 a 18">${sign(base[a]) || '0'}</output><small>${vk.score[a]}${vk.score[a] > 18 ? ' (máx. +4)' : ''}</small>`;
    else baseCell = rolls.length ? `<div class="t20tk-ac-rolls">${chipField(`assign.${a}`, rolls.map((r, i) => ({ value: i, label: `${sign(r.value) || '0'}${r.total !== null ? ` (${r.total})` : ''}`, disabled: used.has(String(i)) && String(cr.assign?.[a]) !== String(i), reason: 'já usado em outro atributo' })), cr.assign?.[a], { num: true })}</div>` : '<output>—</output>';
    const cost = method === 'points' ? `<small>custo ${POINT_COST[Number(cr.base?.[a] ?? 0)] ?? '?'}</small>` : '';
    const o = other.total?.[a] ?? 0;
    const r = (racial[a] ?? 0) + o;
    const why = [racial[a] ? `Raça ${sign(racial[a])}` : '', ...other.parts.filter(p => p.attrs[a]).map(p => `${p.label} ${sign(p.attrs[a])}`)].filter(Boolean).join(' · ');
    const total = base[a] + r;
    return `<div class="t20tk-ac-row"><span class="t20tk-ac-name"><b>${a.toUpperCase()}</b><small>${ATTR_LABELS[a]}</small></span>
      <span class="t20tk-ac-base">${baseCell}${cost}</span><span class="t20tk-ac-op">+</span><span class="t20tk-ac-racial"><output class="${r > 0 ? 'is-plus' : r < 0 ? 'is-minus' : ''}" title="${escapeHtml(why || 'sem bônus')}">${sign(r) || '0'}</output>${why ? `<small>${escapeHtml(why)}</small>` : ''}</span><span class="t20tk-ac-op">=</span><output class="t20tk-ac-total">${sign(total) || '0'}</output></div>`;
  }).join('');
  const m = ATTRIBUTE_METHODS[method];
  const pill = method === 'points'
    ? `<div class="t20tk-ac-points ${v.left === 0 ? 'is-done' : v.left < 0 ? 'is-over' : ''}"><span>Pontos restantes</span><b>${v.left}</b></div>`
    : m.fixed ? '' : `<div class="t20tk-ac-points"><button type="button" class="t20tk-ui-button" data-action="rollAttributes">${(vk ? (cr.vDice ?? []).length : rolls.length) ? 'Rolar de novo' : vk ? 'Rolar 7d6' : 'Rolar atributos'}</button></div>`;
  const seg = methods.length > 1 ? `<div class="t20tk-seg" role="radiogroup" aria-label="Método">${methods.map(id => `<label title="${escapeHtml(ATTRIBUTE_METHODS[id].label)}"><input type="radio" name="method" value="${id}" ${method === id ? 'checked' : ''}><span>${escapeHtml(ATTRIBUTE_METHODS[id].short)}</span></label>`).join('')}</div>` : `<span class="t20tk-bz-note">${escapeHtml(m.label)}</span>`;
  const help = {
    points: `Custo: 1 → 1 ponto, 2 → 2, 3 → 4, 4 → 7. Cada atributo em −1 devolve 1 ponto. Gaste exatamente ${rules.pointBudget}.`,
    roll: 'Role 6 vezes 4d6 (descarta o menor); se a soma dos atributos for menor que 6, o menor é rolado de novo.',
    classic: 'Clássica: 6 vezes 3d6. Personagens mais fracos e desequilibrados.',
    epic: 'Épica: 6 vezes 3d6 (descarta o menor) +6. Personagens mais fortes.',
    khalmyr: 'Khalmyr: distribua 3, 3, 2, 1, 0 e −1, sem rolar nada.',
    nimb: 'Nimb: 7d20, descarta o menor. 1–3 vira −3; 18–19 vira 4; 20 vira 5.',
    valkaria: 'Valkaria: todo atributo começa em 8. Role 7d6 e ponha cada dado inteiro no atributo que quiser (pode somar vários no mesmo). O total vira modificador pela tabela do livro (p. 17): 8–9 → −1, 10–11 → 0, 12–13 → +1, 14–15 → +2, 16–17 → +3, 18+ → +4 (máximo).'
  }[method];

  // Valkaria: cada dado escolhe um atributo
  let valk = '';
  if (vk) {
    const dice = cr.vDice ?? [];
    valk = dice.length
      ? `<section class="t20tk-wz-box t20tk-vk"><header><b>Dados (7d6)</b><small>${vk.unassigned ? `${vk.unassigned} dado(s) sem atributo` : 'todos os dados aplicados'}</small></header>
        <ul class="t20tk-vk-dice">${dice.map((d, i) => `<li class="${cr.vAssign?.[i] ? 'is-set' : ''}"><span class="t20tk-vk-die">${d}</span><div class="t20tk-wz-chips">${ATTRS.map(a => `<button type="button" class="t20tk-chip ${cr.vAssign?.[i] === a ? 'is-on' : ''}" data-action="wzVAssign" data-die="${i}" data-value="${a}">${a.toUpperCase()}</button>`).join('')}</div></li>`).join('')}</ul></section>`
      : '<p class="t20tk-bz-note">Clique em <b>Rolar 7d6</b> para começar.</p>';
  }

  // Bônus à escolha: raça (atributos dinâmicos), habilidades raciais, origens
  const choose = [];
  const info = ex.info;
  const dyn = info?.dyn;
  if (dyn?.d) {
    const full = dyn.picks.length >= dyn.want;
    const kally = dyn.d.kally ? `<div class="t20tk-wz-seg">${[['two', '+1 em dois'], ['one', '+2 em um']].map(([k, l]) => `<button type="button" data-action="wzDynMode" data-value="${k}" aria-pressed="${dyn.mode === k}">${l}</button>`).join('')}</div>` : '';
    choose.push(`<div class="t20tk-ab-row ${full ? 'is-done' : ''}"><span><b>${escapeHtml(race.name)}</b><small>${escapeHtml(dyn.d.text || 'atributos à escolha')} · ${dyn.picks.length}/${dyn.want}</small></span>${kally}
      <div class="t20tk-wz-chips">${ATTRS.map(a => { const ok = dyn.d.allowed.includes(a); const on = dyn.picks.includes(a); return `<button type="button" class="t20tk-chip ${on ? 'is-on' : ''}" data-action="wzAttrPick" data-src="dyn" data-value="${a}" ${!ok || (full && !on) ? 'disabled' : ''} title="${ok ? '' : 'a raça não permite este atributo'}">${a.toUpperCase()}${on ? ` ${sign(dyn.bonus[a])}` : ''}</button>`; }).join('')}</div></div>`);
  }
  for (const { c, s, i } of info?.attrSlots ?? []) {
    const cur = cr.raceChoices?.[c.key]?.[i]?.value;
    const prev = s.distinct ? cr.raceChoices?.[c.key]?.[i - 1]?.value : null;
    choose.push(`<div class="t20tk-ab-row ${cur ? 'is-done' : ''}"><span><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.text)}</small></span>
      <div class="t20tk-wz-chips">${ATTRS.map(a => `<button type="button" class="t20tk-chip ${cur === a ? 'is-on' : ''}" data-action="wzAttrPick" data-src="slot" data-ability="${c.key}" data-slot="${i}" data-value="${a}" ${a === prev ? 'disabled' : ''}>${a.toUpperCase()}${cur === a ? ' +1' : ''}</button>`).join('')}</div></div>`);
  }
  for (const n of other.needs ?? []) {
    choose.push(`<div class="t20tk-ab-row ${n.pick ? 'is-done' : ''}"><span><b>${escapeHtml(n.origin)}</b><small>Origem · ${escapeHtml(n.label)}</small></span>
      <div class="t20tk-wz-chips">${ATTRS.map(a => `<button type="button" class="t20tk-chip ${n.pick === a ? 'is-on' : ''}" data-action="wzAttrPick" data-src="origin" data-key="${escapeHtml(n.origin)}" data-value="${a}">${a.toUpperCase()}${n.pick === a ? ' +1' : ''}</button>`).join('')}</div></div>`);
  }
  const fixed = [];
  if (race) {
    const mods = ATTRS.filter(a => Number(race.atributos?.[a])).map(a => `${a.toUpperCase()} ${sign(Number(race.atributos[a]))}`);
    if (mods.length) fixed.push(`<li><b>${escapeHtml(race.name)}</b> <span>${mods.join(' · ')}</span>${rules.openRaces ? ' <small>(Raças Abertas: redistribuídos na etapa Raça)</small>' : ''}</li>`);
  }
  for (const p of other.parts) fixed.push(`<li><b>${escapeHtml(p.label)}</b> <span>${ATTRS.filter(a => p.attrs[a]).map(a => `${a.toUpperCase()} ${sign(p.attrs[a])}`).join(' · ')}</span> <small>${p.how === 'efeito' ? 'efeito do poder, aplicado pela ficha' : 'o Toolkit soma na base'}</small></li>`);
  const bonusBox = choose.length || fixed.length ? `<section class="t20tk-wz-box t20tk-ab"><header><b>Bônus de atributo</b><small>Tudo o que mexe nos atributos, escolhido aqui. O total acima já soma.</small></header>
    ${choose.join('')}${fixed.length ? `<ul class="t20tk-ab-fixed">${fixed.join('')}</ul>` : ''}</section>` : '';

  return `<div class="t20tk-ac-head">${seg}${pill}</div>
    ${valk}
    <div class="t20tk-ac ${!['points', 'valkaria'].includes(method) && rolls.length ? 't20tk-ac--rolls' : ''}"><div class="t20tk-ac-row t20tk-ac-th"><span>Atributo</span><span>Base</span><span></span><span>Raça e outros</span><span></span><span>Total</span></div>${rows}</div>
    <p class="t20tk-bz-note">${help}</p>
    ${method === 'points' && !v.ok && v.left < 0 ? `<p class="t20tk-bz-warn">${v.errors.map(escapeHtml).join(' ')}</p>` : ''}
    ${!['points', 'valkaria'].includes(method) && rolls.length && !m.fixed ? `<p class="t20tk-bz-note">Clique num resultado em cada atributo (cada um só pode ser usado uma vez). Rolagens: ${rolls.map(r => `${r.total} → <b>${sign(r.value) || '0'}</b>`).join(' · ')}</p>` : ''}
    ${bonusBox}`;
}

export function renderAge(cr, rules, idx, age) {
  const rule = ageRuleFor(cr.ageRule, rules);
  const RULES = { off: 'Sem regra de idade', jda: 'Livro Básico (p. 108)', herois: 'Heróis de Arton (p. 288)' };
  let html = `<div class="t20tk-wz-field"><span>Regra de idade deste personagem</span>${chipField('ageRule', ['off', ...allowedAgeRules(rules)].map(k => ({ value: k, label: RULES[k] })), rule)}</div>`;
  if (rule === 'off') return html + '<p class="t20tk-bz-note">A idade vem antes dos atributos porque pode mudá-los. Sem regra, a idade é só descritiva.</p>';
  const table = rule === 'jda' ? AGE_JDA : AGE_HEROIS;
  const band = cr.age || 'jovem';
  html += `<div class="t20tk-wz-field"><span>Faixa etária</span>${chipField('age', Object.entries(table).map(([k, v]) => ({ value: k, label: v.label })), band)}</div>`;
  const attrs = ATTRS.filter(a => age.attrs[a]).map(a => `${ATTR_LABELS[a]} ${sign(age.attrs[a])}`).join(', ');
  if (attrs) html += `<p class="t20tk-bz-note"><b>Atributos:</b> ${attrs} (já somados na etapa Atributos).</p>`;
  if (age.features?.length) html += `<ul class="t20tk-pl-gains">${age.features.map(f => `<li data-kind="note">${escapeHtml(f)}</li>`).join('')}</ul>`;
  if (rule === 'herois' && band === 'adulto') {
    html += `<label class="t20tk-cr-check"><input type="checkbox" name="adultPower" ${cr.adultPower ? 'checked' : ''}> Já Vi Coisas: receber um poder geral (e uma complicação de idade)</label>`;
    if (cr.adultPower) html += `<div class="t20tk-wz-row"><span>Poder geral</span>${pickButton({ path: 'agePower', pool: 'geral', title: 'Poder geral (Já Vi Coisas)', item: idx.powers.find(p => p.uuid === cr.agePower) })}</div>`;
  }
  if (age.complications) {
    const chosen = (cr.ageComps ?? []).filter(Boolean).slice(0, age.complications);
    const full = chosen.length >= age.complications;
    html += `<p class="t20tk-bz-note">Escolha <b>${age.complications}</b> complicação(ões) de idade (Heróis de Arton, p. 290) · ${chosen.length}/${age.complications}:</p>
      <ul class="t20tk-wz-tiles">${AGE_COMPLICATIONS.map(c => { const on = chosen.includes(c.name); return `<li><button type="button" class="t20tk-wz-tile ${on ? 'is-on' : ''}" data-action="wzAgeComp" data-value="${escapeHtml(c.name)}" ${full && !on ? 'disabled' : ''}><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.text)}</small></button></li>`; }).join('')}</ul>`;
  }
  return html;
}

/** Opções de uma escolha de item de origem: itens nomeados e/ou armas do compêndio. */
export function originChoiceOptions(gear, entry) {
  const opts = [];
  for (const o of entry.choose ?? [entry]) {
    if (o.item) { const g = findGear(gear, o.item); if (g) opts.push({ value: g.uuid, label: g.name }); }
    else if (o.weapon) for (const w of weaponOptions(gear, o.weapon)) opts.push({ value: w.uuid, label: entry.choose ? `Arma: ${w.name}` : w.name });
  }
  return opts;
}

export function renderOriginItems(idx, originName, S, P) {
  const list = ORIGIN_ITEMS[originName] ?? [];
  if (!list.length) return '';
  const gear = idx.gear ?? [];
  const rows = list.map((e, i) => {
    const id = `i${i}`;
    if (e.choose || e.weapon) return `<li>${escapeHtml(e.label ?? '')}: ${chipField(`${P.items}.${id}`, originChoiceOptions(gear, e), S.items?.[id])}</li>`;
    if (e.money) return `<li>${escapeHtml(e.label ?? `T$ ${e.money}`)} <span class="t20tk-bz-meta">rolado ao criar</span></li>`;
    if (e.note) return `<li>${escapeHtml(e.note)} <span class="t20tk-bz-meta">sem item no compêndio: combine com o mestre</span></li>`;
    const g = findGear(gear, e.item);
    return `<li>${escapeHtml(e.label ?? e.item)}${e.qty > 1 ? ` ×${e.qty}` : ''} ${g ? '' : '<span class="t20tk-bz-meta">não encontrado no compêndio</span>'}</li>`;
  }).join('');
  return `<p class="t20tk-bz-note"><b>Itens de origem</b> (vão para o inventário):</p><ul class="t20tk-pl-gains">${rows}</ul>`;
}

/** Ofício do livro básico para "Ofício" sem especificar (chips, não menu). */
export function craftChips(name, current, labels) {
  return chipField(name, CORE_CRAFTS.map(k => ({ value: k, label: (labels[k] ?? k).replace(/^Of[íi]cio:\s*/i, '') })), current);
}

/** Raça e classe escolhidas na criação, no formato de devotionCheck. */
export function devotionContext(app, cr) {
  const race = app.index.races.find(r => r.uuid === cr.race)?.name ?? '';
  const cls = app.index.classes.find(c => c.uuid === cr.cls);
  return { race, classes: cls ? [{ name: cls.name, variantOf: classInfo(cls.name)?.variantOf ?? null }] : [] };
}

/** Perícias da criação: fontes travadas (classe fixa, origem, raça) e a grade de escolhas. */
export function creationSkills(idx, cr, rules = getTableRules(), info = raceInfo(idx, cr), labels = skillLabels()) {
  const cls = idx.classes.find(c => c.uuid === cr.cls) ?? null;
  const cs = cls ? classSkills(cls.name, cls.skills) : null;
  const spec = cls ? parseClassSkills(cs.inatas, cs.numero) : null;
  const locked = [];
  const customs = [];
  const add = (name, craft, source) => {
    const keys = keysForName(name, labels);
    if (keys.length === 1) locked.push({ key: keys[0], source });
    else if (keys.length > 1) { if (craft) locked.push({ key: craft, source }); }
    else { const r = skillKeyFor(name, labels); if (r.custom) customs.push(r.custom); }
  };
  for (const k of originSlots(cr, rules, info.noOrigin)) {
    const S = originSlot(cr, k);
    const origin = ORIGINS.find(o => o.name === S.origin);
    if (!origin) continue;
    if (origin.fixed) origin.fixed.skills.forEach(n => add(n, S.craft, 'Origem'));
    else S.picks.filter(x => x.startsWith('skill:')).forEach(x => add(x.slice(6), S.craft, 'Origem'));
  }
  for (const c of info.choices) c.slots.forEach((slot, i) => {
    const v = cr.raceChoices?.[c.key]?.[i]?.value;
    if (slot.kind === 'skillFrom' && v) locked.push({ key: v, source: 'Raça' });
  });
  // Int final (com origem, idade e efeitos de poderes) decide quantas perícias de Inteligência.
  const finals = finalAttributes(cr, info.race, rules, info.attrBonus, otherAttributes(idx, cr, rules, info).total);
  const plan = skillPlan({ labels, classSpec: spec, oneOfPicks: cr.classOneOf ?? {}, classCraft: cr.classCraft, locked, picks: cr.skillPicks ?? {}, counts: { race: info.skillSlots, int: intBonusSkills(finals.int) } });
  const genericCraft = !!spec?.fixed.some(n => keysForName(n, labels).length > 1);
  return { cls, spec, plan, locked, customs, genericCraft, finals };
}

/** O que falta, por etapa do assistente: [{step, text}]. */
export function creationIssues(app, cr) {
  const rules = getTableRules();
  const idx = app.index;
  const info = raceInfo(idx, cr);
  const out = [];
  const push = (step, text) => out.push({ step, text });
  if (!cr.race) push('race', 'raça');
  else if (rules.openRaces && info.race && !remapRacial(info.race.atributos, cr.raceMap ?? {}).ok) push('race', 'modificadores raciais repetidos');
  for (const p of info.problems) push('raceChoices', p);
  const age = ageFor(cr, rules);
  if (age.complications && (cr.ageComps ?? []).filter(Boolean).length < age.complications) push('age', `${age.complications} complicação(ões) de idade`);
  if (age.extraPower && !cr.agePower) push('age', 'poder geral de "Já Vi Coisas"');
  const method = currentMethod(cr, rules);
  if (method === 'points') { if (!validatePoints(cr.base ?? {}, rules.pointBudget).ok) push('attributes', 'gastar os pontos de atributo'); }
  else if (method === 'valkaria') {
    if (!(cr.vDice ?? []).length) push('attributes', 'rolar os 7d6 (Valkaria)');
    else { const left = valkariaScores(cr.vDice, cr.vAssign ?? {}, ATTRS).unassigned; if (left) push('attributes', `aplicar ${left} dado(s) (Valkaria)`); }
  }
  else if (!rollsFor(cr, method).length || ATTRS.some(a => cr.assign?.[a] === undefined || cr.assign?.[a] === '')) push('attributes', 'distribuir os atributos');
  if (info.dyn?.d && info.dyn.picks.length < info.dyn.want) push('attributes', `${info.dyn.want - info.dyn.picks.length} atributo(s) à escolha da raça`);
  for (const { c, s, i } of info.attrSlots ?? []) {
    const v = cr.raceChoices?.[c.key]?.[i]?.value;
    if (!v) push('attributes', `+1 em atributo de ${c.name}`);
    else if (s.distinct && v === cr.raceChoices?.[c.key]?.[i - 1]?.value) push('attributes', `${c.name}: atributos diferentes`);
  }
  for (const n of otherAttributes(idx, cr, rules, info).needs) if (!n.pick) push('attributes', `+1 em atributo de ${n.origin}`);
  for (const k of originSlots(cr, rules, info.noOrigin)) {
    const S = originSlot(cr, k);
    const label = rules.originsCount > 1 ? `origem ${k + 1}` : 'origem';
    if (!S.origin) { push('origin', label); continue; }
    const o = ORIGINS.find(x => x.name === S.origin);
    const need = Math.min(2, age.originBenefits ?? 2);
    if (!o?.special && !o?.fixed && S.picks.length !== need) push('origin', `${need} benefício(s) de ${label}`);
    if (originItemChoices(S.origin).some(e => !S.items?.[e.id])) push('origin', `itens de ${label}`);
    if (S.picks.some(x => x.startsWith('generic:')) && !S.choice) push('origin', `poder de ${label}`);
  }
  if (!cr.cls) { push('class', 'classe'); push('skills', 'escolher a classe primeiro'); }
  else {
    const cls = idx.classes.find(c => c.uuid === cr.cls);
    if (gainsAt(cls?.name ?? '', 1).gains.some(x => x.kind === 'path') && !cr.path) push('class', 'caminho da classe');
    const sk = creationSkills(idx, cr, rules, info);
    if (sk.genericCraft && !cr.classCraft) push('skills', 'Ofício da classe');
    if (sk.spec?.oneOf.some((_, i) => !cr.classOneOf?.[i])) push('skills', 'perícia "ou" da classe');
    const p = sk.plan;
    if (p.picks.class.length < p.want.class) push('skills', `${p.want.class - p.picks.class.length} perícia(s) da classe`);
    if (p.picks.race.length < p.want.race) push('skills', `${p.want.race - p.picks.race.length} perícia(s) da raça`);
    if (p.picks.int.length < p.want.int) push('skills', `${p.want.int - p.picks.int.length} perícia(s) de Inteligência`);
  }
  if (rules.complications && cr.complication && !cr.complicationPower) push('complication', 'poder geral da complicação');
  const dv = devotionContext(app, cr);
  const required = mustBeDevout(dv.classes);
  if (required && !cr.god) push('god', `divindade (${required} é devoto)`);
  if (cr.god) {
    const r = devotionCheck({ god: cr.god, race: dv.race, classes: dv.classes, rules });
    if (r.level === 'block') push('god', `devoção a ${cr.god} não permitida`);
    else if (!cr.godPower) push('god', 'poder concedido');
  }
  return out;
}

export function creationProblems(app, cr) {
  return creationIssues(app, cr).map(i => i.text);
}

/** Botões ▲▼ da compra de pontos. */
export async function stepCreationAttribute(app, attr, delta) {
  if (!ATTRS.includes(attr)) return;
  const cur = readCreation(app.actor).base?.[attr] ?? 0;
  await draftUpdate(app, { [`${FLAG}.base.${attr}`]: stepPoint(cur, Number(delta)) });
}

/** Rola os atributos pelo método escolhido (4d6, 3d6, épica ou Nimb) e mostra no chat. */
export async function rollCreationAttributes(actor) {
  const cr = readCreation(actor);
  const method = currentMethod(cr);
  const m = ATTRIBUTE_METHODS[method];
  if (method === 'valkaria') {
    const roll = await new Roll('7d6').evaluate();
    let dice = (roll.dice?.[0]?.results ?? []).map(r => r.result).filter(Number.isFinite);
    if (dice.length !== 7) { dice = []; for (let i = 0; i < 7; i++) dice.push((await new Roll('1d6').evaluate()).total); }
    dice.sort((x, y) => y - x);
    await actor.update({ [`${FLAG}.vDice`]: dice, [`${FLAG}.-=vAssign`]: null });
    await postCard(actor, { tool: 'planner', title: 'Atributos rolados', subtitle: m.label, rows: [['7d6', dice.join(', ')], ['Total', String(dice.reduce((x, y) => x + y, 0))]], note: 'Aplique cada dado inteiro num atributo (todos começam em 8).' });
    return;
  }
  if (!m?.formula) return;
  const once = async () => (await new Roll(m.formula).evaluate()).total;
  let totals = [];
  for (let i = 0; i < (m.count ?? 6); i++) totals.push(await once());
  if (m.dropLowest) { const i = totals.indexOf(Math.min(...totals)); totals.splice(i, 1); }
  if (method === 'roll') {
    let guard = 0;
    while (totals.map(rollToValue).reduce((s, x) => s + x, 0) < 6 && guard++ < 50) {
      const i = totals.indexOf(Math.min(...totals));
      totals[i] = await once();
    }
  }
  const rolls = totals.map(t => ({ total: t, value: convertRoll(t, method) }));
  await actor.update({ [`${FLAG}.rolls`]: rolls, [`${FLAG}.rollMethod`]: method, [`${FLAG}.-=assign`]: null });
  await postCard(actor, { tool: 'planner', title: 'Atributos rolados', subtitle: m.label, rows: rolls.map((r, i) => [`${i + 1}ª rolagem`, `${r.total} → ${sign(r.value) || '0'}`]) });
}

/**
 * Aplica a criação na ficha. Ordem: atributos base → raça (o sistema aplica modificadores e habilidades
 * raciais e pergunta os atributos de escolha) → classe + habilidades de 1º nível → perícias → origens → complicações → divindade.
 * Guarda em history[1] o que foi feito, para "Desfazer".
 */
export async function applyCreation(app) {
  const rules = getTableRules();
  const actor = app.actor;
  const cr = readCreation(actor);
  const idx = app.index;
  const labels = skillLabels();
  const problems = creationProblems(app, cr);
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: 'Criar personagem' },
    content: `<p>Aplicar a criação em <b>${escapeHtml(actor.name)}</b>?</p>${problems.length ? `<p>Ainda falta: ${problems.map(escapeHtml).join('; ')}.</p>` : ''}<p>Se a raça tiver atributos à escolha, o sistema vai perguntar.</p>`,
    rejectClose: false
  });
  if (!ok) return;
  const prev = {
    base: Object.fromEntries(ATTRS.map(a => [a, actor.system?.atributos?.[a]?.base ?? 0])),
    trained: Object.entries(actor.system?.pericias ?? {}).filter(([, s]) => s?.treinado).map(([k]) => k),
    origem: actor.system?.detalhes?.origem ?? '', divindade: actor.system?.detalhes?.divindade ?? '',
    conjuracao: actor.system?.attributes?.conjuracao ?? '',
    tp: Number(actor.system?.dinheiro?.tp) || 0
  };
  const created = [];
  // Os itens são juntados numa fila e criados de uma vez (uma ida ao servidor em vez de uma por item).
  // A raça é a exceção: vai antes, sozinha, porque o sistema pode perguntar atributos ao criá-la.
  const queue = [];
  const abilitySlots = new Set();   // habilidades de classe: não entram se a ficha ou a fila já tiverem uma com o mesmo nome
  const queueData = (data) => {
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.plannerLevel`, 1);
    queue.push(Promise.resolve(data));
    return queue.length - 1;
  };
  const queueFrom = (uuid, extra = {}) => {
    queue.push(fromUuid(uuid).then(doc => {
      if (!doc) return null;
      const data = game.items.fromCompendium(doc);
      foundry.utils.mergeObject(data, extra);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.plannerLevel`, 1);
      return data;
    }));
    return queue.length - 1;
  };
  try {
    const age = ageFor(cr, rules);
    // 1) Atributos base (+ idade: os modificadores de idade entram na base; a raça o sistema aplica)
    const info = raceInfo(idx, cr);
    const other = otherAttributes(idx, cr, rules, info);
    const base = addAttrs(baseAttributes(cr, rules), other.toBase);
    const update = Object.fromEntries(ATTRS.map(a => [`system.atributos.${a}.base`, base[a] ?? 0]));
    // 2) Raça (substitui uma raça anterior, como a ficha faz). O Toolkit grava os modificadores finais
    //    (fixos + à escolha + "+1" de habilidades) e zera os "atributos dinâmicos" para o sistema não perguntar de novo.
    const race = info.race;
    const raceNotes = [];
    if (cr.race) {
      const oldRaces = actor.items.filter(i => i.type === 'race').map(i => i.id);
      const custom = race && (rules.openRaces || Object.keys(info.attrBonus).length || race.dynamic?.length);
      const [raceDoc] = await Promise.all([fromUuid(cr.race), oldRaces.length ? actor.deleteEmbeddedDocuments('Item', oldRaces) : null]);
      if (raceDoc) {
        const data = game.items.fromCompendium(raceDoc);
        foundry.utils.mergeObject(data, custom ? { system: { atributos: racialAttributes(race, cr, rules, info.attrBonus), atributosDinamicos: { value: [] } } } : {});
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.plannerLevel`, 1);
        const [item] = await actor.createEmbeddedDocuments('Item', [data]);
        if (item) created.push(item.id);
      }
      if (race) {
        // Garante o modificador racial final na ficha (mesmo que o sistema tenha perguntado algo ao criar a raça).
        const fin = racialAttributes(race, cr, rules, info.attrBonus);
        for (const a of ATTRS) update[`system.atributos.${a}.racial`] = fin[a] ?? 0;
      }
      // 2b) Escolhas dentro da raça: bancos (material, presentes…), poderes, magias e anotações
      for (const pool of info.pools) for (const u of cr.racePool?.[pool.id] ?? []) queueFrom(u);
      const labelsR = skillLabels();
      const spellNotes = [];
      for (const c of info.choices) for (const [i, slot] of c.slots.entries()) {
        const pick = cr.raceChoices?.[c.key]?.[i] ?? {};
        if (!pick.value) continue;
        const isPower = slot.kind === 'power' || ((slot.kind === 'skillOrPower' || slot.kind === 'bonusOrPower') && pick.mode === 'power');
        if (isPower) queueFrom(pick.value);
        else if (slot.kind === 'spell' && slot.asNote) spellNotes.push(fromUuid(pick.value).then(d => `${c.name}: ${d?.name ?? pick.value}`, () => `${c.name}: ${pick.value}`));
        else if (slot.kind === 'spell') queueFrom(pick.value, { flags: { [MODULE_ID]: { learnedBy: 'raca' } } });
        else if (slot.kind === 'note' || slot.kind === 'bonusOrPower') raceNotes.push(`${c.name}: ${slot.label ?? '+2 em'} ${labelsR[pick.value] ?? pick.value}`);
      }
      raceNotes.push(...await Promise.all(spellNotes));
    }
    // 3) Classe + habilidades de 1º nível + caminho
    const cls = idx.classes.find(c => c.uuid === cr.cls);
    let classSlot = null;
    if (cls) {
      classSlot = queueFrom(cls.uuid, { system: { niveis: 1, inicial: true } });
      for (const gain of gainsAt(cls.name, 1).gains) {
        if (gain.kind === 'ability') {
          const ref = app.findAbility?.(cls.name, gain.item) ?? idx.powers.find(p => p.tipo === 'ability' && p.key === fold(gain.item));
          if (ref && !actor.items.some(i => fold(i.name) === ref.key)) abilitySlots.add(queueFrom(ref.uuid));
        }
      }
      if (cr.path) queueFrom(cr.path);
    }
    // 4) Perícias: classe (fixas, "ou", escolhidas), origem, raça e Inteligência — da grade única
    const sk = creationSkills(idx, cr, rules, info);
    const trained = new Set([...sk.plan.tiles.filter(t => t.lockedBy).map(t => t.key), ...sk.plan.picks.class, ...sk.plan.picks.race, ...sk.plan.picks.int]);
    const customs = [...sk.customs];
    const origins = [];
    for (const k of originSlots(cr, rules, info.noOrigin)) {
      const S = originSlot(cr, k);
      const origin = ORIGINS.find(o => o.name === S.origin);
      if (!origin) continue;
      origins.push({ origin, S });
      if (origin.fixed) {
        const power = idx.powers.find(x => x.tipo === 'origem' && x.key === fold(origin.fixed.power));
        if (power) queueFrom(power.uuid);
        continue;
      }
      for (const pick of S.picks) {
        const [kind, value] = [pick.slice(0, pick.indexOf(':')), pick.slice(pick.indexOf(':') + 1)];
        if (kind === 'power') queueFrom(value);
        else if (kind === 'generic' && S.choice) queueFrom(S.choice);
      }
    }
    for (const k of trained) update[`system.pericias.${k}.treinado`] = true;
    let n = 1;
    for (const label of customs) {
      while (actor.system?.pericias?.[`ofi${n}`]) n++;
      update[`system.pericias.ofi${n}`] = { label, custom: true, atributo: 'int', st: true, treinado: true };
      n++;
    }
    // 5) Origem, divindade e atributo-chave de magia
    const dvc = devotionContext(app, cr);
    const god = cr.god && devotionCheck({ god: cr.god, race: dvc.race, classes: dvc.classes, rules }).level !== 'block' ? cr.god : '';
    if (origins.length) update['system.detalhes.origem'] = origins.map(o => o.origin.name).join(' / ');
    if (god) update['system.detalhes.divindade'] = god;
    const pathName = idx.powers.find(p => p.uuid === cr.path)?.name ?? '';
    const pathKey = PATH_KEY[fold(pathName).split(':').pop()?.trim()];
    const key = pathKey ?? KEY_BY_CLASS[cls?.key];
    if (key) update['system.attributes.conjuracao'] = key;
    if (god && cr.godPower) queueFrom(cr.godPower);
    // 6) Complicação (+ poder geral) e idade (complicações de idade, poder de "Já Vi Coisas")
    if (rules.complications && cr.complication) {
      queueFrom(cr.complication);
      if (cr.complicationPower) queueFrom(cr.complicationPower);
    }
    for (const name of (cr.ageComps ?? []).slice(0, age.complications).filter(Boolean)) {
      const data = ageComplicationItem(name);
      if (data) queueData(data);
    }
    if (age.extraPower && cr.agePower) queueFrom(cr.agePower);
    // 7) Itens de origem (o dinheiro rolado entra no mesmo update do fim)
    const notes = [];
    let money = 0;
    for (const { origin, S } of origins) {
      const r = await queueOriginItems(actor, idx, origin.name, S, queueFrom);
      notes.push(...r.notes);
      money += r.money;
    }
    if (money) update['system.dinheiro.tp'] = (Number(actor.system?.dinheiro?.tp) || 0) + money;
    // Cria tudo de uma vez, na ordem em que entrou na fila.
    const datas = await Promise.all(queue);
    const names = new Set();
    const slots = [];
    datas.forEach((d, i) => {
      if (!d) return;
      const name = fold(d.name);
      if (abilitySlots.has(i) && names.has(name)) return;
      names.add(name);
      slots.push(i);
    });
    const docs = slots.length ? await actor.createEmbeddedDocuments('Item', slots.map(i => datas[i])) : [];
    created.push(...docs.map(d => d.id));
    const classItem = classSlot === null ? null : docs[slots.indexOf(classSlot)] ?? null;
    // 8) Atributos, perícias, origem, divindade e histórico para desfazer: uma gravação só
    Object.assign(update, {
      [`flags.${MODULE_ID}.history.1`]: { cls: cls?.name ?? '', classId: classItem?.id ?? null, classCreated: true, created, creation: true, prev, trained: [...trained] },
      [`flags.${MODULE_ID}.creationRules`]: { ageRule: ageRuleFor(cr.ageRule, rules), age: ageRuleFor(cr.ageRule, rules) !== 'off' ? (cr.age || 'jovem') : null, noPhysicalIncrease: !!age.noPhysicalIncrease, extraLevels: age.levels || 0 },
      [`flags.${MODULE_ID}.plan.-=creation`]: null
    });
    await actor.update(update);
    const raceName = race?.name ?? '';
    await postCard(actor, {
      tool: 'planner', tone: 'success', title: 'Personagem criado', subtitle: `${actor.name} · ${raceName} ${cls?.name ?? ''}`.trim(),
      rows: [['Origem', origins.map(o => o.origin.name).join(' / ') || '—'], ['Divindade', god || '—'], ...(age.label ? [['Idade', age.label]] : [])],
      itemsTitle: 'Adicionado à ficha', items: created.map(id => actor.items.get(id)).filter(Boolean).map(d => ({ name: d.name, img: d.img })),
      note: [raceNotes.length ? `Escolhas da raça: ${raceNotes.join('; ')}.` : '', age.levels ? `Começa com ${age.levels} nível(is) a mais: suba-os no Planejador.` : '', notes.length ? `Itens de origem para combinar com o mestre: ${notes.join('; ')}` : ''].filter(Boolean).join(' ')
    });
    if (gainsAt(cls?.name ?? '', 1).gains.some(g => g.kind === 'spells')) game.t20Toolkit?.buscador?.open({ actor });
  } catch (error) {
    console.error('[T20 Toolkit] Criação:', error);
    ui.notifications.error(`Não foi possível criar o personagem: ${error.message}. O que já foi aplicado continua na ficha.`);
  }
}

/** Põe na fila os itens de uma origem e rola o dinheiro. Devolve os textos que não viram item e o dinheiro rolado. */
async function queueOriginItems(actor, idx, originName, S, queueFrom) {
  const gear = idx.gear ?? [];
  const notes = [];
  let money = 0;
  const list = ORIGIN_ITEMS[originName] ?? [];
  for (const [i, e] of list.entries()) {
    if (e.note) { notes.push(e.note); continue; }
    if (e.money) {
      const roll = await new Roll(e.money).evaluate();
      await roll.toMessage?.({ speaker: ChatMessage.getSpeaker({ actor }), flavor: chatFlavor({ tool: 'planner', title: `Origem ${originName}`, result: e.label ?? `T$ ${e.money}` }) });
      money += roll.total;
      continue;
    }
    const uuid = (e.choose || e.weapon) ? S.items?.[`i${i}`] : findGear(gear, e.item)?.uuid;
    if (!uuid) { notes.push(e.label ?? e.item ?? ''); continue; }
    queueFrom(uuid, e.qty ? { system: { qtd: e.qty } } : {});
  }
  return { notes: notes.filter(Boolean), money };
}

/** Desfaz a criação: remove itens criados (raça, classe, poderes) e volta atributos e perícias. */
export async function undoCreation(actor, h, extra = {}) {
  const ids = (h.created ?? []).filter(id => actor.items.get(id));
  const upd = Object.fromEntries(ATTRS.map(a => [`system.atributos.${a}.base`, h.prev?.base?.[a] ?? 0]));
  for (const k of h.trained ?? []) if (!(h.prev?.trained ?? []).includes(k)) upd[`system.pericias.${k}.treinado`] = false;
  upd['system.detalhes.origem'] = h.prev?.origem ?? '';
  upd['system.detalhes.divindade'] = h.prev?.divindade ?? '';
  upd['system.attributes.conjuracao'] = h.prev?.conjuracao ?? '';
  if (h.prev?.tp !== undefined) upd['system.dinheiro.tp'] = h.prev.tp;
  upd[`flags.${MODULE_ID}.-=creationRules`] = null;
  await Promise.all([ids.length ? actor.deleteEmbeddedDocuments('Item', ids) : null, actor.update({ ...upd, ...extra })]);
}
