/** Leitura do estado do Grimório na ficha, sem carregar a janela (usada pela guarda de conjuração e pela API). */
import { MODULE_ID } from '../../constants.js';
import { arcanistPaths } from '../core/t20.js';

export function readGrimorio(actor) {
  return actor?.getFlag?.(MODULE_ID, 'grimorio') ?? {};
}

export function isMago(actor) {
  return arcanistPaths(actor).includes('mago');
}
