/**
 * Filtros de magias (funções puras) — os 18 filtros do Criador de Engenhocas, agora para todas as ferramentas.
 *
 * Estado do filtro (todos opcionais):
 *   query, circle, type, school, pack,
 *   execution, resistance ('yes'|'no'), resistanceType, duration, range, application ('target'|'area'|'effect'|'none'),
 *   function, element, conditionPresence ('yes'|'no'), conditionType, targetType, targetRelation, targetCount, defenseType,
 *   useEnhancements (considerar aprimoramentos), sort ('circle'|'name'|'pmAsc'|'pmDesc'|'source')
 *
 * Com `useEnhancements`, uma magia que só atende ao filtro por um aprimoramento aparece com o motivo e o custo (+N PM).
 * Combinações contraditórias ("Sem resistência" + "Reflexos", "Não causa condição" + "Paralisado") são recusadas.
 */
import { fold } from '../t20.js';
import { EXEC_FILTER_ORDER, DURATION_FILTER_ORDER, DURATION_FILTER_LABELS, RANGE_FILTER_ORDER, eng4ExecutionLabel, eng4RangeLabel, resistanceSkillLabel, TYPE_LABELS, SCHOOL_LABELS } from './spell-metadata.js';
import { eng5RangeKeyFromText, eng5ExecutionKeyFromText, eng5DurationKeyFromText, eng5ResistanceKeyFromText, eng5ResistanceRemoved } from './enhancement-parsers.js';
import { buildEnhancementMetaFromIndex } from './enhancement-meta.js';
import { validateFilterCombination, assessEnhancementEvidence } from './filter-combinations.js';
import {
  semanticProfileMatches, functionLabel, elementLabel, conditionLabel, targetTypeLabel, targetRelationLabel, targetCountLabel, defenseLabel,
  FUNCTION_ORDER, ELEMENT_ORDER, TARGET_TYPE_ORDER, TARGET_RELATION_ORDER, TARGET_COUNT_ORDER, DEFENSE_ORDER, CONDITION_LABELS
} from './spell-semantics.js';

const SEMANTIC = ['function', 'element', 'conditionPresence', 'conditionType', 'targetType', 'targetRelation', 'targetCount', 'defenseType'];
export const ENHANCEABLE = ['execution', 'resistance', 'resistanceType', 'duration', 'range', 'application', ...SEMANTIC];
const norm = v => fold(v);

/* ---------- definição dos filtros (rótulos e opções) ---------- */

const APPLICATION_LABELS = { target: 'Possui alvo', area: 'Possui área', effect: 'Possui efeito', none: 'Nenhum dos três' };
const RES_TYPES = ['fort', 'ref', 'von', 'other'];

export const FILTER_GROUPS = Object.freeze([
  { id: 'base', label: 'Círculo e características', filters: ['type', 'school', 'pack', 'execution', 'resistance', 'resistanceType', 'duration', 'range', 'application'] },
  { id: 'effect', label: 'Função e efeito', filters: ['function', 'element', 'conditionPresence', 'conditionType'] },
  { id: 'targets', label: 'Alvos e proteção', filters: ['targetType', 'targetRelation', 'targetCount', 'defenseType'] }
]);

export const FILTER_LABELS = Object.freeze({
  circle: 'Círculo', type: 'Tipo', school: 'Escola', pack: 'Fonte', execution: 'Execução', resistance: 'Resistência', resistanceType: 'Tipo de resistência',
  duration: 'Duração', range: 'Alcance', application: 'Alvo / Área / Efeito', function: 'Função', element: 'Elemento', conditionPresence: 'Causa condição',
  conditionType: 'Tipo de condição', targetType: 'Tipo de alvo', targetRelation: 'Relação do alvo', targetCount: 'Número de alvos', defenseType: 'Tipo de proteção'
});

export function valueLabel(category, value) {
  switch (category) {
    case 'circle': return `${value}º`;
    case 'type': return TYPE_LABELS[value] ?? value;
    case 'school': return SCHOOL_LABELS[value] ?? value;
    case 'execution': return eng4ExecutionLabel(value);
    case 'range': return eng4RangeLabel(value);
    case 'duration': return DURATION_FILTER_LABELS[value] ?? value;
    case 'resistance': return value === 'yes' ? 'Com resistência' : 'Sem resistência';
    case 'resistanceType': return value === 'other' ? 'Outra / não identificada' : resistanceSkillLabel(value);
    case 'application': return APPLICATION_LABELS[value] ?? value;
    case 'function': return functionLabel(value);
    case 'element': return elementLabel(value);
    case 'conditionPresence': return value === 'yes' ? 'Sim' : 'Não';
    case 'conditionType': return conditionLabel(value);
    case 'targetType': return targetTypeLabel(value);
    case 'targetRelation': return targetRelationLabel(value);
    case 'targetCount': return targetCountLabel(value);
    case 'defenseType': return defenseLabel(value);
    default: return String(value);
  }
}

