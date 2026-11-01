/**
 * Perícias e poderes da ficha para os testes montados pelo Toolkit (Engenhocas, Fabricação).
 * Campos: `system.pericias.<chave>.{label, value, pda, treinado}` e o texto dos itens `poder`.
 */
import { plainText } from './t20.js';

const localize = s => (typeof s === 'string' && globalThis.game?.i18n?.localize ? game.i18n.localize(s) : String(s ?? ''));

/** Perícias da ficha: [{ key, label, value, pda, trained }]. */
export function sheetSkills(actor) {
  return Object.entries(actor?.system?.pericias ?? {})
    .filter(([, p]) => p && typeof p === 'object')
    .map(([key, p]) => ({ key, label: localize(p.label) || key, value: Number(p.value) || 0, pda: p.pda !== false, trained: !!p.treinado }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** Poderes da ficha com o texto e se algum efeito permanente deles já soma na perícia `skill`. */
export function sheetPowers(actor, skill) {
  const touches = new RegExp(`pericias\\.(${skill}|\\*)\\.`);
  return [...(actor?.items ?? [])].filter(i => i.type === 'poder').map(i => ({
    uuid: i.id, name: i.name, description: plainText(i.system?.description?.value ?? ''),
    onSheet: [...(i.effects ?? [])].some(e => !e.flags?.tormenta20?.onuse && (e.changes ?? []).some(c => touches.test(c.key ?? '')))
  }));
}
