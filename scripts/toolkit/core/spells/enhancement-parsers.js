/**
 * Pure parsers used by the Creator enhancement-aware filters.
 *
 * Keep this file independent from Foundry so it can be regression-tested
 * without opening a world. The Creator runtime imports these functions by
 * the same historical names used by the macro implementation.
 */

function clean(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function textValue(value) {
  if (value == null) return "";

  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value).trim();
  }

  if (typeof value === "object") {
    for (const key of ["label", "nome", "name", "value", "txt", "texto", "text"]) {
      if (value[key] != null && typeof value[key] !== "object") {
        return String(value[key]).trim();
      }
    }
  }

  return "";
}

export function eng5PushUnique(array, value) {
  if (value && !array.includes(value)) array.push(value);
}

export function eng5Truthy(value) {
  if (value === true || value === 1) return true;
  return ["sim", "true", "yes", "1"].includes(norm(textValue(value)));
}

export function eng5ResistanceKeyFromText(value) {
  const text = norm(value);
  if (!text) return "";
  if (text.includes("fort")) return "fort";
  if (text.includes("reflex") || /(^|\s)ref($|\s)/.test(text)) return "ref";
  if (text.includes("vont") || text.includes("will") || /(^|\s)von($|\s)/.test(text)) return "von";
  return "";
}

export function eng5ResistanceRemoved(value) {
  const text = norm(value);
  if (!text) return false;
  return text === "nenhuma" || text === "nenhum" || text === "sem" || text === "sem resistencia" || text === "none"
    || text.includes("sem resistencia") || text.includes("remove a resistencia") || text.includes("nao permite resistencia")
    || text.includes("nao permite teste de resistencia")
    || /resistencia[^.;]*\bpara\s+(?:nenhuma|nenhum|none)\b/.test(text);
}

export function eng5RangeKeyFromText(value) {
  const text = norm(value);
  if (!text) return "";

  // Prioriza o destino de frases como “muda o alcance de médio para longo”.
  const afterPara = text.match(
    /(?:alcance[^.;]*?\bpara\s+|alcance[^.;]*?\bpassa\s+a\s+)(pessoal|personal|toque|touch|curto|short|medio|medium|longo|long|ilimitado|unlimited|qualquer|any|quilometros?|kilometers?|km|sem alcance)/i
  );
  if (afterPara) {
    const captured = norm(afterPara[1]);
    if (["pessoal", "personal"].includes(captured)) return "self";
    if (["toque", "touch"].includes(captured)) return "touch";
    if (["curto", "short"].includes(captured)) return "short";
    if (["medio", "medium"].includes(captured)) return "medium";
    if (["longo", "long"].includes(captured)) return "long";
    if (["ilimitado", "unlimited"].includes(captured)) return "unlimited";
    if (["qualquer", "any"].includes(captured)) return "any";
    if (captured.includes("quilomet") || captured.includes("kilometer") || captured === "km") return "km";
    if (captured.includes("sem alcance")) return "none";
  }

  // Se houver mais de um alcance no texto, o último costuma ser o novo valor.
  const candidates = [
    ["self", /\b(?:pessoal|personal)\b/g],
    ["touch", /\b(?:toque|touch)\b/g],
    ["short", /\b(?:curto|short)\b/g],
    ["medium", /\b(?:medio|medium)\b/g],
    ["long", /\b(?:longo|long)\b/g],
    ["unlimited", /\b(?:ilimitado|unlimited)\b/g],
    ["any", /\b(?:qualquer|any)\b/g],
    ["km", /\b(?:quilometros?|kilometers?|km)\b/g],
    ["none", /\bsem alcance\b/g]
  ];

  let best = null;
  for (const [key, regex] of candidates) {
    for (const match of text.matchAll(regex)) {
      if (!best || match.index > best.index) best = { key, index: match.index };
    }
  }

  return best?.key ?? "";
}

export function eng5ExecutionKeyFromText(value) {
  const text = norm(value);
  if (!text) return "";
  if (text.includes("acao livre") || text.includes("free action")) return "free";
  if (text.includes("reacao") || text.includes("reaction")) return "reaction";
  if (text.includes("acao completa") || text.includes("complete action") || text.includes("full action")) return "full";
  if (text.includes("acao de movimento") || text.includes("acao movimento") || text.includes("movement action") || text.includes("move action")) return "move";
  if (text.includes("acao padrao") || text.includes("standard action")) return "action";
  if (text.includes("1 minuto") || text.includes("one minute")) return "minute";
  if (text.includes("1 hora") || text.includes("one hour")) return "hour";
  if (text.includes("1 dia") || text.includes("one day")) return "day";
  return "";
}

export function eng5DurationKeyFromText(value) {
  const text = norm(value);
  if (!text) return "";
  if (text.includes("instant")) return "instant";
  if (text.includes("sustent") || text.includes("concentr")) return "sustained";
  if (text.includes("permanent")) return "permanent";
  if (text.includes("cena") || text.includes("scene")) return "scene";
  if (/\b(?:rodada|rodadas|round|rounds|turn|turns)\b/.test(text)) return "round";
  if (/\b(?:minuto|minutos|minute|minutes)\b/.test(text)) return "minute";
  if (/\b(?:hora|horas|hour|hours)\b/.test(text)) return "hour";
  if (/\b(?:dia|dias|day|days)\b/.test(text)) return "day";
  return "";
}

export function eng5EmptyMeta() {
  return {
    ranges: [],
    executions: [],
    durations: [],
    resistanceSkills: [],
    resistancePresence: [],
    applicationKinds: []
  };
}

export function eng5RelevantChangeKey(key) {
  const text = norm(key);
  return text.includes("alcance") || text.includes("execucao") || text.includes("duracao") || text.includes("resistencia")
    || text.includes("alvo") || text.includes("area") || text.includes("efeito");
}

/**
 * Small regression suite for the parser layer. Returns a serializable report
 * and does not depend on Foundry globals.
 */
export function runEnhancementParserSelfTest() {
  const cases = [
    ["alcance: médio -> longo", eng5RangeKeyFromText("muda o alcance de médio para longo"), "long"],
    ["alcance: curto -> médio", eng5RangeKeyFromText("o alcance passa a médio"), "medium"],
    ["alcance: pessoal", eng5RangeKeyFromText("muda o alcance para pessoal"), "self"],
    ["execução: movimento", eng5ExecutionKeyFromText("muda a execução para ação de movimento"), "move"],
    ["execução: reação", eng5ExecutionKeyFromText("a execução passa a reação"), "reaction"],
    ["duração: cena", eng5DurationKeyFromText("muda a duração para cena"), "scene"],
    ["duração: sustentada", eng5DurationKeyFromText("a duração passa a sustentada"), "sustained"],
    ["resistência: Vontade", eng5ResistanceKeyFromText("Vontade anula"), "von"],
    ["resistência removida", eng5ResistanceRemoved("muda a resistência para nenhuma"), true],
    ["chave relevante", eng5RelevantChangeKey("system.alcance"), true]
  ];

  const failures = cases
    .filter(([, actual, expected]) => actual !== expected)
    .map(([name, actual, expected]) => ({ name, actual, expected }));

  return {
    ok: failures.length === 0,
    total: cases.length,
    passed: cases.length - failures.length,
    failures
  };
}
