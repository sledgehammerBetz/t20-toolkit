/**
 * Engenhocas — ações no Foundry: fabricar, ativar, consertar, novo dia, aparatos.
 * Ativação: monta uma magia temporária a partir do retrato salvo na engenhoca, abre o diálogo
 * de aprimoramentos do sistema (AbilityUseDialog), rola Ofício (engenhoqueiro) contra a CD e,
 * se passar, executa o efeito como o item.roll() do sistema faz (ataque, fórmula, dano, área, cartão).
 * O teste usa as mesmas peças do Usurpador (core/skill-test.js): perícia substituta lida dos poderes,
 * efeitos "no uso" da perícia, bônus escritos em poderes, escolher 10 (Maestria em Perícia) e escolher 0.
 * Preferências do teste em flags['t20-toolkit'].engenhocasTeste = { skill, fx, text }.
 */
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, actorClasses, plainText, fold } from '../core/t20.js';
import { powerClassLevel } from '../core/class-levels.js';
import { chatCard, chatFlavor, postCard } from '../ui/chat.js';
import { skillSubstitutes, textBonuses, testParts, fixedBonus, allFixed, testFormula, chanceOf, canChooseZero } from '../core/skill-test.js';
import {
  FLAG_SCOPE, FLAG_KEY, SKILL_KEY, APARATO_BY_ID, ENGENHOCA_ITEM_TYPE, COUPLE_PRICE, isEngenhoca, engenhocaState, engenhocaFlags, inventorContext,
  activationDC, activationExtras, activationCost, resistanceBonus, outcomePatch, NEW_DAY_PATCH, aparatoBlocker, buildEngenhocaItem, craftCheck,
  splitApplied, powerEffectKey, armorUpgradeCount, armorCapacity, coupleBlocker, actorEngenhocas,
  engenhocaExecution, effectReminders, makerBlocker
} from './engenhocas-rules.js';

const DialogV2 = () => foundry.applications.api.DialogV2;
const TEST_FLAG = 'engenhocasTeste';

/* ---------- leitura da ficha ---------- */

export function actorInventor(actor) {
  const skill = actor?.system?.pericias?.[SKILL_KEY];
  const classes = actorClasses(actor);
  // Engenhoqueiro pego por poder de outra classe (Alma Livre, Diferentão...): nível efetivo da fonte.
  const eng = [...(actor?.items ?? [])].find(i => i.type === 'poder' && fold(i.name) === 'engenhoqueiro');
  const via = eng?.flags?.[MODULE_ID]?.via ?? null;
  return inventorContext({
    classes,
    viaLevel: via ? powerClassLevel({ classes, via, cls: 'inventor' }) : 0,
    powerNames: [...(actor?.items ?? [])].filter(i => i.type === 'poder').map(i => i.name),
    int: Number(actor?.system?.atributos?.int?.value) || 0,
    maxPV: Number(actor?.system?.attributes?.pv?.max) || 0,
    pda: Number(actor?.system?.attributes?.defesa?.pda) || 0,
    skillTrained: !!skill?.treinado
  });
}

export { actorEngenhocas };

const money = actor => Number(actor?.system?.dinheiro?.tp) || 0;
const pmNow = actor => (Number(actor?.system?.attributes?.pm?.value) || 0) + (Number(actor?.system?.attributes?.pm?.temp) || 0);

