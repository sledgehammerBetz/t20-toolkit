/**
 * Leitura da ficha do Tormenta20 1.5.015.
 * Todos os campos usados aqui estão documentados em docs/REFERENCIA-DADOS-T20-1.5.015.md
 * e foram conferidos no código-fonte do sistema. Não adicione campos sem conferir.
 */

export const SPELL_TYPES = Object.freeze({ arc: 'Arcana', div: 'Divina', uni: 'Universal', eng: 'Engenhoca', sim: 'Simulacro' });
export const SPELL_SCHOOLS = Object.freeze({
  abj: 'Abjuração', adv: 'Adivinhação', con: 'Convocação', enc: 'Encantamento',
  evo: 'Evocação', ilu: 'Ilusão', nec: 'Necromancia', tra: 'Transmutação'
});
export const CIRCLES = Object.freeze([1, 2, 3, 4, 5]);

/** Normaliza texto para comparação (sem acento, minúsculo). */
export function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** O círculo vem como string "2" nos compêndios e número na ficha. */
export function spellCircle(itemOrIndex) {
  const n = Number(itemOrIndex?.system?.circulo);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** Itens `classe` da ficha. `system.niveis` é o nível naquela classe. */
export function actorClasses(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== 'classe') continue;
    out.push({ id: item.id, name: item.name, key: fold(item.name), level: Math.max(1, parseInt(item.system?.niveis) || 1), initial: !!item.system?.inicial, item });
  }
  return out;
}

/** Nível total: o sistema calcula em `actor.nivel` somando as classes. */
export function actorLevel(actor) {
  if (Number.isFinite(actor?.nivel)) return actor.nivel;
  return actorClasses(actor).reduce((sum, c) => sum + c.level, 0);
}

export function actorPowers(actor) {
  return [...(actor?.items ?? [])].filter(i => i.type === 'poder');
}

export function hasPower(actor, name) {
  const wanted = fold(name);
  return actorPowers(actor).some(p => fold(p.name) === wanted);
}

/**
 * Caminho do Arcanista pelo poder na ficha: "Caminho do Arcanista: Mago".
 * Retorna 'mago' | 'feiticeiro' | 'bruxo' | null, e a lista completa se houver conflito.
 */
export function arcanistPaths(actor) {
  const found = new Set();
  for (const p of actorPowers(actor)) {
    const m = fold(p.name).match(/^caminho do arcanista\s*:\s*(mago|feiticeiro|bruxo)\b/);
    if (m) found.add(m[1]);
  }
  return [...found];
}

/** Magias da ficha, com nome normalizado e origem no compêndio quando houver. */
export function actorSpells(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== 'magia') continue;
    out.push({
      id: item.id, name: item.name, key: fold(item.name),
      circle: spellCircle(item), type: item.system?.tipo, school: item.system?.escola,
      prepared: !!item.system?.preparada,
      sourceUuid: item._stats?.compendiumSource ?? item.flags?.core?.sourceId ?? null,
      learnedBy: item.flags?.['t20-toolkit']?.learnedBy ?? null,
      item
    });
  }
  return out;
}

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Perícia treinada cujo nome contém o texto (ex.: Ofício "escriba"). Perícias de ofício extras são criadas pelo usuário. */
export function trainedSkillMatching(actor, text) {
  const wanted = fold(text);
  for (const [key, skill] of Object.entries(actor?.system?.pericias ?? {})) {
    const label = fold(skill?.label ?? '');
    if ((label.includes(wanted) || key.includes(wanted)) && skill?.treinado) return { key, label: skill.label };
  }
  return null;
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', deg: 'º', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', times: '×' };
/** HTML → texto simples (tira tags, decodifica entidades como &ecirc;). */
export function plainText(html) {
  return String(html ?? '').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/\s+/g, ' ').trim();
}
