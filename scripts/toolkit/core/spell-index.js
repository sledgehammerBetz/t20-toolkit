/**
 * Índices dos compêndios de Item do mundo (sistema + módulos): magias, poderes concedidos e Planejador.
 * Um único pedido por compêndio, com todos os campos que os três usam, feito em paralelo e uma vez por sessão
 * (pedidos com campos diferentes fariam o Foundry baixar o compêndio inteiro de novo). Os compêndios trancados
 * do sistema e dos módulos ficam guardados no navegador entre sessões (pack-cache.js).
 */
import { fold, spellCircle } from './t20.js';
import { readPack, writePack } from './pack-cache.js';

const SPELL_FIELDS = [
  'system.circulo', 'system.tipo', 'system.escola', 'system.source',
  'system.ativacao.custo', 'system.ativacao.execucao', 'system.alcance', 'system.duracao', 'system.resistencia.txt'
];
const PLANNER_FIELDS = ['system.subtipo', 'system.description.value', 'system.pvPorNivel', 'system.pmPorNivel', 'system.pericias', 'system.atributos', 'system.atributosDinamicos', 'system.grants', 'system.proficiencia', 'system.proposito'];
export const INDEX_FIELDS = Object.freeze([...new Set([...SPELL_FIELDS, ...PLANNER_FIELDS])]);

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

let shared = null;

/** Índice comum: [{ pack, entries, error? }], um por compêndio. Chamadas simultâneas esperam o mesmo pedido. */
export function getCompendiumIndex({ refresh = false, gameRef = globalThis.game } = {}) {
  if (shared && !refresh) return shared;
  shared = Promise.all(spellPacks(gameRef).map(async pack => {
    if (!refresh) {
      const hit = await readPack('index', pack, gameRef);
      if (hit) return { pack, entries: hit };
    }
    try {
      const entries = [...await pack.getIndex({ fields: INDEX_FIELDS })];
      writePack('index', pack, entries, gameRef);
      return { pack, entries };
    } catch (error) {
      console.warn(`[T20 Toolkit] Não foi possível ler o compêndio ${pack.collection}:`, error);
      return { pack, entries: [], error };
    }
  }));
  return shared;
}

export async function getSpellIndex({ refresh = false, gameRef = globalThis.game } = {}) {
  if (cache && !refresh) return cache;
  const spells = [];
  const packs = [];
  const errors = [];
  for (const { pack, entries, error } of await getCompendiumIndex({ refresh, gameRef })) {
    if (error) { errors.push({ id: pack.collection, message: String(error?.message ?? error) }); continue; }
    let count = 0;
    for (const entry of entries) {
      if (entry.type !== 'magia') continue;
      spells.push(toSpellRecord(entry, pack));
      count++;
    }
    if (count) packs.push({ id: pack.collection, label: pack.metadata?.label ?? pack.collection, count });
  }
  spells.sort((a, b) => (a.circle ?? 9) - (b.circle ?? 9) || a.name.localeCompare(b.name, 'pt-BR'));
  cache = Object.freeze({ spells: Object.freeze(spells), packs: Object.freeze(packs), errors: Object.freeze(errors), builtAt: Date.now() });
  return cache;
}

export function invalidateSpellIndex() { cache = null; powerCache = null; plannerCache = null; shared = null; }

/** "Recarregar": esquece tudo e baixa de novo do servidor, sobrescrevendo o cache do navegador. */
export function refreshCompendiumIndex(gameRef = globalThis.game) {
  invalidateSpellIndex();
  return getCompendiumIndex({ refresh: true, gameRef });
}

let powerCache = null;

/** Índice dos poderes concedidos (tipo "concedido") de todos os compêndios de Item. */
export async function getGrantedPowerIndex({ refresh = false, gameRef = globalThis.game } = {}) {
  if (powerCache && !refresh) return powerCache;
  const out = [];
  for (const { pack, entries: index } of await getCompendiumIndex({ refresh, gameRef })) {
    for (const e of index) {
      if (e.type !== 'poder' || e.system?.tipo !== 'concedido') continue;
      out.push(Object.freeze({ uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`, name: e.name, key: fold(e.name), img: e.img, description: e.system?.description?.value ?? '', packLabel: pack.metadata?.label ?? pack.collection }));
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
  for (const { pack, entries: index } of await getCompendiumIndex({ refresh, gameRef })) {
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
  }
  powers.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  classes.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  races.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  gear.sort((a, b) => (b.core - a.core) || a.name.localeCompare(b.name, 'pt-BR'));
  plannerCache = Object.freeze({ powers: Object.freeze(powers), classes: Object.freeze(classes), races: Object.freeze(races), gear: Object.freeze(gear) });
  return plannerCache;
}