/** Atualiza campos da flag da engenhoca. `unset` remove chaves (ex.: 'aparatoGroups.comutador'). */
function flagsUpdate(patch, unset = []) {
  const base = `flags.${FLAG_SCOPE}.${FLAG_KEY}`;
  const upd = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${base}.${k}`, v]));
  for (const path of unset) upd[`${base}.${path.replace(/([^.]+)$/, '-=$1')}`] = null;
  return upd;
}
async function patchFlags(item, patch, unset = []) {
  return item.update(flagsUpdate(patch, unset));
}

/* ---------- fabricar ---------- */

/**
 * @param {Actor} actor
 * @param {object} o { uuid, name, mode: 'hand'|'body', roll: boolean, pay: boolean }
 */
export async function craftEngenhoca(actor, { uuid, name = '', mode = 'hand', roll = true, pay = true }) {
  if (!actor?.isOwner) return ui.notifications.warn('Você não pode alterar esta ficha.');
  const spell = await fromUuid(uuid);
  if (!spell) return ui.notifications.error('Magia não encontrada.');
  const inv = actorInventor(actor);
  const check = craftCheck({ circle: Number(spell.system?.circulo), type: spell.system?.tipo }, { inventorLevel: inv.level, goblinoide: inv.goblinoide, owned: actorEngenhocas(actor).length, limit: inv.limit });
  if (!check.ok && !game.user.isGM) return ui.notifications.warn(check.reason);
  if (pay && money(actor) < check.price) return ui.notifications.warn(`Faltam T$ ${check.price - money(actor)} para fabricar (custa T$ ${check.price}).`);
  const finalName = name.trim() || `${spell.name} (engenhoca)`;

  if (roll) {
    // Mesmo teste da ativação: perícia substituta (Artesão Criativo…), efeitos e bônus de poderes, escolher 10 / 0.
    const choice = await confirmActivation(actor, null, { aparatos: [], coupled: null, mode }, inv, { spellPM: 0, powerPM: 0, powers: new Set(), ownFx: new Set(), craft: { dc: check.dc, pm: check.pm, title: `Fabricar ${finalName}` } });
    if (!choice) return null;
    if (choice.cost.total > pmNow(actor)) return ui.notifications.warn(`PM insuficientes: o teste custa ${choice.cost.total} PM.`);
    const r = await rollActivation(actor, null, choice.test, check.dc, choice.take, `Fabricar ${finalName}`, ['sucesso', 'falha']);
    if (choice.cost.total) await actor.spendMana(choice.cost.total, 0, false);
    const ok = r.success;
    if (!ok) {
      await postCard(actor, { tool: 'engenhocas', tone: 'error', title: 'Fabricação falhou', subtitle: finalName, rows: [['Teste', `${r.total} contra CD ${check.dc}`]], note: 'Nada foi descontado. Confira com o mestre se houve perda de material.' });
      return null;
    }
  }

  const data = buildEngenhocaItem({ spell: { name: spell.name, img: spell.img, uuid: spell.uuid, system: spell.toObject().system, effects: spell.toObject().effects, flags: spell.toObject().flags }, name: finalName, mode, makerMaxPV: inv.maxPV, manutencao: inv.manutencao, inventorLevel: inv.level, price: check.price, userId: game.user.id, actorId: actor.id });
  const tp = money(actor) - check.price;
  const [[created]] = await Promise.all([actor.createEmbeddedDocuments('Item', [data]), pay && check.price ? actor.update({ 'system.dinheiro.tp': tp }) : null]);
  await postCard(actor, {
    tool: 'engenhocas', tone: 'success', title: 'Engenhoca fabricada', subtitle: `${actor.name} · ${spell.name}`,
    rows: [['Forma', mode === 'body' ? 'Vestida' : 'Empunhada'], ['Preço', pay ? `T$ ${check.price}` : 'não descontado'], ['CD de ativação', String(15 + check.pm)]],
    items: [{ name: created?.name ?? finalName, img: data.img, note: `${spell.system?.circulo}º círculo` }]
  });
  return created;
}

/* ---------- ativar ---------- */

function buildPreview(actor, item, st, resBonus) {
  const snap = st.snapshot;
  const data = foundry.utils.deepClone({ name: item.name, type: 'magia', img: item.img || snap.img, system: snap.system, effects: snap.effects ?? [], flags: snap.flags ?? {} });
  data.system.ativacao ??= {};
  data.system.ativacao.custo = 0;          // a engenhoca não paga o custo da magia, só os aprimoramentos
  data.system.ativacao.execucao = engenhocaExecution(data.system.ativacao.execucao); // padrão ou a da magia, o que for maior
  data.system.resistencia ??= {};
  if (data.system.resistencia.txt) {
    data.system.resistencia.atributo = 'int'; // atributo-chave Inteligência
    data.system.resistencia.bonus = (Number(data.system.resistencia.bonus) || 0) + resBonus;
  }
  for (const e of data.effects) e._id = foundry.utils.randomID(); // ids próprios: a janela do sistema marca os aprimoramentos por id
  return new CONFIG.Item.documentClass(data, { parent: actor });
}

async function snapshotFromSource(item, st) {
  if (st.snapshot) return st;
  const src = st.sourceUuid ? await fromUuid(st.sourceUuid) : null;
  if (!src) return null;
  const o = src.toObject();
  return { ...st, snapshot: { name: o.name, img: o.img, system: o.system, effects: o.effects, flags: o.flags } };
}

/* ---------- teste de ativação (perícia, poderes, escolher 10 / 0) ---------- */

const sign = n => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const showValue = v => (typeof v === 'number' ? sign(v) : String(v));
const localize = s => (typeof s === 'string' && globalThis.game?.i18n?.localize ? game.i18n.localize(s) : String(s ?? ''));
/** Efeito "no uso" vale para este item? (flag `items` do sistema: lista de nomes separada por ;) */
const forItem = (ef, name) => {
  const list = String(ef.flags?.tormenta20?.items ?? '').split(';').map(s => s.trim()).filter(Boolean);
  return !list.length || list.includes(name);
};

/** Perícias da ficha: [{ key, label, value, pda }]. */
function sheetSkills(actor) {
  return Object.entries(actor?.system?.pericias ?? {})
    .filter(([, p]) => p && typeof p === 'object')
    .map(([key, p]) => ({ key, label: localize(p.label) || key, value: Number(p.value) || 0, pda: p.pda !== false }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** Poderes da ficha com o texto e se algum efeito permanente deles já soma na perícia `skill`. */
function sheetPowers(actor, skill) {
  const touches = new RegExp(`pericias\\.(${skill}|\\*)\\.`);
  return [...(actor?.items ?? [])].filter(i => i.type === 'poder').map(i => ({
    uuid: i.id, name: i.name, description: plainText(i.system?.description?.value ?? ''),
    onSheet: [...(i.effects ?? [])].some(e => !e.flags?.tormenta20?.onuse && (e.changes ?? []).some(c => touches.test(c.key ?? '')))
  }));
}

/** Efeitos "no uso" da ficha para testes da perícia (os mesmos da janela do sistema), menos Forçar a Calibragem. */
function skillEffects(actor, label) {
  return [...(actor?.effects ?? [])].filter(e => {
    const f = e.flags?.tormenta20 ?? {};
    return f.onuse && (f.skill || f.pericia) && forItem(e, label) && powerEffectKey(e.name) !== 'calibrar';
  }).map(e => {
    const f = e.flags.tormenta20;
    const adds = (e.changes ?? []).filter(c => Number(c.mode) === 2 && ['roll', 'pericia', 'bonus'].includes(c.key)).map(c => c.value);
    return { id: e.id, name: e.name, cost: Number(f.custo) || 0, aumenta: !!f.aumenta, adds };
  });
}

/** Perícias que poderes deixam usar no lugar de Ofício (engenhoqueiro), como Artesão Criativo ("qualquer outro Ofício"). */
const ENGE_PATTERN = 'of[ií]cio\\s*[(:]?\\s*engenhoqueiro\\)?|(?:qualquer\\s+)?outro\\s+of[ií]cio';
export const activationSubstitutes = (actor, skills = sheetSkills(actor)) => skillSubstitutes(sheetPowers(actor, SKILL_KEY), skills, { key: SKILL_KEY, pattern: ENGE_PATTERN });

/** Armadura em que a engenhoca está acoplada (ou null). */
const coupledArmor = (actor, st) => (st.coupled?.kind === 'armor' ? actor.items.get(st.coupled.id) ?? null : null);

/**
 * Monta o teste com as escolhas `c` = { skill, fx, text, extra, calibrar }.
 * Devolve { skill, skills, substitutes, effects, texts, parts, bonus, fixed, formula, pmCost }.
 */
export function activationTest(actor, st, inv, c, { craft = false } = {}) {
  const skills = sheetSkills(actor);
  const enge = skills.find(s => s.key === SKILL_KEY) ?? { key: SKILL_KEY, label: 'Ofício (engenhoqueiro)', value: 0, pda: true };
  const substitutes = activationSubstitutes(actor, skills);
  const skill = skills.find(s => s.key === c.skill && (s.key === SKILL_KEY || substitutes.some(x => x.key === s.key))) ?? enge;
  const effects = skillEffects(actor, skill.label);
  const texts = textBonuses(sheetPowers(actor, skill.key), skill.key === SKILL_KEY ? 'engenhoqueiro' : skill.label);
  const extras = [];
  let pmCost = 0;
  for (const ef of effects) {
    const qty = Number(c.fx?.[ef.id]) || 0;
    if (!qty) continue;
    pmCost += ef.cost * qty;
    for (const v of ef.adds) extras.push({ label: ef.name, value: Number(v) ? Number(v) * qty : v });
  }
  for (const t of texts) if (c.text?.[t.id] && !t.onSheet) extras.push({ label: t.source, value: t.value });
  // Fabricar não sofre penalidade de armadura (só a ativação sofre): devolve o que a ficha descontou.
  const pda = Math.min(0, Number(inv.pda) || 0);
  if (craft && pda && skill.pda) extras.push({ label: 'Sem penalidade de armadura (fabricação)', value: -pda });
  const armor = !craft && inv.avancada ? coupledArmor(actor, st) : null;
  if (!craft) extras.push(...activationExtras({ pda: inv.pda, pdaInSkill: skill.pda, giroscopio: st.aparatos.includes('giroscopio'), calibrar: c.calibrar, armorUpgrades: armor ? armorUpgradeCount(armor.system?.upgrades) : 0 }));
  if (c.extra) extras.push({ label: 'Outros', value: Number(c.extra) || 0 });
  const parts = testParts({ skillLabel: skill.key === SKILL_KEY ? 'Ofício (engenhoqueiro)' : skill.label, skillValue: skill.value, extras });
  return { skill, skills, substitutes, effects, texts, parts, bonus: fixedBonus(parts), fixed: allFixed(parts), formula: testFormula(parts), pmCost: Math.max(0, pmCost) };
}

/** Resultado garantido ou chance pelo modo: 'roll' (d20), 'ten' (escolher 10) ou 'zero'. */
const chanceFor = (take, dc, bonus) => (take === 'zero' ? 100 : take === 'ten' ? (10 + bonus >= dc ? 100 : 0) : chanceOf(dc, bonus));

/**
 * Diálogo da ativação: CD aberta, teste (perícia, efeitos, bônus de poderes), opções e custo.
 * `sys` = o que já veio da janela do sistema: { spellPM, powerPM, powers: Set, ownFx: Set de chaves com efeito na ficha }.
 * Fabricação usa o mesmo diálogo com `sys.craft` = { dc, pm, title }: sem opções de ativação e com escolher 10 livre
 * (fabricar não é situação de pressão). Devolve as escolhas ou null.
 */
async function confirmActivation(actor, item, st, inv, sys) {
  const craft = sys.craft ?? null;
  const has = id => st.aparatos.includes(id);
  const saved = actor.getFlag?.(MODULE_ID, TEST_FLAG) ?? {};
  const c = { skill: saved.skill || SKILL_KEY, fx: { ...(saved.fx ?? {}) }, text: { ...(saved.text ?? {}) }, extra: 0, take: 'roll', refrigeration: false, calibrar: sys.powers.has('calibrar'), potente: false, rapida: false };
  // Poderes com efeito na ficha já foram escolhidos na janela do sistema; sem efeito, o Toolkit oferece aqui.
  const options = craft ? [] : [
    has('sistema-refrigeracao') && !st.refrigerationUsedToday ? ['refrigeration', 'Sistema de Refrigeração', '−5 na CD por 1 PM (ação completa, 1× por dia)'] : null,
    inv.calibrar && !sys.powers.has('calibrar') ? ['calibrar', 'Forçar a Calibragem', '−5 no teste, +2 na CD para resistir'] : null,
    inv.potente && !sys.ownFx.has('potente') ? ['potente', 'Invenção Potente', '+1 PM, +2 na CD para resistir'] : null,
    inv.rapida && !sys.ownFx.has('rapida') ? ['rapida', 'Ativação Rápida', '+2 PM, ativa com ação de movimento'] : null
  ].filter(Boolean);
  const calc = () => {
    const test = activationTest(actor, st, inv, c, { craft: !!craft });
    const dc = craft ? { dc: craft.dc, parts: [['Base', 20], ['Magia', craft.pm]] } : activationDC(st, { upgradePM: sys.spellPM, personalizado: inv.personalizado, refrigeration: c.refrigeration });
    if (c.take === 'zero' && !canChooseZero(dc.dc, test.parts)) c.take = 'roll';
    if (c.take === 'ten' && !inv.maestria && !craft) c.take = 'roll';
    const cost = activationCost({ upgradePM: sys.spellPM, powerPM: sys.powerPM + test.pmCost, comutador: has('comutador'), refrigeration: c.refrigeration, rapida: c.rapida, potente: c.potente, maestria: c.take === 'ten' && !craft });
    return { test, dc, cost, chance: chanceFor(c.take, dc.dc, test.bonus) };
  };
  const body = () => {
    const { test, dc, cost, chance } = calc();
    const cur = test.skill.key;
    const chip = (name, value, on, label, title = '') => `<label class="t20tk-chip ${on ? 'is-on' : ''}" ${title ? `title="${escapeHtml(title)}"` : ''}><input type="radio" name="${name}" value="${escapeHtml(value)}" ${on ? 'checked' : ''} hidden> ${label}</label>`;
    const enge = test.skills.find(s => s.key === SKILL_KEY);
    const skills = [chip('skill', SKILL_KEY, cur === SKILL_KEY, `Ofício (engenhoqueiro) ${sign(enge?.value ?? 0)}`, 'padrão'),
      ...test.substitutes.map(s => chip('skill', s.key, cur === s.key, `${escapeHtml(s.label)} ${sign(test.skills.find(k => k.key === s.key)?.value ?? 0)}`, `por ${s.source}`))].join('');
    const check = (name, on, label, extra = '') => `<label class="t20tk-bz-check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}${extra}</label>`;
    const fx = test.effects.map(e => {
      const what = `<b>${escapeHtml(e.name)}</b>${e.adds.length ? ` <small>${escapeHtml(e.adds.map(showValue).join(', '))}</small>` : ''}${e.cost ? ` <small>· ${e.cost} PM</small>` : ''}`;
      return e.aumenta
        ? `<label class="t20tk-bz-check"><input type="number" name="fx.${e.id}" value="${Number(c.fx[e.id]) || 0}" min="0" step="1" style="width:3.5em"> ${what}</label>`
        : check(`fx.${e.id}`, Number(c.fx[e.id]) > 0, what);
    }).join('');
    const texts = test.texts.map(t => (t.onSheet
      ? `<p class="t20tk-bz-meta"><b>${escapeHtml(t.source)}</b> ${escapeHtml(t.text)} (já na ficha)</p>`
      : check(`text.${t.id}`, !!c.text[t.id], `<b>${escapeHtml(t.source)}</b> <small>${escapeHtml(t.text)} (confira se vale aqui)</small>`))).join('');
    const opts = options.map(([k, label, note]) => check(k, !!c[k], `<b>${escapeHtml(label)}</b> <small>${escapeHtml(note)}</small>`)).join('');
    const fromSys = [...sys.powers].map(k => ({ calibrar: 'Forçar a Calibragem (−5 no teste)', potente: 'Invenção Potente', rapida: 'Ativação Rápida', avancada: 'Armadura Avançada (ação livre)', automato: 'Autômato Engenhocado' })[k]).filter(Boolean);
    const zeroOk = canChooseZero(dc.dc, test.parts);
    const takes = [chip('take', 'roll', c.take === 'roll', 'Rolar'),
      craft ? chip('take', 'ten', c.take === 'ten', 'Escolher 10', 'Fabricar não é situação de pressão')
        : inv.maestria ? chip('take', 'ten', c.take === 'ten', 'Escolher 10 (Maestria em Perícia, 1 PM)', 'Só se a perícia for uma das escolhidas no poder') : '',
      zeroOk ? chip('take', 'zero', c.take === 'zero', 'Escolher 0', `O resultado é só o bônus (${test.bonus}): passa sem rolar, sem acerto crítico nem falha crítica`) : ''].join('');
    const formula = c.take === 'zero' ? `0 + ${test.bonus}` : c.take === 'ten' ? test.formula.replace(/^1d20/, '10') : test.formula;
    return `<p><b>CD ${dc.dc}</b> = ${dc.parts.map(([k, v], i) => `${i ? (v >= 0 ? ' + ' : ' − ') : ''}${Math.abs(v)} <small>(${escapeHtml(k.toLowerCase())})</small>`).join('')}</p>
      ${sys.powerPM ? `<p class="t20tk-bz-note">Poderes marcados na janela do sistema: ${sys.powerPM} PM, sem somar na CD${fromSys.length ? ` (${escapeHtml(fromSys.join(', '))})` : ''}.</p>` : ''}
      <div class="t20tk-wz-field"><span>Teste</span><div class="t20tk-wz-chips">${skills}</div>
        ${test.substitutes.length ? `<p class="t20tk-bz-note">${test.substitutes.map(s => `<b>${escapeHtml(s.source)}</b> deixa usar ${escapeHtml(s.label)}`).join(' · ')}.</p>` : ''}
        ${fx}${texts}${opts}
        <label class="t20tk-pl-field">Outros bônus ou penalidades <input type="number" name="extra" value="${Number(c.extra) || 0}" step="1"></label>
        <p class="t20tk-bz-meta">${test.parts.map(p => `${escapeHtml(p.label)} ${escapeHtml(showValue(p.value))}`).join(' · ')}</p>
      </div>
      <div class="t20tk-wz-chips">${takes}</div>
      <p>Teste: <b>${escapeHtml(formula)}</b> · chance <b>${chance}%</b> · PM: <b>${cost.total}</b> (você tem ${pmNow(actor)})</p>
      ${zeroOk ? '' : '<p class="t20tk-bz-meta">Escolher 0 aparece quando o bônus já alcança a CD.</p>'}
      ${craft ? '<p class="t20tk-bz-note">Fabricar não sofre penalidade de armadura. Falhou: nada é descontado.</p>' : st.coupled?.kind === 'armor' ? '<p class="t20tk-bz-note">Acoplada na armadura: não precisa estar empunhada nem vestida.</p>' : st.coupled?.kind === 'automato' ? '<p class="t20tk-bz-note">Acoplada no autômato: com Autômato Engenhocado (+2 PM, ação de movimento), o efeito sai do autômato (alcance curto).</p>' : st.mode === 'hand' ? '<p class="t20tk-bz-note">Engenhoca empunhada: precisa de uma mão livre.</p>' : ''}`;
  };
  const read = el => {
    const n = el.name;
    if (!n) return;
    if (n === 'skill' || n === 'take') c[n] = el.value;
    else if (n === 'extra') c.extra = Number(el.value) || 0;
    else if (n.startsWith('fx.')) c.fx[n.slice(3)] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Math.max(0, Number(el.value) || 0);
    else if (n.startsWith('text.')) c.text[n.slice(5)] = el.checked;
    else c[n] = el.checked;
  };
  const result = await DialogV2().wait({
    window: { title: craft ? craft.title : `Ativar ${item.name}` },
    content: `<div class="t20tk-eng-confirm">${body()}</div>`,
    rejectClose: false,
    buttons: [
      { action: 'go', label: craft ? 'Fabricar' : 'Ativar', default: true, callback: () => ({ ...c, ...calc() }) },
      { action: 'cancel', label: 'Cancelar', callback: () => null }
    ],
    render: (event, dialog) => {
      const box = dialog.element.querySelector('.t20tk-eng-confirm');
      box?.addEventListener('change', ev => { read(ev.target); box.innerHTML = body(); });
    }
  });
  const remember = { skill: c.skill, fx: c.fx, text: c.text };
  if (result && actor.isOwner && !foundry.utils.objectsEqual(saved, remember)) await actor.setFlag(MODULE_ID, TEST_FLAG, remember).catch(() => null);
  return result;
}

