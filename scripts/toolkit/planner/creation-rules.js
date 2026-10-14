/**
 * Criação de personagem (Tormenta20 JdA, cap. 1). Funções puras.
 * - Atributos por pontos: todos em 0, 10 pontos (gastar exatamente); custo 1→1, 2→2, 3→4, 4→7; qualquer atributo pode ir a −1 e devolve 1 ponto.
 * - Atributos por rolagem: 6× (4d6, descarta o menor) convertidos pela Tabela 1-1; se a soma for < 6, rola de novo o menor.
 * - Perícias da classe: as fixas, uma de cada "A ou B", mais N à escolha da lista; Int positiva dá Int perícias extras (quaisquer).
 * - Origem: 2 benefícios da lista (perícias e/ou poderes).
 */
import { fold } from '../core/t20.js';

export const ATTRS = Object.freeze(['for', 'des', 'con', 'int', 'sab', 'car']);
export const ATTR_LABELS = Object.freeze({ for: 'Força', des: 'Destreza', con: 'Constituição', int: 'Inteligência', sab: 'Sabedoria', car: 'Carisma' });
export const POINT_COST = Object.freeze({ '-1': -1, 0: 0, 1: 1, 2: 2, 3: 4, 4: 7 });
export const POINT_BUDGET = 10;

export function pointsSpent(base) {
  return ATTRS.reduce((s, a) => s + (POINT_COST[base?.[a] ?? 0] ?? Infinity), 0);
}

export function validatePoints(base, budget = POINT_BUDGET) {
  const errors = [];
  for (const a of ATTRS) if (!(String(base?.[a] ?? 0) in POINT_COST)) errors.push(`${ATTR_LABELS[a]}: use valores de −1 a 4.`);
  const spent = pointsSpent(base);
  const left = budget - spent;
  if (left < 0) errors.push(`Gastou ${spent} de ${budget} pontos.`);
  else if (left > 0) errors.push(`Faltam ${left} ponto${left > 1 ? 's' : ''} para gastar (é preciso gastar exatamente ${budget}).`);
  return { ok: errors.length === 0, errors, spent, left };
}

/** Próximo valor ao subir/descer um atributo na compra de pontos (−1 a 4). */
export function stepPoint(value, delta) {
  const v = Math.max(-1, Math.min(4, (Number(value) || 0) + Math.sign(delta)));
  return v;
}

/** Tabela 1-1: resultado de 4d6 (descartando o menor) → valor do atributo. */
export function rollToValue(total) {
  if (total <= 7) return -2;
  if (total <= 9) return -1;
  if (total <= 11) return 0;
  if (total <= 13) return 1;
  if (total <= 15) return 2;
  if (total <= 17) return 3;
  return 4;
}

/** Rola os seis atributos. `d6` pode ser trocado em testes. */
export function rollAttributes(d6 = () => 1 + Math.floor(Math.random() * 6)) {
  const roll = () => { const dice = [d6(), d6(), d6(), d6()].sort((a, b) => a - b); return dice.slice(1).reduce((s, x) => s + x, 0); };
  const totals = Array.from({ length: 6 }, roll);
  let guard = 0;
  while (totals.map(rollToValue).reduce((s, x) => s + x, 0) < 6 && guard++ < 100) {
    const i = totals.indexOf(Math.min(...totals));
    totals[i] = roll();
  }
  return totals.map(t => ({ total: t, value: rollToValue(t) }));
}

/**
 * Texto de perícias da classe → estrutura.
 * "Luta (For) ou Pontaria (Des), Fortitude (Con), mais 2 a sua escolha entre A (Car), B (For) e C (Des)."
 */
export function parseClassSkills(text, count = 0) {
  const clean = String(text ?? '').replace(/-\s+/g, '').replace(/\s*\((For|Des|Con|Int|Sab|Car)\)/g, '').replace(/\.$/, '');
  const [fixedPart, choicePart = ''] = clean.split(/,?\s*mais\s+\d+\s+a\s+sua\s+escolha\s+entre\s+/i);
  const list = s => s.split(/,|\s+e\s+/).map(x => x.trim()).filter(Boolean);
  const fixed = [], oneOf = [];
  for (const piece of fixedPart.split(/,|\s+e\s+(?=[A-ZÁÉÍÓÚ])/).map(x => x.trim()).filter(Boolean)) {
    if (/\sou\s/.test(piece)) oneOf.push(piece.split(/\s+ou\s+/).map(x => x.trim()));
    else fixed.push(piece);
  }
  const options = [...new Set(list(choicePart).flatMap(x => x.split(/\s+(?=[A-ZÁÉÍÓÚ][a-záéíóúãç]+$)/)).map(x => x.trim()))];
  return { fixed, oneOf, options, count: Number(count) || 0 };
}

/** Perícias extras por Inteligência positiva. */
export function intBonusSkills(intValue) {
  return Math.max(0, Number(intValue) || 0);
}

/**
 * Nome de perícia do livro → chave no sistema.
 * @param {string} name     ex.: "Misticismo", "Ofício (alquimista)", "Ofício"
 * @param {Record<string,string>} labels  chave → rótulo (ex.: alqu → "Ofício: Alquimista")
 * @returns {{key:string|null, custom?:string, anyCraft?:boolean}}
 */
export function skillKeyFor(name, labels) {
  const f = fold(name).replace(/[()]/g, ' ').replace(/[:\s]+/g, ' ').trim();
  if (f === 'oficio') return { key: null, anyCraft: true };
  for (const [key, label] of Object.entries(labels)) {
    const l = fold(label).replace(/[():]/g, ' ').replace(/\s+/g, ' ').trim();
    if (l === f) return { key };
  }
  const m = f.match(/^oficio (.+)$/);
  if (m) return { key: null, custom: `Ofício: ${m[1].charAt(0).toUpperCase()}${m[1].slice(1)}` };
  return { key: null };
}

/** Benefícios de origem: exatamente 2 (perícias e/ou poderes). */
export function validateOriginPicks(picks) {
  const n = (picks ?? []).filter(Boolean).length;
  return { ok: n === 2, n };
}
