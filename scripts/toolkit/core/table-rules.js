/**
 * Regras da mesa: regras opcionais dos livros e homebrews, ligadas pelo mestre.
 * Fontes: Tormenta20 JdA (Idade, p. 108), Heróis de Arton cap. 4 (Regras Mais Soltas: Atributos Variados,
 * Raças Abertas, Devoções Abertas, Pontos Variados; Complicações; Idades Variadas).
 * Funções puras + leitura/escrita da configuração do mundo.
 */
import { MODULE_ID } from '../../constants.js';

export const TABLE_RULES_SETTING = 'tableRules';

export const TABLE_RULES_DEFAULTS = Object.freeze({
  methods: Object.freeze({ points: true, roll: true, classic: false, epic: false, khalmyr: false, nimb: false, valkaria: false }),
  pointBudget: 10,
  openRaces: false,
  openDevotions: 'both',        // 'off' | 'race' | 'class' | 'both' — ligado por padrão (pedido da mesa)
  complications: false,
  ages: Object.freeze({ jda: false, herois: false }), // regras de idade liberadas; cada personagem escolhe a sua
  originsCount: 1,              // homebrew: quantas origens na criação
  customOrigins: true,          // Sua Própria Origem (JdA p. 95): o jogador monta a origem, combinando com o mestre
  distinctions: false,
  extraGains: 'gm',             // 'off' | 'gm' | 'all' — ganhos fora da progressão no Planejador
  retrain: 'off'                // 'off' | 'levelUp' (uma troca por nível de personagem) | 'free' — retreino no Planejador
});

export const RETRAIN_MODES = Object.freeze(['off', 'levelUp', 'free']);

/**
 * Retreino: pode trocar agora? O mestre sempre pode (se a regra não estiver desligada).
 * 'levelUp': uma troca por nível de personagem — liberada de novo ao subir de nível.
 */
export function retrainStatus(rules, { level = 0, usedAt = 0, isGM = false } = {}) {
  const mode = rules?.retrain ?? 'off';
  if (mode === 'off') return { allowed: false, mode, reason: 'Retreino desligado nas Regras da mesa.' };
  if (mode === 'free' || isGM) return { allowed: true, mode, reason: mode === 'free' ? 'Retreino livre.' : 'Mestre: troca liberada.' };
  if (usedAt >= level) return { allowed: false, mode, reason: `Você já retreinou no ${usedAt}º nível. Libera de novo ao subir de nível.` };
  return { allowed: true, mode, reason: 'Uma troca disponível neste nível.' };
}

/* ---------- configuração ---------- */

export function normalizeRules(raw = {}) {
  const d = TABLE_RULES_DEFAULTS;
  const methods = { ...d.methods, ...(raw.methods ?? {}) };
  if (!Object.values(methods).some(Boolean)) methods.points = true;
  return {
    methods,
    pointBudget: [5, 10, 15].includes(Number(raw.pointBudget)) ? Number(raw.pointBudget) : Math.max(1, Math.min(30, Number(raw.pointBudget) || d.pointBudget)),
    openRaces: !!(raw.openRaces ?? d.openRaces),
    openDevotions: normalizeDevotion(raw.openDevotions),
    complications: !!(raw.complications ?? d.complications),
    ages: normalizeAges(raw),
    originsCount: Math.max(1, Math.min(3, Number(raw.originsCount) || 1)),
    customOrigins: !!(raw.customOrigins ?? d.customOrigins),
    distinctions: !!(raw.distinctions ?? d.distinctions),
    extraGains: ['off', 'gm', 'all'].includes(raw.extraGains) ? raw.extraGains : d.extraGains,
    retrain: RETRAIN_MODES.includes(raw.retrain) ? raw.retrain : d.retrain
  };
}

/** Devoções Abertas: true/false (versões antigas) viram 'both'/'off'. */
function normalizeDevotion(v) {
  if (v === undefined || v === null) return TABLE_RULES_DEFAULTS.openDevotions;
  if (v === true) return 'both';
  if (v === false) return 'off';
  return DEVOTION_MODES.includes(v) ? v : TABLE_RULES_DEFAULTS.openDevotions;
}

/** Regras de idade liberadas. Aceita o formato antigo (age: 'jda' | 'herois'). */
function normalizeAges(raw) {
  if (raw.ages && typeof raw.ages === 'object') return { jda: !!raw.ages.jda, herois: !!raw.ages.herois };
  return { jda: raw.age === 'jda', herois: raw.age === 'herois' };
}

export const DEVOTION_MODES = Object.freeze(['off', 'race', 'class', 'both']);