/** Rola (ou escolhe 10 / 0) o teste e posta no chat. Devolve { total, natural, success }. */
async function rollActivation(actor, item, test, dc, take, title = item.name, [ok, ko] = ['ativou', 'falhou']) {
  if (take === 'zero') {
    await postCard(actor, { tool: 'engenhocas', tone: 'success', title, subtitle: `escolheu 0: ${ok}`, rows: [['Resultado', `${test.bonus} (só o bônus)`], ['CD', String(dc)]], note: 'Sem rolar o d20: não há acerto crítico nem falha crítica.' });
    return { total: test.bonus, natural: null, success: true };
  }
  const roll = await new Roll(take === 'ten' ? test.formula.replace(/^1d20/, '10') : test.formula).evaluate();
  const success = roll.total >= dc;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: chatFlavor({ tool: 'engenhocas', title, result: `${test.skill.key === SKILL_KEY ? 'Ofício (engenhoqueiro)' : test.skill.label}${take === 'ten' ? ' (escolheu 10)' : ''} contra CD ${dc}: ${success ? ok : ko}`, tone: success ? 'success' : 'error' }) });
  return { total: roll.total, natural: take === 'ten' ? null : roll.dice?.[0]?.total, success };
}

/** Executa o efeito da magia como o item.roll() do sistema faz depois do diálogo. */
async function runEffect(preview, configuration, cost) {
  const options = configuration ?? {};
  options.rolls = [];
  preview.system.rolled = {};
  const rolls = preview.system.rolls ?? [];
  if (rolls.some(r => r.type === 'ataque' && r.parts?.[0]?.[0])) await preview.rollAttack({ options });
  if (rolls.some(r => r.type === 'formula' && r.parts?.[0]?.[0])) await preview.rollFormula({ options });
  if (rolls.some(r => r.type === 'dano' && r.parts?.[0]?.[0])) await preview.rollDamage({ options });
  options.hasManaCost = cost > 0;
  if (globalThis.canvas?.scene && preview.hasAreaTarget) {
    const template = game.tormenta20?.canvas?.AbilityTemplate?.fromItem?.(preview);
    if (template) {
      template.drawPreview();
      options.template = { area: preview.system.area, alcance: preview.system.alcance };
    }
  }
  delete options.itemId;
  return preview.displayCard({ options, rollMode: options.rollMode ?? game.settings.get('core', 'rollMode'), createMessage: true });
}

