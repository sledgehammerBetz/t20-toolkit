/** Perfil de conjurador da ficha (classes, regras, magias conhecidas), sem carregar o Buscador. */
import { MODULE_ID } from '../../constants.js';
import { actorClasses, arcanistPaths, actorSpells } from './t20.js';
import { buildCasterProfiles, learningCapacity } from './caster-rules.js';

/** Escolas de Bardo/Druida ficam numa flag do módulo, por classe. */
export function readSchools(actor) {
  return actor?.getFlag?.(MODULE_ID, 'casting.schools') ?? {};
}

export function casterContext(actor) {
  const classes = actorClasses(actor);
  const profiles = buildCasterProfiles({ classes, arcanistPaths: arcanistPaths(actor), schoolsByClass: readSchools(actor) });
  const known = actorSpells(actor);
  return { classes, profiles, known, capacity: learningCapacity(profiles, known) };
}
