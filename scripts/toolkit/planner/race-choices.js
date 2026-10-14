/**
 * Escolhas dentro das raças (funções puras).
 *
 * 1) Habilidades raciais com escolha (texto do livro → "vagas"):
 *    skill        perícia treinada à escolha (vai para a grade de Perícias, origem "Raça")
 *    skillFrom    perícia treinada de uma lista curta (escolhida aqui)
 *    skillOrPower perícia OU poder (Humano: troca uma das perícias por um poder geral)
 *    power        poder de um grupo (geral, tormenta, origem, geral-ou-origem, classe)
 *    spell        magia de 1º círculo (com filtro de tipo/escola)
 *    attr         +1 em um atributo (soma nos modificadores raciais)
 *    note         escolha que não muda a ficha (vai no chat): resistência, arma natural, bônus em perícia…
 *    bonusOrPower +2 em uma perícia (nota) OU um poder (Lefou)
 * 2) "Bancos" de habilidades da raça para escolher (Golem de Ameaças, Duende, Kallyanach, Mashin, Kobolds).
 */
import { fold } from '../core/t20.js';

const SKILLS_ANY = null;
const ELEMENTS = ['ácido', 'eletricidade', 'fogo', 'frio', 'luz', 'trevas'];

/** Chave = nome da habilidade racial (sem acento, minúsculo). */
export const RACE_ABILITY_CHOICES = Object.freeze({
  'versatil': { text: 'Duas perícias à escolha (não precisam ser da classe). Pode trocar uma delas por um poder geral.', slots: [{ kind: 'skill' }, { kind: 'skillOrPower', power: 'geral' }] },
  'memoria postuma': { text: 'Uma perícia ou um poder geral.', slots: [{ kind: 'skillOrPower', power: 'geral' }] },
  'natureza organica': { text: 'Uma perícia ou um poder geral.', slots: [{ kind: 'skillOrPower', power: 'geral' }] },
  'hibrido': { text: 'Uma perícia à escolha (não precisa ser da classe).', slots: [{ kind: 'skill' }] },
  'infancia entre os pequenos': { text: 'Uma perícia à escolha.', slots: [{ kind: 'skill' }] },
  'adaptavel': { text: 'Uma perícia à escolha (além de +2 em Intimidação).', slots: [{ kind: 'skill' }] },
  'papel tribal': { text: 'Uma perícia entre Cura, Intimidação, Ofício ou Sobrevivência.', slots: [{ kind: 'skillFrom', from: ['Cura', 'Intimidação', 'Ofício', 'Sobrevivência'] }] },
  'plurivalente': { text: 'Um poder geral à escolha.', slots: [{ kind: 'power', power: 'geral' }] },
  'proposito de criacao': { text: 'Um poder geral à escolha. O golem não tem origem.', slots: [{ kind: 'power', power: 'geral' }], noOrigin: true },
  'ambicao herdada': { text: 'Um poder geral ou um poder único de origem.', slots: [{ kind: 'power', power: 'geralOuOrigem' }] },
  'terror vivo': { text: 'Um poder da Tormenta (não conta para perda de Carisma).', slots: [{ kind: 'power', power: 'tormenta' }] },
  'deformidade': { text: '+2 em duas perícias (cada uma conta como poder da Tormenta). Pode trocar um bônus por um poder da Tormenta.', slots: [{ kind: 'note', label: '+2 em', skills: true }, { kind: 'bonusOrPower', power: 'tormenta' }] },
  'chassi mashin': { text: '+1 em dois atributos e duas perícias treinadas.', slots: [{ kind: 'attr' }, { kind: 'attr' }, { kind: 'skill' }, { kind: 'skill' }] },
  'tatuagem mistica': { text: 'Uma magia de 1º círculo (atributo-chave Carisma).', slots: [{ kind: 'spell' }] },
  'sagrada': { text: 'Uma magia divina de 1º círculo (atributo-chave Sabedoria).', slots: [{ kind: 'spell', type: 'div' }] },
  'sapiencia': { text: 'Uma magia de adivinhação de 1º círculo (atributo-chave Sabedoria).', slots: [{ kind: 'spell', school: 'adv' }] },
  'heranca de magika': { text: 'Uma magia arcana de 1º círculo.', slots: [{ kind: 'spell', type: 'arc' }] },
  'pratica arcana': { text: 'Uma magia arcana de 1º círculo que cause dano do tipo da Herança Dracônica.', slots: [{ kind: 'spell', type: 'arc' }] },
  'diferentao': { text: 'Um poder de outra classe cujos pré-requisitos vocês cumpram.', slots: [{ kind: 'power', power: 'classe' }] },
  'resistencia elemental': { text: 'Resistência 10 a um tipo de dano, conforme a ascendência.', slots: [{ kind: 'note', label: 'Tipo', options: ['frio (água)', 'eletricidade (ar)', 'fogo (fogo)', 'ácido (terra)', 'luz (luz)', 'trevas (trevas)'] }] },
  'heranca draconica': { text: 'Redução 5 contra um tipo de dano.', slots: [{ kind: 'note', label: 'Tipo', options: ELEMENTS }] },
  'fonte elemental': { text: 'Espírito elemental: imunidade ao tipo escolhido.', slots: [{ kind: 'note', label: 'Elemento', options: ['água (frio)', 'ar (eletricidade)', 'fogo (fogo)', 'terra (ácido)'] }] },
  'elemental': { text: 'Espírito elemental: imunidade ao tipo escolhido.', slots: [{ kind: 'note', label: 'Elemento', options: ['água (frio)', 'ar (eletricidade)', 'fogo (fogo)', 'terra (ácido)'] }] },
  'armamento kallyanach': { text: 'Arma natural (1d6).', slots: [{ kind: 'note', label: 'Arma', options: ['cauda (impacto)', 'chifres (perfuração)', 'mordida (perfuração)'] }] },
  'esperteza vulpina': { text: '+2 em duas perícias de Inteligência ou Carisma.', slots: [{ kind: 'note', label: '+2 em', skills: true }, { kind: 'note', label: '+2 em', skills: true }] },
  'heranca de deathok': { text: '+2 em duas perícias (pode trocar a cada manhã).', slots: [{ kind: 'note', label: '+2 em', skills: true }, { kind: 'note', label: '+2 em', skills: true }] },
  'heranca de ramknal': { text: 'Duas perícias entre Acrobacia, Enganação, Furtividade, Jogatina e Ladinagem (+5 por 2 PM).', slots: [{ kind: 'note', label: 'Perícia', options: ['Acrobacia', 'Enganação', 'Furtividade', 'Jogatina', 'Ladinagem'] }, { kind: 'note', label: 'Perícia', options: ['Acrobacia', 'Enganação', 'Furtividade', 'Jogatina', 'Ladinagem'] }] },
  'heranca de pelagia': { text: 'Três perícias para escolher 10 por 1 PM.', slots: [{ kind: 'note', label: 'Perícia', skills: true }, { kind: 'note', label: 'Perícia', skills: true }, { kind: 'note', label: 'Perícia', skills: true }] },
  'heranca de arboria': { text: 'Forma Selvagem para uma forma.', slots: [{ kind: 'note', label: 'Forma', options: ['Ágil', 'Sorrateira', 'Veloz'] }] },
  'heranca de chacina': { text: 'Forma Selvagem para uma forma.', slots: [{ kind: 'note', label: 'Forma', options: ['Feroz', 'Resistente'] }] },
  'vanguardista': { text: '+2 em um Ofício à escolha.', slots: [{ kind: 'note', label: 'Ofício', crafts: true }] },
  'tabu': { text: '−5 em uma perícia, conforme o tabu.', slots: [{ kind: 'note', label: 'Penalidade em', options: ['Diplomacia', 'Iniciativa', 'Luta', 'Percepção'] }] },
  'natureza animal': { text: '+1 em um atributo.', slots: [{ kind: 'attr' }] },
  'dons': { text: '+1 em dois atributos diferentes.', slots: [{ kind: 'attr' }, { kind: 'attr', distinct: true }] }
});