export async function activateEngenhoca(item) {
  const actor = item?.actor;
  if (!actor) return ui.notifications.warn('A engenhoca precisa estar na ficha de um personagem.');
  if (!actor.isOwner) return ui.notifications.warn('Você não controla este personagem.');
  let st = engenhocaState(item);
  if (st.jammed) {
    const fix = await DialogV2().confirm({ window: { title: item.name }, content: `<p><b>${escapeHtml(item.name)}</b> está enguiçada. Consertar leva 1 hora de trabalho.</p><p>Marcar como consertada agora?</p>`, rejectClose: false });
    if (fix) await repairEngenhoca(item);
    return null;
  }
  const notMaker = makerBlocker(engenhocaFlags(item), actor.id);
  if (notMaker && !game.user.isGM) return ui.notifications.warn(notMaker);
  st = await snapshotFromSource(item, st);
  if (!st) return ui.notifications.error(`Não encontrei a magia de "${item.name}". Fabrique de novo pela Oficina.`);
  if (!actor.system?.pericias?.[SKILL_KEY]) return ui.notifications.error('A ficha não tem Ofício (engenhoqueiro).');
  const inv = actorInventor(actor);
  const AbilityUseDialog = game.tormenta20?.applications?.AbilityUseDialog;
  if (!AbilityUseDialog) return ui.notifications.error('O diálogo de aprimoramentos do Tormenta20 não está disponível.');

  // 1) aprimoramentos da magia e efeitos de poderes (diálogo do sistema)
  const preview = buildPreview(actor, item, st, 0);
  preview.prepareFinalAttributes?.();
  const configuration = await AbilityUseDialog.create(preview);
  if (!configuration) return null;
  if (configuration.brew) return ui.notifications.warn('Engenhocas não fabricam poções: use o botão de usar.');
  const actorFx = [...(actor.effects ?? [])].map(e => ({ id: e.id, name: e.name, spell: !!(e.flags?.tormenta20?.onuse && e.flags?.tormenta20?.spell) }));
  const split = splitApplied(foundry.utils.expandObject(configuration).aprs ?? {}, [...(preview.effects ?? [])].map(e => e.id), actorFx);
  const ownFx = new Set(actorFx.filter(e => e.spell).map(e => powerEffectKey(e.name)).filter(Boolean));
  if (split.spellPM > inv.int) return ui.notifications.warn(`Aprimoramentos custam ${split.spellPM} PM, mas o limite da engenhoca é ${inv.int} PM (Inteligência).`);

  // 2) teste, CD, opções e custo
  const choice = await confirmActivation(actor, item, st, inv, { ...split, ownFx });
  if (!choice) return null;
  const { dc, cost, test } = choice;
  if (cost.total > pmNow(actor)) return ui.notifications.warn(`PM insuficientes: a ativação custa ${cost.total} PM.`);
  // Forçar a Calibragem e Invenção Potente marcados na janela do sistema já somaram na CD para resistir.
  const resBonus = resistanceBonus({ estabilizador: st.aparatos.includes('estabilizador'), calibrar: choice.calibrar && !split.powers.has('calibrar'), potente: choice.potente });
  if (resBonus && preview.system.resistencia?.txt) {
    preview.system.resistencia.bonus = (Number(preview.system.resistencia.bonus) || 0) + resBonus;
    preview.prepareFinalAttributes?.();
  }
  preview.system.ativacao.custo = cost.upgrades + cost.powers;

  // 3) teste
  let r = await rollActivation(actor, item, test, dc.dc, choice.take);
  if (cost.total) await actor.spendMana(cost.total, 0, false);

  if (!r.success && inv.chutes && pmNow(actor) >= 1) {
    const again = await DialogV2().confirm({ window: { title: 'Chutes e Palavrões' }, content: `<p>Falhou (${r.total} contra CD ${dc.dc}). Pagar 1 PM para repetir o teste (1× por rodada)?</p>`, rejectClose: false });
    if (again) {
      await actor.spendMana(1, 0, false);
      r = await rollActivation(actor, item, test, dc.dc, 'roll', `${item.name} — de novo (Chutes e Palavrões)`);
    }
  }
  const success = r.success;

  let supressor = false;
  if (!success && st.aparatos.includes('supressor-seguranca') && !st.supressorScene) {
    supressor = !!(await DialogV2().confirm({ window: { title: 'Supressor de Segurança' }, content: '<p>Usar o Supressor de Segurança (1× por cena)? A falha não enguiça a engenhoca nem aumenta a próxima CD.</p>', rejectClose: false }));
  }
  await patchFlags(item, outcomePatch(st, { success, supressor, sceneId: 'cena', refrigeration: choice.refrigeration }));

  if (!success) {
    const explode = inv.goblinoide && (r.total <= dc.dc - 5 || r.natural === 1);
    await postCard(actor, {
      tool: 'engenhocas', tone: 'error', title: supressor ? 'Falhou, mas o Supressor segurou' : 'A engenhoca enguiçou', subtitle: item.name,
      rows: [['Teste', `${r.total} contra CD ${dc.dc}`], ['PM gastos', String(cost.total)]],
      note: supressor ? 'A engenhoca continua funcionando e a próxima CD não aumenta.' : `Consertar leva 1 hora de trabalho.${explode ? ` Engenhocaria Goblinoide: a engenhoca explode! ${2 * st.circle}d6 de impacto em você e em todos a até 3m (Reflexos reduz à metade).` : ''}`
    });
    return { success: false };
  }

  const notes = [];
  if (resBonus) notes.push(`CD para resistir +${resBonus} (já no cartão).`);
  if (choice.rapida || split.powers.has('rapida')) notes.push('Ativada com ação de movimento (Ativação Rápida).');
  if (split.powers.has('avancada')) notes.push('Ativada como ação livre (Armadura Avançada).');
  if (split.powers.has('automato')) notes.push('Ativada pelo autômato, com ação de movimento; o efeito sai dele (Autômato Engenhocado).');
  if (choice.take === 'ten') notes.push('Escolheu 10 com Maestria em Perícia (1 PM).');
  if (st.aparatos.includes('gatilho-corda')) notes.push('Gatilho de Corda: pode ativar com ação de movimento; depois, ação completa para dar corda.');
  notes.push(...effectReminders(st.snapshot?.system));
  await runEffect(preview, configuration, cost.upgrades + cost.powers);
  if (notes.length) await postCard(actor, { tool: 'engenhocas', tone: 'success', title: 'Engenhoca ativada', subtitle: item.name, note: notes.join(' ') });
  return { success: true };
}
/* ---------- acoplar (Armadura Mecanizada, Autômato Engenhocado) ---------- */

