/**
 * T20 Engenhocas — metadados puros de magias.
 *
 * Este arquivo foi extraído literalmente do runtime validado na v0.8.0.
 * Ele não carrega compêndios, não hidrata ActiveEffects e não participa do
 * filtro assíncrono. A responsabilidade aqui é somente normalizar e rotular
 * os campos estáticos de uma magia.
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

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function titleCase(value) {
  const text = clean(value).replace(/[_-]+/g, " ");
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Tipo da magia
// ---------------------------------------------------------------------------

export const TYPE_LABELS = {
  arc:
    "Arcana",

  div:
    "Divina",

  uni:
    "Universal"
};


/*
 * O campo system.tipo deveria usar códigos como:
 *
 * arc
 * div
 * uni
 *
 * Porém conteúdos de terceiros podem trazer valores inválidos,
 * inclusive coisas como "Sim".
 *
 * Nunca exibimos esse valor bruto como se fosse uma tradição.
 */

export function canonicalSpellType(value) {
  const v =
    norm(
      textValue(
        value
      )
    );


  if (
    [
      "arc",
      "arcana",
      "arcano",
      "arcane"
    ]
    .includes(v)
  ) {
    return "arc";
  }


  if (
    [
      "div",
      "divina",
      "divino",
      "divine"
    ]
    .includes(v)
  ) {
    return "div";
  }


  if (
    [
      "uni",
      "universal",
      "universais"
    ]
    .includes(v)
  ) {
    return "uni";
  }


  return "";
}


export function spellTypeFromSystem(system) {
  const candidates = [

    system?.tipo,

    system?.tradicao,

    system?.[
      "tradição"
    ],

    system?.tipoMagia,

    system?.tipo_magia,

    system?.magia?.tipo

  ];


  for (
    const candidate
    of candidates
  ) {
    const code =
      canonicalSpellType(
        candidate
      );


    if (
      code
    ) {
      return code;
    }
  }


  /*
   * Fallback para módulos que eventualmente
   * armazenem a tradição em campos booleanos.
   */

  const truthy =
    value => {

      if (
        value === true
        ||
        value === 1
      ) {
        return true;
      }


      return [
        "sim",
        "true",
        "yes",
        "1"
      ]
      .includes(
        norm(
          textValue(
            value
          )
        )
      );
    };


  if (
    truthy(
      system?.arcana
      ??
      system?.arcano
      ??
      system?.arcane
    )
  ) {
    return "arc";
  }


  if (
    truthy(
      system?.divina
      ??
      system?.divino
      ??
      system?.divine
    )
  ) {
    return "div";
  }


  if (
    truthy(
      system?.universal
    )
  ) {
    return "uni";
  }


  return "";
}


export function spellTypeLabel(value) {
  const code =
    canonicalSpellType(
      value
    )

    ||

    clean(
      value
    );


  return (
    TYPE_LABELS[
      code
    ]

    ??

    "Não informado"
  );
}


// ---------------------------------------------------------------------------
// Escolas
// ---------------------------------------------------------------------------

export const SCHOOL_LABELS = {

  abj:
    "Abjuração",

  abjuracao:
    "Abjuração",

  adv:
    "Adivinhação",

  adi:
    "Adivinhação",

  adivinhacao:
    "Adivinhação",

  con:
    "Convocação",

  conv:
    "Convocação",

  convocacao:
    "Convocação",

  enc:
    "Encantamento",

  encantamento:
    "Encantamento",

  evo:
    "Evocação",

  evocacao:
    "Evocação",

  ilu:
    "Ilusão",

  ilusao:
    "Ilusão",

  nec:
    "Necromancia",

  necromancia:
    "Necromancia",

  tra:
    "Transmutação",

  trans:
    "Transmutação",

  transmutacao:
    "Transmutação"

};


// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export const EXEC_LABELS = {
  action: "Padrão",
  standard: "Padrão",
  padrao: "Padrão",
  move: "Movimento",
  movement: "Movimento",
  movimento: "Movimento",
  full: "Completa",
  complete: "Completa",
  completa: "Completa",
  reaction: "Reação",
  reacao: "Reação",
  free: "Livre",
  livre: "Livre",
  minute: "1 minuto",
  minuto: "1 minuto",
  hour: "1 hora",
  hora: "1 hora",
  day: "1 dia",
  dia: "1 dia",
  special: "Especial",
  spec: "Especial",
  especial: "Especial"
};


export const EXEC_FILTER_ORDER = [
  "action",
  "move",
  "full",
  "reaction",
  "free",
  "minute",
  "hour",
  "day",
  "special"
];


export function eng4ExecutionKey(value) {
  const raw = norm(textValue(value));
  if (!raw) return "";

  const aliases = {
    action: "action", standard: "action", padrao: "action",
    move: "move", movement: "move", movimento: "move",
    full: "full", complete: "full", completa: "full",
    reaction: "reaction", reacao: "reaction",
    free: "free", livre: "free",
    minute: "minute", minuto: "minute",
    hour: "hour", hora: "hour",
    day: "day", dia: "day",
    special: "special", spec: "special", especial: "special"
  };

  return aliases[raw] ?? "special";
}


export function eng4ExecutionLabel(value) {
  return EXEC_LABELS[value] ?? "Especial";
}


// ---------------------------------------------------------------------------
// Alcance
// ---------------------------------------------------------------------------

export const RANGE_LABELS = {
  self: "Pessoal", personal: "Pessoal", pessoal: "Pessoal",
  touch: "Toque", toque: "Toque",
  short: "Curto", curto: "Curto",
  medium: "Médio", medio: "Médio",
  long: "Longo", longo: "Longo",
  unlimited: "Ilimitado", ilimitado: "Ilimitado",
  km: "Quilômetros", kilometer: "Quilômetros", kilometers: "Quilômetros",
  quilometro: "Quilômetros", quilometros: "Quilômetros",
  any: "Qualquer", qualquer: "Qualquer",
  none: "Sem alcance", nenhum: "Sem alcance",
  spec: "Especial", special: "Especial", especial: "Especial"
};


export const RANGE_FILTER_ORDER = [
  "self",
  "touch",
  "short",
  "medium",
  "long",
  "unlimited",
  "km",
  "any",
  "none",
  "spec"
];


export function eng4RangeKey(value) {
  const raw = norm(textValue(value));
  if (!raw) return "";

  const aliases = {
    self: "self", personal: "self", pessoal: "self",
    touch: "touch", toque: "touch",
    short: "short", curto: "short",
    medium: "medium", medio: "medium",
    long: "long", longo: "long",
    unlimited: "unlimited", ilimitado: "unlimited",
    km: "km", kilometer: "km", kilometers: "km", quilometro: "km", quilometros: "km",
    any: "any", qualquer: "any",
    none: "none", nenhum: "none",
    spec: "spec", special: "spec", especial: "spec"
  };

  return aliases[raw] ?? "spec";
}


export function eng4RangeLabel(value) {
  return RANGE_LABELS[value] ?? "Especial";
}


// ---------------------------------------------------------------------------
// Resistências
// ---------------------------------------------------------------------------

export const RESIST_SKILL_LABELS = {

  fort:
    "Fortitude",

  fortitude:
    "Fortitude",

  ref:
    "Reflexos",

  reflexos:
    "Reflexos",

  reflex:
    "Reflexos",

  von:
    "Vontade",

  vontade:
    "Vontade",

  will:
    "Vontade"

};


export function labelFrom(
  map,
  value
) {
  const raw =
    clean(
      value
    );


  if (
    !raw
  ) {
    return "—";
  }


  return (
    map[
      norm(
        raw
      )
    ]

    ??

    titleCase(
      raw
    )
  );
}


