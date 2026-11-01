/**
 * Regras do Grimório do Mago (JdA p. 37): estudar o grimório por 1 hora, uma vez por dia,
 * e memorizar metade (para baixo) das magias que conhece. Só pode lançar magias memorizadas.
 * Funções puras — sem Foundry.
 */

/** Magias que entram na conta do Mago: arcanas e universais (engenhocas ficam de fora). */
export function magoSpells(spells) {
  return spells.filter(s => s.type === 'arc' || s.type === 'uni');
}

export function memorizationLimit(knownCount) {
  return Math.floor(knownCount / 2);
}

/** Chave do dia no calendário do mundo: "ano-dia". */
export function dayKey(components, worldTime = 0) {
  if (components && Number.isFinite(components.year) && Number.isFinite(components.day)) return `${components.year}-${components.day}`;
  return `d${Math.floor((worldTime || 0) / 86400)}`;
}

/**
 * Valida uma seleção de estudo.
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateStudy({ selectedIds, known, lastStudyDay, today, isGM = false }) {
  const errors = [];
  const limit = memorizationLimit(known.length);
  const knownIds = new Set(known.map(s => s.id));
  if (selectedIds.some(id => !knownIds.has(id))) errors.push('Há magias selecionadas que não estão mais na ficha.');
  if (selectedIds.length > limit) errors.push(`Você conhece ${known.length} magias e pode memorizar ${limit}.`);
  if (lastStudyDay && lastStudyDay === today && !isGM) errors.push('Você já estudou o grimório hoje. O Mago só pode memorizar uma vez por dia.');
  return { ok: errors.length === 0, errors, limit };
}