/** Armaduras da ficha que aceitam engenhocas, com quantas já estão acopladas. */
export function couplingArmors(actor) {
  const engs = actorEngenhocas(actor);
  return [...(actor?.items ?? [])].filter(i => i.type === 'equipamento' && !isEngenhoca(i) && armorCapacity(i.system?.tipo))
    .map(i => ({ item: i, tipo: i.system.tipo, capacity: armorCapacity(i.system.tipo), used: engs.filter(e => engenhocaState(e).coupled?.kind === 'armor' && engenhocaState(e).coupled.id === i.id).length, upgrades: armorUpgradeCount(i.system?.upgrades) }));
}

export const automatoUsed = actor => actorEngenhocas(actor).filter(e => engenhocaState(e).coupled?.kind === 'automato').length;

/**
 * Acopla a engenhoca na armadura (`target` = id do item) ou no autômato (`target` = 'automato').
 * T$ 100 e 1 dia de trabalho. Acoplada, não conta como vestida nem precisa ser empunhada: sai dos espaços equipados.
 */
export async function coupleEngenhoca(actor, item, target, { pay = true } = {}) {
  const inv = actorInventor(actor);
  const st = engenhocaState(item);
  const armor = target === 'automato' ? null : couplingArmors(actor).find(a => a.item.id === target);
  if (target !== 'automato' && !armor) return ui.notifications.warn('Escolha uma armadura leve ou pesada da ficha.');
  const why = coupleBlocker(st, target === 'automato' ? { kind: 'automato', used: automatoUsed(actor) } : { kind: 'armor', tipo: armor.tipo, used: armor.used }, inv);
  if (why && !game.user.isGM) return ui.notifications.warn(why);
  if (pay && money(actor) < COUPLE_PRICE) return ui.notifications.warn(`Faltam T$ ${COUPLE_PRICE - money(actor)} (custa T$ ${COUPLE_PRICE}).`);
  await Promise.all([
    item.update({
      'system.equipado': false, 'system.equipado2.slot': 0,
      [`flags.${FLAG_SCOPE}.${FLAG_KEY}.coupled`]: target === 'automato' ? { kind: 'automato', id: null } : { kind: 'armor', id: armor.item.id }
    }),
    pay ? actor.update({ 'system.dinheiro.tp': money(actor) - COUPLE_PRICE }) : null
  ]);
  const where = armor ? armor.item.name : 'autômato';
  await postCard(actor, {
    tool: 'engenhocas', tone: 'success', title: 'Engenhoca acoplada', subtitle: `${item.name} → ${where}`,
    rows: [['Preço', pay ? `T$ ${COUPLE_PRICE}` : 'não descontado'], ['Tempo', '1 dia de trabalho']],
    note: armor ? `Armadura Mecanizada: não conta no limite de itens vestidos e não precisa ser empunhada.${inv.avancada ? ` Armadura Avançada: +${armor.upgrades} no teste de ativação (melhorias da armadura).` : ''}` : 'Autômato Engenhocado: 1× por rodada, com o autômato em alcance curto, +2 PM para ativar com ação de movimento, tendo ele como origem.'
  });
}

