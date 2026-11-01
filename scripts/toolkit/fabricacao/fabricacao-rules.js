/**
 * Fabricação (parte a): comidas, preparados alquímicos, catalisadores e venenos. Funções puras.
 *
 * Ofício, Fabricar (JdA, perícias; texto do diário "Perícias" do sistema 1.5.015):
 * - matéria-prima custa um terço do preço do item;
 * - consumíveis levam um dia de trabalho; dá para fazer duas unidades no mesmo tempo com −5 no teste (pagando as duas);
 * - CD 15 para itens simples (preparados, catalisadores...) e 20 para complexos (venenos...);
 * - sem os instrumentos do Ofício, −5 no teste.
 * Ofício (alquimista) fabrica alquímicos; Ofício (cozinheiro) fabrica alimentação.
 * Alguns itens mudam a regra no próprio texto ("A CD para fabricar ... aumenta em +5", "Ofício (cozinheiro) com CD 20",
 * "pode usar Sobrevivência no lugar de Ofício (cozinheiro)"): isso é lido da descrição.
 */
import { toTC } from '../core/wallet.js';

export const CRAFT_SKILLS = Object.freeze({
  cozi: Object.freeze({ key: 'cozi', label: 'Ofício (cozinheiro)', short: 'cozinheiro' }),
  alqu: Object.freeze({ key: 'alqu', label: 'Ofício (alquimista)', short: 'alquimista' })
});

export const KINDS = Object.freeze({
  prato: Object.freeze({ id: 'prato', label: 'Comida', plural: 'Comidas', skill: 'cozi', dc: 15, icon: 'fa-utensils' }),
  preparado: Object.freeze({ id: 'preparado', label: 'Preparado alquímico', plural: 'Preparados', skill: 'alqu', dc: 15, icon: 'fa-flask' }),
  catalisador: Object.freeze({ id: 'catalisador', label: 'Catalisador', plural: 'Catalisadores', skill: 'alqu', dc: 15, icon: 'fa-gem' }),
  veneno: Object.freeze({ id: 'veneno', label: 'Veneno', plural: 'Venenos', skill: 'alqu', dc: 20, icon: 'fa-skull-crossbones' })
});

/** Tipos de consumível do sistema que entram na Fabricação. */
export const RECIPE_TYPES = Object.freeze(['food', 'alchemy']);

export const TWO_UNITS_PENALTY = -5;
export const NO_TOOLS_PENALTY = -5;
export const CRAFT_TIME = '1 dia';

const ACCENT = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };
const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', ordm: 'º', ordf: 'ª', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
/** Os textos dos compêndios vêm com entidades HTML (&oacute;, &atilde;...): decodifica sem depender do navegador. */
export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z])(acute|grave|circ|tilde|uml|cedil);/g, (_, l, a) => `${l}${ACCENT[a]}`.normalize('NFC'))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

/** Texto corrido da descrição: sem tags, sem entidades e sem os links @UUID[...] (que trazem "magias" no caminho). */
const plain = html => decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
  .replace(/@UUID\[[^\]]*\](\{([^}]*)\})?/g, (_, __, label) => label ?? '')
  .replace(/\s+/g, ' ').trim();

/** Veneno: o texto diz o tipo ("Tipo: Contato.", "Inalação, vítima..."), com maiúscula. */
export const isPoisonText = text => /(?:^|[\s.:;])(Ingest[ãa]o|Contato|Inala[çc][ãa]o)\s*[.,:]/.test(plain(text));

/** Catalisador: usado junto de magias (dano, CD ou custo de magias). */
export const isCatalystText = text => /\b(magias?|catalisador(?:es)?)\b/i.test(plain(text));

/**
 * Receita a partir de um item do compêndio ({ name, type, system: { tipo, preco, description: { value } } } ou índice).
 * Devolve null se não for comida nem alquímico.
 */