export function resistanceText(system) {
  const r =
    system?.resistencia;


  if (
    r == null

    ||

    r === false

    ||

    r === 0
  ) {
    return "";
  }


  if (
    typeof r ===
    "string"
  ) {
    return clean(
      r
    );
  }


  if (
    typeof r !==
      "object"

    ||

    Array.isArray(
      r
    )
  ) {
    return "";
  }


  const txt =
    clean(
      r.txt
      ??
      r.text
      ??
      r.value
    );


  if (
    txt

    &&

    ![
      "0",
      "1"
    ]
    .includes(
      txt
    )
  ) {
    return txt;
  }


  const skill =
    clean(
      r.pericia
      ??
      r.skill
    );


  if (
    !skill
  ) {
    return "";
  }


  const base =
    labelFrom(
      RESIST_SKILL_LABELS,
      skill
    );


  const bonus =
    num(
      r.bonus,
      0
    );


  return bonus

    ? `${base} ${bonus >= 0 ? "+" : ""}${bonus}`

    : base;
}


export function hasResistance(value) {
  const t =
    norm(
      value
    );


  if (
    !t
  ) {
    return false;
  }


  return ![
    "nenhuma",
    "nenhum",
    "nao",
    "sem",
    "sem resistencia",
    "-"
  ]
  .includes(
    t
  );
}


export function resistanceSkillKey(system) {
  const r =
    system?.resistencia;


  const rawSkill =
    clean(
      (
        r
        &&
        typeof r === "object"
        &&
        !Array.isArray(r)
      )
        ? (
            r.pericia
            ??
            r.skill
          )
        : ""
    );


  const haystack =
    norm(
      `${rawSkill} ${resistanceText(system)}`
    );


  if (
    haystack.includes("fort")
  ) {
    return "fort";
  }


  if (
    haystack.includes("reflex")
    ||
    haystack.includes("relfex") // Erupção Glacial no sistema 1.5.015
    ||
    /(^|\s)ref($|\s)/.test(haystack)
  ) {
    return "ref";
  }


  if (
    haystack.includes("vont")
    ||
    haystack.includes("will")
    ||
    /(^|\s)von($|\s)/.test(haystack)
  ) {
    return "von";
  }


  return hasResistance(
    resistanceText(system)
  )
    ? "other"
    : "";
}


export function resistanceSkillLabel(value) {
  return (
    {
      fort: "Fortitude",
      ref: "Reflexos",
      von: "Vontade",
      other: "Outra / não identificada"
    }[value]
    ??
    labelFrom(
      RESIST_SKILL_LABELS,
      value
    )
  );
}


// ---------------------------------------------------------------------------
// Duração
// ---------------------------------------------------------------------------

export const DURATION_FILTER_LABELS = {
  instant: "Instantânea",
  round: "Rodadas",
  scene: "Cena",
  sustained: "Sustentada",
  minute: "Minutos",
  hour: "Horas",
  day: "Dias",
  permanent: "Permanente",
  special: "Especial / variável"
};


export const DURATION_FILTER_ORDER = [
  "instant",
  "round",
  "scene",
  "sustained",
  "minute",
  "hour",
  "day",
  "permanent",
  "special"
];


export function eng4TranslateDurationLiteral(value) {
  const raw = clean(value);
  if (!raw) return "";

  const exact = {
    inst: "Instantânea", instant: "Instantânea", instantaneous: "Instantânea", instantanea: "Instantânea",
    round: "1 rodada", rodada: "1 rodada",
    scene: "Cena", cena: "Cena",
    sust: "Sustentada", sustained: "Sustentada", sustain: "Sustentada", sustentada: "Sustentada",
    perm: "Permanente", permanent: "Permanente", permanente: "Permanente",
    minute: "1 minuto", minuto: "1 minuto",
    hour: "1 hora", hora: "1 hora",
    day: "1 dia", dia: "1 dia"
  }[norm(raw)];

  if (exact) return exact;

  return raw
    .replace(/\bturns\b/gi, "rodadas")
    .replace(/\bturn\b/gi, "rodada")
    .replace(/\brounds\b/gi, "rodadas")
    .replace(/\bround\b/gi, "rodada")
    .replace(/\bscene\b/gi, "Cena")
    .replace(/\bsustained\b/gi, "Sustentada")
    .replace(/\bpermanent\b/gi, "Permanente")
    .replace(/\bminutes\b/gi, "minutos")
    .replace(/\bminute\b/gi, "minuto")
    .replace(/\bhours\b/gi, "horas")
    .replace(/\bhour\b/gi, "hora")
    .replace(/\bdays\b/gi, "dias")
    .replace(/\bday\b/gi, "dia");
}