export async function uncoupleEngenhoca(item) {
  await patchFlags(item, {}, ['coupled']);
}

/**
 * Acerta as engenhocas da ficha: tipo acessório (as antigas eram armadura leve e só uma ficava vestida),
 * o espaço pela Manutenção Eficiente e os PV (metade dos PV máximos do fabricante). Só o dono da ficha grava.
 */
export async function syncEngenhocas(actor) {
  if (!actor?.isOwner) return;
  const inv = actorInventor(actor);
  const spaces = inv.manutencao ? 0.5 : 1;
  const updates = [];
  for (const item of actorEngenhocas(actor)) {
    const upd = {};
    if (item.system?.tipo !== ENGENHOCA_ITEM_TYPE) upd['system.tipo'] = ENGENHOCA_ITEM_TYPE;
    const cur = Number(item.system?.espacos);
    if ((cur === 0.5 || cur === 1) && cur !== spaces) upd['system.espacos'] = spaces;
    // PV = metade dos PV do fabricante: acompanha os PV máximos dele.
    const half = Math.floor(inv.maxPV / 2);
    const pv = item.system?.pv ?? {};
    const maker = engenhocaFlags(item)?.makerActorId;
    if (half > 0 && (!maker || maker === actor.id) && Number(pv.max) !== half) {
      upd['system.pv.max'] = half;
      upd['system.pv.value'] = Number(pv.value) >= Number(pv.max) ? half : Math.min(Number(pv.value) || 0, half);
    }
    if (Object.keys(upd).length) updates.push({ _id: item.id, ...upd });
  }
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
}

