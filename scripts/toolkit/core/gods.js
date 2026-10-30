/**
 * Devotos dos 20 deuses maiores (Tormenta20 JdA, cap. 1, "Divindades"). Funções puras.
 * Regra: para ser devoto, a raça OU a classe precisa estar na lista do deus.
 * Humanos e clérigos podem ser devotos de qualquer deus. Clérigo, druida e paladino são devotos obrigatoriamente.
 * Usurpador (Inimigo dos Deuses) não pode ter devoção.
 * Devoções Abertas (Heróis de Arton p. 281, regra da mesa), em quatro modos:
 *   'off'   — livro: raça OU classe na lista;
 *   'race'  — qualquer raça: a raça deixa de contar e a CLASSE precisa estar na lista (clérigo: qualquer deus);
 *   'class' — qualquer classe: a classe deixa de contar e a RAÇA precisa estar na lista (humano: qualquer deus);
 *   'both'  — qualquer personagem, qualquer deus.
 * Variantes de classe contam como a classe base (ex.: Necromante → Arcanista).
 * Classes devotas (JdA p. 57, 61 e 82): recebem dois poderes concedidos; druida e paladino só seguem os deuses
 * da sua lista; clérigo pode cultuar o Panteão, paladino pode ser paladino do bem e druida pode ser druida de Arton
 * (Deuses de Arton p. 27), sem poder concedido. Devoções Abertas (qualquer classe) tira a lista da classe.
 */
import { fold } from './t20.js';

export const DEVOTEES = Object.freeze({
  'Aharadak': { any: true, note: 'A Tormenta aceita todos.' },
  'Allihanna': { races: ['Dahllan', 'Elfo', 'Sílfide'], classes: ['Bárbaro', 'Caçador', 'Druida'] },
  'Arsenal': { races: ['Anão', 'Minotauro'], classes: ['Bárbaro', 'Cavaleiro', 'Guerreiro', 'Lutador'] },
  'Azgher': { races: ['Aggelus', 'Qareen'], classes: ['Arcanista', 'Bárbaro', 'Caçador', 'Cavaleiro', 'Guerreiro', 'Nobre', 'Paladino'] },
  'Hyninn': { races: ['Hynne', 'Goblin', 'Sílfide'], classes: ['Bardo', 'Bucaneiro', 'Ladino', 'Inventor', 'Nobre'] },
  'Kallyadranoch': { races: ['Elfo', 'Medusa', 'Sulfure'], classes: ['Arcanista', 'Cavaleiro', 'Guerreiro', 'Lutador', 'Nobre'] },
  'Khalmyr': { races: ['Aggelus', 'Anão'], classes: ['Cavaleiro', 'Guerreiro', 'Nobre', 'Paladino'] },
  'Lena': { races: ['Dahllan', 'Qareen'], classes: ['Nobre', 'Paladino'] },
  'Lin-Wu': { races: ['Anão'], classes: ['Cavaleiro', 'Guerreiro', 'Nobre', 'Paladino'] },
  'Marah': { races: ['Aggelus', 'Elfo', 'Hynne', 'Qareen'], classes: ['Bardo', 'Nobre', 'Paladino'] },
  'Megalokk': { races: ['Goblin', 'Medusa', 'Minotauro', 'Sulfure', 'Trog'], classes: ['Bárbaro', 'Caçador', 'Druida', 'Lutador'] },
  'Nimb': { races: ['Goblin', 'Qareen', 'Sílfide'], classes: ['Arcanista', 'Bárbaro', 'Bardo', 'Bucaneiro', 'Inventor', 'Ladino'] },
  'Oceano': { races: ['Dahllan', 'Hynne', 'Minotauro', 'Sereia/Tritão'], classes: ['Bárbaro', 'Bucaneiro', 'Caçador', 'Druida'] },
  'Sszzaas': { races: ['Medusa'], classes: ['Arcanista', 'Bardo', 'Bucaneiro', 'Inventor', 'Ladino', 'Nobre'] },
  'Tanna-Toh': { races: ['Golem', 'Kliren'], classes: ['Arcanista', 'Bardo', 'Inventor', 'Nobre', 'Paladino'] },
  'Tenebra': { races: ['Anão', 'Medusa', 'Qareen', 'Osteon', 'Sulfure', 'Trog'], classes: ['Arcanista', 'Bardo', 'Druida', 'Ladino'] }, // Druida: Dragão Brasil 204 / Deuses de Arton
  'Thwor': { any: true, note: 'Qualquer duyshidakk: o devoto precisa fazer parte do povo duyshidakk, seja qual for a raça (confirme com o mestre).' },
  'Thyatis': { races: ['Aggelus'], classes: ['Cavaleiro', 'Guerreiro', 'Inventor', 'Lutador', 'Paladino'] },
  'Valkaria': { any: true, note: 'Membros de todas as classes podem ser devotos de Valkaria.' },
  'Wynna': { races: ['Elfo', 'Golem', 'Qareen', 'Sílfide'], classes: ['Arcanista', 'Bardo'] }
});

