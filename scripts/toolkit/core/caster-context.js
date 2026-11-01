/** Perfil de conjurador da ficha (classes, regras, magias conhecidas), sem carregar o Buscador. */
import { MODULE_ID } from '../../constants.js';
import { actorClasses, arcanistPaths, actorSpells, actorPowers } from './t20.js';
import { buildCasterProfiles, learningCapacity, applySpellPowers, CASTER_CLASSES } from './caster-rules.js';
import { crossClassCasters } from './class-levels.js';

/** Escolas de Bardo/Druida ficam numa flag do módulo, por classe. */
export function readSchools(actor) {
  return actor?.getFlag?.(MODULE_ID, 'casting.schools') ?? {};
}

/** Magias por poderes de outra classe (Presente dos Deuses, Duplo Feérico), conforme a ficha. */
export function crossClassExtra(actor, classes = actorClasses(actor)) {
  const hasMagic = buildCasterProfiles({ classes }).length > 0;
  return crossClassCasters({
    powers: actorPowers(actor).map(p => ({ name: p.name, tipo: p.system?.tipo, subtipo: p.system?.subtipo })),
    ownClasses: classes.map(c => c.name), hasMagic,
    duploClass: actor?.getFlag?.(MODULE_ID, 'duploFeericoClass') ?? '', casterKeys: Object.keys(CASTER_CLASSES)
  });
}

/** Poderes da ficha no formato de applySpellPowers. */
export const spellPowers = actor => actorPowers(actor).map(p => ({ name: p.name, subtipo: p.system?.subtipo }));

export function casterContext(actor) {
  const classes = actorClasses(actor);
  const known = actorSpells(actor);
  const profiles = applySpellPowers(
    buildCasterProfiles({ classes, arcanistPaths: arcanistPaths(actor), schoolsByClass: readSchools(actor), extra: crossClassExtra(actor, classes) }),
    spellPowers(actor), known);
  return { classes, profiles, known, capacity: learningCapacity(profiles, known) };
}
