/**
 * Índice de magias de todos os compêndios de Item do mundo (sistema + módulos).
 * Usa pack.getIndex com campos extras: não carrega documentos inteiros.
 */
import { fold, spellCircle } from './t20.js';

const INDEX_FIELDS = [
  'system.circulo', 'system.tipo', 'system.escola', 'system.source',
  'system.ativacao.custo', 'system.ativacao.execucao', 'system.alcance', 'system.duracao', 'system.resistencia.txt'
];

let cache = null;

/** Converte uma entrada de índice em um registro simples. Exportada para testes. */
export function toSpellRecord(entry, pack) {
  const s = entry.system ?? {};
  return Object.freeze({
    uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`,
    id: entry._id,
    name: entry.name,
    key: fold(entry.name),
    img: entry.img,
    circle: spellCircle(entry),
    type: s.tipo ?? null,
    school: s.escola ?? null,
    cost: Number(s.ativacao?.custo) || null,
    execution: s.ativacao?.execucao ?? null,
    range: s.alcance ?? null,
    duration: s.duracao?.special || [s.duracao?.value, s.duracao?.units].filter(Boolean).join(' ') || null,
    durationUnits: s.duracao?.units ?? null,
    resistance: s.resistencia?.txt || null,
    book: s.source ?? '',
    packId: pack.collection,
    packLabel: pack.metadata?.label ?? pack.title ?? pack.collection
  });
}

/** Lista os compêndios de Item que podem conter magias. */
export function spellPacks(gameRef = globalThis.game) {
  return [...(gameRef?.packs ?? [])].filter(p => p.documentName === 'Item' && (!p.metadata?.system || p.metadata.system === 'tormenta20'));
}

export async function getSpellIndex({ refresh = false, gameRef = globalThis.game } = {}) {
  if (cache && !refresh) return cache;
  const spells = [];
  const packs = [];
  const errors = [];
  for (const pack of spellPacks(gameRef)) {
    try {
      const index = await pack.getIndex({ fields: INDEX_FIELDS });
      let count = 0;
      for (const entry of index) {
        if (entry.type !== 'magia') continue;
        spells.push(toSpellRecord(entry, pack));
        count++;
      }
      if (count) packs.push({ id: pack.collection, label: pack.metadata?.label ?? pack.collection, count });
    } catch (error) {
      console.warn(`[T20 Toolkit] Não foi possível ler o compêndio ${pack.collection}:`, error);
      errors.push({ id: pack.collection, message: String(error?.message ?? error) });
    }
  }
  spells.sort((a, b) => (a.circle ?? 9) - (b.circle ?? 9) || a.name.localeCompare(b.name, 'pt-BR'));
  cache = Object.freeze({ spells: Object.freeze(spells), packs: Object.freeze(packs), errors: Object.freeze(errors), builtAt: Date.now() });
  return cache;
}

export function invalidateSpellIndex() { cache = null; }

let powerCache = null;

/** Índice dos poderes concedidos (tipo "concedido") de todos os compêndios de Item. */
export async function getGrantedPowerIndex({ refresh = false, gameRef = globalThis.game } = {}) {
  if (powerCache && !refresh) return powerCache;
  const out = [];
  for (const pack of spellPacks(gameRef)) {
    try {
      const index = await pack.getIndex({ fields: ['system.tipo', 'system.subtipo', 'system.description.value'] });
      for (const e of index) {
        if (e.type !== 'poder' || e.system?.tipo !== 'concedido') continue;
        out.push(Object.freeze({ uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`, name: e.name, key: fold(e.name), img: e.img, description: e.system?.description?.value ?? '', packLabel: pack.metadata?.label ?? pack.collection }));
      }
    } catch (error) {
      console.warn(`[T20 Toolkit] Não foi possível ler poderes de ${pack.collection}:`, error);
    }
  }
  powerCache = Object.freeze(out);
  return powerCache;
}

let plannerCache = null;

/** Poderes (classe, geral, habilidade de classe), classes, raças e equipamento de todos os compêndios (equipamento do sistema primeiro). */
export async function getPlannerIndex({ refresh = false, gameRef = globalThis.game } = {}) {
  if (plannerCache && !refresh) return plannerCache;
  const powers = [];
  const classes = [];
  const races = [];
  const gear = [];
  for (const pack of spellPacks(gameRef)) {
    try {
      const index = await pack.getIndex({ fields: ['system.tipo', 'system.subtipo', 'system.description.value', 'system.pvPorNivel', 'system.pmPorNivel', 'system.pericias', 'system.atributos', 'system.atributosDinamicos', 'system.grants', 'system.proficiencia', 'system.proposito'] });
      const label = pack.metadata?.label ?? pack.collection;
      for (const e of index) {
        const uuid = e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`;
        if (e.type === 'classe') classes.push(Object.freeze({ uuid, name: e.name, key: fold(e.name), img: e.img, packLabel: label, pv: e.system?.pvPorNivel, pm: e.system?.pmPorNivel, skills: e.system?.pericias ?? null }));
        else if (e.type === 'race') races.push(Object.freeze({ uuid, name: e.name, key: fold(e.name), img: e.img, packLabel: label, atributos: e.system?.atributos ?? {}, dynamic: [...(e.system?.atributosDinamicos?.value ?? [])], dynamicText: e.system?.atributosDinamicos?.description ?? '', core: pack.collection.startsWith('tormenta20.'), grants: (e.system?.grants ?? []).flatMap(g => (g.choices ?? []).map(c => c.uuid)) }));
        else if (['arma', 'equipamento', 'tesouro', 'consumivel'].includes(e.type)) gear.push(Object.freeze({ uuid, name: e.name, key: fold(e.name), img: e.img, packLabel: label, pack: pack.collection, core: pack.collection.startsWith('tormenta20.'), type: e.type, prof: e.system?.proficiencia ?? null, proposito: e.system?.proposito ?? null }));
        else if (e.type === 'poder' && ['classe', 'geral', 'ability', 'origem', 'concedido', 'complicacao', 'distincao', 'racial'].includes(e.system?.tipo)) {
          powers.push(Object.freeze({ uuid, name: e.name, key: fold(e.name), img: e.img, packLabel: label, tipo: e.system.tipo, subtipo: fold(e.system?.subtipo ?? ''), description: e.system?.description?.value ?? '' }));
        }
      }
    } catch (error) {
      console.warn(`[T20 Toolkit] Planejador: não foi possível ler ${pack.collection}:`, error);
    }
  }
  powers.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  classes.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  races.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  gear.sort((a, b) => (b.core - a.core) || a.name.localeCompare(b.name, 'pt-BR'));
  plannerCache = Object.freeze({ powers: Object.freeze(powers), classes: Object.freeze(classes), races: Object.freeze(races), gear: Object.freeze(gear) });
  return plannerCache;
}