/* ---------- manutenção ---------- */

export async function repairEngenhoca(item) {
  await patchFlags(item, { jammed: false, lastResult: 'repaired' });
  await postCard(item.actor, { tool: 'engenhocas', tone: 'success', title: 'Engenhoca consertada', subtitle: item.name, note: '1 hora de trabalho.' });
}

export async function newDay(actor) {
  const updates = actorEngenhocas(actor).map(item => ({ _id: item.id, ...flagsUpdate(NEW_DAY_PATCH) }));
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
  await postCard(actor, { tool: 'engenhocas', title: 'Novo dia', subtitle: actor.name, note: 'As CDs de ativação voltaram ao normal. Engenhocas enguiçadas continuam enguiçadas até o conserto.' });
}

export async function newScene(actor) {
  const updates = actorEngenhocas(actor).map(item => ({ _id: item.id, ...flagsUpdate({ supressorScene: null }) }));
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
  ui.notifications.info('Nova cena: Supressores de Segurança liberados.');
}

export async function dismantleEngenhoca(item) {
  const ok = await DialogV2().confirm({ window: { title: 'Desmontar engenhoca' }, content: `<p>Desmontar <b>${escapeHtml(item.name)}</b>? O item sai da ficha e não há reembolso.</p>`, rejectClose: false });
  if (!ok) return false;
  await item.delete();
  return true;
}

