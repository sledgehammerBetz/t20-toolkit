/**
 * Regras do Planejador (funções puras).
 * - Ganhos por nível de classe vêm de PROGRESSION (livro), com itens do compêndio ligados por nome.
 * - "Poder de <classe>" pode ser trocado por um poder geral (JdA, cap. 2: poderes gerais).
 * - Pré-requisitos lidos do texto "Pré-requisito(s): ..." da descrição do poder.
 */
import { PROGRESSION } from './progression.js';
import { fold } from '../core/t20.js';

/** Classes com tabela de progressão (14 do JdA + variantes de Heróis/Deuses de Arton). */
export const BASE_CLASSES = Object.freeze(Object.keys(PROGRESSION));

function entryFor(className) {
  const key = BASE_CLASSES.find(c => fold(c) === fold(className));
  return key ? PROGRESSION[key] : null;
}

/** Poderes da classe básica que a variante não pode escolher (Usurpador: HA p. 41). */
export const EXCLUDED_CLASS_POWERS = Object.freeze({
  usurpador: ['conhecimento magico']
});

/** No compêndio o nome traz a classe ("Conhecimento Mágico (Clérigo)"): compara pelo começo do nome. */
export const excludedPower = (className, powerKey) => (EXCLUDED_CLASS_POWERS[fold(className)] ?? []).some(k => powerKey === k || String(powerKey).startsWith(`${k} (`));

/** Poder que pode ser escolhido mais de uma vez ("pode escolher este poder outras vezes", "quantas vezes quiser"). */
export function isRepeatable(html) {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return /escolher (?:este|esse) poder (?:outras vezes|v[aá]rias vezes|quantas vezes quiser|mais de uma vez)/i.test(text);
}

/**
 * Poder de raça (Heróis de Arton p. 84): o pré-requisito é pertencer à raça, que o compêndio guarda no subtipo.
 * `subtipo` e `race` normalizados. true = é da raça; false = de outra raça; null = conferir (herança, "Várias", sem raça).
 */
export function racePowerOk(subtipo, race) {
  const sub = fold(subtipo);
  if (!sub || sub === 'varias') return null;
  const r = fold(race);
  if (!r) return null;
  if (sub === r || sub.split('/').map(s => s.trim()).includes(r) || r.split('/').map(s => s.trim()).includes(sub)) return true;
  if (sub.startsWith(`${r} `) || r.startsWith(`${sub} `)) return null; // Moreau do Lobo, Qareen de Luz...
  return false;
}

/** Tabela de níveis da classe (ou null). */
export function progressionFor(className) {
  return entryFor(className)?.levels ?? null;
}

/** Classe básica da variante (ex.: Necromante → Arcanista) e livro de origem. */
export function classInfo(className) {
  const e = entryFor(className);
  return e ? { variantOf: e.variantOf ?? null, source: e.source ?? '' } : null;
}

/**
 * Perícias da classe: as do item de classe; se estiverem vazias (as variantes do suplemento vêm sem texto),
 * usa as do livro guardadas na progressão.
 */
export function classSkills(className, itemSkills) {
  if (itemSkills?.inatas && String(itemSkills.inatas).trim()) return itemSkills;
  const s = entryFor(className)?.skills;
  return s ? { inatas: s.inatas ?? '', numero: s.numero ?? 0 } : (itemSkills ?? { inatas: '', numero: 0 });
}

/** Ganhos de um nível de classe, cada um com um id estável para guardar a escolha. */
export function gainsAt(className, classLevel) {
  const row = progressionFor(className)?.[classLevel];
  if (!row) return { text: '', gains: [], modeled: false };
  return { text: row.text, modeled: true, gains: row.gains.map((g, i) => ({ ...g, id: `${g.kind}-${i}` })) };
}

/**
 * Linha do tempo: níveis já na ficha + níveis planejados.
 * @param {{name:string, level:number}[]} sheetClasses
 * @param {Record<string,{cls:string}>} planned  por nível de personagem
 * @returns {{level:number, cls:string|null, classLevel:number|null, done:boolean}[]}
 */
export function buildTimeline(sheetClasses, planned, max = 20) {
  const current = sheetClasses.reduce((s, c) => s + c.level, 0);
  const counts = Object.fromEntries(sheetClasses.map(c => [fold(c.name), c.level]));
  const rows = [];
  for (let lvl = 1; lvl <= max; lvl++) {
    if (lvl <= current) { rows.push({ level: lvl, cls: null, classLevel: null, done: true }); continue; }
    const cls = planned?.[lvl]?.cls ?? null;
    let classLevel = null;
    if (cls) { counts[fold(cls)] = (counts[fold(cls)] ?? 0) + 1; classLevel = counts[fold(cls)]; }
    rows.push({ level: lvl, cls, classLevel, done: false });
  }
  return rows;
}

