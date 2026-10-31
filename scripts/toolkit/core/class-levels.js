/**
 * Níveis de classe e poderes que dão acesso a outras classes. Funções puras.
 *
 * - Variantes (Heróis de Arton p. 21): a variante e a classe básica são a mesma classe, com a mesma lista de
 *   poderes e os mesmos pré-requisitos. O nível na variante conta como nível na classe básica.
 * - Fontes de outra classe: poderes que dão um poder (ou o direito de escolher poderes) de outra classe, com um
 *   "nível efetivo" nessa classe. O nível efetivo vale só para o poder que veio pela fonte (decidido com o usuário).
 *   O poder ganho guarda a fonte em `flags.t20-toolkit.via = { source, cls }`.
 * - Poderes de vassalo que dão "um poder de cavaleiro" sem dizer o nível usam o nível de personagem (decidido com o usuário).
 * - Temporários (Planejamento Marcial, Poder Improvisado, Resultado Destinado, Espelhos, Gostei, Vou Comprar!) ficam de fora.
 */
import { fold } from './t20.js';

/** Variante → classe básica (Heróis de Arton, Tabela 1-2). Conferido contra PROGRESSION do Planejador. */
export const VARIANT_OF = Object.freeze({
  alquimista: 'inventor', atleta: 'lutador', burgues: 'nobre', duelista: 'bucaneiro', ermitao: 'druida',
  inovador: 'guerreiro', 'machado de pedra': 'barbaro', magimarcialista: 'bardo', necromante: 'arcanista',
  santo: 'paladino', seteiro: 'cacador', usurpador: 'clerigo', ventanista: 'ladino', vassalo: 'cavaleiro'
});

/** Classe básica de uma classe (ela mesma se não for variante), normalizada. */
export const baseClassKey = name => VARIANT_OF[fold(name)] ?? fold(name);

/**
 * Nível em cada classe: a classe da ficha e, se for variante, também a classe básica (somando).
 * @param {{name:string, level:number}[]} classes
 * @returns {Record<string, number>}
 */
export function classLevelMap(classes) {
  const out = {};
  for (const c of classes ?? []) {
    const lv = Number(c.level) || 0;
    const key = fold(c.name);
    out[key] = (out[key] ?? 0) + lv;
    const base = VARIANT_OF[key];
    if (base) out[base] = (out[base] ?? 0) + lv;
  }
  return out;
}

const total = ctx => ctx.total;
const minus4 = ctx => ctx.total - 4;
const classLv = cls => ctx => ctx.levels[cls] ?? 0;

/**
 * Poderes que dão um poder de outra classe.
 * - `classes`: classes de onde sai o poder; 'other' = qualquer classe que não seja a sua; 'chosen' = a classe escolhida no poder.
 * - `general`: também aceita poder geral (Conde).
 * - `grant`: true = recebe um poder agora (vaga extra); false = só o direito de escolher mais tarde nas vagas de poder (Alma Livre).
 * - `level(ctx)`: nível efetivo na classe do poder, com ctx = { total, levels }.
 */
