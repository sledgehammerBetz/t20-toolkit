/**
 * Rascunho do Planejador (flags['t20-toolkit'].plan) com resposta imediata.
 * Cada clique entra numa fila local e a janela redesenha na hora com o rascunho aplicado; a gravação vai depois,
 * juntando os cliques próximos numa só, com { render: false } para não redesenhar a ficha dos outros conectados.
 * Quem lê o plano (readCreation, o Planejador) usa planFlag(), que já inclui o que ainda não chegou ao servidor.
 */
import { MODULE_ID } from '../../constants.js';

export const PLAN_PREFIX = `flags.${MODULE_ID}.plan.`;
const WAIT = 350;

/** actor.uuid → { queue: [patch, …] (aplicados em ordem), timer, sending: Promise|null } */
const drafts = new Map();

const bare = key => key.replace(/(^|\.)-=/g, '$1');
const related = (a, b) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
/** Dois patches mexem no mesmo lugar? (aí não dá para juntar numa gravação só). Exportada para testes. */
export function conflicts(a, b) {
  const kb = Object.keys(b).map(bare);
  return Object.keys(a).map(bare).some(x => kb.some(y => related(x, y)));
}

/** Junta os patches em gravações: consecutivos sem conflito viram um só. Exportada para testes. */
export function groupPatches(queue) {
  const out = [];
  for (const p of queue) {
    const last = out[out.length - 1];
    if (last && !conflicts(last, p)) Object.assign(last, p);
    else out.push({ ...p });
  }
  return out;
}

function applyPatch(plan, patch) {
  const { expandObject, mergeObject } = foundry.utils;
  const rel = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k.slice(PLAN_PREFIX.length), v]));
  return mergeObject(plan, expandObject(rel), { performDeletions: true, inplace: true });
}

/** O plano do ator com o rascunho que ainda não foi gravado. */
export function planFlag(actor) {
  const saved = actor?.getFlag?.(MODULE_ID, 'plan') ?? {};
  const d = actor?.uuid ? drafts.get(actor.uuid) : null;
  if (!d?.queue.length) return saved;
  const plan = foundry.utils.deepClone(saved);
  for (const p of d.queue) applyPatch(plan, p);
  return plan;
}

async function send(actor, d) {
  clearTimeout(d.timer);
  d.timer = null;
  while (d.sending) await d.sending.catch(() => null);
  const batch = d.queue.slice();
  if (!batch.length) return;
  d.sending = (async () => {
    try {
      for (const update of groupPatches(batch)) await actor.update(update, { render: false, t20tkDraft: true });
    } catch (error) {
      console.error('[T20 Toolkit] Planejador: não foi possível salvar o plano:', error);
      ui.notifications?.error?.('T20 Toolkit: o plano não foi salvo. Confira a conexão e tente de novo.');
    } finally {
      d.queue.splice(0, batch.length);
      d.sending = null;
    }
  })();
  await d.sending;
}

/**
 * Registra um patch do plano (chaves completas, começando por flags.t20-toolkit.plan.) e redesenha a janela já.
 * Devolve logo; a gravação acontece depois (use flushDraft para esperar).
 */
export function draftUpdate(app, patch) {
  const actor = app.actor;
  if (!actor?.uuid) return Promise.resolve();
  let d = drafts.get(actor.uuid);
  if (!d) drafts.set(actor.uuid, d = { queue: [], timer: null, sending: null, actor });
  d.queue.push(patch);
  clearTimeout(d.timer);
  d.timer = setTimeout(() => send(actor, d), WAIT);
  if (app._t20Refresh) app._t20Refresh(0); else app.render?.();
  return Promise.resolve();
}

/** Grava agora o que estiver pendente (antes de aplicar um nível, ao fechar a janela…). */
export async function flushDraft(actor) {
  const d = actor?.uuid ? drafts.get(actor.uuid) : null;
  if (!d) return;
  while (d.queue.length || d.sending) await send(actor, d);
}

/** Hook do próprio rascunho voltando do servidor: a janela já mostrou a mudança. */
export const isOwnDraft = (options, userId) => !!options?.t20tkDraft && userId === globalThis.game?.user?.id;
