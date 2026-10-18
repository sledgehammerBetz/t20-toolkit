/**
 * Engenhocas — regras puras (Tormenta20 JdA, poder Engenhoqueiro, p. 70; Heróis de Arton, aparatos p. 235).
 *
 * Fabricação: magia arcana ou divina; 1º círculo, 2º a partir do 6º nível de inventor e +1 círculo a cada 4 níveis.
 *   Preço T$ 100 × PM da magia. Teste de Ofício (engenhoqueiro) CD 20 + PM.
 * Limite: Inteligência (+3 com Manutenção Eficiente, que também reduz o espaço para 0,5).
 * Item: Minúsculo, 1 espaço, Defesa 15, PV = metade dos PV do fabricante, RD 5; empunhada ou vestida.
 * Ativação: ação padrão (ou a execução da magia), Ofício (engenhoqueiro) CD 15 + PM, +5 por ativação no mesmo dia,
 *   +1 por PM de aprimoramento (limite de aprimoramentos = Int). Falha: enguiça (1 hora para consertar).
 * Aparatos: até 2 por engenhoca; 1 aparato +2 na CD, 2 aparatos +5 (Aparato Personalizado ignora o primeiro).
 * O teste de ativação sofre penalidade de armadura (já está no Ofício (engenhoqueiro) da ficha; o Giroscópio tira).
 * Armadura Mecanizada (HdA): T$ 100 e 1 dia para acoplar na armadura (leve 1, pesada 3); não conta como vestida.
 *   Armadura Avançada: + nº de melhorias da armadura no teste de ativação de engenhoca acoplada.
 * Autômato Engenhocado (HdA): T$ 100 e 1 dia para acoplar no autômato uma engenhoca de 1º círculo.
 * Os custos de poderes que aparecem na janela de aprimoramentos do sistema (Invenção Potente, Ativação Rápida,
 *   Armadura Avançada, Autômato Engenhocado…) são pagos, mas não somam na CD: só os aprimoramentos da magia somam.
 *
 * O item é um equipamento do tipo acessório: vestida usa um espaço de item vestido, sem ocupar o lugar da armadura.
 *
 * As engenhocas são itens `equipamento` com flags.tormenta20.engenhoca (formato v2 das versões anteriores),
 * para que as engenhocas já fabricadas continuem funcionando.
 */
import { fold } from '../core/t20.js';

export const FLAG_SCOPE = 'tormenta20';
export const FLAG_KEY = 'engenhoca';
export const SKILL_KEY = 'enge';
/** Tipo do equipamento: acessório (não é armadura, então várias engenhocas vestidas cabem juntas). */
export const ENGENHOCA_ITEM_TYPE = 'acessorio';
export const PM_BY_CIRCLE = Object.freeze({ 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 });

/* ---------- aparatos (Heróis de Arton, p. 235) ---------- */

export const APARATOS = Object.freeze([
  { id: 'captador-luz', label: 'Captador de Luz', price: 450, text: '+1 por dado na cura de luz da engenhoca. Só em engenhocas que curam com luz.' },
  { id: 'comutador', label: 'Comutador', price: 300, text: 'Os aprimoramentos da engenhoca custam 1 PM a menos (no total).', auto: true },
  { id: 'conversor-alimentador', label: 'Conversor-Alimentador', price: 300, text: 'Comporta três doses de essência de mana ou outros preparados que fornecem PM.' },
  { id: 'engenho-automacao', label: 'Engenho de Automação', price: 600, text: 'Um efeito sustentado da engenhoca pode não contar no limite normal. Requer Conversor-Alimentador.', requires: 'conversor-alimentador' },
  { id: 'espera-melhorias', label: 'Espera para Melhorias', price: 150, text: 'Permite instalar uma melhoria apropriada de outro tipo de item.', duplicate: true },
  { id: 'estabilizador', label: 'Estabilizador', price: 900, text: '+2 na CD para resistir ao efeito da engenhoca.', auto: true },
  { id: 'estimulador-sobrecarga', label: 'Estimulador de Sobrecarga', price: 750, text: '+1 dado no dano da engenhoca.' },
  { id: 'gatilho-corda', label: 'Gatilho de Corda', price: 1500, text: 'Engenhocas de ação padrão: ativa com ação de movimento; depois, ação completa para dar corda.' },
  { id: 'giroscopio', label: 'Giroscópio', price: 450, text: 'Ignora a penalidade de armadura nos testes de ativação.', auto: true },
  { id: 'ligacao-convergencia', label: 'Ligação de Convergência', price: 300, text: 'Acoplado a exatamente duas engenhocas.', targets: 2 },
  { id: 'remontagem-portabilidade', label: 'Remontagem de Portabilidade', price: 300, text: 'A engenhoca não ocupa espaço e conta como vestida. Só uma por vez.' },
  { id: 'sequenciador-ativacao', label: 'Sequenciador de Ativação', price: 600, text: 'Acoplado a exatamente três engenhocas, numa ordem definida.', targets: 3 },
  { id: 'sistema-refrigeracao', label: 'Sistema de Refrigeração', price: 900, text: 'Uma vez por dia: ação completa e 1 PM para reduzir em 5 a CD de ativação.', auto: true },
  { id: 'supressor-seguranca', label: 'Supressor de Segurança', price: 300, text: 'Uma vez por cena, uma falha não enguiça a engenhoca nem aumenta a próxima CD.', auto: true },
  { id: 'transformador-mistico', label: 'Transformador Místico', price: 600, text: 'Permite acoplar um item esotérico e aplicar seus benefícios à magia simulada.' }
].map(a => Object.freeze({ targets: 1, duplicate: false, auto: false, requires: null, ...a })));