/** Raças do livro básico: as outras (suplementos) não aparecem nas listas e ficam a critério do mestre. */
export const CORE_RACES = Object.freeze(['Humano', 'Anão', 'Dahllan', 'Elfo', 'Goblin', 'Lefou', 'Minotauro', 'Qareen', 'Golem', 'Hynne', 'Kliren', 'Medusa', 'Osteon', 'Sereia/Tritão', 'Sílfide', 'Aggelus', 'Sulfure', 'Trog']);
export const MUST_BE_DEVOUT = Object.freeze(['Clérigo', 'Druida', 'Paladino']);

/** Deuses que a classe pode seguir (Druida: JdA p. 61 + Deuses de Arton p. 24-26; Paladino: JdA p. 82). */
export const CLASS_GODS = Object.freeze({
  'Druida': ['Allihanna', 'Megalokk', 'Oceano', 'Aharadak', 'Tenebra'],
  'Paladino': ['Azgher', 'Khalmyr', 'Lena', 'Lin-Wu', 'Marah', 'Tanna-Toh', 'Thyatis', 'Valkaria']
});

/** Devoções sem deus: contam como devoção, mas não dão poder concedido. */
export const ALT_DEVOTIONS = Object.freeze({
  'Panteão': { cls: 'Clérigo', label: 'Cultuar o Panteão', note: 'Sem poder concedido. Única obrigação: não usar armas cortantes ou perfurantes. Arma preferida: maça (JdA p. 57).' },
  'Bem': { cls: 'Paladino', label: 'Paladino do bem', note: 'Sem poder concedido e sem Obrigações & Restrições além do Código do Herói (JdA p. 82).' },
  'Arton': { cls: 'Druida', label: 'Druida de Arton', note: 'Sem poder concedido. Nunca matar ou destruir seres que não ameacem a sobrevivência sua ou dos aliados. Arma preferida: foice (Deuses de Arton p. 27).' }
});

const classNames = classes => classes.flatMap(c => [c.name, c.variantOf].filter(Boolean)).map(fold);

/** Devoções sem deus que as classes permitem. */
export function altDevotionsFor(classes = []) {
  const names = classNames(classes);
  return Object.keys(ALT_DEVOTIONS).filter(k => names.includes(fold(ALT_DEVOTIONS[k].cls)));
}

/** Quantos poderes concedidos a devoção dá: 0 sem deus, 2 para clérigo/druida/paladino, 1 para os outros. */
export function grantedPowerCount(god, classes = []) {
  if (!god || ALT_DEVOTIONS[god]) return 0;
  const names = classNames(classes);
  return MUST_BE_DEVOUT.some(c => names.includes(fold(c))) ? 2 : 1;
}

