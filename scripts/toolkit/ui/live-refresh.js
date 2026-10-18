/**
 * Redesenho das janelas do Toolkit quando a ficha muda.
 * - junta rajadas de mudanças num redesenho só (e cancela o pendente quando a janela já se redesenhou);
 * - ignora mudanças que a janela não mostra (ex.: PV e PM no combate);
 * - pausa durante ações em lote (criação, subir nível) e redesenha uma vez no fim.
 */
const DEFAULT_HOOKS = Object.freeze(['createItem', 'deleteItem', 'updateItem', 'updateActor']);
/** PV e PM mudam o tempo todo no combate; as janelas que não mostram esses valores não precisam redesenhar. */
export const COMBAT_PATHS = Object.freeze(['system.attributes.pv', 'system.attributes.pm']);

const flatten = obj => globalThis.foundry?.utils?.flattenObject?.(obj) ?? obj;

/** A mudança só mexe em caminhos ignorados? Exportada para testes. */
export function onlyIgnored(changed, ignore) {
  const keys = Object.keys(flatten(changed ?? {})).filter(k => k !== '_id' && !k.startsWith('_stats'));
  return keys.every(k => ignore.some(p => k === p || k.startsWith(`${p}.`)));
}

/**
 * Liga os hooks da janela (guardados em app._hooks, que o _onClose de cada janela já desliga).
 * @param {object} app  janela com `actor`, `rendered`, `render()` e `_hooks`
 * @param {object} o  { hooks, ignore: caminhos que não pedem redesenho, skip(hook, doc, changed): true para ignorar, wait: ms }
 */
export function watchActor(app, { hooks = DEFAULT_HOOKS, ignore = [], skip = null, wait = 80 } = {}) {
  let timer = null;
  const render = app.render;
  // Um redesenho feito pela própria janela cancela o que estava esperando.
  app.render = function (...args) { clearTimeout(timer); timer = null; return render.apply(this, args); };
  app._t20Refresh = () => {
    if (app._t20Busy) { app._t20Dirty = true; return; }
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; if (app.rendered) app.render(); }, wait);
  };
  for (const hook of hooks) {
    const id = Hooks.on(hook, (doc, changed) => {
      const actor = app.actor;
      if (!actor || (doc !== actor && doc?.parent !== actor)) return;
      if (skip?.(hook, doc, changed)) return;
      if (hook.startsWith('update') && ignore.length && onlyIgnored(changed, ignore)) return;
      app._t20Refresh();
    });
    app._hooks.push([hook, id]);
  }
}

/** Roda uma ação que grava várias vezes sem redesenhar a cada gravação; redesenha uma vez no fim, se algo mudou. */
export async function batch(app, fn) {
  app._t20Busy = (app._t20Busy ?? 0) + 1;
  try { return await fn(); }
  finally {
    app._t20Busy--;
    if (!app._t20Busy && app._t20Dirty) {
      app._t20Dirty = false;
      app._t20Refresh?.();
    }
  }
}