/** Opções de cada filtro: só o que existe no catálogo (com listas de reserva para os semânticos). */
export function filterOptions(spells, packs = []) {
  const has = (key, order) => order.filter(v => spells.some(s => s[key] === v));
  const union = (get, order) => {
    const found = new Set();
    for (const s of spells) {
      for (const v of get(s.semantics ?? {}) ?? []) found.add(v);
      for (const e of s.enhancementSemantics ?? []) for (const v of get(e.profile ?? {}) ?? []) found.add(v);
    }
    const list = order.filter(v => found.has(v));
    return list.length ? list : [...order];
  };
  const conditionOrder = Object.keys(CONDITION_LABELS).sort((a, b) => CONDITION_LABELS[a].localeCompare(CONDITION_LABELS[b], 'pt-BR'));
  const opt = (cat, list) => list.map(v => ({ value: v, label: valueLabel(cat, v) }));
  return {
    circle: opt('circle', [1, 2, 3, 4, 5]),
    type: opt('type', ['arc', 'div', 'uni']),
    school: opt('school', Object.keys(SCHOOL_LABELS).filter(k => k.length === 3 && spells.some(s => s.school === k))),
    pack: packs.map(p => ({ value: p.id, label: `${p.label} (${p.count})` })),
    execution: opt('execution', has('executionKey', EXEC_FILTER_ORDER)),
    resistance: opt('resistance', ['yes', 'no']),
    resistanceType: opt('resistanceType', RES_TYPES.filter(v => v === 'other' || spells.some(s => s.resistanceSkill === v))),
    duration: opt('duration', has('durationKey', DURATION_FILTER_ORDER)),
    range: opt('range', has('rangeKey', RANGE_FILTER_ORDER)),
    application: opt('application', ['target', 'area', 'effect', 'none']),
    function: opt('function', union(p => p.functions, FUNCTION_ORDER)),
    element: opt('element', union(p => p.elements, ELEMENT_ORDER)),
    conditionPresence: opt('conditionPresence', ['yes', 'no']),
    conditionType: opt('conditionType', union(p => p.conditions, conditionOrder)),
    targetType: opt('targetType', union(p => p.targetTypes, TARGET_TYPE_ORDER)),
    targetRelation: opt('targetRelation', union(p => p.targetRelations, TARGET_RELATION_ORDER)),
    targetCount: opt('targetCount', union(p => (p.targetCount?.category ? [p.targetCount.category] : []), TARGET_COUNT_ORDER)),
    defenseType: opt('defenseType', union(p => p.defenses, DEFENSE_ORDER))
  };
}

/* ---------- correspondência ---------- */

export function baseMatches(spell, category, value) {
  if (!value) return true;
  switch (category) {
    case 'circle': return String(spell.circle) === String(value);
    case 'type': return spell.type === value;
    case 'school': return spell.school === value;
    case 'pack': return spell.packId === value;
    case 'execution': return spell.executionKey === value;
    case 'duration': return spell.durationKey === value;
    case 'range': return spell.rangeKey === value;
    case 'resistanceType': return value === 'other' ? spell.hasResistance && !['fort', 'ref', 'von'].includes(spell.resistanceSkill) : spell.resistanceSkill === value;
    case 'resistance': return value === 'yes' ? !!spell.hasResistance : !spell.hasResistance;
    case 'application': return spell.applicationKinds?.includes(value) ?? false;
    default: return SEMANTIC.includes(category) ? semanticProfileMatches(spell.semantics, category, value) : true;
  }
}

export function enhancementMatches(spell, category, value) {
  if (!value) return true;
  if (SEMANTIC.includes(category)) {
    if (category === 'conditionPresence' && value === 'no') return false;
    return (spell.enhancementSemantics ?? []).some(e => semanticProfileMatches(e?.profile, category, value));
  }
  const meta = buildEnhancementMetaFromIndex(spell);
  const map = { execution: meta.executions, duration: meta.durations, range: meta.ranges, resistanceType: meta.resistanceSkills, resistance: meta.resistancePresence, application: meta.applicationKinds };
  return (map[category] ?? []).includes(value);
}

/** Qual aprimoramento atende ao filtro (nome e custo), para mostrar no resultado. */
function evidence(spell, category, wanted) {
  if (SEMANTIC.includes(category)) {
    const e = (spell.enhancementSemantics ?? []).find(c => semanticProfileMatches(c?.profile, category, wanted));
    if (e) return { name: e.text || 'Aprimoramento', cost: e.cost };
  }
  for (const effect of spell._eng6RawEffects ?? []) {
    const flags = effect?.flags?.tormenta20 ?? {};
    const changes = Array.isArray(effect?.changes) ? effect.changes : [];
    const name = String(effect?.name ?? effect?.label ?? 'Aprimoramento').trim();
    const text = norm([name, flags.descricao, flags.description, ...changes.map(c => c?.value ?? '')].filter(Boolean).join(' '));
    const hit = (category === 'range' && text.includes('alcance') && eng5RangeKeyFromText(text) === wanted)
      || (category === 'execution' && eng5ExecutionKeyFromText(text) === wanted)
      || (category === 'duration' && eng5DurationKeyFromText(text) === wanted)
      || (category === 'resistanceType' && eng5ResistanceKeyFromText(text) === wanted)
      || (category === 'resistance' && text.includes('resist') && (wanted === 'no' ? eng5ResistanceRemoved(text) : !eng5ResistanceRemoved(text)))
      || (category === 'application' && wanted === 'target' && /\balvos?\b/.test(text))
      || (category === 'application' && wanted === 'area' && (text.includes('area') || /\b(?:cone|linha|esfera|explosao|cilindro)\b/.test(text)));
    if (!hit) continue;
    let cost = Number.isFinite(Number(flags.custo)) ? Number(flags.custo) : null;
    if (cost == null) { const m = name.match(/\+\s*(\d+)\s*PM\b/i); if (m) cost = Number(m[1]); }
    return { name, cost };
  }
  return null;
}