export const abilityKey = name => fold(name).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Bancos de habilidades raciais. `match(power)` decide se o poder pertence ao banco.
 * `count` = quantas escolher; `min` = mínimo (0 = opcional). `coreOnly: false` = só raças fora do livro básico.
 */
export const RACE_POOLS = Object.freeze({
  golem: { race: 'golem', notCore: true, pools: [
    { id: 'tamanho', label: 'Tamanho', count: 1, min: 0, note: 'Opcional: sem escolha, o golem é Médio.', match: n => ['pequeno', 'grande'].includes(n) },
    { id: 'fonte', label: 'Fonte de energia', count: 1, min: 1, match: n => ['alquimica', 'elemental', 'sagrada', 'vapor'].includes(n) },
    { id: 'material', label: 'Material do chassi', count: 1, min: 1, match: () => true }
  ] },
  duende: { race: 'duende', pools: [
    { id: 'tamanho', label: 'Tamanho', count: 1, min: 1, match: n => n.startsWith('duende ') },
    { id: 'natureza', label: 'Natureza', count: 1, min: 1, match: n => n.startsWith('natureza') },
    { id: 'presentes', label: 'Presentes', count: 3, min: 3, match: () => true }
  ] },
  kallyanach: { race: 'kallyanach', pools: [{ id: 'bencaos', label: 'Bênçãos dracônicas', count: 2, min: 2, note: 'Confira no livro quantas bênçãos o mestre libera.', match: () => true }] },
  mashin: { race: 'mashin', pools: [{ id: 'maravilha', label: 'Maravilha mecânica', count: 1, min: 0, note: 'Opcional: substitui uma das perícias do Chassi.', match: () => true }] },
  kobolds: { race: 'kobolds', pools: [{ id: 'talentos', label: 'Talentos do bando', count: 2, min: 0, note: 'Confira no livro quantos talentos o bando recebe.', match: () => true }] }
});