/* ---------- aparatos ---------- */

export async function installAparato(actor, type, targets, { pay = true } = {}) {
  const def = APARATO_BY_ID.get(type);
  if (!def) return;
  if (targets.length !== def.targets) return ui.notifications.warn(`${def.label} precisa de exatamente ${def.targets} engenhoca(s).`);
  for (const t of targets) {
    const why = aparatoBlocker(engenhocaState(t), type);
    if (why) return ui.notifications.warn(`${t.name}: ${why}`);
  }
  if (pay && money(actor) < def.price) return ui.notifications.warn(`Faltam T$ ${def.price - money(actor)} (custa T$ ${def.price}).`);
  const group = def.targets > 1 ? foundry.utils.randomID() : null;
  const updates = targets.map(t => {
    const st = engenhocaState(t);
    return { _id: t.id, ...flagsUpdate({ aparatos: [...st.aparatos, type], ...(group ? { aparatoGroups: { ...st.groups, [type]: group } } : {}) }) };
  });
  await Promise.all([actor.updateEmbeddedDocuments('Item', updates), pay && def.price ? actor.update({ 'system.dinheiro.tp': money(actor) - def.price }) : null]);
  await postCard(actor, { tool: 'engenhocas', tone: 'success', title: `${def.label} instalado`, subtitle: actor.name, rows: [['Preço', pay ? `T$ ${def.price}` : 'não descontado']], items: targets.map(t => ({ name: t.name, img: t.img })), note: def.text });
}

export async function removeAparato(actor, item, type) {
  const st = engenhocaState(item);
  const group = st.groups?.[type];
  const linked = group ? actorEngenhocas(actor).filter(e => engenhocaState(e).groups?.[type] === group) : [item];
  const updates = linked.map(t => {
    const s = engenhocaState(t);
    const i = s.aparatos.indexOf(type);
    return { _id: t.id, ...flagsUpdate({ aparatos: s.aparatos.filter((_, k) => k !== i) }, s.groups?.[type] ? [`aparatoGroups.${type}`] : []) };
  });
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
}

export { isEngenhoca, engenhocaState, chatCard };
