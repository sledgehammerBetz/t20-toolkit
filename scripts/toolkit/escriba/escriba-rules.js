/**
 * Escriba Arcano (poder de Arcanista, JdA p. 38):
 * "Você pode aprender magias copiando os textos de pergaminhos e grimórios de outros magos.
 *  Aprender uma magia dessa forma exige um dia de trabalho e T$ 250 em matérias-primas por PM
 *  necessário para lançar a magia." Pré-requisitos: Mago, treinado em Ofício (escriba).
 * Funções puras.
 */

/** Custo em PM por círculo (tabela de magias do JdA; ex.: 3º círculo = 6 PM). */
export const PM_BY_CIRCLE = Object.freeze({ 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 });

export function copyCost(circle) {
  const pm = PM_BY_CIRCLE[circle];
  if (!pm) return null;
  return { pm, days: pm, tibares: 250 * pm };
}

/**
 * Requisitos do poder. `scribeSkill` null = não encontrado (o Ofício é perícia criada pelo usuário).
 * @returns {{status:'ok'|'review'|'blocked', items:{label:string, ok:boolean|null, note?:string}[]}}
 */
export function checkRequirements({ isMago, hasPower, scribeSkill }) {
  const items = [
    { label: 'Caminho do Arcanista: Mago', ok: !!isMago },
    { label: 'Poder Escriba Arcano', ok: !!hasPower },
    { label: 'Treinado em Ofício (escriba)', ok: scribeSkill ? true : null, note: scribeSkill ? scribeSkill.label : 'Não encontrei uma perícia de Ofício (escriba) treinada. Confira na ficha.' }
  ];
  const status = items.some(i => i.ok === false) ? 'blocked' : items.some(i => i.ok === null) ? 'review' : 'ok';
  return { status, items };
}

/** Pode copiar esta magia? Precisa ser arcana/universal e de um círculo que o Mago já lança. */
export function canCopy(spell, { maxCircle, ownedKeys }) {
  if (ownedKeys.has(spell.key)) return { ok: false, reason: 'Já está na ficha.' };
  if (!['arc', 'uni'].includes(spell.type)) return { ok: false, reason: 'Só magias arcanas ou universais.' };
  if (!spell.circle || spell.circle > maxCircle) return { ok: false, reason: `${spell.circle ?? '?'}º círculo: o Mago lança até o ${maxCircle}º.` };
  return { ok: true, reason: '' };
}
