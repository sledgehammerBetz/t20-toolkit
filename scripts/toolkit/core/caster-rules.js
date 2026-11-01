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
export function buildCasterProfiles({ classes = [], arcanistPaths = [], schoolsByClass = {}, extra = [] }) {
  const profiles = [];
  // `extra`: Magias vindas de poderes de outra classe (core/class-levels.js, crossClassCasters).
  for (const cls of [...classes, ...extra.map(x => ({ ...x, name: x.cls, extra: x }))]) {
    const id = fold(cls.name);
    const def = CASTER_CLASSES[id];
    if (!def) continue;
    const level = cls.level;
    const circles = maxCircle(def.table, level);
    const profile = {
      id, label: cls.extra ? `${def.label} (${cls.extra.label})` : def.label,
      level, tradition: def.tradition, maxCircle: circles,
      key: def.key, known: cls.extra?.known ?? def.known(level), source: cls.extra?.source ?? def.source, warnings: [], notes: [...(cls.extra?.notes ?? [])],
      schools: null, schoolsRequired: def.schools ?? 0,
      necromancer: !!def.necromancer, usurper: !!def.usurper, path: null, fromPower: !!cls.extra
    };
    if (id === 'arcanista' && !cls.extra) {
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
  let typeOk = !isOffTradition(spell, profile);
  let via = null;
  if (!typeOk) {
    // Poderes que liberam magias da outra tradição (Teurgista Místico, Aumentar Repertório, linhagens...).
    via = (profile.grants ?? []).find(g => grantFits(g, spell, profile)) ?? null;
    if (via) typeOk = true;
  }
  if (!typeOk) block(`Magia ${t === 'div' ? 'divina' : t === 'arc' ? 'arcana' : t}: ${profile.label} lança magias ${profile.tradition === 'arc' ? 'arcanas' : 'divinas'}.`);

  if (profile.necromancer && spell.school === 'enc') block('Necromante não pode aprender magias de encantamento.');

  if (profile.schoolsRequired) {
    if (!profile.schools) review(`Defina as escolas do ${profile.label}.`);
    else if (!profile.schools.includes(spell.school)) block(`Escola fora das escolhidas pelo ${profile.label}.`);
  }
  if (profile.usurper && status !== 'blocked') return { status: 'review', reasons: ['Usurpador lança por Usurpar; não adiciona magias à lista.'] };
  return via && status !== 'blocked' ? { status, reasons, grant: via.label } : { status, reasons };
}

/** Magia de outra tradição para o perfil (universais nunca são; o Necromante aprende divinas de necromancia). */
export function isOffTradition(spell, profile) {
  const t = spell.type;
  if (t === 'uni' || t === profile.tradition) return false;
  if (profile.necromancer && t === 'div' && spell.school === 'nec') return false;
  return true;
}

/** A vaga do poder ainda aceita esta magia? */
function grantFits(g, spell, profile) {
  if (g.tradition && g.tradition !== spell.type) return false;
  if (g.maxCircle && !(spell.circle <= g.maxCircle)) return false;
  if (!(spell.circle <= profile.maxCircle)) return false;
  if (g.schools && !g.schools.includes(spell.school)) return false;
  if (g.perCircle) return !g.usedCircles.has(spell.circle);
  return g.used < g.slots;
}

/**
 * Poderes que dão magias a uma classe. Magias aprendidas por eles são magias da classe (JdA p. 171) e entram na
 * capacidade dela. `bonus`: magias a mais (número ou função do perfil); `slots`: quantas podem ser da outra
 * tradição (Infinity = qualquer quantidade); `perCircle`: uma da outra tradição por círculo.
 * `cls: null` = a classe vem do subtipo do poder ou do nome entre parênteses; `cls: '*'` = todas as classes.
 */
export const CLASS_SPELL_POWERS = Object.freeze([
  { name: /^conhecimento magico\b/, cls: null, bonus: 2, label: 'Conhecimento Mágico' },
  { name: /^aumentar repertorio$/, cls: 'bardo', bonus: 2, slots: 2, label: 'Aumentar Repertório' },
  { name: /^segredos da natureza$/, cls: 'druida', bonus: 2, slots: 2, label: 'Segredos da Natureza' },
  { name: /^linhagem feerica( basica)?$/, cls: 'arcanista', once: 'feerica', bonus: 1, slots: 1, maxCircle: 1, schools: ['enc', 'ilu'], label: 'Linhagem Feérica' },
  { name: /^aspecto da primavera$/, cls: 'druida', bonus: 1, slots: 1, schools: ['enc', 'ilu'], label: 'Aspecto da Primavera' },
  { name: /^aspecto do outono$/, cls: 'druida', bonus: 1, slots: 1, schools: ['nec'], label: 'Aspecto do Outono' },
  { name: /^aspecto do verao$/, cls: 'druida', bonus: 1, slots: 1, schools: ['tra'], label: 'Aspecto do Verão' },
  { name: /^aspecto do inverno$/, cls: 'druida', bonus: 1, slots: 1, schools: ['con', 'evo'], label: 'Aspecto do Inverno' },
  { name: /^linhagem abencoada basica$/, cls: 'arcanista', bonus: 1, slots: Infinity, tradition: 'div', maxCircle: 1, label: 'Linhagem Abençoada' },
  { name: /^linhagem abencoada aprimorada$/, cls: 'arcanista', bonus: 0, slots: Infinity, tradition: 'div', maxCircle: 3, label: 'Linhagem Abençoada Aprimorada' },
  { name: /^linhagem abencoada superior$/, cls: 'arcanista', bonus: 0, slots: Infinity, tradition: 'div', maxCircle: 5, label: 'Linhagem Abençoada Superior',
    note: 'Linhagem Abençoada Superior: as magias divinas extras (uma por círculo, limitadas pela Sabedoria) não estão na conta; combine com o mestre.' },
  { name: /^apoteose celestial$/, cls: 'arcanista', bonus: p => p.maxCircle, perCircle: true, tradition: 'div', label: 'Apoteose Celestial' },
  // Teurgista Místico (JdA p. 135): uma magia de cada círculo pode ser da outra tradição; não dá magias a mais.
  { name: /^teurgista mistico$/, cls: '*', bonus: 0, perCircle: true, shared: true, label: 'Teurgista Místico' }
]);

/** Classe a que um poder de magias se refere: subtipo ("Arcanista") ou parênteses ("Conhecimento Mágico (Clérigo)"). */
function powerClass(power) {
  const paren = /\(([^)]+)\)\s*$/.exec(power.name ?? '');
  return fold(power.subtipo || paren?.[1] || '');
}

/**
 * Aplica os poderes de magias da ficha aos perfis (magias a mais e vagas da outra tradição) e conta as vagas já
 * usadas pelas magias conhecidas. Muda os perfis no lugar e os devolve.
 * @param {object[]} profiles  de buildCasterProfiles
 * @param {{name:string, subtipo?:string}[]} powers
 * @param {{circle:number,type:string,school:string,learnedBy?:string}[]} knownSpells
 */
export function applySpellPowers(profiles, powers = [], knownSpells = []) {
  const own = profiles.filter(p => !p.fromPower && !p.usurper);
  for (const p of profiles) p.grants = [];
  const seen = new Set();
  const shared = new Map();
  for (const power of powers) {
    const key = fold(power.name);
    const def = CLASS_SPELL_POWERS.find(d => d.name.test(key));
    if (!def) continue;
    if (def.once) { if (seen.has(def.once)) continue; seen.add(def.once); }
    const targets = def.cls === '*' ? own : own.filter(p => p.id === (def.cls ?? powerClass(power)) || (def.cls === null && !powerClass(power) && own.length === 1));
    for (const p of targets.slice(0, def.cls === '*' ? undefined : 1)) {
      const bonus = typeof def.bonus === 'function' ? def.bonus(p) : def.bonus;
      if (bonus) { p.known += bonus; p.notes.push(`${def.label}: +${bonus} magia${bonus > 1 ? 's' : ''}.`); }
      if (def.note) p.notes.push(def.note);
      if (!def.slots && !def.perCircle) continue;
      let g = def.shared ? shared.get(def.label) : null;
      if (!g) {
        g = { label: def.label, slots: def.slots ?? 0, used: 0, perCircle: !!def.perCircle, usedCircles: new Set(),
          maxCircle: def.maxCircle ?? 0, schools: def.schools ?? null, tradition: def.tradition ?? null };
        if (def.shared) shared.set(def.label, g);
      }
      if (def.shared && p.grants.includes(g)) continue;
      // Poder repetido (Aumentar Repertório 2x) soma vagas na mesma entrada.
      const same = !def.shared && p.grants.find(x => x.label === g.label);
      if (same) same.slots += def.slots ?? 0;
      else p.grants.push(g);
    }
  }
  for (const p of own) {
    if (p.grants.some(g => g.label === 'Teurgista Místico')) {
      p.notes.push(`Teurgista Místico: uma magia de cada círculo pode ser ${p.tradition === 'arc' ? 'divina' : 'arcana'}.`);
    }
  }
  // Vagas já usadas: magias da outra tradição aprendidas pela classe (sem registro = primeira classe).
  const owner = s => profiles.find(p => p.id === s.learnedBy && !p.fromPower) ?? (s.learnedBy ? null : own[0]);
  const ordered = [...knownSpells].sort((a, b) => (a.circle ?? 0) - (b.circle ?? 0));
  for (const s of ordered) {
    const p = owner(s);
    if (!p || !isOffTradition(s, p)) continue;
    // Vagas específicas primeiro; Teurgista (qualquer magia) por último.
    const g = [...p.grants].sort((a, b) => (a.perCircle - b.perCircle) || (!!b.schools - !!a.schools)).find(x => grantFits(x, s, { maxCircle: 99 }));
    if (!g) continue;
    if (g.perCircle) g.usedCircles.add(s.circle);
    else g.used += 1;
  }
  return profiles;
}

/** Junta a avaliação de todos os perfis: basta um permitir. */
export function evaluateSpell(spell, profiles) {
  if (!profiles.length) return { status: 'blocked', reasons: ['Nenhuma classe conjuradora na ficha.'], by: [] };
  const by = profiles.map(p => ({ profile: p.id, ...evaluateForProfile(spell, p) }));
  const allowed = by.find(r => r.status === 'allowed');
  if (allowed) return { status: 'allowed', reasons: allowed.grant ? [`Pela regra de ${allowed.grant}.`] : [], by, grant: allowed.grant ?? null };
  const rev = by.find(r => r.status === 'review');
  if (rev) return { status: 'review', reasons: rev.reasons, by };
  return { status: 'blocked', reasons: [...new Set(by.flatMap(r => r.reasons))], by };
}

/**
 * `learnedBy` de magias que não ocupam escolhas de classe: raça e ganhos extras de poderes (JdA p. 171: magias de
 * classe pertencem à classe com que são usadas). As usurpadas e as copiadas são contadas à parte.
 */
export const NOT_CLASS_SPELL = Object.freeze(new Set(['raca', 'poder']));

/**
 * Valor de `learnedBy` para uma magia aprendida pelo perfil: o id da classe, ou `poder:<classe>` quando o perfil vem
 * de um poder de outra classe (conta na capacidade do poder, mas não é magia da classe).
 */
export const learnedByFor = profile => (!profile ? null : profile.fromPower ? `poder:${profile.id}` : profile.id);

/**
 * Capacidade: quantas magias as classes permitem conhecer e quantas a ficha já tem.
 * Magias de raça e de ganhos extras de poderes ficam fora da conta; poderes da classe (Conhecimento Mágico etc.)
 * já estão no `known` dos perfis (applySpellPowers) e as copiadas com Escriba Arcano somam no total.
 */
export function learningCapacity(profiles, knownSpells) {
  // Magias copiadas com Escriba Arcano são do Arcanista: entram no total, mas não ocupam as escolhas de nível.
  const extra = knownSpells.filter(s => s.learnedBy === 'escriba').length;
  const allowed = profiles.reduce((s, p) => s + p.known, 0) + extra;
  const borrowed = knownSpells.filter(s => s.learnedBy === 'usurpar').length; // magias usurpadas não são aprendidas
  const other = knownSpells.filter(s => NOT_CLASS_SPELL.has(s.learnedBy)).length;
  const current = knownSpells.length - borrowed - other;
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
