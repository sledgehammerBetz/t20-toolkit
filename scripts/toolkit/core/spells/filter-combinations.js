/**
 * Coerência entre critérios de filtro e procedência dos aprimoramentos.
 *
 * Não pressupõe que aprimoramentos independentes sejam cumuláveis: isso
 * depende das regras e da redação específica da magia. A análise sinaliza
 * apenas incerteza, sem ocultar resultados potencialmente válidos.
 */
import { semanticProfileMatches } from "./spell-semantics.js";

export const COMPOSABLE_SEMANTIC_FILTERS = Object.freeze([
  "function", "element", "conditionPresence", "conditionType",
  "targetType", "targetRelation", "targetCount", "defenseType"
]);

/** Combinações logicamente impossíveis, mesmo com aprimoramentos. */
export function validateFilterCombination(filters = {}) {
  const conflicts = [];
  if (filters.conditionPresence === "no" && filters.conditionType) {
    conflicts.push({
      code: "condition-presence-type",
      fields: ["conditionPresence", "conditionType"],
      message: "'Não causa condição' não pode ser combinado com uma condição causada específica."
    });
  }
  if (filters.resistance === "no" && filters.resistanceType) {
    conflicts.push({
      code: "resistance-presence-type",
      fields: ["resistance", "resistanceType"],
      message: "'Sem resistência' não pode ser combinado com um tipo de teste de resistência."
    });
  }
  return { valid: conflicts.length === 0, conflicts };
}

/**
 * Identifica quando filtros positivos dependem de aprimoramentos DISTINTOS.
 * Isso não implica incompatibilidade: os dois podem, ou não, ser combináveis.
 */
export function assessEnhancementEvidence(spell, filters = {}, baseMatches = () => false) {
  const needed = COMPOSABLE_SEMANTIC_FILTERS.filter(category =>
    filters[category]
    && !(category === "conditionPresence" && filters[category] === "no")
    && !baseMatches(spell, category, filters[category])
  );
  if (needed.length < 2) return { status: "single-or-base", categories: needed };

  const entries = Array.isArray(spell?.enhancementSemantics)
    ? spell.enhancementSemantics.filter(entry => entry?.profile)
    : [];
  if (!entries.length) return { status: "unresolved", categories: needed };

  const matched = category => entries.filter(entry =>
    semanticProfileMatches(entry.profile, category, filters[category])
  );
  if (!needed.every(category => matched(category).length)) {
    return { status: "unresolved", categories: needed };
  }
  const combined = entries.some(entry => needed.every(category =>
    semanticProfileMatches(entry.profile, category, filters[category])
  ));
  return {
    status: combined ? "same-enhancement" : "multiple-enhancements",
    categories: needed
  };
}

export function runFilterCombinationSelfTest() {
  const tests = [];
  const check = (name, fn) => {
    try {
      const result = Boolean(fn());
      tests.push({ name, passed: result, error: result ? "" : "resultado inesperado" });
    }
    catch (error) { tests.push({ name, passed: false, error: String(error) }); }
  };
  check("sem critérios não conflita", () => validateFilterCombination({}).valid);
  check("condição não + tipo conflita", () => !validateFilterCombination({ conditionPresence: "no", conditionType: "abalado" }).valid);
  check("resistência não + tipo conflita", () => !validateFilterCombination({ resistance: "no", resistanceType: "fort" }).valid);
  check("condição sim + tipo é válida", () => validateFilterCombination({ conditionPresence: "yes", conditionType: "abalado" }).valid);
  check("resistência sim + tipo é válida", () => validateFilterCombination({ resistance: "yes", resistanceType: "fort" }).valid);
  check("condição não sem tipo é válida", () => validateFilterCombination({ conditionPresence: "no" }).valid);
  check("tipo condição sem presença é válido", () => validateFilterCombination({ conditionType: "lento" }).valid);
  check("resistência não isolada é válida", () => validateFilterCombination({ resistance: "no" }).valid);
  check("função dano e elemento fogo são compatíveis", () => validateFilterCombination({ function: "damage", element: "fire" }).valid);
  check("duas contradições geram duas ocorrências", () => validateFilterCombination({ conditionPresence: "no", conditionType: "lento", resistance: "no", resistanceType: "ref" }).conflicts.length === 2);
  check("conflitos informam campos e mensagens", () => validateFilterCombination({ conditionPresence: "no", conditionType: "lento" }).conflicts[0].message.includes("condição"));
  const base = { semantics: { functions: ["damage"], elements: [] } };
  const baseMatches = (spell, category, value) => semanticProfileMatches(spell?.semantics, category, value);
  const single = { ...base, enhancementSemantics: [{ profile: { functions: [], elements: ["fire"], targetRelations: ["ally"] } }] };
  const split = { ...base, enhancementSemantics: [
    { profile: { elements: ["fire"] } },
    { profile: { targetRelations: ["ally"] } }
  ] };
  const same = { ...base, enhancementSemantics: [
    { profile: { elements: ["fire"], targetRelations: ["ally"] } }
  ] };
  check("base dano + aprimoramento fogo dispensa alerta", () => assessEnhancementEvidence(single, { function: "damage", element: "fire" }, baseMatches).status === "single-or-base");
  check("dois critérios no mesmo aprimoramento", () => assessEnhancementEvidence(same, { element: "fire", targetRelation: "ally" }, baseMatches).status === "same-enhancement");
  check("dois critérios em aprimoramentos distintos", () => assessEnhancementEvidence(split, { element: "fire", targetRelation: "ally" }, baseMatches).status === "multiple-enhancements");
  check("critério indisponível não presume incompatibilidade", () => assessEnhancementEvidence(split, { element: "cold", targetRelation: "ally" }, baseMatches).status === "unresolved");
  check("dois aprimoramentos mais função base ainda separados", () => assessEnhancementEvidence(split, { function: "damage", element: "fire", targetRelation: "ally" }, baseMatches).status === "multiple-enhancements");
  check("perfil sem evidência não causa crash", () => assessEnhancementEvidence(null, { element: "fire", targetRelation: "ally" }, baseMatches).status === "unresolved");
  check("sem aprimoramentos não há conflito presumido", () => assessEnhancementEvidence({}, {}, baseMatches).status === "single-or-base");
  check("a ausência de categoria não integra dependências", () => assessEnhancementEvidence(split, { element: "fire", targetRelation: "" }, baseMatches).categories.length === 1);
  const failures = tests.filter(t => !t.passed);
  return { ok: !failures.length, total: tests.length, passed: tests.length - failures.length, failures, tests };
}