/** Extrai o texto de pré-requisitos de uma descrição HTML. */
export function prerequisiteText(html) {
  const text = String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const decoded = text.replace(/&([a-z]+);/gi, (m, e) => ({ eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', acirc: 'â', ordm: 'º', deg: 'º', agrave: 'à' }[e.toLowerCase()] ?? m));
  // Termina no ponto ou no fim do texto (vários poderes trazem o pré-requisito como última linha, sem ponto).
  const m = decoded.match(/Pr[ée]-?\s?requis+itos?\s*:\s*([^.]*(?:\.\d[^.]*)*)(?:\.|$)/i);
  return m ? m[1].trim() : '';
}

const ATTR = { for: 'for', des: 'des', con: 'con', int: 'int', sab: 'sab', car: 'car' };

/**
 * Avalia pré-requisitos simples.
 * @param {string} text
 * @param {{attributes:Record<string,number>, classLevels:Record<string,number>, totalLevel:number, powers:Set<string>, skills:Set<string>, knownPowerNames:Set<string>, maxCircle?:number}} ctx
 * `skills`: nomes de perícias treinadas normalizados (sem acento/pontuação), ex.: "oficio alquimista".
 * @returns {{status:'ok'|'missing'|'review'|'none', parts:{text:string, ok:boolean|null}[]}}
 */
export function evaluatePrerequisites(text, ctx) {
  if (!text) return { status: 'none', parts: [] };
  const pieces = text.split(/,|\se\s(?=[A-ZÁÉÍÓÚ0-9])/).map(s => s.trim()).filter(Boolean);
  const norm = v => fold(v).replace(/[^a-z0-9º ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const one = piece => {
    const f = fold(piece);
    let m = f.match(/^(\d+)[ºo°]? nivel de ([a-z\s]+)$/); // alguns poderes trazem "6° nível"
    if (m) {
      const cls = fold(m[2]).trim();
      const have = cls === 'personagem' ? ctx.totalLevel : (ctx.classLevels[cls] ?? 0);
      return have >= Number(m[1]);
    }
    m = f.match(/^(for|des|con|int|sab|car)\s*(-?\d+)$/);
    if (m) {
      const ok = (ctx.attributes[ATTR[m[1]]] ?? 0) >= Number(m[2]);
      return ok || !ctx.attributesPending ? ok : null; // criação: atributos ainda não distribuídos = conferir
    }
    m = f.match(/^lancar magias de (\d)[ºo°]? circulo$/);
    if (m) return (ctx.maxCircle ?? 0) >= Number(m[1]);
    if (f === 'lancar magias') return (ctx.maxCircle ?? 0) >= 1 || null; // magias de raça ou poder não entram no círculo

    m = f.match(/^treinad[oa] em (.+)$/);
    if (m) {
      const skill = norm(m[1]);
      if ([...ctx.skills].some(s => s === skill || s.startsWith(skill))) return true;
      // Artesão Criativo (Heróis de Arton): Ofício (artesão) vale por qualquer Ofício, inclusive em pré-requisitos.
      if (skill.startsWith('oficio') && ctx.powers.has('artesao criativo') && [...ctx.skills].some(s => s.startsWith('oficio artesao'))) return true;
      return null;
    }
    if (f === 'habilidade de classe magias') return [...ctx.powers].some(p => p.startsWith('magias'));
    if (ctx.powers.has(f)) return true;
    if ([...ctx.powers].some(p => p.endsWith(': ' + f))) return true; // ex.: "Bruxo" = Caminho do Arcanista: Bruxo
    if (ctx.knownPowerNames.has(f)) return false;
    return null;
  };
  const parts = pieces.map(piece => {
    const alts = piece.split(/\s+ou\s+/i);
    const results = alts.map(one);
    const ok = results.includes(true) ? true : results.includes(null) ? null : false;
    return { text: piece, ok };
  });
  const status = parts.some(p => p.ok === false) ? 'missing' : parts.some(p => p.ok === null) ? 'review' : 'ok';
  return { status, parts };
}

/** Subtipos de poder geral que não são raça (categorias do JdA e de Heróis de Arton). */
const NON_RACE_SUBTYPES = new Set(['', 'combate', 'destino', 'magia', 'tormenta', 'grupo', 'geupo', 'parceiro', 'parceiros', 'montaria', 'varias']);

/**
 * Pré-requisitos de um poder do índice (`{ tipo, subtipo, description }`), com a raça dos poderes de raça.
 * `ctx.race`: nome da raça da ficha.
 */
export function evaluatePower(p, ctx) {
  const ev = evaluatePrerequisites(prerequisiteText(p?.description), ctx);
  if (p?.tipo !== 'geral' || NON_RACE_SUBTYPES.has(fold(p.subtipo))) return ev;
  const ok = racePowerOk(p.subtipo, ctx?.race);
  if (ok === null && !ctx?.race) return ev;
  const label = String(p.subtipo).replace(/(^|[\s/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const parts = [{ text: `Raça: ${label}`, ok }, ...ev.parts];
  const status = parts.some(x => x.ok === false) ? 'missing' : parts.some(x => x.ok === null) ? 'review' : 'ok';
  return { status, parts };
}