/**
 * Aplica os filtros.
 * @returns {{results: Array<{spell, via: Array<{category,label,title}>}>, error: string, warning: string}}
 */
export function filterSpells(spells, state = {}) {
  const combo = validateFilterCombination(state);
  if (!combo.valid) return { results: [], error: combo.conflicts.map(c => c.message).join(' ') || 'Combinação de filtros contraditória.', warning: '' };
  const q = norm(state.query ?? '');
  const results = [];
  let multi = false;
  for (const spell of spells) {
    if (q && !(spell.searchText ?? spell.key ?? norm(spell.name)).includes(q)) continue;
    let ok = true;
    const via = [];
    for (const cat of ['circle', 'type', 'school', 'pack', ...ENHANCEABLE]) {
      const v = state[cat];
      if (!v || baseMatches(spell, cat, v)) continue;
      if (state.useEnhancements && ENHANCEABLE.includes(cat) && enhancementMatches(spell, cat, v)) {
        const ev = evidence(spell, cat, v);
        const cost = ev?.cost != null ? (ev.cost > 0 ? `+${ev.cost} PM` : `${ev.cost} PM`) : '';
        const base = `${FILTER_LABELS[cat]}: ${valueLabel(cat, v)}`;
        via.push({ category: cat, filter: FILTER_LABELS[cat], value: valueLabel(cat, v), cost, enh: ev?.name ?? '', label: cost ? `${valueLabel(cat, v)} (${cost})` : valueLabel(cat, v), title: ev?.name ? `${base} com o aprimoramento "${ev.name}"${cost ? ` (${cost})` : ''}` : `${base} com aprimoramento` });
        continue;
      }
      ok = false; break;
    }
    if (!ok) continue;
    if (via.length > 1 && assessEnhancementEvidence(spell, state, (s, c, v) => baseMatches(s, c, v)).status === 'multiple-enhancements') {
      multi = true;
      via.forEach(r => { r.title += ' • depende de aprimoramentos diferentes: confira se podem ser usados juntos.'; });
    }
    results.push({ spell, via });
  }
  sortResults(results, state.sort);
  return { results, error: '', warning: multi ? 'Alguns resultados dependem de aprimoramentos diferentes ao mesmo tempo.' : '' };
}

export const SORTS = Object.freeze({ circle: 'Círculo + nome', name: 'Nome', pmAsc: 'PM menor → maior', pmDesc: 'PM maior → menor', source: 'Fonte + nome' });

export function sortResults(results, sort = 'circle') {
  const byName = (a, b) => a.spell.name.localeCompare(b.spell.name, 'pt-BR');
  const cmp = {
    name: byName,
    pmAsc: (a, b) => (a.spell.cost - b.spell.cost) || byName(a, b),
    pmDesc: (a, b) => (b.spell.cost - a.spell.cost) || byName(a, b),
    source: (a, b) => String(a.spell.packLabel).localeCompare(String(b.spell.packLabel), 'pt-BR') || byName(a, b),
    circle: (a, b) => ((a.spell.circle ?? 9) - (b.spell.circle ?? 9)) || byName(a, b)
  }[sort] ?? ((a, b) => ((a.spell.circle ?? 9) - (b.spell.circle ?? 9)) || byName(a, b));
  return results.sort(cmp);
}

/** Etiquetas dos filtros ativos (para mostrar e remover um a um). */
export function activeFilterTags(state = {}, packs = []) {
  const out = [];
  for (const cat of ['circle', 'type', 'school', 'pack', ...ENHANCEABLE]) {
    const v = state[cat];
    if (!v) continue;
    const label = cat === 'pack' ? (packs.find(p => p.id === v)?.label ?? v) : valueLabel(cat, v);
    out.push({ key: cat, label: `${FILTER_LABELS[cat]}: ${label}` });
  }
  if (state.useEnhancements) out.push({ key: 'useEnhancements', label: 'Considerando aprimoramentos' });
  return out;
}

export const EMPTY_FILTERS = Object.freeze({ query: '', circle: '', type: '', school: '', pack: '', execution: '', resistance: '', resistanceType: '', duration: '', range: '', application: '', function: '', element: '', conditionPresence: '', conditionType: '', targetType: '', targetRelation: '', targetCount: '', defenseType: '', useEnhancements: false, sort: 'circle' });