/** Regras de idade disponíveis: a do Livro Básico sempre; a de Heróis de Arton se o mestre liberou. */
export const allowedAgeRules = rules => ['jda', 'herois'].filter(k => k === 'jda' || rules?.ages?.[k]);

/** Regra de idade de um personagem: a que ele escolheu, se o mestre liberou. */
export function ageRuleFor(choice, rules) {
  return allowedAgeRules(rules).includes(choice) ? choice : 'off';
}

export function registerTableRulesSetting(gameRef = globalThis.game) {
  gameRef?.settings?.register?.(MODULE_ID, TABLE_RULES_SETTING, {
    name: 'Regras da mesa', scope: 'world', config: false, type: Object, default: {}
  });
}

export function getTableRules(gameRef = globalThis.game) {
  try { return normalizeRules(gameRef?.settings?.get?.(MODULE_ID, TABLE_RULES_SETTING) ?? {}); }
  catch { return normalizeRules({}); }
}

export async function setTableRules(patch, gameRef = globalThis.game) {
  const next = normalizeRules({ ...getTableRules(gameRef), ...patch });
  await gameRef.settings.set(MODULE_ID, TABLE_RULES_SETTING, next);
  return next;
}

/* ---------- atributos (Heróis de Arton, Atributos Variados) ---------- */

export const ATTRIBUTE_METHODS = Object.freeze({
  points: { label: 'Pontos', short: 'Pontos', source: 'JdA' },
  roll: { label: 'Rolagem 4d6', short: '4d6', formula: '4d6kh3', source: 'JdA' },
  classic: { label: 'Clássica 3d6', short: '3d6', formula: '3d6', source: 'Heróis de Arton' },
  epic: { label: 'Épica (3d6 menos o menor, +6)', short: 'Épica', formula: '3d6kh2 + 6', source: 'Heróis de Arton' },
  khalmyr: { label: 'Khalmyr (3, 3, 2, 1, 0, −1)', short: 'Khalmyr', fixed: [3, 3, 2, 1, 0, -1], source: 'Heróis de Arton' },
  nimb: { label: 'Nimb (7d20, descarta o menor)', short: 'Nimb', formula: '1d20', count: 7, dropLowest: true, source: 'Heróis de Arton' },
  valkaria: { label: 'Valkaria (7d6 sobre 8)', short: 'Valkaria', dice: 7, source: 'Atributos Variados' }
});

/**
 * Método Valkaria: cada atributo começa em 8; os 7d6 são aplicados inteiros, cada dado num atributo.
 * O total é convertido pela Tabela 1-1 (JdA p. 17), com no máximo 4.
 * @param {number[]} dice  @param {Record<number,string>} assign  índice do dado → atributo
 */
export function valkariaScores(dice = [], assign = {}, attrs = ['for', 'des', 'con', 'int', 'sab', 'car']) {
  const score = Object.fromEntries(attrs.map(a => [a, 8]));
  dice.forEach((d, i) => { const a = assign?.[i]; if (a && a in score) score[a] += Number(d) || 0; });
  const value = Object.fromEntries(attrs.map(a => [a, Math.min(4, rollToValue(score[a]))]));
  return { score, value, unassigned: dice.filter((_, i) => !assign?.[i]).length };
}

/** Tabela 1-1 (JdA p. 17). */
export function rollToValue(total) {
  if (total <= 7) return -2;
  if (total <= 9) return -1;
  if (total <= 11) return 0;
  if (total <= 13) return 1;
  if (total <= 15) return 2;
  if (total <= 17) return 3;
  return 4;
}

/** Conversão de um resultado conforme o método (Nimb: 1–3 → −3, 18–19 → 4, 20 → 5). */
export function convertRoll(total, method = 'roll') {
  if (method === 'nimb') {
    if (total <= 3) return -3;
    if (total >= 20) return 5;
    if (total >= 18) return 4;
  }
  return rollToValue(total);
}

/** Métodos ligados na mesa, na ordem de exibição. */
export function enabledMethods(rules) {
  return Object.keys(ATTRIBUTE_METHODS).filter(m => rules?.methods?.[m]);
}

/* ---------- Raças Abertas ---------- */

/** Modificadores não nulos da raça, em ordem (maior primeiro). */
export function racialModifiers(atributos = {}) {
  return Object.entries(atributos).map(([attr, v]) => ({ attr, value: Number(v) || 0 })).filter(m => m.value).sort((a, b) => b.value - a.value);
}

/**
 * Aplica a distribuição livre: `map` = { índice do modificador: atributo de destino }.
 * Sem destino, o modificador fica no atributo original. Não pode repetir atributo.
 * @returns {{ ok:boolean, atributos:Record<string,number>, error?:string }}
 */
