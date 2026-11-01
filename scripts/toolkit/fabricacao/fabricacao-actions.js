/**
 * Fabricação — ações na ficha: catálogo de receitas (compêndios), teste de Ofício, pagar a matéria-prima,
 * pôr o item na ficha, comer (refeição do dia como efeito ativo de 1 dia) e os ganchos de descanso e de virada do dia.
 */
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, fold, hasPower } from '../core/t20.js';
import { getCompendiumIndex } from '../core/spell-index.js';
import { sheetSkills, sheetPowers } from '../core/sheet-skills.js';
import { skillSubstitutes, textBonuses, testParts, fixedBonus, allFixed, testFormula, chanceOf, canChooseZero } from '../core/skill-test.js';
import { coinsOf, totalTC, formatTC, pay } from '../core/wallet.js';
import { postCard, chatFlavor } from '../ui/chat.js';
import {
  CRAFT_SKILLS, CRAFT_TIME, UNSTABLE, classifyRecipe, materialCost, craftCheck, canUnstable, craftedName,
  foodBenefit, isSpecialFood, benefitLines, foodEffects, foodFlag, expiredFood, restBonus, tempAfter
} from './fabricacao-rules.js';

const DialogV2 = () => foundry.applications.api.DialogV2;
const pmNow = actor => (Number(actor?.system?.attributes?.pm?.value) || 0) + (Number(actor?.system?.attributes?.pm?.temp) || 0);
const sign = n => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/* ---------- catálogo ---------- */

let catalog = null;

