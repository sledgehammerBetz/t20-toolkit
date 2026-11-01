/**
 * Carteira do personagem: `system.dinheiro.{tc, tp, to, tl}` (Tormenta20 1.5.015).
 * TC = tibar de cobre (T$ 0,1), tp = T$ (tibar de prata, a moeda padrão), TO = tibar de ouro (T$ 10).
 * TL (platina) é um campo opcional do sistema sem valor definido nas regras: a carteira não conta nem mexe nele.
 *
 * Tudo é calculado em TC (inteiros), para não errar com T$ 0,5 ou T$ 16,67.
 * Pagar usa primeiro o cobre, depois a prata e por fim o ouro; o troco volta em prata e cobre.
 */

export const RATES = Object.freeze({ tc: 1, tp: 10, to: 100 });

const n = v => Math.max(0, Math.floor(Number(v) || 0));

/** Moedas da ficha (só as que a carteira usa). */
export const coinsOf = actor => {
  const d = actor?.system?.dinheiro ?? {};
  return { tc: n(d.tc), tp: n(d.tp), to: n(d.to) };
};

/** T$ (pode ter fração) → TC inteiro, arredondando para cima o que passar de um cobre. */
export const toTC = tibares => Math.ceil(Math.round((Number(tibares) || 0) * 1000) / 100);

/** Total da carteira em TC. */
export const totalTC = coins => n(coins?.tc) + n(coins?.tp) * RATES.tp + n(coins?.to) * RATES.to;

/** "T$ 16,7" (TC como T$, com até uma casa). */
export function formatTC(tc) {
  const v = (Number(tc) || 0) / 10;
  return `T$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
}

/** Moedas como texto: "2 TO, 5 T$, 3 TC". */
export function formatCoins(coins) {
  const parts = [[n(coins?.to), 'TO'], [n(coins?.tp), 'T$'], [n(coins?.tc), 'TC']].filter(([v]) => v).map(([v, k]) => `${v} ${k}`);
  return parts.length ? parts.join(', ') : 'sem dinheiro';
}

/**
 * Paga `cost` TC com as moedas `coins`. Devolve as moedas novas, ou null se não der.
 * Cobre primeiro, depois prata, depois ouro; o troco de uma moeda maior volta em prata e cobre.
 */
export function payCoins(coins, cost) {
  let tc = n(coins?.tc), tp = n(coins?.tp), to = n(coins?.to);
  let due = Math.max(0, Math.ceil(Number(cost) || 0));
  if (due > tc + tp * RATES.tp + to * RATES.to) return null;
  const fromTc = Math.min(tc, due); tc -= fromTc; due -= fromTc;
  if (due > 0) {
    const coinsTp = Math.min(tp, Math.ceil(due / RATES.tp));
    tp -= coinsTp;
    const paid = coinsTp * RATES.tp;
    if (paid >= due) { tc += paid - due; due = 0; } else due -= paid;
  }
  if (due > 0) {
    const coinsTo = Math.ceil(due / RATES.to);
    to -= coinsTo;
    const change = coinsTo * RATES.to - due;
    tp += Math.floor(change / RATES.tp);
    tc += change % RATES.tp;
    due = 0;
  }
  return { tc, tp, to };
}

/** Soma `amount` TC na carteira (o que der em T$ entra como prata, o resto como cobre). */
export function addCoins(coins, amount) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  return { tc: n(coins?.tc) + add % RATES.tp, tp: n(coins?.tp) + Math.floor(add / RATES.tp), to: n(coins?.to) };
}

/** A ficha tem `cost` TC? */
export const canAfford = (actor, cost) => totalTC(coinsOf(actor)) >= Math.ceil(Number(cost) || 0);

const coinUpdate = coins => ({ 'system.dinheiro.tc': coins.tc, 'system.dinheiro.tp': coins.tp, 'system.dinheiro.to': coins.to });

/** Desconta `cost` TC da ficha. Devolve as moedas novas, ou null (sem gravar) se faltar dinheiro. */
export async function pay(actor, cost) {
  const next = payCoins(coinsOf(actor), cost);
  if (!next) return null;
  if (Math.ceil(Number(cost) || 0) > 0) await actor.update(coinUpdate(next));
  return next;
}

/** Credita `amount` TC na ficha. */
export async function receive(actor, amount) {
  const next = addCoins(coinsOf(actor), amount);
  await actor.update(coinUpdate(next));
  return next;
}
