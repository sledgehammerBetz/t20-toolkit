/**
 * Planejador: poderes de outra classe (Alma Livre, Diferentão, Cavaleiro Sagrado, poderes de vassalo...).
 * Regras em core/class-levels.js. Aqui: vagas extras, listas de poderes e a marca `via` ao aplicar.
 */
import { MODULE_ID } from '../../constants.js';
import { fold } from '../core/t20.js';
import { CROSS_CLASS_SOURCES, sourceAccepts, overlayClassLevel, baseClassKey } from '../core/class-levels.js';
import { gainsAt } from './planner-rules.js';

export const ALMA_LIVRE = 'alma livre';
export const almaLivre = CROSS_CLASS_SOURCES[ALMA_LIVRE];

/** Classe escolhida na Alma Livre (flag do personagem). */
export const almaLivreClass = actor => fold(actor?.getFlag?.(MODULE_ID, 'almaLivreClass') ?? '');

const viaId = key => `via-${key.replace(/[^a-z0-9]+/g, '-')}`;

function classesLabel(def) {
  if (def.classes === 'other') return 'outra classe';
  const names = def.classes.join(' ou ');
  return def.general ? `${names} ou geral` : names;
}

/**
 * Vagas extras do nível: cada fonte ganha neste nível (habilidade da classe ou poder escolhido aqui) que
 * dá "um poder de outra classe" abre uma vaga `via-<fonte>`.
 */
export function viaSlots(app, level, row, entry) {
  if (!row?.cls) return [];
  const keys = [];
  for (const g of gainsAt(row.cls, row.classLevel).gains) {
    if (g.kind === 'ability') keys.push(fold(g.item));
    if ((g.kind === 'power' || g.kind === 'path') && entry?.picks?.[g.id]) keys.push(app.index.powerByUuid.get(entry.picks[g.id])?.key);
  }
  return [...new Set(keys.filter(Boolean))].map(k => [k, CROSS_CLASS_SOURCES[k]]).filter(([, def]) => def?.grant)
    .map(([key, def]) => ({ id: viaId(key), kind: 'power', via: key, def, label: `Poder de ${classesLabel(def)} (${def.name})` }));
}

/** A vaga é de uma fonte de outra classe? */
export const isViaGain = id => String(id ?? '').startsWith('via-');

/** Poderes que a fonte permite, para quem tem as classes `ctx.ownClasses`. */
export function viaPool(app, def, ctx) {
  const opts = { own: ctx.ownClasses ?? [], chosen: def === almaLivre ? almaLivreClass(app.actor) : '' };
  return app.index.powers.filter(p => (p.tipo === 'classe' && sourceAccepts(def, p.subtipo, opts)) || (def.general && p.tipo === 'geral'));
}

/** Contexto de pré-requisitos do poder `p` escolhido pela fonte: o nível na classe do poder é o efetivo. */
export const viaCtx = (ctx, def, p) => (def && p?.tipo === 'classe' ? overlayClassLevel(ctx, def, p.subtipo) : ctx);

/**
 * Alma Livre: nas vagas de poder de classe, os poderes da classe escolhida também entram.
 * Vale se o personagem tem Alma Livre na ficha ou planejada antes deste nível.
 */
export function almaLivreOptions(app, ctx, slotClass) {
  if (!ctx.powers.has(ALMA_LIVRE)) return { cls: '', options: [] };
  const cls = almaLivreClass(app.actor);
  if (!cls || cls === baseClassKey(slotClass)) return { cls, options: [] };
  return { cls, options: app.index.powers.filter(p => p.tipo === 'classe' && fold(p.subtipo) === cls) };
}

/** Poder de vaga normal que veio pela Alma Livre (é da classe escolhida, não da classe da vaga). */
export function isAlmaLivrePick(app, ctx, p, slotClass) {
  const cls = almaLivreClass(app.actor);
  return !!cls && ctx.powers.has(ALMA_LIVRE) && p?.tipo === 'classe' && fold(p.subtipo) === cls && cls !== baseClassKey(slotClass);
}

/** Contexto certo para mostrar/avaliar um poder numa vaga (fonte, Alma Livre ou normal). */
export function slotCtx(app, ctx, p, { via = null, slotClass = '' } = {}) {
  if (via) return viaCtx(ctx, CROSS_CLASS_SOURCES[via], p);
  if (isAlmaLivrePick(app, ctx, p, slotClass)) return viaCtx(ctx, almaLivre, p);
  return ctx;
}

/** Fontes na ficha que dão um poder de outra classe (para a página de ganhos extras). */
export function sheetGrantSources(actor) {
  const keys = new Set([...(actor?.items ?? [])].filter(i => i.type === 'poder').map(i => fold(i.name)));
  return Object.entries(CROSS_CLASS_SOURCES).filter(([k, def]) => def.grant && keys.has(k)).map(([key, def]) => ({ key, def }));
}

/** Marca gravada no poder ganho por uma fonte. */
export const viaFlag = (def, p) => ({ source: def.name, cls: fold(p?.subtipo ?? '') });
