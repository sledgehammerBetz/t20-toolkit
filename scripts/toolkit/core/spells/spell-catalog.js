/**
 * Catálogo classificado de magias (compartilhado pelo Buscador, Oficina das Engenhocas, Escriba, Grimório e Usurpador).
 * Lê os compêndios com pack.getIndex({fields: ['system', 'effects']}) — sem carregar Documents — e monta, para cada magia,
 * os campos estruturados (execução, alcance, duração, resistência, alvo/área/efeito) e o perfil semântico
 * (função, elemento, condições, alvos, proteção), inclusive o que os aprimoramentos mudam.
 */
import { fold } from '../t20.js';
import { spellTypeFromSystem, resistanceText, hasResistance, resistanceSkillKey, durationText, eng4ExecutionKey, eng4RangeKey, eng4DurationKey } from './spell-metadata.js';
import { htmlToPlainText, extractEnhancements } from './enhancement-content.js';
import { refreshSpellSemantics } from './spell-semantics.js';

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

/** Catálogo de todas as magias dos compêndios de Item do sistema e módulos. */
export async function getSpellCatalog({ refresh = false, gameRef = globalThis.game } = {}) {
  if (cache && !refresh) return cache;
  const spells = [];
  const packs = [];
  for (const pack of [...(gameRef?.packs ?? [])].filter(p => p.documentName === 'Item' && (!p.metadata?.system || p.metadata.system === 'tormenta20'))) {
    try {
      const index = await pack.getIndex({ fields: ['type', 'img', 'system', 'effects'] });
      const entries = [...index].filter(e => e.type === 'magia');
      // No Foundry o índice do compêndio traz os efeitos (aprimoramentos) só como ids — ou nem traz.
      // Sem os efeitos completos, "considerar aprimoramentos" não tem o que comparar: carrega os documentos.
      const fullEffects = entries.some(e => Array.isArray(e.effects) && e.effects.some(x => x && typeof x === 'object' && (x.changes || x.flags)));
      let docs = null;
      if (entries.length && !fullEffects && typeof pack.getDocuments === 'function') {
        try { docs = new Map((await pack.getDocuments({ type: 'magia' })).map(d => [d.id ?? d._id, d])); } catch (error) {
          console.warn(`[T20 Toolkit] Catálogo de magias: não foi possível carregar os aprimoramentos de ${pack.collection}:`, error);
        }
      }
      let n = 0;
      for (const entry of entries) {
        const doc = docs?.get(entry._id);
        const effects = doc ? [...(doc.effects ?? [])].map(e => (e.toObject ? e.toObject() : e)) : entry.effects;
        spells.push(classifySpell({ ...entry, effects }, pack));
        n++;
      }
      if (n) packs.push({ id: pack.collection, label: pack.metadata?.label ?? pack.collection, count: n });
    } catch (error) {
      console.warn(`[T20 Toolkit] Catálogo de magias: não foi possível ler ${pack.collection}:`, error);
    }
  }
  spells.sort((a, b) => (a.circle ?? 9) - (b.circle ?? 9) || a.name.localeCompare(b.name, 'pt-BR'));
  cache = Object.freeze({ spells: Object.freeze(spells), packs: Object.freeze(packs), byUuid: new Map(spells.map(s => [s.uuid, s])) });
  return cache;
}

export function invalidateSpellCatalog() { cache = null; }