export function remapRacial(atributos = {}, map = {}, attrs = ['for', 'des', 'con', 'int', 'sab', 'car']) {
  const mods = racialModifiers(atributos);
  const out = Object.fromEntries(attrs.map(a => [a, 0]));
  const used = new Set();
  for (const [i, m] of mods.entries()) {
    const target = map[i] || m.attr;
    if (used.has(target)) return { ok: false, atributos: { ...atributos }, error: 'Dois modificadores no mesmo atributo.' };
    used.add(target);
    out[target] = m.value;
  }
  return { ok: true, atributos: out };
}

/* ---------- Idade ---------- */

/** JdA p. 108: Maduro (45) e Velho (70), cumulativos. */
export const AGE_JDA = Object.freeze({
  jovem: { label: 'Jovem (padrão)', attrs: {} },
  maduro: { label: 'Maduro (45 anos ou mais)', attrs: { for: -1, des: -1, con: -1, int: 1, sab: 1, car: 1 } },
  velho: { label: 'Velho (70 anos ou mais)', attrs: { for: -3, des: -3, con: -3, int: 2, sab: 2, car: 2 } }
});

/** Heróis de Arton, Tabela 4-2: Faixas Etárias. */
export const AGE_HEROIS = Object.freeze({
  crianca: { label: 'Criança (9–12)', attrs: { for: -2, con: -1, sab: -1 }, levels: 0, complications: 0, originBenefits: 0,
    features: ['Tamanho Menor: uma categoria menor que o padrão da raça.', 'Protegido dos Deuses: +2 na Defesa e +5 em testes de resistência.', 'Sem Origem: não recebe benefícios de origem.'] },
  adolescente: { label: 'Adolescente (13–17)', attrs: { sab: -1 }, levels: 0, complications: 0, originBenefits: 1,
    features: ['Ímpeto Juvenil: +3 PM.', 'Origem em Construção: um benefício de origem em vez de dois.'] },
  jovem: { label: 'Jovem (18–24, padrão)', attrs: {}, levels: 0, complications: 0, originBenefits: 2, features: [] },
  adulto: { label: 'Adulto (25–39)', attrs: {}, levels: 0, complications: 0, optionalPower: true, originBenefits: 2,
    features: ['Já Vi Coisas: pode receber um poder geral; se receber, também recebe uma complicação de idade.'] },
  maduro: { label: 'Maduro (40–59)', attrs: {}, levels: 1, complications: 2, originBenefits: 2,
    features: ['Veterano Calejado: começa com 1 nível a mais que o grupo.'] },
  velho: { label: 'Velho (60–79)', attrs: { for: -1, des: -1, con: -1 }, levels: 2, complications: 3, originBenefits: 2, noPhysicalIncrease: true,
    features: ['Ai Minhas Costas: começa com 2 níveis a mais.', 'Não pode escolher Aumento de Atributo para atributos físicos.'] },
  anciao: { label: 'Ancião (80+)', attrs: { for: -2, des: -2, con: -2 }, levels: 3, complications: 4, originBenefits: 2, noPhysicalIncrease: true,
    features: ['O Inverno da Vida: começa com 3 níveis a mais.', 'Não pode escolher Aumento de Atributo para atributos físicos.'] }
});

/** Multiplicador de idade a partir de "adulto" (Heróis de Arton, quadro "Idades das Raças"). */
export function ageMultiplier(raceName = '') {
  const r = String(raceName).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/(^|\s)(anao|meio-elfo|qareen)/.test(r)) return 2;
  if (/(dahllan|duende|eiradaan|elfo|golem|osteon|satiro|silfide)/.test(r) && !/meio-elfo/.test(r)) return 5;
  if (/(goblin|trog)/.test(r)) return 0.7;
  return 1;
}

/**
 * Efeitos da idade escolhida.
 * @param {'off'|'jda'|'herois'} system
 * @param {string} band
 * @param {{adultPower?:boolean}} [opts]
 */
export function ageEffects(system, band, opts = {}) {
  const none = { attrs: {}, levels: 0, complications: 0, extraPower: false, originBenefits: 2, features: [], label: '' };
  if (system === 'jda') {
    const a = AGE_JDA[band];
    return a ? { ...none, attrs: { ...a.attrs }, label: a.label } : none;
  }
  if (system === 'herois') {
    const a = AGE_HEROIS[band];
    if (!a) return none;
    const extraPower = !!(a.optionalPower && opts.adultPower);
    return { attrs: { ...a.attrs }, levels: a.levels, complications: a.complications + (extraPower ? 1 : 0), extraPower,
      originBenefits: a.originBenefits, features: [...a.features], label: a.label, noPhysicalIncrease: !!a.noPhysicalIncrease };
  }
  return none;
}