export const APARATO_BY_ID = new Map(APARATOS.map(a => [a.id, a]));

/** CD extra pelos aparatos: 1 → +2, 2 → +5 (Aparato Personalizado ignora o primeiro). */
export function aparatoDC(count, personalizado = false) {
  const n = Math.max(0, Math.trunc(Number(count) || 0) - (personalizado ? 1 : 0));
  return n <= 0 ? 0 : n === 1 ? 2 : 5;
}

/** Pode instalar o aparato `type` nesta engenhoca? Devolve o motivo do bloqueio ou ''. */
export function aparatoBlocker(state, type) {
  const def = APARATO_BY_ID.get(type);
  if (!def) return 'Aparato desconhecido.';
  if (state.aparatos.length >= 2) return 'Já tem dois aparatos.';
  if (!def.duplicate && state.aparatos.includes(type)) return `Já tem ${def.label}.`;
  if (def.requires && !state.aparatos.includes(def.requires)) return `Requer ${APARATO_BY_ID.get(def.requires).label}.`;
  return '';
}

/* ---------- fabricação ---------- */

/** Círculo máximo de engenhoca pelo nível de inventor. */
export function maxCircle(inventorLevel) {
  const lvl = Math.trunc(Number(inventorLevel) || 0);
  if (lvl < 1) return 0;
  if (lvl < 6) return 1;
  return Math.min(5, 2 + Math.floor((lvl - 6) / 4));
}

export const pmOf = circle => PM_BY_CIRCLE[Number(circle)] ?? 0;
export const craftDC = pm => 20 + pm;

/** Preço em T$. Engenhocaria Goblinoide: metade. */
export const craftPrice = (pm, { goblinoide = false } = {}) => Math.floor(100 * pm / (goblinoide ? 2 : 1));

/** Limite de engenhocas: Inteligência (+3 com Manutenção Eficiente). Mínimo 0. */
export const engenhocaLimit = (int, { manutencao = false } = {}) => Math.max(0, (Number(int) || 0) + (manutencao ? 3 : 0));

/** Tipos de magia que viram engenhoca. */
export const CRAFTABLE_TYPES = Object.freeze(['arc', 'div', 'uni']);

/**
 * Avalia uma magia para fabricação.
 * @returns {{ok:boolean, pm:number, dc:number, price:number, reason:string}}
 */
export function craftCheck(spell, { inventorLevel = 0, goblinoide = false, owned = 0, limit = 0 } = {}) {
  const circle = Number(spell?.circle ?? spell?.circulo) || 0;
  const pm = pmOf(circle);
  const out = { ok: true, pm, dc: craftDC(pm), price: craftPrice(pm, { goblinoide }), reason: '' };
  const max = maxCircle(inventorLevel);
  if (!CRAFTABLE_TYPES.includes(spell?.type ?? spell?.tipo)) return { ...out, ok: false, reason: 'Só magias arcanas ou divinas.' };
  if (!max) return { ...out, ok: false, reason: 'Precisa de nível de inventor.' };
  if (circle > max) return { ...out, ok: false, reason: `Seu limite é ${max}º círculo (nível ${inventorLevel} de inventor).` };
  if (owned >= limit) return { ...out, ok: false, reason: `Limite de engenhocas atingido (${owned}/${limit}).` };
  return out;
}