export const CROSS_CLASS_SOURCES = Object.freeze({
  'alma livre': { name: 'Alma Livre', classes: 'chosen', grant: false, level: minus4, book: 'Heróis de Arton p. 80' },
  diferentao: { name: 'Diferentão', classes: 'other', grant: true, level: minus4, book: 'Ameaças de Arton p. 183' },
  'agente de elite': { name: 'Agente de Elite', classes: 'other', grant: true, level: ctx => classLv('nobre')(ctx) - 4, book: 'Heróis de Arton p. 75' },
  'cavaleiro sagrado': { name: 'Cavaleiro Sagrado', classes: ['paladino'], grant: true, level: classLv('cavaleiro'), book: 'Heróis de Arton p. 62' },
  'paladino do reino': { name: 'Paladino do Reino', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 77' },
  'sargento do reino': { name: 'Sargento do Reino', classes: ['cavaleiro', 'guerreiro'], grant: true, level: total, book: 'Heróis de Arton p. 42' },
  'lorde: caminho do governante': { name: 'Lorde: Caminho do Governante', classes: ['nobre'], grant: true, level: total, book: 'Heróis de Arton p. 42' },
  'lorde: caminho do soldado': { name: 'Lorde: Caminho do Soldado', classes: ['guerreiro'], grant: true, level: total, book: 'Heróis de Arton p. 42' },
  valete: { name: 'Valete', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 42' },
  'guarda do castelo': { name: 'Guarda do Castelo', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 42' },
  'cavaleiro do reino': { name: 'Cavaleiro do Reino', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 42' },
  conde: { name: 'Conde', classes: ['cavaleiro'], general: true, grant: true, level: total, book: 'Heróis de Arton p. 42' },
  duque: { name: 'Duque', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 43' },
  rei: { name: 'Rei', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 43' },
  'conselheiro real': { name: 'Conselheiro Real', classes: ['cavaleiro'], grant: true, level: total, book: 'Heróis de Arton p. 42' }
});

/** Habilidades ou poderes de outra classe que um poder dá pronto (contam para pré-requisitos). */
export const GRANTED_ABILITIES = Object.freeze({
  'capitao do reino': ['Escudeiro', 'Golpe Divino'],   // HA p. 42, como paladino do seu nível
  barao: ['Título'],                                   // HA p. 42
  'cavaleiro bandido': ['Ataque Furtivo'],             // HA p. 62, como ladino do nível de cavaleiro
  escriba: ['Lendas e Histórias'],                     // origem, HA p. 47
  'presenca majestosa': ['Presença Aristocrática'],    // DB #220 p. 74
  'conexao feerica (marca)': ['Empatia Selvagem']      // HA p. 144
});

export const sourceFor = name => CROSS_CLASS_SOURCES[fold(name)] ?? null;

/** Nomes (normalizados) que os poderes da lista dão prontos. */
export function grantedAbilityKeys(powerKeys) {
  const out = new Set();
  for (const k of powerKeys) for (const a of GRANTED_ABILITIES[k] ?? []) out.add(fold(a));
  return out;
}

/** Classes de onde a fonte tira poderes. `own` = classes do personagem (normalizadas, com as básicas); `chosen` = classe escolhida. */
export function sourceClasses(def, { own = [], chosen = '' } = {}) {
  if (!def) return [];
  if (def.classes === 'chosen') return chosen ? [fold(chosen)] : [];
  if (def.classes === 'other') return null; // qualquer classe fora de `own`; quem chama filtra
  return [...def.classes];
}

/** A fonte aceita um poder da classe `cls`? */
export function sourceAccepts(def, cls, { own = [], chosen = '' } = {}) {
  const key = fold(cls);
  if (!def || !key) return false;
  if (def.classes === 'other') return !own.map(fold).includes(key) && !own.map(baseClassKey).includes(key);
  return sourceClasses(def, { own, chosen }).includes(key);
}

/** Nível efetivo que a fonte dá (mínimo 0). ctx = { total, levels }. */
export function sourceLevel(def, ctx) {
  return def ? Math.max(0, def.level({ total: Number(ctx.total) || 0, levels: ctx.levels ?? {} })) : 0;
}

/**
 * Contexto de pré-requisitos para um poder que vem pela fonte: o nível na classe do poder passa a ser
 * o maior entre o real e o efetivo. Não mexe nas outras classes.
 */
export function overlayClassLevel(ctx, def, cls) {
  const key = fold(cls);
  const lv = sourceLevel(def, { total: ctx.totalLevel, levels: ctx.classLevels });
  if (!def || !key || lv <= (ctx.classLevels?.[key] ?? 0)) return ctx;
  return { ...ctx, classLevels: { ...ctx.classLevels, [key]: lv } };
}

/**
 * Nível efetivo de um poder da ficha na classe `cls`: o real (com variantes) ou o que a fonte gravada em
 * `flags.t20-toolkit.via` dá, o que for maior.
 * @param {{classes:{name:string,level:number}[], via?:{source:string}|null, cls:string}} input
 */
export function powerClassLevel({ classes = [], via = null, cls }) {
  const levels = classLevelMap(classes);
  const real = levels[fold(cls)] ?? 0;
  const def = via?.source ? sourceFor(via.source) : null;
  const total = classes.reduce((s, c) => s + (Number(c.level) || 0), 0);
  return Math.max(real, sourceLevel(def, { total, levels }));
}

/**
 * Magias vindas de poderes de outra classe (perfis extras de conjurador).
 * - Presente dos Deuses (distinção Sumo-Sacerdote, Deuses de Arton p. 129): Magias como clérigo de nível igual ao
 *   dobro dos poderes da distinção. Quem já tem Magias soma Sabedoria no limite de PM (sem perfil novo).
 * - Duplo Feérico (origem, Atlas de Arton p. 472): habilidade de 1º nível de outra classe; se for Magias, uma única
 *   magia e +1 PM, sem somar o atributo-chave. A classe fica em `flags.t20-toolkit.duploFeericoClass`.
 * @param {{powers:{name:string,tipo?:string,subtipo?:string}[], ownClasses:string[], hasMagic:boolean, duploClass?:string, casterKeys:string[]}} input
 * @returns {{cls:string, level:number, known?:number, label:string, source:string, notes:string[]}[]}
 */
export function crossClassCasters({ powers = [], ownClasses = [], hasMagic = false, duploClass = '', casterKeys = [] }) {
  const out = [];
  const own = new Set(ownClasses.flatMap(c => [fold(c), baseClassKey(c)]));
  const presente = powers.find(p => fold(p.name) === 'presente dos deuses' && p.tipo === 'distincao');
  if (presente && !hasMagic) {
    const n = powers.filter(p => p.tipo === 'distincao' && fold(p.subtipo) === fold(presente.subtipo)).length;
    out.push({ cls: 'clerigo', level: 2 * n, label: 'Presente dos Deuses', source: 'Deuses de Arton p. 129',
      notes: [`Presente dos Deuses: Magias como clérigo de nível ${2 * n} (dobro dos ${n} poder(es) da distinção).`] });
  }
  const duplo = fold(duploClass);
  if (powers.some(p => fold(p.name) === 'duplo feerico') && duplo && casterKeys.includes(duplo) && !own.has(duplo)) {
    out.push({ cls: duplo, level: 1, known: 1, label: 'Duplo Feérico', source: 'Atlas de Arton p. 472',
      notes: ['Duplo Feérico: uma única magia e +1 PM, sem somar o atributo-chave no total de PM.'] });
  }
  return out;
}
