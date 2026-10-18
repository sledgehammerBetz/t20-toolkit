/**
 * Catálogo classificado de magias (compartilhado pelo Buscador, Oficina das Engenhocas, Escriba, Grimório e Usurpador).
 * Carrega só as magias (pack.getDocuments({ type: 'magia' }), em paralelo, apenas nos compêndios que têm magias) e monta, para cada uma,
 * os campos estruturados (execução, alcance, duração, resistência, alvo/área/efeito) e o perfil semântico
 * (função, elemento, condições, alvos, proteção), inclusive o que os aprimoramentos mudam.
 */
import { fold } from '../t20.js';
import { spellTypeFromSystem, resistanceText, hasResistance, resistanceSkillKey, durationText, eng4ExecutionKey, eng4RangeKey, eng4DurationKey } from './spell-metadata.js';
import { htmlToPlainText, extractEnhancements } from './enhancement-content.js';
import { refreshSpellSemantics } from './spell-semantics.js';
import { spellPacks } from '../spell-index.js';
import { readPack, writePack } from '../pack-cache.js';

const clean = v => String(v ?? '').trim();
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

export function applicationKinds(target, area, effect) {
  const kinds = [];
  if (clean(target)) kinds.push('target');
  if (clean(area)) kinds.push('area');
  if (clean(effect)) kinds.push('effect');
  if (!kinds.length) kinds.push('none');
  return kinds;
}

const plain = list => (Array.isArray(list) ? list : []).map(e => {
  try { return e?.toObject ? e.toObject() : structuredClone(e); } catch { return JSON.parse(JSON.stringify(e ?? null)); }
});

/** Registro classificado a partir de uma entrada de índice (ou de um objeto com name/img/system/effects). */
export function classifySpell(entry, pack = {}) {
  const system = entry?.system && typeof entry.system === 'object' ? entry.system : {};
  const resistance = resistanceText(system);
  const duration = durationText(system);
  const collection = pack.collection ?? entry.packId ?? '';
  const spell = {
    uuid: entry.uuid ?? (collection ? `Compendium.${collection}.Item.${entry._id}` : entry._id),
    id: entry._id,
    name: entry.name ?? 'Magia sem nome',
    key: fold(entry.name),
    img: entry.img ?? 'icons/svg/book.svg',
    packId: collection,
    packLabel: pack.metadata?.label ?? pack.title ?? entry.packLabel ?? collection,
    book: system.source ?? '',
    circle: Math.max(0, Math.trunc(num(system.circulo, 0))) || null,
    cost: Math.max(0, num(system.ativacao?.custo, 0)),
    type: spellTypeFromSystem(system),
    school: clean(system.escola),
    execution: clean(system.ativacao?.execucao),
    executionKey: eng4ExecutionKey(system.ativacao?.execucao),
    range: clean(system.alcance),
    rangeKey: eng4RangeKey(system.alcance),
    target: clean(system.alvo),
    area: clean(system.area),
    effect: clean(system.efeito),
    duration,
    durationKey: eng4DurationKey(duration),
    durationUnits: system.duracao?.units ?? null,
    descriptionText: htmlToPlainText(system.description?.value),
    resistance,
    resistanceSkill: resistanceSkillKey(system),
    hasResistance: hasResistance(resistance),
    enhancements: extractEnhancements(entry.effects),
    _eng6RawEffects: plain(entry.effects ?? []),
    applicationKinds: applicationKinds(system.alvo, system.area, system.efeito)
  };
  refreshSpellSemantics(spell, { rolls: system.rolls ?? [] });
  spell.searchText = fold([spell.name, spell.descriptionText, spell.book, spell.packLabel, ...(spell.enhancements ?? []).map(e => e.text ?? '')].join(' '));
  return spell;
}

let cache = null;

/** Magias de um compêndio como objetos simples (com uuid e efeitos completos). Usa o cache do navegador quando dá. */
async function packSpells(pack, refresh, gameRef) {
  if (!refresh) {
    const hit = await readPack('spells', pack, gameRef);
    if (hit) return hit;
  }
  // O índice básico (nome, tipo…) o Foundry já carrega ao entrar no mundo: serve para pular os compêndios sem magias.
  const index = pack.index?.size ? pack.index : await pack.getIndex();
  let out = [];
  if ([...index].some(e => e.type === 'magia')) {
    out = (await pack.getDocuments({ type: 'magia' })).map(d => ({ ...(d.toObject ? d.toObject() : d), uuid: d.uuid }));
  }
  writePack('spells', pack, out, gameRef);
  return out;
}

/** Catálogo de todas as magias dos compêndios de Item do sistema e módulos. */
export async function getSpellCatalog({ refresh = false, gameRef = globalThis.game } = {}) {
  if (cache && !refresh) return cache;
  const spells = [];
  const packs = [];
  const loaded = await Promise.all(spellPacks(gameRef).map(pack => packSpells(pack, refresh, gameRef).then(
    entries => ({ pack, entries }),
    error => { console.warn(`[T20 Toolkit] Catálogo de magias: não foi possível ler ${pack.collection}:`, error); return { pack, entries: [] }; }
  )));
  for (const { pack, entries } of loaded) {
    for (const entry of entries) spells.push(classifySpell(entry, pack));
    if (entries.length) packs.push({ id: pack.collection, label: pack.metadata?.label ?? pack.collection, count: entries.length });
  }
  spells.sort((a, b) => (a.circle ?? 9) - (b.circle ?? 9) || a.name.localeCompare(b.name, 'pt-BR'));
  cache = Object.freeze({ spells: Object.freeze(spells), packs: Object.freeze(packs), byUuid: new Map(spells.map(s => [s.uuid, s])) });
  return cache;
}

export function invalidateSpellCatalog() { cache = null; }