export function durationText(system) {
  const d = system?.duracao;
  if (d == null || d === false) return "";

  if (typeof d === "string" || typeof d === "number") {
    return eng4TranslateDurationLiteral(d);
  }

  if (typeof d !== "object" || Array.isArray(d)) return "";

  const special = clean(d.special ?? d.especial);
  if (special) return eng4TranslateDurationLiteral(special);

  const value = clean(d.valor ?? d.value ?? d.quantidade ?? d.amount);
  const unitRaw = clean(d.unidade ?? d.units ?? d.unit ?? d.tipo ?? d.type);
  const unit = eng4TranslateDurationLiteral(unitRaw);

  if (!value || value === "0") return unit;
  if (!unit) return eng4TranslateDurationLiteral(value);

  if (/^\s*(?:\d+|\d+d\d+)/i.test(unit) || norm(unit).startsWith(norm(value) + " ")) {
    return unit;
  }

  if (["cena", "sustentada", "permanente", "instantanea"].includes(norm(unit))) {
    return unit;
  }

  let result = String(value) + " " + String(unit);
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue !== 1) {
    result = result
      .replace(/\b1 rodada\b/i, "rodadas")
      .replace(/\b1 minuto\b/i, "minutos")
      .replace(/\b1 hora\b/i, "horas")
      .replace(/\b1 dia\b/i, "dias");
  }
  return eng4TranslateDurationLiteral(result);
}


export function eng4DurationKey(value) {
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
  return "special";
}


export function eng4DurationLabel(value) {
  return DURATION_FILTER_LABELS[value] ?? "Especial / variável";
}



// ---------------------------------------------------------------------------
// Testes de regressão dos metadados estáticos
// ---------------------------------------------------------------------------

export function runSpellMetadataSelfTest() {
  const cases = [
    ["tipo arcana", () => spellTypeFromSystem({ tipo: "Arcana" }) === "arc"],
    ["tipo divino booleano", () => spellTypeFromSystem({ divina: true }) === "div"],
    ["execução movimento", () => eng4ExecutionKey("Movimento") === "move"],
    ["rótulo execução", () => eng4ExecutionLabel("reaction") === "Reação"],
    ["alcance médio", () => eng4RangeKey("Médio") === "medium"],
    ["rótulo alcance", () => eng4RangeLabel("long") === "Longo"],
    ["resistência com bônus", () => resistanceText({ resistencia: { pericia: "fort", bonus: 2 } }) === "Fortitude +2"],
    ["chave de resistência", () => resistanceSkillKey({ resistencia: { txt: "Vontade anula" } }) === "von"],
    ["duração um dia", () => durationText({ duracao: { value: 1, units: "day" } }) === "1 dia"],
    ["duração em rodadas", () => eng4DurationKey("1d4 rodadas") === "round"]
  ];

  const failures = [];
  let passed = 0;

  for (const [name, test] of cases) {
    try {
      if (test()) passed += 1;
      else failures.push({ name, error: "resultado inesperado" });
    } catch (error) {
      failures.push({ name, error: error?.message ?? String(error) });
    }
  }

  return {
    ok: failures.length === 0,
    passed,
    total: cases.length,
    failures
  };
}
