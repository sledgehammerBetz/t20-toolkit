/**
 * Regras de conjuração por classe. Funções puras: recebem dados, não tocam no Foundry.
 * Fontes: Tormenta20 JdA (Arcanista p.36-37, Bardo p.43, Clérigo p.56, Druida),
 * Heróis de Arton (Necromante p.34, Magimarcialista, Usurpador p.40, Ermitão),
 * Deuses de Arton (Frade p.38), Dragão Brasil 199 (Místico).
 */
import { fold } from './t20.js';

const FULL = [1, 5, 9, 13, 17]; // 2º círculo no 5º nível, a cada quatro níveis
const HALF = [1, 6, 10, 14];    // Bardo/Druida: 2º no 6º, 3º no 10º, 4º no 14º

const knownFull = lvl => 3 + (lvl - 1);              // 3 iniciais + 1 por nível
const knownHalf = lvl => 2 + Math.floor(lvl / 2);    // 2 iniciais + 1 por nível par

/** Definições por nome de classe (normalizado). */
export const CASTER_CLASSES = Object.freeze({
  arcanista:       { label: 'Arcanista', tradition: 'arc', table: FULL, key: 'int', known: knownFull, source: 'JdA p. 36' },
  necromante:      { label: 'Necromante', tradition: 'arc', table: FULL, key: 'int', known: knownFull, necromancer: true, source: 'Heróis de Arton p. 34' },
  clerigo:         { label: 'Clérigo', tradition: 'div', table: FULL, key: 'sab', known: knownFull, source: 'JdA p. 56' },
  frade:           { label: 'Frade', tradition: 'div', table: FULL, key: 'sab', known: knownFull, source: 'Deuses de Arton p. 38' },
  usurpador:       { label: 'Usurpador', tradition: 'div', table: FULL, key: 'car', known: () => 0, usurper: true, source: 'Heróis de Arton p. 40' },
  bardo:           { label: 'Bardo', tradition: 'arc', table: HALF, key: 'car', known: knownHalf, schools: 3, source: 'JdA p. 43' },
  magimarcialista: { label: 'Magimarcialista', tradition: 'arc', table: HALF, key: 'car', known: knownHalf, schools: 3, source: 'Heróis de Arton' },
  druida:          { label: 'Druida', tradition: 'div', table: HALF, key: 'sab', known: knownHalf, schools: 3, source: 'JdA, Druida' },
  ermitao:         { label: 'Ermitão', tradition: 'div', table: HALF, key: 'sab', known: knownHalf, schools: 3, source: 'Heróis de Arton' },
  // Místico: Criar Elementos + 2 de 1º círculo; evocação + escola da Afinidade + 1 escola (Dragão Brasil 199)
  mistico:         { label: 'Místico', tradition: 'arc', table: HALF, key: 'sab', known: lvl => 3 + Math.floor(lvl / 2), schools: 3, source: 'Dragão Brasil 199' }
});

export function maxCircle(table, level) {
  return table.filter(t => level >= t).length; // 0 se não conjura
}

/**
 * Monta os perfis de conjurador a partir de dados simples.
 * @param {{classes:{name:string,level:number}[], arcanistPaths:string[], schoolsByClass?:Record<string,string[]>}} input
 */
export function buildCasterProfiles({ classes = [], arcanistPaths = [], schoolsByClass = {} }) {
  const profiles = [];
  for (const cls of classes) {
    const id = fold(cls.name);
    const def = CASTER_CLASSES[id];
    if (!def) continue;
    const level = cls.level;
    const circles = maxCircle(def.table, level);
    const profile = {
      id, label: def.label, level, tradition: def.tradition, maxCircle: circles,
      key: def.key, known: def.known(level), source: def.source, warnings: [], notes: [],
      schools: null, schoolsRequired: def.schools ?? 0,
      necromancer: !!def.necromancer, usurper: !!def.usurper, path: null
    };
    if (id === 'arcanista') {
      if (arcanistPaths.length > 1) profile.warnings.push(`A ficha tem mais de um Caminho do Arcanista (${arcanistPaths.join(', ')}). Remova o que não vale.`);
      else if (arcanistPaths.length === 0) profile.warnings.push('Falta o poder "Caminho do Arcanista" na ficha. Usando a regra básica (Bruxo).');
      const path = arcanistPaths.length === 1 ? arcanistPaths[0] : null;
      profile.path = path;
      if (path === 'mago') {
        profile.label = 'Arcanista (Mago)';
        profile.known = 4 + (level - 1) + (circles - 1); // +1 inicial e +1 a cada novo círculo
      } else if (path === 'feiticeiro') {
        profile.label = 'Arcanista (Feiticeiro)';
        profile.key = 'car';
        profile.known = 3 + Math.floor((level - 1) / 2); // nova magia só em níveis ímpares
      } else if (path === 'bruxo') {
        profile.label = 'Arcanista (Bruxo)';
      }
    }
    if (def.schools) {
      const chosen = (schoolsByClass[id] ?? []).filter(Boolean);
      profile.schools = chosen.length ? chosen : null;
      if (chosen.length !== def.schools) profile.warnings.push(`Escolha as ${def.schools} escolas de magia do ${def.label} para filtrar corretamente.`);
    }
    if (def.usurper) profile.notes.push('O Usurpador não aprende magias: lança qualquer magia divina dos círculos que acessa usando Usurpar (Enganação CD 15 + PM).');
    if (def.necromancer) profile.notes.push('Necromante: pode aprender magias divinas de necromancia, não pode aprender encantamento e pelo menos metade das magias aprendidas devem ser de necromancia.');
    profiles.push(profile);
  }
  return profiles;
}