/**
 * Bancos da raça a partir dos poderes raciais do índice.
 * @param {{name:string, grants?:string[], core?:boolean}} race
 * @param {Array<{uuid,name,key,subtipo}>} racialPowers  poderes tipo "racial"
 */
export function racePools(race, racialPowers) {
  const cfg = RACE_POOLS[fold(race?.name ?? '')];
  if (!cfg || (cfg.notCore && race.core)) return [];
  const granted = new Set(race.grants ?? []);
  const grantedNames = new Set(racialPowers.filter(p => granted.has(p.uuid)).map(p => p.key));
  const own = racialPowers.filter(p => fold(p.subtipo) === cfg.race && !granted.has(p.uuid) && !grantedNames.has(p.key) && !p.key.startsWith('atributos'));
  const seen = new Set();
  const used = new Set();
  return cfg.pools.map(pool => {
    const options = own.filter(p => !used.has(p.uuid) && pool.match(abilityKey(p.name)) && !seen.has(p.key) && seen.add(p.key));
    options.forEach(p => used.add(p.uuid));
    return { id: pool.id, label: pool.label, count: pool.count, min: pool.min, note: pool.note ?? '', options };
  }).filter(p => p.options.length);
}

/** Habilidades da raça (concedidas + escolhidas nos bancos) que pedem escolha. */
export function raceAbilityChoices(abilityNames) {
  const out = [];
  for (const name of abilityNames) {
    const spec = RACE_ABILITY_CHOICES[abilityKey(name)];
    if (spec) out.push({ key: abilityKey(name), name, ...spec });
  }
  return out;
}

/** Vagas de perícia livre que a raça dá (vão para a grade de Perícias). */
export function raceSkillSlots(choices, picks = {}) {
  let n = 0;
  for (const c of choices) c.slots.forEach((s, i) => {
    if (s.kind === 'skill') n++;
    if (s.kind === 'skillOrPower' && (picks[c.key]?.[i]?.mode ?? 'skill') === 'skill') n++;
  });
  return n;
}

/** +1 de atributo vindos das escolhas da raça. */
export function raceAttrBonus(choices, picks = {}) {
  const out = {};
  for (const c of choices) c.slots.forEach((s, i) => {
    const v = picks[c.key]?.[i]?.value;
    if (s.kind === 'attr' && v) out[v] = (out[v] ?? 0) + 1;
  });
  return out;
}

/** O que falta escolher (para a etapa ficar completa). */
export function raceChoiceProblems(choices, picks = {}, pools = [], poolPicks = {}) {
  const out = [];
  for (const c of choices) c.slots.forEach((s, i) => {
    const p = picks[c.key]?.[i] ?? {};
    if (s.kind === 'skill') return; // contado na grade de perícias
    if (s.kind === 'attr' || s.kind === 'attrDyn') return; // escolhido (e conferido) na etapa Atributos
    if (s.kind === 'skillOrPower' && (p.mode ?? 'skill') === 'skill') return;
    if (s.kind === 'attr' && s.distinct) {
      const prev = picks[c.key]?.[i - 1]?.value;
      if (p.value && p.value === prev) { out.push(`${c.name}: atributos diferentes`); return; }
    }
    if (!p.value) out.push(c.name);
  });
  for (const pool of pools) {
    const n = (poolPicks[pool.id] ?? []).length;
    if (n < pool.min) out.push(`${pool.label} (${n}/${pool.min})`);
    if (n > pool.count) out.push(`${pool.label}: no máximo ${pool.count}`);
  }
  return [...new Set(out)];
}

/** Filtro de poderes por grupo. */
export function powerGroupFilter(group) {
  return p => {
    if (group === 'geral') return p.tipo === 'geral';
    if (group === 'tormenta') return p.tipo === 'geral' && fold(p.subtipo) === 'tormenta';
    if (group === 'origem') return p.tipo === 'origem';
    if (group === 'geralOuOrigem') return p.tipo === 'geral' || p.tipo === 'origem';
    if (group === 'classe') return p.tipo === 'classe';
    return false;
  };
}

/** Filtro de magias de 1º círculo da vaga. */
export function spellSlotFilter(slot) {
  return s => s.circle === 1 && ['arc', 'div', 'uni'].includes(s.type)
    && (!slot.type || s.type === slot.type || s.type === 'uni') && (!slot.school || s.school === slot.school);
}

export { SKILLS_ANY };