export function classifyRecipe(entry) {
  const s = entry?.system ?? {};
  if (entry?.type && entry.type !== 'consumivel') return null;
  if (!RECIPE_TYPES.includes(s.tipo)) return null;
  const text = plain(s.description?.value ?? '');
  const kind = s.tipo === 'food' ? KINDS.prato : isPoisonText(text) ? KINDS.veneno : isCatalystText(text) ? KINDS.catalisador : KINDS.preparado;
  let dc = kind.dc;
  const notes = [];
  // "preparar este cozido é um teste estendido de Ofício (cozinheiro) com CD 20, que requer 3 sucessos antes de 3 falhas"
  const fixed = text.match(/of[íi]cio\s*\((?:cozinheiro|alquimista)\)\s*com\s*CD\s*(\d+)/i);
  if (fixed) dc = Number(fixed[1]);
  if (/teste\s+estendido/i.test(text)) notes.push('Teste estendido: veja a descrição.');
  // "A CD para fabricar e para resistir a este veneno aumenta em +5."
  const up = text.match(/CD\s+para\s+fabricar[^.]*?aumenta\s+em\s*\+\s*(\d+)/i);
  if (up) { dc += Number(up[1]); notes.push(`CD para fabricar +${up[1]} (texto do item).`); }
  const substitutes = [];
  if (/sobreviv[êe]ncia/i.test(text) && /(fabricad|fabricar|no lugar de of[íi]cio)/i.test(text)) substitutes.push('sobr');
  const price = Number(s.preco);
  return {
    kind: kind.id, kindLabel: kind.label, skill: kind.skill, dc, notes, substitutes,
    price: Number.isFinite(price) ? price : 0,
    priced: Number.isFinite(price) && price > 0
  };
}

/** Matéria-prima em TC: um terço do preço (T$) de cada unidade. `half` = Catalisador Instável. */
export function materialCost(price, { units = 1, half = false } = {}) {
  const tc = toTC(((Number(price) || 0) * Math.max(1, units)) / 3);
  return half ? Math.ceil(tc / 2) : tc;
}

/**
 * CD e modificadores do teste de fabricação.
 * @param {{dc:number}} recipe
 * @param {{units?:number, tools?:boolean}} o
 * @returns {{ dc:number, mods: Array<{label:string, value:number}> }}
 */
export function craftCheck(recipe, { units = 1, tools = true } = {}) {
  const mods = [];
  if (units > 1) mods.push({ label: 'Duas unidades', value: TWO_UNITS_PENALTY });
  if (!tools) mods.push({ label: 'Sem instrumentos de ofício', value: NO_TOOLS_PENALTY });
  return { dc: recipe.dc, mods };
}

/**
 * Catalizador Instável (Inventor, JdA p. 69): ação completa e 3 PM, metade do custo, sem teste;
 * o item só dura até o fim da cena. Vale para preparados alquímicos (e poções, que ficam para a parte b).
 */
export const UNSTABLE = Object.freeze({ pm: 3, kinds: Object.freeze(['preparado']) });
export const canUnstable = recipe => UNSTABLE.kinds.includes(recipe?.kind);

/* ---------- comidas ---------- */

/**
 * Benefício de uma comida lido do texto. Só os efeitos numéricos viram automação;
 * o resto ("uma vez até o fim do dia...") fica como lembrete do dia.
 * `mestreCuca`: +1 em todo bônus numérico da comida (Mestre Cuca, JdA p. 69).
 */
export function foodBenefit(html, { mestreCuca = false } = {}) {
  const text = plain(html);
  const out = { testDie: null, tempPV: 0, tempPM: 0, restPV: 0, restPM: 0, reminder: false };
  const die = text.match(/\+\s?(\d+d\d+)\s+(?:num|em\s+um)\s+(?:único\s+)?teste/i);
  if (die) out.testDie = die[1];
  const pv = text.match(/\+\s?(\d+)\s+(?:PV|pontos\s+de\s+vida)\s+tempor[áa]rios/i);
  if (pv) out.tempPV = Number(pv[1]);
  const pm = text.match(/\+\s?(\d+)\s+(?:PM|pontos\s+de\s+mana)\s+tempor[áa]rios/i);
  if (pm) out.tempPM = Number(pm[1]);
  const rest = text.match(/recupera[çc][ãa]o\s+de\s+(pontos\s+de\s+vida|pontos\s+de\s+mana|PV\s+e\s+PM|PV|PM)[^.]*?\+\s?(\d+)\s+por\s+n[íi]vel/i);
  if (rest) {
    const what = rest[1].toLowerCase();
    const v = Number(rest[2]);
    if (/vida|pv/.test(what)) out.restPV = v;
    if (/mana|pm/.test(what)) out.restPM = v;
  }
  out.reminder = /(voc[êe]\s+(?:recebe|pode|fica|aumenta)|fornece|fim\s+do\s+dia|nesse\s+dia|neste\s+dia|uma\s+vez|ao\s+consumir|ao\s+ingerir|cena\s+de\s+a[çc][ãa]o|quando\s+(?:recebe|fizer|faz|realizar))/i.test(text);
  if (mestreCuca) {
    if (out.testDie) out.testDie = `${out.testDie}+1`;
    for (const k of ['tempPV', 'tempPM', 'restPV', 'restPM']) if (out[k]) out[k] += 1;
  }
  return out;
}