/** Dados do item `equipamento` da engenhoca (formato v2, compatível com as engenhocas antigas). */
export function buildEngenhocaItem({ spell, name, mode = 'hand', makerMaxPV = 0, manutencao = false, inventorLevel = 0, price = 0, userId = '', now = Date.now() }) {
  const s = spell.system ?? {};
  const circle = Number(s.circulo) || 1;
  const pm = pmOf(circle);
  const pv = Math.floor((Number(makerMaxPV) || 0) / 2);
  const spaces = manutencao ? 0.5 : 1;
  const snapshot = { schemaVersion: 1, capturedAt: now, name: spell.name, type: 'magia', img: spell.img, system: structuredClone(s), effects: structuredClone(spell.effects ?? []), flags: structuredClone(spell.flags ?? {}) };
  const modeLabel = mode === 'body' ? 'vestida' : 'empunhada';
  const description = `<p><b>Engenhoca</b> (${modeLabel}) que simula <b>${spell.name}</b> (${circle}º círculo).</p>
<p>Minúscula · ${String(spaces).replace('.', ',')} espaço · Defesa 15 · PV ${pv} · RD 5.</p>
<p>Ativação: Ofício (engenhoqueiro) CD ${15 + pm}, +5 por ativação no mesmo dia. Falha: enguiça (1 hora para consertar).</p>
<hr><h3>Efeito simulado</h3>${s.description?.value ?? ''}`;
  return {
    name: name || spell.name,
    type: 'equipamento',
    img: spell.img || 'icons/svg/cog.svg',
    system: {
      description: { value: description, unidentified: '' },
      source: s.source ?? '',
      tags: ['engenhoca'],
      espacos: spaces, peso: 0, qtd: 1, preco: 0,
      pv: { value: pv, max: pv }, rd: 5,
      ativacao: { custo: 0 },
      equipado: false,
      equipado2: { slot: 0, type: mode === 'body' ? 'body' : 'hand' },
      armadura: { maxAtr: 0, penalidade: 0, value: 0 },
      tipo: ENGENHOCA_ITEM_TYPE
    },
    flags: {
      [FLAG_SCOPE]: {
        [FLAG_KEY]: {
          version: 'toolkit-0.6', representation: 'equipment', schemaVersion: 2, isEngenhoca: true,
          sourceUuid: spell.uuid ?? '', sourceName: spell.name, spellSnapshot: snapshot,
          baseCost: pm, circle, spellType: s.tipo ?? '', school: s.escola ?? '', execution: s.ativacao?.execucao ?? '',
          range: s.alcance ?? '', resistance: s.resistencia?.txt ?? '', mode,
          craftDC: craftDC(pm), activationBaseDC: 15 + pm, craftPrice: price, craftTime: '1 semana',
          physical: { size: 'Minúsculo', baseSpaces: 1, effectiveSpaces: spaces, defense: 15, pv, rd: 5, manufacturerMaxPVAtCreation: makerMaxPV },
          inventorLevelAtCreation: inventorLevel, circleLimitAtCreation: maxCircle(inventorLevel),
          jammed: false, usesToday: 0, dayKey: null, aparatos: [],
          createdBy: userId, createdAt: now
        }
      }
    }
  };
}

/* ---------- estado e ativação ---------- */

export function engenhocaFlags(item) {
  return item?.flags?.[FLAG_SCOPE]?.[FLAG_KEY] ?? item?.getFlag?.(FLAG_SCOPE, FLAG_KEY) ?? null;
}

export function isEngenhoca(item) {
  const f = engenhocaFlags(item);
  return !!(f && (f.isEngenhoca || f.sourceUuid || f.spellSnapshot || f.baseCost !== undefined));
}

/** Estado normalizado de uma engenhoca (aceita os campos das versões antigas). */
export function engenhocaState(item) {
  const f = engenhocaFlags(item) ?? {};
  const snap = f.spellSnapshot ?? {};
  const circle = Number(f.circle ?? snap.system?.circulo ?? item?.system?.circulo) || 1;
  return {
    pm: Number(f.baseCost) || pmOf(circle),
    circle,
    usesToday: Math.max(0, Math.trunc(Number(f.usesToday) || 0)),
    jammed: !!f.jammed,
    aparatos: Array.isArray(f.aparatos) ? f.aparatos.filter(a => APARATO_BY_ID.has(a)) : [],
    groups: f.aparatoGroups ?? {},
    refrigerationUsedToday: !!f.refrigerationUsedToday,
    supressorScene: f.supressorScene ?? null,
    mode: f.mode ?? (item?.system?.equipado2?.type === 'body' ? 'body' : 'hand'),
    coupled: f.coupled?.kind ? { kind: f.coupled.kind, id: f.coupled.id ?? null } : null,
    spellName: f.sourceName ?? snap.name ?? item?.name ?? '',
    snapshot: snap.system ? snap : null,
    sourceUuid: f.sourceUuid ?? ''
  };
}

