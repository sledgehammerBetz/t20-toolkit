/**
 * Bateria de testes do T20 Toolkit, registrada no Quench.
 * Rodar: abrir o mundo de teste, clicar no frasco do Quench (barra de controles) ou, no console,
 * `game.t20ToolkitTests.run()` (devolve o resumo; `run(['t20-toolkit.engenhocas'])` roda uma bateria).
 */
import { buscadorBatch } from './batches/buscador.js';
import { grimorioBatch } from './batches/grimorio.js';
import { engenhocasBatch } from './batches/engenhocas.js';
import { planejadorBatch } from './batches/planejador.js';
import { cleanup } from './helpers.js';

const BATCHES = [
  ['t20-toolkit.buscador', 'T20 Toolkit: Buscador de Magias', buscadorBatch],
  ['t20-toolkit.grimorio', 'T20 Toolkit: Grimório', grimorioBatch],
  ['t20-toolkit.engenhocas', 'T20 Toolkit: Engenhocas', engenhocasBatch],
  ['t20-toolkit.planejador', 'T20 Toolkit: Planejador', planejadorBatch]
];

Hooks.on('quenchReady', quench => {
  for (const [key, displayName, fn] of BATCHES) quench.registerBatch(key, fn, { displayName });
});

/** Roda pelo console e devolve { passes, failures, pending, falhas: [{ teste, erro }] }. */
async function run(keys = BATCHES.map(b => b[0])) {
  // O relatório do Quench precisa da janela de resultados aberta.
  if (!quench.app.rendered) await quench.app.render(true);
  const runner = await quench.runBatches(keys, { updateSnapshots: false });
  await new Promise(resolve => runner.once('end', resolve));
  const falhas = [];
  runner.suite.eachTest?.(t => { if (t.state === 'failed') falhas.push({ teste: t.fullTitle(), erro: t.err?.message }); });
  const { passes, failures, pending } = runner.stats ?? {};
  return { passes, failures, pending, falhas };
}

Hooks.once('ready', () => {
  if (game.world.id !== 't20-testes') ui.notifications.warn('T20 Toolkit — Testes: este módulo cria e apaga personagens. Use só no mundo de teste.');
  game.t20ToolkitTests = Object.freeze({ run, cleanup });
});