/**
 * Avalia se UM perfil pode aprender a magia.
 * @param {{circle:number,type:string,school:string}} spell
 * @returns {{status:'allowed'|'blocked'|'review', reasons:string[]}}
 */
export function evaluateForProfile(spell, profile) {
  const reasons = [];
  let status = 'allowed';
  const block = r => { status = 'blocked'; reasons.push(r); };
  const review = r => { if (status === 'allowed') status = 'review'; reasons.push(r); };

  if (!spell.circle) review('Círculo da magia não identificado.');
  else if (spell.circle > profile.maxCircle) block(`${spell.circle}º círculo: ${profile.label} nível ${profile.level} lança até o ${profile.maxCircle}º.`);

  const t = spell.type;
  let typeOk = t === 'uni' || t === profile.tradition;
  if (profile.necromancer && t === 'div' && spell.school === 'nec') typeOk = true;
  if (!typeOk) block(`Magia ${t === 'div' ? 'divina' : t === 'arc' ? 'arcana' : t}: ${profile.label} lança magias ${profile.tradition === 'arc' ? 'arcanas' : 'divinas'}.`);

  if (profile.necromancer && spell.school === 'enc') block('Necromante não pode aprender magias de encantamento.');

  if (profile.schoolsRequired) {
    if (!profile.schools) review(`Defina as escolas do ${profile.label}.`);
    else if (!profile.schools.includes(spell.school)) block(`Escola fora das escolhidas pelo ${profile.label}.`);
  }
  if (profile.usurper && status !== 'blocked') return { status: 'review', reasons: ['Usurpador lança por Usurpar; não adiciona magias à lista.'] };
  return { status, reasons };
}

/** Junta a avaliação de todos os perfis: basta um permitir. */
export function evaluateSpell(spell, profiles) {
  if (!profiles.length) return { status: 'blocked', reasons: ['Nenhuma classe conjuradora na ficha.'], by: [] };
  const by = profiles.map(p => ({ profile: p.id, ...evaluateForProfile(spell, p) }));
  const allowed = by.find(r => r.status === 'allowed');
  if (allowed) return { status: 'allowed', reasons: [], by };
  const rev = by.find(r => r.status === 'review');
  if (rev) return { status: 'review', reasons: rev.reasons, by };
  return { status: 'blocked', reasons: [...new Set(by.flatMap(r => r.reasons))], by };
}

/**
 * Capacidade: quantas magias as classes permitem conhecer e quantas a ficha já tem.
 * Magias vindas de poderes/raça também estão na ficha, então o número é uma referência.
 */
export function learningCapacity(profiles, knownSpells) {
  const allowed = profiles.reduce((s, p) => s + p.known, 0);
  // Magias copiadas com Escriba Arcano não ocupam as escolhas de nível.
  const extra = knownSpells.filter(s => s.learnedBy === 'escriba').length;
  const borrowed = knownSpells.filter(s => s.learnedBy === 'usurpar').length; // magias usurpadas não são aprendidas
  const current = knownSpells.length - extra - borrowed;
  const necro = profiles.find(p => p.necromancer);
  const necroCount = knownSpells.filter(s => s.school === 'nec').length;
  return { allowed, current, extra, remaining: allowed - current, necro: necro ? { count: necroCount, total: current } : null };
}

/** Necromante: depois de adicionar, pelo menos metade precisa ser de necromancia. */
export function necromancerRatioOk(capacity, spell) {
  if (!capacity.necro) return true;
  const count = capacity.necro.count + (spell.school === 'nec' ? 1 : 0);
  const total = capacity.necro.total + 1;
  return count * 2 >= total;
}
