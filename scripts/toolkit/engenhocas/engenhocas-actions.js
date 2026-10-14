/**
 * Engenhocas — ações no Foundry: fabricar, ativar, consertar, novo dia, aparatos.
 * Ativação: monta uma magia temporária a partir do retrato salvo na engenhoca, abre o diálogo
 * de aprimoramentos do sistema (AbilityUseDialog), rola Ofício (engenhoqueiro) contra a CD e,
 * se passar, executa o efeito como o item.roll() do sistema faz (ataque, fórmula, dano, área, cartão).
 */
import { escapeHtml, actorClasses } from '../core/t20.js';
import { chatCard, chatFlavor, postCard } from '../ui/chat.js';
import {
  FLAG_SCOPE, FLAG_KEY, SKILL_KEY, APARATO_BY_ID, isEngenhoca, engenhocaState, engenhocaFlags, inventorContext,
  activationDC, activationBonus, activationCost, resistanceBonus, outcomePatch, NEW_DAY_PATCH, aparatoBlocker, buildEngenhocaItem, craftCheck
} from './engenhocas-rules.js';

const DialogV2 = () => foundry.applications.api.DialogV2;

/* ---------- leitura da ficha ---------- */

export function actorInventor(actor) {
  const skill = actor?.system?.pericias?.[SKILL_KEY];
  return inventorContext({
    classes: actorClasses(actor),
    powerNames: [...(actor?.items ?? [])].filter(i => i.type === 'poder').map(i => i.name),
    int: Number(actor?.system?.atributos?.int?.value) || 0,
    maxPV: Number(actor?.system?.attributes?.pv?.max) || 0,
    pda: Number(actor?.system?.attributes?.defesa?.pda) || 0,
    skillTrained: !!skill?.treinado
  });
}

export const actorEngenhocas = actor => [...(actor?.items ?? [])].filter(isEngenhoca).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

const money = actor => Number(actor?.system?.dinheiro?.tp) || 0;
const pmNow = actor => (Number(actor?.system?.attributes?.pm?.value) || 0) + (Number(actor?.system?.attributes?.pm?.temp) || 0);