/**
 * CD da ativação, com a conta aberta.
 * @param {object} st  engenhocaState
 * @param {object} o   { upgradePM, personalizado, refrigeration }
 */
export function activationDC(st, { upgradePM = 0, personalizado = false, refrigeration = false } = {}) {
  const parts = [['Base', 15], ['Magia', st.pm]];
  if (st.usesToday) parts.push([`${st.usesToday} ativação(ões) hoje`, 5 * st.usesToday]);
  const ap = aparatoDC(st.aparatos.length, personalizado);
  if (ap) parts.push(['Aparatos', ap]);
  if (upgradePM) parts.push(['Aprimoramentos', upgradePM]);
  if (refrigeration) parts.push(['Refrigeração', -5]);
  return { dc: Math.max(0, parts.reduce((a, [, v]) => a + v, 0)), parts };
}

/**
 * Bônus próprios das engenhocas no teste de ativação, como partes [{ label, value }].
 * `pda` é a penalidade de armadura (número ≤ 0) e `pdaInSkill` diz se a perícia da ficha já a inclui:
 * o Giroscópio só devolve o que foi descontado. `armorUpgrades`: melhorias da armadura (Armadura Avançada).
 */
export function activationExtras({ pda = 0, pdaInSkill = true, giroscopio = false, calibrar = false, armorUpgrades = 0 } = {}) {
  const parts = [];
  const p = Math.min(0, Number(pda) || 0);
  if (p && !pdaInSkill && !giroscopio) parts.push({ label: 'Penalidade de armadura', value: p });
  if (p && pdaInSkill && giroscopio) parts.push({ label: 'Giroscópio', value: -p });
  if (calibrar) parts.push({ label: 'Forçar a Calibragem', value: -5 });
  if (armorUpgrades > 0) parts.push({ label: 'Armadura Avançada', value: armorUpgrades });
  return parts;
}

/**
 * PM pagos na ativação: aprimoramentos da magia (−1 com Comutador) + custos de poderes da janela do sistema
 * (`powerPM`) + opções do Toolkit (Refrigeração, Maestria em Perícia e os poderes sem efeito na ficha).
 */
export function activationCost({ upgradePM = 0, powerPM = 0, comutador = false, refrigeration = false, rapida = false, potente = false, maestria = false } = {}) {
  const up = Math.max(0, upgradePM - (comutador && upgradePM > 0 ? 1 : 0));
  return { upgrades: up, powers: Math.max(0, powerPM), total: up + Math.max(0, powerPM) + (refrigeration ? 1 : 0) + (rapida ? 2 : 0) + (potente ? 1 : 0) + (maestria ? 1 : 0) };
}

/* ---------- poderes que aparecem na janela de aprimoramentos do sistema ---------- */

/** Efeitos "no uso" de poderes de inventor, pelo começo do nome (sem acento). */
export const POWER_EFFECTS = Object.freeze([
  ['calibrar', 'forcar a calibragem'],
  ['potente', 'invencao potente'],
  ['rapida', 'ativacao rapida'],
  ['avancada', 'armadura avancada'],
  ['automato', 'automato engenhocado']
]);

export const powerEffectKey = name => POWER_EFFECTS.find(([, prefix]) => fold(name).startsWith(prefix))?.[0] ?? null;

/** Custo de um efeito marcado no diálogo do sistema (`aprs.<id>` = { aplica, custo }). */
export function appliedCost(apr) {
  if (!apr) return 0;
  const qty = apr.aplica === true ? 1 : Number(apr.aplica) || 0;
  const c = Number(apr.custo);
  return qty && Number.isFinite(c) ? c * qty : 0;
}

/**
 * Separa o que foi marcado na janela do sistema: PM dos aprimoramentos da magia (somam na CD e têm o limite de Int)
 * e PM de efeitos do personagem (poderes: só são pagos). `spellIds`: ids dos efeitos da própria magia.
 * `actorEffects`: [{ id, name }]. Devolve { spellPM, powerPM, powers: Set de chaves de POWER_EFFECTS }.
 */
export function splitApplied(aprs = {}, spellIds = [], actorEffects = []) {
  const spell = new Set(spellIds);
  const byId = new Map(actorEffects.map(e => [e.id, e]));
  let spellPM = 0, powerPM = 0;
  const powers = new Set();
  for (const [id, apr] of Object.entries(aprs ?? {})) {
    const qty = apr?.aplica === true ? 1 : Number(apr?.aplica) || 0;
    if (!qty) continue;
    if (spell.has(id)) { spellPM += appliedCost(apr); continue; }
    powerPM += appliedCost(apr);
    const key = byId.has(id) ? powerEffectKey(byId.get(id).name) : null;
    if (key) powers.add(key);
  }
  return { spellPM: Math.max(0, spellPM), powerPM: Math.max(0, powerPM), powers };
}