/**
 * @param {object} p
 * @param {string} p.god
 * @param {string} [p.race]
 * @param {Array<{name:string, variantOf?:string|null}>} [p.classes]
 * @returns {{ok:boolean, level:'ok'|'warn'|'block', reason:string}}
 */
export function devotionCheck({ god, race = '', classes = [], rules = null }) {
  const g = DEVOTEES[god];
  if (!god) return { ok: true, level: 'ok', reason: '' };
  const alt = ALT_DEVOTIONS[god];
  if (alt) {
    return classNames(classes).includes(fold(alt.cls))
      ? { ok: true, level: 'ok', reason: `${alt.label}: ${alt.note}` }
      : { ok: false, level: 'block', reason: `${alt.label} é só para ${alt.cls.toLowerCase()}.` };
  }
  if (!g) return { ok: true, level: 'warn', reason: `${god} não está na tabela do livro básico: confira com o mestre.` };
  const names = classNames(classes);
  if (names.includes(fold('Usurpador'))) return { ok: false, level: 'block', reason: 'Usurpador (Inimigo dos Deuses) não pode ter devoção.' };
  const mode = rules?.openDevotions === true ? 'both' : (rules?.openDevotions || 'off');
  if (mode === 'both') return { ok: true, level: 'ok', reason: 'Devoções Abertas (regra da mesa): qualquer personagem pode ser devoto.' };
  // A classe devota restringe o deus, a menos que a mesa abra a devoção por classe.
  if (mode !== 'class') {
    for (const [cls, gods] of Object.entries(CLASS_GODS)) {
      if (names.includes(fold(cls)) && !gods.includes(god)) return { ok: false, level: 'block', reason: `${cls} só pode ser devoto de ${gods.join(', ')}.` };
    }
  }
  if (g.any) return { ok: true, level: g.note && god === 'Thwor' ? 'warn' : 'ok', reason: g.note ?? '' };
  const raceCheck = () => {
    if (fold(race) === fold('Humano')) return { ok: true, level: 'ok', reason: 'Humanos podem ser devotos de qualquer deus.' };
    if (g.races.some(r => fold(r) === fold(race))) return { ok: true, level: 'ok', reason: `${race} pode ser devoto de ${god}.` };
    if (race && !CORE_RACES.some(r => fold(r) === fold(race))) return { ok: true, level: 'warn', reason: `${race} é de suplemento e não aparece na lista de ${god}: confira com o mestre.` };
    return null;
  };
  const classCheck = () => {
    if (names.includes(fold('Clérigo'))) return { ok: true, level: 'ok', reason: 'Clérigos podem ser devotos de qualquer deus.' };
    const cls = g.classes.find(c => names.includes(fold(c)));
    return cls ? { ok: true, level: 'ok', reason: `${cls} pode ser devoto de ${god}.` } : null;
  };
  if (mode === 'race') return classCheck() ?? { ok: false, level: 'block', reason: `Devoções abertas por raça: a classe precisa estar entre os devotos de ${god} (${g.classes.join(', ')}).` };
  if (mode === 'class') return raceCheck() ?? { ok: false, level: 'block', reason: `Devoções abertas por classe: a raça precisa estar entre os devotos de ${god} (${g.races.join(', ')}).` };
  const byRace = raceCheck();
  if (byRace?.level === 'ok') return byRace;
  return classCheck() ?? byRace ?? { ok: false, level: 'block', reason: `Nem a raça nem a classe estão entre os devotos de ${god} (${[...g.races, ...g.classes].join(', ')}).` };
}

/** Classe que obriga a ser devoto (clérigo, druida, paladino — e as variantes delas). */
export function mustBeDevout(classes = []) {
  if (classes.some(c => fold(c.name) === fold('Usurpador'))) return null;
  const names = classNames(classes);
  return MUST_BE_DEVOUT.find(c => names.includes(fold(c))) ?? null;
}