/** Atualiza campos da flag da engenhoca. `unset` remove chaves (ex.: 'aparatoGroups.comutador'). */
async function patchFlags(item, patch, unset = []) {
  const base = `flags.${FLAG_SCOPE}.${FLAG_KEY}`;
  const upd = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${base}.${k}`, v]));
  for (const path of unset) upd[`${base}.${path.replace(/([^.]+)$/, '-=$1')}`] = null;
  return item.update(upd);
}

async function rollSkill(actor, bonus = 0) {
  const skill = actor.system?.pericias?.[SKILL_KEY];
  const value = Number(skill?.value) || 0;
  const roll = new Roll(`1d20 + ${value}${bonus ? ` + ${bonus}` : ''}`);
  await roll.evaluate();
  return roll;
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
    const r = await rollSkill(actor);
    const ok = r.total >= check.dc;
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: chatFlavor({ tool: 'engenhocas', title: `Fabricar ${finalName}`, result: `Ofício (engenhoqueiro) contra CD ${check.dc}: ${ok ? 'sucesso' : 'falha'}`, tone: ok ? 'success' : 'error' }) });
    if (!ok) {
      await postCard(actor, { tool: 'engenhocas', tone: 'error', title: 'Fabricação falhou', subtitle: finalName, rows: [['Teste', `${r.total} contra CD ${check.dc}`]], note: 'Nada foi descontado. Confira com o mestre se houve perda de material.' });
      return null;
    }
  }

  const data = buildEngenhocaItem({ spell: { name: spell.name, img: spell.img, uuid: spell.uuid, system: spell.toObject().system, effects: spell.toObject().effects, flags: spell.toObject().flags }, name: finalName, mode, makerMaxPV: inv.maxPV, manutencao: inv.manutencao, inventorLevel: inv.level, price: check.price, userId: game.user.id });
  const [created] = await actor.createEmbeddedDocuments('Item', [data]);
  if (pay && check.price) await actor.update({ 'system.dinheiro.tp': money(actor) - check.price });
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
  data.system.resistencia ??= {};
  if (data.system.resistencia.txt) {
    data.system.resistencia.atributo = 'int'; // atributo-chave Inteligência
    data.system.resistencia.bonus = (Number(data.system.resistencia.bonus) || 0) + resBonus;
  }
  for (const e of data.effects) delete e._id;
  return new CONFIG.Item.documentClass(data, { parent: actor });
}

async function snapshotFromSource(item, st) {
  if (st.snapshot) return st;
  const src = st.sourceUuid ? await fromUuid(st.sourceUuid) : null;
  if (!src) return null;
  const o = src.toObject();
  return { ...st, snapshot: { name: o.name, img: o.img, system: o.system, effects: o.effects, flags: o.flags } };
}

/** Diálogo com a CD aberta e as opções da ativação. Devolve as escolhas ou null. */
async function confirmActivation(actor, item, st, inv, upgradePM) {
  const has = id => st.aparatos.includes(id);
  const options = [
    has('sistema-refrigeracao') && !st.refrigerationUsedToday ? ['refrigeration', 'Sistema de Refrigeração: −5 na CD por 1 PM (ação completa, 1× por dia)'] : null,
    inv.calibrar ? ['calibrar', 'Forçar a Calibragem: −5 no teste, +2 na CD para resistir'] : null,
    inv.potente ? ['potente', 'Invenção Potente: +1 PM, +2 na CD para resistir'] : null,
    inv.rapida ? ['rapida', 'Ativação Rápida: +2 PM, ativa com ação de movimento'] : null
  ].filter(Boolean);
  const calc = form => {
    const field = n => form?.querySelector?.(`[name="${n}"]`);
    const o = Object.fromEntries(options.map(([k]) => [k, !!field(k)?.checked]));
    const extra = Number(field('extra')?.value) || 0;
    const dc = activationDC(st, { upgradePM, personalizado: inv.personalizado, refrigeration: o.refrigeration });
    const bonus = activationBonus({ pda: inv.pda, giroscopio: has('giroscopio'), calibrar: o.calibrar, extra });
    const cost = activationCost({ upgradePM, comutador: has('comutador'), refrigeration: o.refrigeration, rapida: o.rapida, potente: o.potente });
    return { o, extra, dc, bonus, cost };
  };
  const summary = c => `<p><b>CD ${c.dc.dc}</b> = ${c.dc.parts.map(([k, v], i) => `${i ? (v >= 0 ? ' + ' : ' − ') : ''}${Math.abs(v)} <small>(${escapeHtml(k.toLowerCase())})</small>`).join('')}</p>
    <p>Teste: Ofício (engenhoqueiro) ${Number(actor.system?.pericias?.[SKILL_KEY]?.value) >= 0 ? '+' : ''}${Number(actor.system?.pericias?.[SKILL_KEY]?.value) || 0}${c.bonus.bonus ? ` ${c.bonus.bonus >= 0 ? '+' : '−'} ${Math.abs(c.bonus.bonus)} (${c.bonus.parts.map(p => p[0]).join(', ')})` : ''} · PM: <b>${c.cost.total}</b> (você tem ${pmNow(actor)})</p>`;
  const content = `<div class="t20tk-eng-confirm">
    <div data-region="sum">${summary(calc(null))}</div>
    ${options.map(([k, label]) => `<label class="t20tk-bz-check"><input type="checkbox" name="${k}"> ${escapeHtml(label)}</label>`).join('')}
    <label class="t20tk-pl-field">Ajuste no teste (bônus ou penalidade de outras fontes) <input type="number" name="extra" value="0" step="1"></label>
    ${st.mode === 'hand' ? '<p class="t20tk-bz-note">Engenhoca empunhada: precisa de uma mão livre.</p>' : ''}
  </div>`;
  return DialogV2().wait({
    window: { title: `Ativar ${item.name}` },
    content,
    rejectClose: false,
    buttons: [
      { action: 'go', label: 'Rolar ativação', default: true, callback: (event, button, dialog) => calc(dialog.element.querySelector('.t20tk-eng-confirm')) },
      { action: 'cancel', label: 'Cancelar', callback: () => null }
    ],
    render: (event, dialog) => {
      const box = dialog.element.querySelector('.t20tk-eng-confirm');
      const update = () => { box.querySelector('[data-region="sum"]').innerHTML = summary(calc(box)); };
      box?.addEventListener('change', update);
      box?.addEventListener('input', update);
    }
  });
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
  st = await snapshotFromSource(item, st);
  if (!st) return ui.notifications.error(`Não encontrei a magia de "${item.name}". Fabrique de novo pela Oficina.`);
  if (!actor.system?.pericias?.[SKILL_KEY]) return ui.notifications.error('A ficha não tem Ofício (engenhoqueiro).');
  const inv = actorInventor(actor);
  const AbilityUseDialog = game.tormenta20?.applications?.AbilityUseDialog;
  if (!AbilityUseDialog) return ui.notifications.error('O diálogo de aprimoramentos do Tormenta20 não está disponível.');

  // 1) aprimoramentos (diálogo do sistema)
  let preview = buildPreview(actor, item, st, 0);
  preview.prepareFinalAttributes?.();
  const configuration = await AbilityUseDialog.create(preview);
  if (!configuration) return null;
  if (configuration.brew) return ui.notifications.warn('Engenhocas não fabricam poções: use o botão de usar.');
  const upgradePM = Math.max(0, Number(preview.system?.ativacao?.custo) || 0);
  if (upgradePM > inv.int) return ui.notifications.warn(`Aprimoramentos custam ${upgradePM} PM, mas o limite da engenhoca é ${inv.int} PM (Inteligência).`);

  // 2) CD, opções e custo
  const choice = await confirmActivation(actor, item, st, inv, upgradePM);
  if (!choice) return null;
  const { o, dc, bonus, cost } = choice;
  if (cost.total > pmNow(actor)) return ui.notifications.warn(`PM insuficientes: a ativação custa ${cost.total} PM.`);
  const resBonus = resistanceBonus({ estabilizador: st.aparatos.includes('estabilizador'), calibrar: o.calibrar, potente: o.potente });
  if (resBonus && preview.system.resistencia?.txt) {
    preview.system.resistencia.bonus = (Number(preview.system.resistencia.bonus) || 0) + resBonus;
    preview.prepareFinalAttributes?.();
  }
  preview.system.ativacao.custo = cost.upgrades;

  // 3) teste
  let roll = await rollSkill(actor, bonus.bonus);
  let success = roll.total >= dc.dc;
  const natural = roll.dice?.[0]?.total;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: chatFlavor({ tool: 'engenhocas', title: item.name, result: `Ofício (engenhoqueiro) contra CD ${dc.dc}: ${success ? 'ativou' : 'falhou'}`, tone: success ? 'success' : 'error' }) });
  if (cost.total) await actor.spendMana(cost.total, 0, false);

  if (!success && inv.chutes && pmNow(actor) >= 1) {
    const again = await DialogV2().confirm({ window: { title: 'Chutes e Palavrões' }, content: `<p>Falhou (${roll.total} contra CD ${dc.dc}). Pagar 1 PM para repetir o teste?</p>`, rejectClose: false });
    if (again) {
      await actor.spendMana(1, 0, false);
      roll = await rollSkill(actor, bonus.bonus);
      success = roll.total >= dc.dc;
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: chatFlavor({ tool: 'engenhocas', title: `${item.name} — de novo`, result: `CD ${dc.dc}: ${success ? 'ativou' : 'falhou'}`, tone: success ? 'success' : 'error' }) });
    }
  }

  let supressor = false;
  if (!success && st.aparatos.includes('supressor-seguranca') && !st.supressorScene) {
    supressor = !!(await DialogV2().confirm({ window: { title: 'Supressor de Segurança' }, content: '<p>Usar o Supressor de Segurança (1× por cena)? A falha não enguiça a engenhoca nem aumenta a próxima CD.</p>', rejectClose: false }));
  }
  await patchFlags(item, outcomePatch(st, { success, supressor, sceneId: 'cena', refrigeration: o.refrigeration }));

  if (!success) {
    const explode = inv.goblinoide && (roll.total <= dc.dc - 5 || natural === 1);
    await postCard(actor, {
      tool: 'engenhocas', tone: 'error', title: supressor ? 'Falhou, mas o Supressor segurou' : 'A engenhoca enguiçou', subtitle: item.name,
      rows: [['Teste', `${roll.total} contra CD ${dc.dc}`], ['PM gastos', String(cost.total)]],
      note: supressor ? 'A engenhoca continua funcionando e a próxima CD não aumenta.' : `Consertar leva 1 hora de trabalho.${explode ? ` Engenhocaria Goblinoide: a engenhoca explode! ${2 * st.circle}d6 de impacto em você e em todos a até 3m (Reflexos reduz à metade).` : ''}`
    });
    return { success: false };
  }

  const notes = [];
  if (resBonus) notes.push(`CD para resistir +${resBonus} (já no cartão).`);
  if (o.rapida) notes.push('Ativada com ação de movimento (Ativação Rápida).');
  if (st.aparatos.includes('gatilho-corda')) notes.push('Gatilho de Corda: pode ativar com ação de movimento; depois, ação completa para dar corda.');
  await runEffect(preview, configuration, cost.upgrades);
  if (notes.length) await postCard(actor, { tool: 'engenhocas', tone: 'success', title: 'Engenhoca ativada', subtitle: item.name, note: notes.join(' ') });
  return { success: true };
}

/* ---------- manutenção ---------- */

export async function repairEngenhoca(item) {
  await patchFlags(item, { jammed: false, lastResult: 'repaired' });
  await postCard(item.actor, { tool: 'engenhocas', tone: 'success', title: 'Engenhoca consertada', subtitle: item.name, note: '1 hora de trabalho.' });
}

export async function newDay(actor) {
  for (const item of actorEngenhocas(actor)) await patchFlags(item, NEW_DAY_PATCH);
  await postCard(actor, { tool: 'engenhocas', title: 'Novo dia', subtitle: actor.name, note: 'As CDs de ativação voltaram ao normal. Engenhocas enguiçadas continuam enguiçadas até o conserto.' });
}

export async function newScene(actor) {
  for (const item of actorEngenhocas(actor)) await patchFlags(item, { supressorScene: null });
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
  for (const t of targets) {
    const st = engenhocaState(t);
    await patchFlags(t, { aparatos: [...st.aparatos, type], ...(group ? { aparatoGroups: { ...st.groups, [type]: group } } : {}) });
  }
  if (pay && def.price) await actor.update({ 'system.dinheiro.tp': money(actor) - def.price });
  await postCard(actor, { tool: 'engenhocas', tone: 'success', title: `${def.label} instalado`, subtitle: actor.name, rows: [['Preço', pay ? `T$ ${def.price}` : 'não descontado']], items: targets.map(t => ({ name: t.name, img: t.img })), note: def.text });
}

export async function removeAparato(actor, item, type) {
  const st = engenhocaState(item);
  const group = st.groups?.[type];
  const linked = group ? actorEngenhocas(actor).filter(e => engenhocaState(e).groups?.[type] === group) : [item];
  for (const t of linked) {
    const s = engenhocaState(t);
    const i = s.aparatos.indexOf(type);
    await patchFlags(t, { aparatos: s.aparatos.filter((_, k) => k !== i) }, s.groups?.[type] ? [`aparatoGroups.${type}`] : []);
  }
}

export { isEngenhoca, engenhocaState, chatCard };