/* ---------- acoplar (Armadura Mecanizada, Autômato Engenhocado) ---------- */

export const COUPLE_PRICE = 100;

/** Quantas engenhocas cabem na armadura: leve 1, pesada 3. */
export const armorCapacity = tipo => (tipo === 'pesada' ? 3 : tipo === 'leve' ? 1 : 0);

/** Melhorias da armadura (campos system.upgrades.melhoria1…4 preenchidos). */
export const armorUpgradeCount = upgrades => Object.entries(upgrades ?? {}).filter(([k, v]) => /^melhoria\d+$/.test(k) && String(v ?? '').trim()).length;

/**
 * Pode acoplar? Devolve o motivo do bloqueio ou ''.
 * `target`: { kind: 'armor', tipo, used } | { kind: 'automato', used }; `st`: engenhocaState.
 */
export function coupleBlocker(st, target, inv) {
  if (st.coupled) return 'Já está acoplada.';
  if (target.kind === 'armor') {
    if (!inv.mecanizada) return 'Precisa do poder Armadura Mecanizada.';
    const cap = armorCapacity(target.tipo);
    if (!cap) return 'Só em armadura leve ou pesada.';
    if (target.used >= cap) return `A armadura já tem ${target.used} de ${cap} engenhoca(s).`;
    return '';
  }
  if (target.kind === 'automato') {
    if (!inv.automatoEng) return 'Precisa do poder Autômato Engenhocado.';
    if (st.circle !== 1) return 'Só engenhocas de 1º círculo (alvo 1 criatura ou objeto, ou área).';
    if (target.used >= 1) return 'O autômato já tem uma engenhoca.';
    return '';
  }
  return 'Destino desconhecido.';
}

/** Resistência extra contra o efeito (texto para o chat). */
export function resistanceBonus({ estabilizador = false, calibrar = false, potente = false } = {}) {
  return (estabilizador ? 2 : 0) + (calibrar ? 2 : 0) + (potente ? 2 : 0);
}

/** Mudanças nas flags depois de um teste. */
export function outcomePatch(st, { success, supressor = false, sceneId = null, refrigeration = false }) {
  if (!success && supressor) return { supressorScene: sceneId, ...(refrigeration ? { refrigerationUsedToday: true } : {}) };
  return { usesToday: st.usesToday + 1, jammed: !success, lastResult: success ? 'success' : 'fail', ...(refrigeration ? { refrigerationUsedToday: true } : {}) };
}

/** Novo dia: zera usos e a refrigeração (não conserta engenhocas enguiçadas). */
export const NEW_DAY_PATCH = Object.freeze({ usesToday: 0, refrigerationUsedToday: false, dayKey: null });

/* ---------- personagem ---------- */

const has = (names, wanted) => names.has(fold(wanted));

/** Contexto do inventor a partir da ficha (nomes de poderes e classes). */
export function inventorContext({ classes = [], powerNames = [], int = 0, maxPV = 0, pda = 0, skillTrained = false }) {
  const names = new Set(powerNames.map(fold));
  const inv = classes.find(c => fold(c.name) === 'inventor');
  const level = inv?.level ?? 0;
  const manutencao = has(names, 'Manutenção Eficiente');
  return {
    level,
    maxCircle: maxCircle(level),
    engenhoqueiro: has(names, 'Engenhoqueiro'),
    skillTrained,
    int, maxPV, pda,
    limit: engenhocaLimit(int, { manutencao }),
    manutencao,
    personalizado: has(names, 'Aparato Personalizado'),
    maestria: [...names].some(n => n.startsWith(fold('Maestria em Per'))),
    mecanizada: has(names, 'Armadura Mecanizada'),
    avancada: has(names, 'Armadura Avançada'),
    automatoEng: has(names, 'Autômato Engenhocado'),
    rapida: has(names, 'Ativação Rápida'),
    chutes: has(names, 'Chutes e Palavrões'),
    potente: has(names, 'Invenção Potente'),
    calibrar: has(names, 'Forçar a Calibragem'),
    goblinoide: [...names].some(n => n.startsWith(fold('Engenhocaria Goblinoide')))
  };
}

/** Engenhocas da ficha, em ordem alfabética. */
export const actorEngenhocas = actor => [...(actor?.items ?? [])].filter(isEngenhoca).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