/** A comida tem algum benefício (é um "prato especial")? Ração, refeição e bebida comuns não têm. */
export const isSpecialFood = b => !!(b && (b.testDie || b.tempPV || b.tempPM || b.restPV || b.restPM || b.reminder));

/** Linhas curtas do benefício, para cartões e para a janela. */
export function benefitLines(b) {
  const out = [];
  if (!b) return out;
  if (b.testDie) out.push(`+${b.testDie} em um teste à sua escolha hoje`);
  if (b.tempPV) out.push(`+${b.tempPV} PV temporários`);
  if (b.tempPM) out.push(`+${b.tempPM} PM temporários`);
  if (b.restPV) out.push(`+${b.restPV} PV por nível na próxima noite de sono`);
  if (b.restPM) out.push(`+${b.restPM} PM por nível na próxima noite de sono`);
  if (!out.length && b.reminder) out.push('Efeito descrito no texto, até o fim do dia');
  return out;
}

export const DAY_SECONDS = 86400;
export const FOOD_FLAG = 'food';

/**
 * Efeitos ativos da refeição do dia (dados para createEmbeddedDocuments('ActiveEffect')).
 * - um efeito "do dia", que guarda o benefício (o descanso lê `restPV`/`restPM` dele);
 * - se houver dado de bônus, um efeito opcional "no uso" para testes, que aparece desmarcado na janela de rolagem do sistema.
 */
export function foodEffects({ name, img = '', description = '', benefit, worldTime = 0, origin = null, moduleId = 't20-toolkit' }) {
  const until = worldTime + DAY_SECONDS;
  const duration = { seconds: DAY_SECONDS, startTime: worldTime };
  const flag = extra => ({ [moduleId]: { [FOOD_FLAG]: { name, until, ...extra } } });
  const lines = benefitLines(benefit);
  const out = [{
    name: `Refeição do dia: ${name}`, img: img || 'icons/consumables/food/bowl-stew-brown.webp', origin, disabled: false, transfer: false,
    duration, changes: [], description: `${lines.length ? `<p><b>${lines.join('; ')}.</b></p>` : ''}${description}`,
    flags: flag({ day: true, restPV: benefit?.restPV || 0, restPM: benefit?.restPM || 0, tempPV: benefit?.tempPV || 0, tempPM: benefit?.tempPM || 0 })
  }];
  if (benefit?.testDie) {
    out.push({
      name: `${name}: +${benefit.testDie} em um teste (hoje)`, img: img || 'icons/svg/upgrade.svg', origin, disabled: true, transfer: false,
      duration, changes: [{ key: 'roll', mode: 2, value: benefit.testDie, priority: 0 }],
      description: '<p>Marque na janela da rolagem quando quiser usar. Vale um teste: depois de usar, apague este efeito.</p>',
      flags: { ...flag({ option: true }), tormenta20: { onuse: true, skill: true, attack: true, ability: true, durationScene: false } }
    });
  }
  return out;
}

/** Valor da flag de comida de um efeito (ou null). */
export const foodFlag = (effect, moduleId = 't20-toolkit') => effect?.flags?.[moduleId]?.[FOOD_FLAG] ?? null;

/** Efeitos de comida vencidos em `worldTime`. */
export const expiredFood = (effects, worldTime, moduleId = 't20-toolkit') =>
  [...(effects ?? [])].filter(e => { const f = foodFlag(e, moduleId); return f && Number(f.until) <= worldTime; });

/** Bônus de descanso das comidas do dia: { pv, pm, ids } (ids = efeitos que já deram o bônus e saem depois do descanso). */
export function restBonus(effects, moduleId = 't20-toolkit') {
  let pv = 0, pm = 0;
  const ids = [];
  for (const e of effects ?? []) {
    const f = foodFlag(e, moduleId);
    if (!f?.day || f.restUsed || (!f.restPV && !f.restPM)) continue;
    pv += Number(f.restPV) || 0;
    pm += Number(f.restPM) || 0;
    ids.push(e.id);
  }
  return { pv, pm, ids };
}

/** Pontos temporários depois de comer: não somam com os que já tem, fica o maior. */
export const tempAfter = (current, gain) => Math.max(Number(current) || 0, Number(gain) || 0);

/** Item crafted: nome final e flags. `unstable` = Catalizador Instável (só até o fim da cena). */
export function craftedName(name, { unstable = false } = {}) {
  return unstable ? `${name} (instável)` : name;
}
