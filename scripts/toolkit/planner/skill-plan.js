/**
 * Grade única de perícias da criação (funções puras).
 * Junta todas as fontes — classe (fixas, "A ou B", à escolha), origem, raça e Inteligência —
 * para que nenhuma perícia seja escolhida duas vezes.
 */
import { fold } from '../core/t20.js';
import { skillKeyFor } from './creation-rules.js';

export const isCraftLabel = label => /^of[íi]cio/i.test(fold(label));

/**
 * Ofícios citados em poderes e origens (sistema e Suplementos de Arton) que não estão entre os seis do sistema.
 * Entram nas listas de perícia com chave "ofx_<nome>" e viram perícia personalizada (ofiN) ao gravar na ficha.
 * Ex.: Escriba Arcano pede "treinado em Ofício (escriba)".
 */
export const EXTRA_CRAFTS = Object.freeze(['Barbeiro', 'Calígrafo', 'Carpinteiro', 'Coureiro', 'Escriba', 'Minerador', 'Pedreiro', 'Pescador', 'Serviçal', 'Tatuador']);
export const EXTRA_CRAFT_PREFIX = 'ofx_';
export const isExtraCraft = key => String(key ?? '').startsWith(EXTRA_CRAFT_PREFIX);
const craftNorm = v => fold(v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Rótulos do sistema + Ofícios extras (sem repetir um que o sistema ou a ficha já tenham). */
export function withExtraCrafts(labels) {
  const have = new Set(Object.values(labels).map(craftNorm));
  const out = { ...labels };
  for (const name of EXTRA_CRAFTS) {
    const label = `Ofício: ${name}`;
    if (!have.has(craftNorm(label))) out[`${EXTRA_CRAFT_PREFIX}${fold(name).replace(/[^a-z0-9]+/g, '')}`] = label;
  }
  return out;
}

/**
 * Atualização da ficha para treinar `keys`. Chaves do sistema: só marca treinado.
 * Ofícios extras e `customLabels`: reaproveita uma perícia personalizada com o mesmo rótulo ou cria ofiN.
 * @returns {{update:object, trained:string[], created:string[]}} trained = chaves reais; created = ofiN novas
 */
export function trainSkillsUpdate(pericias = {}, keys = [], labels = {}, customLabels = []) {
  const update = {};
  const trained = [];
  const created = [];
  const taken = new Set(Object.keys(pericias));
  const customs = [...keys.filter(isExtraCraft).map(k => labels[k]).filter(Boolean), ...customLabels];
  for (const k of keys) if (!isExtraCraft(k)) { update[`system.pericias.${k}.treinado`] = true; trained.push(k); }
  let n = 1;
  for (const label of [...new Set(customs)]) {
    const hit = Object.entries(pericias).find(([, sk]) => sk?.custom && craftNorm(sk.label) === craftNorm(label));
    if (hit) { update[`system.pericias.${hit[0]}.treinado`] = true; trained.push(hit[0]); continue; }
    while (taken.has(`ofi${n}`)) n++;
    const key = `ofi${n}`;
    taken.add(key);
    update[`system.pericias.${key}`] = { label, custom: true, atributo: 'int', st: true, treinado: true };
    trained.push(key); created.push(key);
  }
  return { update, trained, created };
}

/** Chaves de perícia para um nome do livro ("Ofício" sem especificar = todas as de Ofício). */
export function keysForName(name, labels) {
  const r = skillKeyFor(name, labels);
  if (r.key) return [r.key];
  if (r.anyCraft) return Object.entries(labels).filter(([, l]) => isCraftLabel(l)).map(([k]) => k);
  return [];
}

/**
 * @param {object} o
 * @param {Record<string,string>} o.labels
 * @param {{fixed:string[], oneOf:string[][], options:string[], count:number}|null} o.classSpec
 * @param {Record<number,string>} [o.oneOfPicks]  índice → nome escolhido
 * @param {string} [o.classCraft]  chave do Ofício para "Ofício" fixo da classe
 * @param {Array<{key:string, source:string}>} [o.locked]  perícias já garantidas por origem/raça
 * @param {{class?:string[], race?:string[], int?:string[]}} [o.picks]
 * @param {{race?:number, int?:number}} [o.counts]
 */
export function skillPlan({ labels, classSpec = null, oneOfPicks = {}, classCraft = '', locked = [], picks = {}, counts = {} }) {
  const lockedMap = new Map();
  const lock = (key, source) => { if (key && !lockedMap.has(key)) lockedMap.set(key, source); };
  if (classSpec) {
    for (const name of classSpec.fixed) {
      const keys = keysForName(name, labels);
      lock(keys.length > 1 ? (classCraft || null) : keys[0], 'Classe');
    }
    classSpec.oneOf.forEach((_, i) => { const n = oneOfPicks[i]; if (n) lock(keysForName(n, labels)[0], 'Classe'); });
  }
  for (const l of locked) lock(l.key, l.source);

  const eligible = new Set(classSpec ? classSpec.options.flatMap(n => keysForName(n, labels)) : []);
  const want = { class: classSpec?.count ?? 0, race: counts.race ?? 0, int: counts.int ?? 0 };
  // normaliza: tira perícias travadas, inelegíveis e o excesso
  const clean = { class: [], race: [], int: [] };
  const seen = new Set(lockedMap.keys());
  for (const kind of ['class', 'race', 'int']) {
    for (const k of picks[kind] ?? []) {
      if (!labels[k] || seen.has(k)) continue;
      if (kind === 'class' && !eligible.has(k)) continue;
      if (clean[kind].length >= want[kind]) continue;
      clean[kind].push(k); seen.add(k);
    }
  }
  const pickedBy = new Map();
  for (const kind of ['class', 'race', 'int']) for (const k of clean[kind]) pickedBy.set(k, kind);

  const full = kind => clean[kind].length >= want[kind];
  const tiles = Object.entries(labels)
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
    .map(([key, label]) => {
      const lockedBy = lockedMap.get(key) ?? null;
      const by = pickedBy.get(key) ?? null;
      const canClass = eligible.has(key) && !full('class');
      const free = !full('race') || !full('int');
      return { key, label, lockedBy, pickedBy: by, classOption: eligible.has(key), available: !lockedBy && !by && (canClass || free) };
    });
  return { tiles, picks: clean, want, done: full('class') && full('race') && full('int') };
}

/** Clicar numa perícia: tira se já escolhida; senão põe na primeira vaga que aceita (classe → raça → Int). */
export function toggleSkill(plan, key) {
  const t = plan.tiles.find(x => x.key === key);
  if (!t || t.lockedBy) return plan.picks;
  const next = { class: [...plan.picks.class], race: [...plan.picks.race], int: [...plan.picks.int] };
  if (t.pickedBy) { next[t.pickedBy] = next[t.pickedBy].filter(k => k !== key); return next; }
  if (t.classOption && next.class.length < plan.want.class) next.class.push(key);
  else if (next.race.length < plan.want.race) next.race.push(key);
  else if (next.int.length < plan.want.int) next.int.push(key);
  return next;
}