/** Receitas de todos os compêndios de Item: comidas e alquímicos (sistema primeiro, depois módulos). */
export async function getRecipeCatalog({ refresh = false } = {}) {
  if (catalog && !refresh) return catalog;
  const out = [];
  for (const { pack, entries } of await getCompendiumIndex({ refresh })) {
    const label = pack.metadata?.label ?? pack.collection;
    for (const e of entries) {
      const recipe = classifyRecipe(e);
      if (!recipe) continue;
      out.push(Object.freeze({
        ...recipe, uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`, name: e.name, key: fold(e.name), img: e.img,
        book: e.system?.source ?? '', packLabel: label, core: pack.collection.startsWith('tormenta20.'),
        description: e.system?.description?.value ?? ''
      }));
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (b.core - a.core));
  catalog = Object.freeze(out);
  return catalog;
}

export function invalidateRecipeCatalog() { catalog = null; }

/* ---------- ficha ---------- */

/** Instrumentos de ofício na ficha para `skill` (o item do sistema é um só; o nome pode trazer o Ofício entre parênteses). */
export function hasTools(actor, skill) {
  const want = CRAFT_SKILLS[skill]?.short ?? '';
  return [...(actor?.items ?? [])].some(i => {
    const name = fold(i.name);
    if (!/instrumentos? de oficio/.test(name)) return false;
    const spec = name.match(/\(([^)]+)\)/)?.[1];
    return !spec || spec.includes(want);
  });
}

/** O que a janela precisa saber da ficha. */
export function crafterInfo(actor) {
  const skills = sheetSkills(actor);
  const by = key => skills.find(s => s.key === key) ?? null;
  return {
    skills: { cozi: by('cozi'), alqu: by('alqu') },
    tools: { cozi: hasTools(actor, 'cozi'), alqu: hasTools(actor, 'alqu') },
    mestreCuca: hasPower(actor, 'Mestre Cuca'),
    instavel: hasPower(actor, 'Catalizador Instável') || hasPower(actor, 'Catalisador Instável'),
    money: totalTC(coinsOf(actor)),
    pm: pmNow(actor)
  };
}

const SKILL_PATTERN = {
  cozi: 'of[ií]cio\\s*[(:]?\\s*cozinheiro\\)?|(?:qualquer\\s+)?outro\\s+of[ií]cio',
  alqu: 'of[ií]cio\\s*[(:]?\\s*alquimista\\)?|(?:qualquer\\s+)?outro\\s+of[ií]cio'
};

/**
 * Teste de fabricação com as escolhas `c` = { skill, text: {id: bool}, extra, units, tools }.
 * Devolve { skill, options, texts, parts, bonus, fixed, formula, dc }.
 */
export function craftTest(actor, recipe, c = {}) {
  const skills = sheetSkills(actor);
  const main = skills.find(s => s.key === recipe.skill) ?? { key: recipe.skill, label: CRAFT_SKILLS[recipe.skill].label, value: 0, trained: false };
  const fromPowers = skillSubstitutes(sheetPowers(actor, recipe.skill), skills, { key: recipe.skill, pattern: SKILL_PATTERN[recipe.skill] });
  const fromText = recipe.substitutes.map(k => skills.find(s => s.key === k)).filter(Boolean).map(s => ({ key: s.key, label: s.label, source: recipe.name }));
  const options = [{ ...main, label: CRAFT_SKILLS[recipe.skill].label, source: '' }, ...[...fromPowers, ...fromText].filter((s, i, a) => a.findIndex(x => x.key === s.key) === i).map(s => ({ ...skills.find(x => x.key === s.key), source: s.source }))];
  const skill = options.find(o => o.key === c.skill) ?? options[0];
  const texts = textBonuses(sheetPowers(actor, skill.key), skill.key === recipe.skill ? CRAFT_SKILLS[recipe.skill].short : skill.label);
  const { dc, mods } = craftCheck(recipe, { units: c.units ?? 1, tools: c.tools ?? true });
  const extras = [...mods];
  for (const t of texts) if (c.text?.[t.id] && !t.onSheet) extras.push({ label: t.source, value: t.value });
  if (c.extra) extras.push({ label: 'Outros', value: Number(c.extra) || 0 });
  const parts = testParts({ skillLabel: skill.label, skillValue: skill.value, extras });
  return { skill, options, texts, parts, bonus: fixedBonus(parts), fixed: allFixed(parts), formula: testFormula(parts), dc };
}

const chanceFor = (take, dc, bonus) => (take === 'zero' ? 100 : take === 'ten' ? (10 + bonus >= dc ? 100 : 0) : chanceOf(dc, bonus));

/* ---------- fabricar ---------- */

/** Diálogo do teste: perícia, bônus, duas unidades, instrumentos, pagar, Catalizador Instável. Devolve as escolhas ou null. */
async function confirmCraft(actor, recipe, info) {
  const c = { skill: recipe.skill, text: {}, extra: 0, units: 1, tools: info.tools[recipe.skill], take: 'ten', pay: true, unstable: false };
  const gm = !!game.user?.isGM;
  const body = () => {
    const unstable = c.unstable && canUnstable(recipe);
    const test = craftTest(actor, recipe, c);
    const cost = materialCost(recipe.price, { units: c.units, half: unstable });
    const enough = info.money >= cost;
    const zeroOk = canChooseZero(test.dc, test.parts);
    if (c.take === 'zero' && !zeroOk) c.take = 'ten';
    const chance = chanceFor(c.take, test.dc, test.bonus);
    const chip = (name, value, on, label, title = '') => `<label class="t20tk-chip ${on ? 'is-on' : ''}" ${title ? `title="${escapeHtml(title)}"` : ''}><input type="radio" name="${name}" value="${escapeHtml(value)}" ${on ? 'checked' : ''} hidden> ${label}</label>`;
    const skills = test.options.map(o => chip('skill', o.key, o.key === test.skill.key, `${escapeHtml(o.label)} ${escapeHtml(sign(o.value))}`, o.source ? `Pelo texto de ${o.source}` : '')).join('');
    const texts = test.texts.length ? `<div class="t20tk-wz-chips">${test.texts.map(t => `<label class="t20tk-bz-check" title="${escapeHtml(t.text)}"><input type="checkbox" name="text.${escapeHtml(t.id)}" ${c.text[t.id] ? 'checked' : ''} ${t.onSheet ? 'disabled' : ''}> ${escapeHtml(t.source)} ${t.onSheet ? '(já na ficha)' : `+${t.value}`}</label>`).join('')}</div>` : '';
    const takes = [chip('take', 'ten', c.take === 'ten', 'Escolher 10', 'Fabricar não é situação de pressão'), chip('take', 'roll', c.take === 'roll', 'Rolar'),
      zeroOk ? chip('take', 'zero', c.take === 'zero', 'Escolher 0', `O resultado é só o bônus (${test.bonus})`) : ''].join('');
    const formula = c.take === 'zero' ? `0 + ${test.bonus}` : c.take === 'ten' ? test.formula.replace(/^1d20/, '10') : test.formula;
    const trained = test.skill.key !== recipe.skill || test.skill.trained;
    return `${unstable ? `<p class="t20tk-bz-note"><b>Catalizador Instável</b>: ação completa e ${UNSTABLE.pm} PM, sem teste, metade do custo. O item só dura até o fim da cena.</p>` : `
      <p><b>CD ${test.dc}</b> <small>(${escapeHtml(recipe.kindLabel.toLowerCase())})</small>${recipe.notes.length ? ` · <small>${escapeHtml(recipe.notes.join(' '))}</small>` : ''}</p>
      <div class="t20tk-wz-field"><span>Teste</span><div class="t20tk-wz-chips">${skills}</div>${texts}
        <label class="t20tk-pl-field">Outros bônus ou penalidades <input type="number" name="extra" value="${Number(c.extra) || 0}" step="1"></label>
        <p class="t20tk-bz-meta">${test.parts.map(p => `${escapeHtml(p.label)} ${escapeHtml(typeof p.value === 'number' ? sign(p.value) : String(p.value))}`).join(' · ')}</p>
      </div>
      ${trained ? '' : `<p class="t20tk-bz-warn">${escapeHtml(CRAFT_SKILLS[recipe.skill].label)} não está treinado: Ofício só pode ser usado por quem é treinado.</p>`}
      <div class="t20tk-wz-chips">${takes}</div>
      <p>Teste: <b>${escapeHtml(formula)}</b> · chance <b>${chance}%</b></p>`}
      <div class="t20tk-wz-chips">
        <label class="t20tk-bz-check"><input type="checkbox" name="two" ${c.units > 1 ? 'checked' : ''} ${unstable ? 'disabled' : ''}> Duas unidades (−5 no teste, paga as duas)</label>
        <label class="t20tk-bz-check"><input type="checkbox" name="tools" ${c.tools ? 'checked' : ''} ${unstable ? 'disabled' : ''}> Tenho os instrumentos de ofício${info.tools[recipe.skill] ? '' : ' <small>(não achei na ficha: −5)</small>'}</label>
        ${info.instavel && canUnstable(recipe) ? `<label class="t20tk-bz-check"><input type="checkbox" name="unstable" ${c.unstable ? 'checked' : ''}> Catalizador Instável (${UNSTABLE.pm} PM, você tem ${info.pm})</label>` : ''}
      </div>
      <p>Matéria-prima: <b>${escapeHtml(formatTC(cost))}</b>${c.units > 1 ? ' (duas unidades)' : ''} · tempo: <b>${unstable ? 'ação completa' : CRAFT_TIME}</b> · você tem ${escapeHtml(formatTC(info.money))}</p>
      <label class="t20tk-bz-check"><input type="checkbox" name="pay" ${c.pay && enough ? 'checked' : ''} ${enough ? '' : 'disabled'}> Descontar a matéria-prima do dinheiro (é gasta mesmo se o teste falhar)${enough ? '' : ' <small>(dinheiro insuficiente: acerte com o mestre)</small>'}</label>
      ${gm && !unstable ? '<label class="t20tk-bz-check"><input type="checkbox" name="advance"> Avançar 1 dia no relógio do mundo</label>' : ''}`;
  };
  const read = el => {
    const name = el.name;
    if (!name) return;
    if (name === 'skill' || name === 'take') c[name] = el.value;
    else if (name === 'extra') c.extra = Number(el.value) || 0;
    else if (name === 'two') c.units = el.checked ? 2 : 1;
    else if (name.startsWith('text.')) c.text[name.slice(5)] = el.checked;
    else c[name] = el.checked;
  };
  const description = recipe.description ? `<details class="t20tk-disclosure t20tk-eng-desc"><summary>Descrição</summary><div class="t20tk-disclosure-body t20tk-bz-description">${recipe.description}</div></details>` : '';
  return DialogV2().wait({
    window: { title: `Fabricar ${recipe.name}` },
    position: { width: 520 },
    content: `${description}<div class="t20tk-eng-confirm t20tk-fab-confirm">${body()}</div>`,
    rejectClose: false,
    buttons: [
      { action: 'go', label: 'Fabricar', default: true, callback: () => ({ ...c, unstable: c.unstable && canUnstable(recipe), test: craftTest(actor, recipe, c) }) },
      { action: 'cancel', label: 'Cancelar', callback: () => null }
    ],
    render: (event, dialog) => {
      const box = dialog.element.querySelector('.t20tk-fab-confirm');
      box?.addEventListener('change', ev => { read(ev.target); box.innerHTML = body(); });
    }
  });
}

/** Rola (ou escolhe 10 / 0) e posta no chat. Devolve { total, success }. */
async function rollCraft(actor, recipe, test, take) {
  const title = `Fabricar ${recipe.name}`;
  if (take === 'zero') return { total: test.bonus, success: true };
  const roll = await new Roll(take === 'ten' ? test.formula.replace(/^1d20/, '10') : test.formula, actor.getRollData()).evaluate();
  const success = roll.total >= test.dc;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: chatFlavor({ tool: 'fabricacao', title, result: `${test.skill.label}${take === 'ten' ? ' (escolheu 10)' : ''} contra CD ${test.dc}: ${success ? 'sucesso' : 'falha'}`, tone: success ? 'success' : 'error' }) });
  return { total: roll.total, success };
}

/**
 * Dados do item fabricado. Comidas perdem o efeito "no uso" transferido do compêndio (o bônus só vale depois de comer,
 * e aí vem da refeição do dia); quem tem Mestre Cuca deixa a marca no prato.
 */
export function craftedItemData(source, recipe, { units = 1, mestreCuca = false, unstable = false, actorName = '' } = {}) {
  const data = foundry.utils.deepClone(source);
  delete data._id;
  data.name = craftedName(data.name, { unstable });
  foundry.utils.setProperty(data, 'system.qtd', units);
  if (recipe.kind === 'prato') data.effects = (data.effects ?? []).filter(e => !(e.transfer && e.flags?.tormenta20?.onuse));
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.crafted`, { by: actorName, kind: recipe.kind, mestreCuca: recipe.kind === 'prato' && mestreCuca, unstable });
  return data;
}

/** Mesmo item já na ficha (mesmo nome e mesma marca de Mestre Cuca), para empilhar. */
function stackTarget(actor, data) {
  const cuca = !!data.flags?.[MODULE_ID]?.crafted?.mestreCuca;
  return [...actor.items].find(i => i.type === 'consumivel' && i.name === data.name && !!i.flags?.[MODULE_ID]?.crafted?.mestreCuca === cuca) ?? null;
}

/** Fabrica a receita na ficha. Devolve o item criado/atualizado, ou null. */
export async function craftRecipe(actor, recipe) {
  if (!actor?.isOwner) return ui.notifications.warn('Você não pode alterar esta ficha.');
  if (!recipe.priced && !game.user.isGM) return ui.notifications.warn(`${recipe.name} não tem preço no compêndio: combine o custo com o mestre.`);
  const info = crafterInfo(actor);
  const choice = await confirmCraft(actor, recipe, info);
  if (!choice) return null;
  const unstable = !!choice.unstable;
  const units = unstable ? 1 : choice.units;
  const cost = materialCost(recipe.price, { units, half: unstable });
  if (unstable && pmNow(actor) < UNSTABLE.pm) return ui.notifications.warn(`PM insuficientes: o Catalizador Instável custa ${UNSTABLE.pm} PM.`);

  // Regra da mesa (decidida em 01/11/2026): o que o texto chama de custo é gasto qualquer que seja o resultado,
  // a menos que o texto diga o contrário. A matéria-prima sai antes do teste e se perde na falha.
  const paid = choice.pay && cost > 0 ? await pay(actor, cost) : null;
  const costRow = ['Matéria-prima', cost ? `${formatTC(cost)}${paid ? ' (pago)' : ' (a acertar)'}` : 'sem custo'];

  let total = null;
  if (!unstable) {
    const r = await rollCraft(actor, recipe, choice.test, choice.take);
    total = r.total;
    if (!r.success) {
      await postCard(actor, { tool: 'fabricacao', tone: 'error', title: 'Fabricação falhou', subtitle: recipe.name, rows: [['Teste', `${r.total} contra CD ${choice.test.dc}`], costRow, ['Tempo', CRAFT_TIME]], note: 'A matéria-prima e o tempo foram gastos.' });
      if (choice.advance && game.user.isGM) await game.time.advance(86400);
      return null;
    }
  } else await actor.spendMana(UNSTABLE.pm, 0, false);

  const source = await fromUuid(recipe.uuid);
  if (!source) return ui.notifications.error(`Não encontrei ${recipe.name} no compêndio.`);
  const data = craftedItemData(game.items.fromCompendium(source), recipe, { units, mestreCuca: info.mestreCuca, unstable, actorName: actor.name });
  const existing = stackTarget(actor, data);
  const item = existing
    ? (await existing.update({ 'system.qtd': (Number(existing.system?.qtd) || 0) + units }), existing)
    : (await actor.createEmbeddedDocuments('Item', [data]))[0];
  if (choice.advance && game.user.isGM && !unstable) await game.time.advance(86400);
  const benefit = recipe.kind === 'prato' ? benefitLines(foodBenefit(recipe.description, { mestreCuca: info.mestreCuca })) : [];
  await postCard(actor, {
    tool: 'fabricacao', tone: 'success', title: `${recipe.kindLabel} fabricado`, subtitle: `${actor.name} · ${recipe.name}`,
    rows: [
      ['Teste', unstable ? 'sem teste (Catalizador Instável)' : `${choice.take === 'zero' ? 'escolheu 0' : total} contra CD ${choice.test.dc}`],
      ['Unidades', String(units)],
      costRow,
      ['Tempo', unstable ? 'ação completa' : CRAFT_TIME]
    ],
    items: [{ name: item?.name ?? data.name, img: data.img, note: benefit.join('; ') }],
    note: unstable ? 'Instável: só dura até o fim da cena.' : (data.flags?.[MODULE_ID]?.crafted?.mestreCuca ? 'Mestre Cuca: os bônus numéricos deste prato aumentam em +1.' : '')
  });
  return item;
}

/* ---------- comer ---------- */

/** Efeitos de comida ativos na ficha. */
export const activeFood = actor => [...(actor?.effects ?? [])].filter(e => foodFlag(e, MODULE_ID));

/** Comida no inventário: benefício, já com Mestre Cuca se foi o cozinheiro que fez. */
export function foodOf(item) {
  const cuca = !!item?.flags?.[MODULE_ID]?.crafted?.mestreCuca;
  const benefit = foodBenefit(item?.system?.description?.value ?? '', { mestreCuca: cuca });
  return { item, benefit, special: isSpecialFood(benefit), mestreCuca: cuca };
}

export const sheetFoods = actor => [...(actor?.items ?? [])].filter(i => i.type === 'consumivel' && i.system?.tipo === 'food').map(foodOf);

/** Come uma unidade. Prato especial vira a refeição do dia (efeito de 1 dia); comida comum só é consumida. */
export async function eatFood(actor, item) {
  if (!actor?.isOwner) return ui.notifications.warn('Você não pode alterar esta ficha.');
  const food = foodOf(item);
  const qtd = Number(item.system?.qtd) || 0;
  if (qtd < 1) return ui.notifications.warn(`Não há ${item.name} no inventário.`);
  let replace = [];
  if (food.special) {
    const current = activeFood(actor).filter(e => foodFlag(e, MODULE_ID)?.day);
    if (current.length) {
      const names = [...new Set(current.map(e => foodFlag(e, MODULE_ID).name))].join(', ');
      const pick = await DialogV2().wait({
        window: { title: `Comer ${item.name}` },
        content: `<p>Hoje você já comeu <b>${escapeHtml(names)}</b>. Os benefícios de pratos especiais valem um por dia.</p><p>Trocar pela refeição nova?</p>`,
        rejectClose: false,
        buttons: [
          { action: 'replace', label: 'Trocar', default: true },
          { action: 'keep', label: 'Manter as duas' },
          { action: 'cancel', label: 'Cancelar' }
        ]
      });
      if (!pick || pick === 'cancel') return null;
      if (pick === 'replace') replace = activeFood(actor).map(e => e.id);
    }
  }
  if (replace.length) await actor.deleteEmbeddedDocuments('ActiveEffect', replace);
  const updates = {};
  const b = food.benefit;
  if (food.special) {
    if (b.tempPV) updates['system.attributes.pv.temp'] = tempAfter(actor.system?.attributes?.pv?.temp, b.tempPV);
    if (b.tempPM) updates['system.attributes.pm.temp'] = tempAfter(actor.system?.attributes?.pm?.temp, b.tempPM);
    const fx = foodEffects({ name: item.name, img: item.img, description: item.system?.description?.value ?? '', benefit: b, worldTime: game.time.worldTime, origin: item.uuid, moduleId: MODULE_ID });
    await actor.createEmbeddedDocuments('ActiveEffect', fx);
  }
  if (Object.keys(updates).length) await actor.update(updates);
  if (qtd > 1) await item.update({ 'system.qtd': qtd - 1 });
  else await item.delete();
  const lines = benefitLines(b);
  await postCard(actor, {
    tool: 'fabricacao', tone: 'success', title: `${actor.name} comeu ${item.name}`, subtitle: food.special ? 'refeição do dia' : 'refeição comum',
    rows: lines.map(l => ['Efeito', l]),
    note: food.special ? `Vale até esta hora amanhã.${b.testDie ? ' O bônus no teste aparece desmarcado na janela de rolagem: marque quando usar e apague o efeito depois.' : ''}${food.mestreCuca ? ' Feito com Mestre Cuca (+1 nos bônus numéricos).' : ''}` : ''
  });
  return true;
}

/** Apaga as refeições do dia da ficha (novo dia). */
export async function clearFood(actor, { silent = false } = {}) {
  const ids = activeFood(actor).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
  if (!silent && ids.length) ui.notifications.info(`${actor.name}: refeições do dia encerradas.`);
  return ids.length;
}

/* ---------- ganchos: dia que vira e noite de sono ---------- */

/** O mestre apaga as refeições vencidas quando o relógio do mundo avança. */
async function sweepExpired(worldTime) {
  if (!game.users?.activeGM || game.users.activeGM.id !== game.user?.id) return;
  for (const actor of game.actors ?? []) {
    const ids = expiredFood(actor.effects, worldTime, MODULE_ID).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(error => console.warn('[T20 Toolkit] Refeições vencidas:', error));
  }
}

/**
 * Descanso do sistema (`Actor#descanso(modificador, modPV, modPM, ...)`): soma a recuperação extra das comidas do dia
 * (Prato do Aventureiro, Sopa de Peixe...) e marca que já foi usada ("na próxima noite de sono").
 */
function wrapRest() {
  const proto = CONFIG.Actor?.documentClass?.prototype;
  if (!proto?.descanso || proto.descanso.t20tkFood) return;
  const original = proto.descanso;
  const wrapped = async function (modificador = 1, modPV = 0, modPM = 0, ...rest) {
    const bonus = restBonus(this.effects, MODULE_ID);
    const result = await original.call(this, modificador, (Number(modPV) || 0) + bonus.pv, (Number(modPM) || 0) + bonus.pm, ...rest);
    if (bonus.ids.length && this.isOwner) {
      await this.updateEmbeddedDocuments('ActiveEffect', bonus.ids.map(id => ({ _id: id, [`flags.${MODULE_ID}.food.restUsed`]: true }))).catch(() => null);
      const names = [...new Set(bonus.ids.map(id => foodFlag(this.effects.get(id), MODULE_ID)?.name).filter(Boolean))];
      await postCard(this, { tool: 'fabricacao', title: 'Noite de sono', subtitle: this.name, rows: [['PV extra', bonus.pv ? `+${bonus.pv} por nível` : ''], ['PM extra', bonus.pm ? `+${bonus.pm} por nível` : '']], note: `Pela refeição do dia: ${names.join(', ')}.` });
    }
    return result;
  };
  wrapped.t20tkFood = true;
  proto.descanso = wrapped;
}

export function installFabricacao() {
  wrapRest();
  Hooks.on('updateWorldTime', worldTime => { sweepExpired(worldTime); });
}