/** Complicações de idade (Heróis de Arton, "O Peso da Idade"). Não existem no compêndio: viram poderes na ficha. */
export const AGE_COMPLICATIONS = Object.freeze([
  ['Abatido', 'Seu vigor se foi. Você recebe –2 PV por nível.'],
  ['Catarata', 'Seus olhos já não são os mesmos. Você sofre –5 em Percepção e Pontaria.'],
  ['Dedos Trêmulos', 'Você sofre –2 em Luta e Pontaria. Além disso, quando usa um item que esteja empunhando, role 1d4. Em um resultado 1, você derruba esse item.'],
  ['Definhamento', 'A idade roubou seu peso, deixando-o um fiapo do que era antes. Você sofre –5 em Fortitude e em testes de manobras de combate.'],
  ['Desatento', 'Na primeira rodada de qualquer cena de ação, role um dado. Em um resultado ímpar, você fica surpreendido (mesmo que um efeito possa evitar isso).'],
  ['"Devagar, Jovem!"', 'Seu deslocamento diminui em –3m e você não pode correr ou fazer investidas.'],
  ['Gota', 'Sempre que faz um teste de Destreza ou de perícias baseadas nesse atributo você perde 1d6 pontos de vida. Você só pode recuperar esses PV com descanso.'],
  ['Juntas Duras', 'Suas articulações doem. Você sofre –5 em testes de Acrobacia e Reflexos.'],
  ['Melancólico', 'Você já não tem mais tanta motivação para realizar grandes façanhas. Você perde 1 PM por nível.'],
  ['Memórias Tristes', 'Sempre que rola um resultado 1 natural em qualquer teste, você fica pasmo por 1 rodada e frustrado até o fim do dia (cumulativo).'],
  ['"No Meu Tempo..."', 'Você se prende a visões idealizadas de um passado que nunca existiu e se torna presa fácil para manipulação. Você sofre –5 em Intuição e Vontade.'],
  ['Pulmão Ruim', 'Quando corre ou prende a respiração, você precisa fazer testes de Fortitude para não ficar fatigado a partir da primeira rodada. Além disso, sempre que faz uma investida, você fica fatigado até o fim da cena.'],
  ['Rabugento', 'Você reclama de tudo. Você sofre –5 em testes de Carisma e de perícias baseadas nesse atributo, exceto Intimidação.'],
  ['Recurvado', 'Você conta como uma categoria de tamanho menor para alcance natural, modificador de manobras e armas que pode empunhar (mas não para espaço ocupado, modificador de Furtividade ou dano de armas naturais).'],
  ['Sono Ruim', 'Sua recuperação de PM e PV é sempre uma categoria pior. Se a condição de descanso já é ruim, você recupera apenas 1 PM e 1 PV; se já recupera apenas 1, não recupera nada.'],
  ['Teimoso', 'Sempre que falha em um teste de atributo ou de perícia que possa tentar novamente, você é obrigado a tentar pelo menos mais uma vez.'],
  ['Tosse', 'Em cenas de ação, role 1d6 no início de cada rodada; num 1, fica atordoado por 1 rodada. Em cenas de interpretação, role 1d6 em testes de perícia de Carisma; num 1, sofre –5 nesse teste.'],
  ['Turrão', 'Você não recebe o bônus de metade do nível em perícias nas quais não é treinado.'],
  ['Velha Ferida', 'Sempre que você sofre um acerto crítico, o multiplicador de dano aumenta em +1 e você fica fraco (mesmo que seja imune, cumulativo).']
].map(([name, text]) => Object.freeze({ name, text })));

/** Dados de um poder de complicação de idade para criar na ficha. */
export function ageComplicationItem(name) {
  const c = AGE_COMPLICATIONS.find(x => x.name === name);
  if (!c) return null;
  return {
    name: c.name, type: 'poder', img: 'icons/svg/hazard.svg',
    system: { tipo: 'complicacao', subtipo: 'Idade', description: { value: `<p>${c.text}</p><p><em>Complicação de idade — Heróis de Arton, p. 290.</em></p>` } }
  };
}

/** Somatório de modificadores de atributo. */
export function addAttrs(...parts) {
  const out = {};
  for (const p of parts) for (const [k, v] of Object.entries(p ?? {})) out[k] = (out[k] ?? 0) + (Number(v) || 0);
  return out;
}
