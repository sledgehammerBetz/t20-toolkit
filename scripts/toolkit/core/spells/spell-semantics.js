/**
 * T20 Engenhocas — classificação semântica de magias.
 *
 * Esta camada produz metadados usados pelos filtros avançados do Criador.
 * O objetivo é ser conservador: quando o texto é ambíguo, preferimos não
 * classificar a inventar uma propriedade que a magia talvez não possua.
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

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

export const FUNCTION_ORDER = Object.freeze([
  "damage",
  "healing",
  "buff",
  "debuff",
  "defense",
  "movement",
  "summon",
  "control"
]);

export const FUNCTION_LABELS = Object.freeze({
  damage: "Dano",
  healing: "Cura",
  buff: "Buff",
  debuff: "Debuff",
  defense: "Defesa",
  movement: "Movimentação",
  summon: "Invocação",
  control: "Controle"
});

export const ELEMENT_ORDER = Object.freeze([
  "acid",
  "electricity",
  "essence",
  "fire",
  "cold",
  "light",
  "psychic",
  "darkness"
]);

export const ELEMENT_LABELS = Object.freeze({
  acid: "Ácido",
  electricity: "Eletricidade",
  essence: "Essência",
  fire: "Fogo",
  cold: "Frio",
  light: "Luz",
  psychic: "Psíquico",
  darkness: "Trevas"
});

export const TARGET_TYPE_ORDER = Object.freeze([
  "self",
  "creature",
  "animal",
  "construct",
  "spirit",
  "humanoid",
  "monster",
  "undead",
  "object",
  "plant",
  "corpse"
]);

export const TARGET_TYPE_LABELS = Object.freeze({
  self: "Você",
  creature: "Criatura",
  animal: "Animal",
  construct: "Construto",
  spirit: "Espírito",
  humanoid: "Humanoide",
  monster: "Monstro",
  undead: "Morto-vivo",
  object: "Objeto",
  plant: "Planta",
  corpse: "Cadáver"
});

export const TARGET_RELATION_ORDER = Object.freeze([
  "self",
  "ally",
  "enemy",
  "any-creature"
]);

export const TARGET_RELATION_LABELS = Object.freeze({
  self: "Você",
  ally: "Aliado",
  enemy: "Inimigo",
  "any-creature": "Qualquer criatura"
});

export const TARGET_COUNT_ORDER = Object.freeze([
  "one",
  "two",
  "three-plus",
  "up-to",
  "multiple",
  "area",
  "all",
  "variable"
]);

export const TARGET_COUNT_LABELS = Object.freeze({
  one: "1 alvo",
  two: "2 alvos",
  "three-plus": "3 ou mais alvos",
  "up-to": "Até N alvos",
  multiple: "Múltiplos alvos",
  area: "Alvos na área",
  all: "Todos no alcance/área",
  variable: "Quantidade variável"
});

export const DEFENSE_ORDER = Object.freeze([
  "defense",
  "damage-reduction",
  "resistance-tests",
  "effect-resistance",
  "immunity",
  "temporary-hp",
  "concealment"
]);

export const DEFENSE_LABELS = Object.freeze({
  defense: "Defesa",
  "damage-reduction": "RD / redução de dano",
  "resistance-tests": "Testes de resistência",
  "effect-resistance": "Resistência a efeito/dano",
  immunity: "Imunidade",
  "temporary-hp": "PV temporários",
  concealment: "Camuflagem / proteção visual"
});

export const CONDITION_LABELS = Object.freeze({
  abalado: "Abalado",
  agarrado: "Agarrado",
  alquebrado: "Alquebrado",
  apavorado: "Apavorado",
  atordoado: "Atordoado",
  caido: "Caído",
  cego: "Cego",
  confuso: "Confuso",
  debilitado: "Debilitado",
  desprevenido: "Desprevenido",
  "em-chamas": "Em Chamas",
  enjoado: "Enjoado",
  enredado: "Enredado",
  esmorecido: "Esmorecido",
  exausto: "Exausto",
  fascinado: "Fascinado",
  fatigado: "Fatigado",
  fraco: "Fraco",
  frustrado: "Frustrado",
  imovel: "Imóvel",
  inconsciente: "Inconsciente",
  lento: "Lento",
  ofuscado: "Ofuscado",
  paralisado: "Paralisado",
  pasmo: "Pasmo",
  petrificado: "Petrificado",
  sangrando: "Sangrando",
  surdo: "Surdo",
  vulneravel: "Vulnerável"
});

const CONDITION_ALIASES = Object.freeze({
  abalado: ["abalado", "abalada", "abalados", "abaladas"],
  agarrado: ["agarrado", "agarrada", "agarrados", "agarradas"],
  alquebrado: ["alquebrado", "alquebrada", "alquebrados", "alquebradas"],
  apavorado: ["apavorado", "apavorada", "apavorados", "apavoradas"],
  atordoado: ["atordoado", "atordoada", "atordoados", "atordoadas"],
  caido: ["caido", "caida", "caidos", "caidas"],
  cego: ["cego", "cega", "cegos", "cegas"],
  confuso: ["confuso", "confusa", "confusos", "confusas"],
  debilitado: ["debilitado", "debilitada", "debilitados", "debilitadas"],
  desprevenido: ["desprevenido", "desprevenida", "desprevenidos", "desprevenidas"],
  "em-chamas": ["em chamas"],
  enjoado: ["enjoado", "enjoada", "enjoados", "enjoadas"],
  enredado: ["enredado", "enredada", "enredados", "enredadas"],
  esmorecido: ["esmorecido", "esmorecida", "esmorecidos", "esmorecidas"],
  exausto: ["exausto", "exausta", "exaustos", "exaustas"],
  fascinado: ["fascinado", "fascinada", "fascinados", "fascinadas"],
  fatigado: ["fatigado", "fatigada", "fatigados", "fatigadas"],
  fraco: ["fraco", "fraca", "fracos", "fracas"],
  frustrado: ["frustrado", "frustrada", "frustrados", "frustradas"],
  imovel: ["imovel", "imoveis"],
  inconsciente: ["inconsciente", "inconscientes"],
  lento: ["lento", "lenta", "lentos", "lentas"],
  ofuscado: ["ofuscado", "ofuscada", "ofuscados", "ofuscadas"],
  paralisado: ["paralisado", "paralisada", "paralisados", "paralisadas"],
  pasmo: ["pasmo", "pasma", "pasmos", "pasmas"],
  petrificado: ["petrificado", "petrificada", "petrificados", "petrificadas"],
  sangrando: ["sangrando"],
  surdo: ["surdo", "surda", "surdos", "surdas"],
  vulneravel: ["vulneravel", "vulneraveis"]
});

const CONDITION_PATTERNS = Object.freeze(Object.fromEntries(
  Object.entries(CONDITION_ALIASES).map(([key, aliases]) => [
    key,
    aliases.map(alias => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"))
  ])
));

const CONTROL_CONDITIONS = new Set([
  "agarrado",
  "atordoado",
  "caido",
  "cego",
  "confuso",
  "fascinado",
  "imovel",
  "inconsciente",
  "lento",
  "paralisado",
  "pasmo",
  "petrificado",
  "enredado"
]);

export function functionLabel(value) {
  return FUNCTION_LABELS[value] ?? value ?? "—";
}

export function elementLabel(value) {
  return ELEMENT_LABELS[value] ?? value ?? "—";
}

export function conditionLabel(value) {
  return CONDITION_LABELS[value] ?? value ?? "—";
}

export function targetTypeLabel(value) {
  return TARGET_TYPE_LABELS[value] ?? value ?? "—";
}

export function targetRelationLabel(value) {
  return TARGET_RELATION_LABELS[value] ?? value ?? "—";
}

export function targetCountLabel(value) {
  return TARGET_COUNT_LABELS[value] ?? value ?? "—";
}

export function targetCountDisplay(targetCount) {
  const count = targetCount ?? {};
  const category = count.category ?? "";
  const value = Number(count.value);

  if (category === "up-to" && Number.isFinite(value) && value > 0) {
    return `Até ${value} ${value === 1 ? "alvo" : "alvos"}`;
  }

  if (category === "three-plus" && Number.isFinite(value) && value >= 3) {
    return `${value} alvos`;
  }

  return targetCountLabel(category);
}

export function defenseLabel(value) {
  return DEFENSE_LABELS[value] ?? value ?? "—";
}

function hasAny(text, patterns) {
  return patterns.some(pattern => pattern instanceof RegExp
    ? pattern.test(text)
    : text.includes(pattern));
}

function extractElements(text) {
  const found = [];
  const checks = [
    ["acid", /\bacid[oa]?\b|\bacido\b/],
    ["electricity", /\beletric(?:idade|o|a|os|as)\b|\braio(?:s)?\b|\brelampago(?:s)?\b/],
    ["essence", /\bessencia\b|\benergia magica pura\b/],
    ["fire", /\bfogo\b|\bchama(?:s)?\b|\bflamejante\b|\bincendiar\b/],
    ["cold", /\bfrio\b|\bgelo\b|\bcongel/],
    ["light", /\bluz\b|\bradiante\b|\bsolar\b/],
    ["psychic", /\bpsiquic[oa]\b|\benergia ps[ií]quica\b/],
    ["darkness", /\btrevas\b|\benergia negativa\b|\benergia sombria\b/]
  ];

  for (const [key, regex] of checks) {
    if (regex.test(text)) pushUnique(found, key);
  }

  return found;
}

/**
 * Um nome de condição em uma descrição nem sempre indica que a magia a causa.
 * Restringimos cada análise à oração e a palavras completas: descrições
 * de imunidade, remoção ou testes CONTRA condições não são aplicações.
 */
function conditionIsPrevented(before) {
  return /\b(?:remove|remova|removem|removido|remocao|elimina|elimine|eliminam|cura|curam|livra|livram|encerra|dissipa|impede|preveni|previne|evita|evitar|ignora|ignorar|imune|imunidade|resistente|resistencia|protegido|protecao|contra|livre de)\b[^.!?;]{0,55}$/.test(before)
    || /\bnao\s+(?:(?:mais|pode|podem)\s+)?(?:fica|ficam|ficara|ficarao|causa|causam|sofre|sofrem|recebe|recebem|deixa|deixam|se torna|tornam)[^.!?;]{0,45}$/.test(before);
}

/**
 * Divide orações de efeito sem quebrar enumerações como "abalado e apavorado".
 * Separar apenas por pontuação deixava um verbo de remoção/imunidade bloquear
 * outra condição aplicada depois de "mas" ou "e deixa" na mesma frase.
 *
 * Uma oração aqui é uma heurística gramatical, não um parser de regras.
 */
function effectClauses(text) {
  return text
    .split(/[.!?;\n]+|,?\s+\b(?:mas|porem|contudo|entretanto)\b\s+|\s+e\s+(?=(?:(?:(?:o|a|os|as)\s+)?(?:alvos?|criaturas?|inimigos?|aliados?)\s+)?(?:fica|ficam|deixa|deixam|causa|causam|sofre|sofrem|recebe|recebem|remove|removem|elimina|eliminam|cura|curam|impede|impedem|evita|evitam|ignora|ignoram|torna|tornam|aplica|aplicam)\b)/)
    .map(chunk => chunk.trim())
    .filter(Boolean);
}

function extractConditions(text) {
  const found = [];
  const clauses = effectClauses(text);

  for (const [key, patterns] of Object.entries(CONDITION_PATTERNS)) {
    let detected = false;

    for (const clause of clauses) {
      for (const pattern of patterns) {
        for (const match of clause.matchAll(pattern)) {
          const index = match.index ?? 0;
          const before = clause.slice(0, index);
          const after = clause.slice(index + match[0].length);
          if (conditionIsPrevented(before)) continue;

          const applies = /\b(?:fica|ficam|ficara|ficarao|deixa|deixam|torna|tornam|causa|causam|sofre|sofrem|recebe|recebem|passa a ficar|passam a ficar|permanece|permanecem|impoe|aplica|aplicam)\b[^.!?;]{0,52}$/.test(before)
            || /\b(?:causa|causam|impoe|aplica|aplicam)\s+(?:a\s+)?condicao\s+[^.!?;]{0,25}$/.test(before)
            || /^\s*(?:por|durante|ate)\b/.test(after) && /\b(?:fica|ficam|causa|causam)\b/.test(before);

          if (applies) { detected = true; break; }
        }
        if (detected) break;
      }
      if (detected) break;
    }

    if (detected) pushUnique(found, key);
  }

  return found;
}

function extractTargetTypes(targetText) {
  const text = norm(targetText);
  const found = [];
  if (!text) return found;

  if (/\bvoce\b/.test(text)) pushUnique(found, "self");
  if (/\bcriatur(?:a|as)\b|\baliad(?:o|a|os|as)\b|\binimig(?:o|a|os|as)\b/.test(text)) pushUnique(found, "creature");

  const subtypes = [
    ["animal", /\b(?:animal|animais)\b/],
    ["construct", /\bconstrut(?:o|os)\b/],
    ["spirit", /\bespirit(?:o|os)\b/],
    ["humanoid", /\bhumanoid(?:e|es)\b/],
    ["monster", /\bmonstr(?:o|os)\b/],
    ["undead", /\bmort[oa]s?-vivos?\b|\bmortos vivos\b/]
  ];

  for (const [key, regex] of subtypes) {
    if (regex.test(text)) {
      pushUnique(found, "creature");
      pushUnique(found, key);
    }
  }

  if (/\bobjet(?:o|os)\b/.test(text)) pushUnique(found, "object");
  if (/\bplant(?:a|as)\b/.test(text)) pushUnique(found, "plant");
  if (/\bcadaver(?:es)?\b|\bcorpo(?:s)? morto(?:s)?\b/.test(text)) pushUnique(found, "corpse");

  return found;
}

function relationMentionAffects(text, stem) {
  if (!text) return false;

  // Relação citada junto de um verbo que descreve quem recebe/sofre o efeito.
  // Isso evita usar uma menção incidental a aliados/inimigos como se fosse alvo.
  const subjectFirst = new RegExp(
    `\\b${stem}(?:o|a|os|as)\\b[^.!?]{0,70}\\b(?:recebe|recebem|ganha|ganham|fica|ficam|sofre|sofrem|cura|curam|recupera|recuperam|pode|podem|deve|devem|e afetad|sao afetad)`
  );
  const verbFirst = new RegExp(
    `\\b(?:afeta|afetam|atinge|atingem|beneficia|beneficiam|protege|protegem|cura|curam|escolhe|escolhem)[^.!?]{0,70}\\b${stem}(?:o|a|os|as)\\b`
  );

  return subjectFirst.test(text) || verbFirst.test(text);
}

function extractTargetRelations(targetText, contextText = "") {
  const text = norm(targetText);
  const context = norm(contextText);
  const found = [];

  if (/\bvoce\b|\bsi mesmo\b|\bsi mesma\b/.test(text)) {
    pushUnique(found, "self");
  }

  if (/\baliad(?:o|a|os|as)\b/.test(text)) {
    pushUnique(found, "ally");
  }

  if (/\binimig(?:o|a|os|as)\b/.test(text)) {
    pushUnique(found, "enemy");
  }

  // Algumas magias de área possuem alvo estrutural genérico, mas a descrição
  // separa explicitamente aliados e inimigos. Nesses casos a relação é útil
  // para o filtro e pode ser inferida com segurança pelo contexto do efeito.
  if (relationMentionAffects(context, "aliad")) {
    pushUnique(found, "ally");
  }
  if (relationMentionAffects(context, "inimig")) {
    pushUnique(found, "enemy");
  }

  const mentionsCreature = /\bcriatur(?:a|as)\b|\banimal(?:is)?\b|\bconstrut(?:o|os)\b|\bespirit(?:o|os)\b|\bhumanoid(?:e|es)\b|\bmonstr(?:o|os)\b|\bmort[oa]s?-vivos?\b|\bmortos vivos\b/.test(text);

  if (mentionsCreature && !found.includes("ally") && !found.includes("enemy")) {
    pushUnique(found, "any-creature");
  }

  return found;
}

function extractTargetCount(targetText, areaText) {
  // Quantidades por extenso aparecem em diversos aprimoramentos oficiais.
  // Convertê-las antes da extração mantém a categoria/valor numéricos estáveis.
  const cardinal = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
  const target = norm(targetText).replace(
    /\b(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/g,
    word => String(cardinal[word])
  );
  const area = norm(areaText);

  if (area && !target) return { category: "area", value: null };
  if (!target) return { category: "", value: null };

  // "1 criatura por nível" não é um alvo único: a quantidade escala.
  if (/\b(?:por nivel|por cada nivel|por ponto de|para cada nivel|a cada nivel)\b/.test(target)) {
    return { category: "variable", value: null };
  }

  if (/\btod(?:o|a|os|as)\b/.test(target) && /\b(?:alcance|area|criatur|aliad|inimig)/.test(target)) {
    return { category: "all", value: null };
  }

  const upTo = target.match(/\bate\s+(\d+)\b/);
  if (upTo) return { category: "up-to", value: Number(upTo[1]) };

  const exact = target.match(/(?:^|\b)(\d+)\s+(?:alvos?|criaturas?|animal|animais|humanoides?|monstros?|espiritos?|construtos?|mortos-vivos?|objetos?|aliados?|inimigos?)/);
  if (exact) {
    const count = Number(exact[1]);
    if (count === 1) return { category: "one", value: 1 };
    if (count === 2) return { category: "two", value: 2 };
    if (count >= 3) return { category: "three-plus", value: count };
  }

  if (/\bvoce\b|\b1\s+(?:alvo|criatura|objeto|animal|humanoide|monstro|espirito|construto|morto-vivo)\b/.test(target)) {
    return { category: "one", value: 1 };
  }

  if (/\b(?:alvos|criaturas|aliados|inimigos|animais|humanoides|monstros|espiritos|construtos|mortos-vivos|objetos)\b/.test(target)) {
    return { category: "multiple", value: null };
  }

  return { category: "variable", value: null };
}

/** Evita ler "perde RD", "ignora resistência" e "remove imunidade"
 * como benefícios defensivos. Também mantém separados cura e PV temporários.
 */
function extractDefenseKinds(text) {
  const found = [];
  const clauses = effectClauses(text);

  for (const clause of clauses) {
    if (/(?:recebe|aumenta|ganha|fornece|concede)[^.!?;]{0,50}\bdefesa\b|\bbonus[^.!?;]{0,30}\bdefesa\b/.test(clause)
        && !/\b(?:perde|reduz|diminui|remove)\b[^.!?;]{0,40}\bdefesa\b/.test(clause)
        // Penalidade em Defesa é debuff, nunca bônus protetivo.
        && !/\b(?:recebe|recebem|ganha|ganham|sofre|sofrem)\s+[-−–]\s*\d+[^.!?;]{0,25}\bdefesa\b/.test(clause)) {
      pushUnique(found, "defense");
    }

    if (/(?:\b(?:recebe|recebem|ganha|ganham|concede|concedem|fornece|fornecem|possui|possuem|adquire|adquirem|tem)\b[^.!?;]{0,38})?\breducao de dano\b|\b(?:recebe|recebem|ganha|ganham|concede|concedem|fornece|fornecem|possui|possuem|adquire|adquirem|tem)\b[^.!?;]{0,38}\brd\s*\d+\b|^rd\s*\d+\b|\babsorve[^.!?;]{0,35}\bdano\b/.test(clause)
        && !/\b(?:perde|reduz|remove|ignora|anula|atravessa|penetra)\b[^.!?;]{0,35}\b(?:rd|reducao de dano)\b/.test(clause)) {
      pushUnique(found, "damage-reduction");
    }

    if (/\bbonus[^.!?;]{0,45}\b(?:fortitude|reflexos|vontade|testes? de resistencia)\b|\btestes? de resistencia[^.!?;]{0,35}\bbonus\b|\b(?:recebe|recebem|ganha|ganham|concede|fornece)\s+\+\d+\s+(?:em|nos?|na|nas)\s+(?:testes? de resistencia|fortitude|reflexos|vontade)\b/.test(clause)) {
      pushUnique(found, "resistance-tests");
    }

    if (/\bresistencia a\b|\bresistente a\b/.test(clause)
        && !/\b(?:perde|reduz|remove|ignora|anula|diminui|supera)\b[^.!?;]{0,40}\bresistencia a\b/.test(clause)) {
      pushUnique(found, "effect-resistance");
    }

    if (/\bimun(?:e|idade)\b/.test(clause)
        && !/\b(?:perde|remove|ignora(?:m)?|anula|supera|contorna|reduz|diminui)\b[^.!?;]{0,40}\bimun(?:e|idade)\b/.test(clause)) {
      pushUnique(found, "immunity");
    }

    if (/\bpv temporarios\b|\bpontos de vida temporarios\b/.test(clause)
        && !/\b(?:perde|remove|reduz|ignora)\b[^.!?;]{0,36}\b(?:pv|pontos de vida) temporarios\b/.test(clause)) {
      pushUnique(found, "temporary-hp");
    }

    if (/\bcamuflagem\b|\binvisivel\b|\binvisibilidade\b/.test(clause)
        && !/\b(?:remove|perde|ignora|anula|revela|(?:ver|enxergar|enxerga|enxergam)\s+atraves\s+d[aeo]s?)\b[^.!?;]{0,44}\b(?:camuflagem|invisivel|invisibilidade)\b/.test(clause)) {
      pushUnique(found, "concealment");
    }
  }

  return found;
}

function hasDamageRoll(rolls) {
  const list = Array.isArray(rolls) ? rolls : [];
  return list.some(roll => norm(roll?.type) === "dano");
}

/** Não confunde "bônus nas rolagens de dano" ou "absorve dano" com dano
 * aplicado pela magia. Rolagens estruturadas do Foundry continuam prioritárias.
 */
function causesDamage(text) {
  const clauses = effectClauses(text);
  return clauses.some(clause => {
    // "não causa dano" é negação explícita, não uma função ofensiva.
    if (/\bnao\s+(?:causa|causam|provoca|provocam|inflige|infligem|sofre|sofrem)\b[^.!?;]{0,75}\bdano\b/.test(clause)) return false;
    if (/\b(?:causa|causam|provoca|provocam|inflige|infligem|sofre|sofrem)\b[^.!?;]{0,75}\b(?:pontos? de )?dano\b/.test(clause)) {
      return !/\b(?:causa|causam|provoca|provocam|inflige|infligem|sofre|sofrem)\b[^.!?;]{0,65}\b(?:bonus|resistencia|reducao|imunidade|protecao|contra|ignora|absorve|evita|resiste)\b[^.!?;]{0,35}\bdano\b/.test(clause);
    }
    return /\b(?:recebe|recebem)\s+\d+(?:d\d+)?(?:\s*\+\s*\d+)?\s+(?:pontos? de )?dano\b/.test(clause);
  });
}

function healsHitPoints(text) {
  // O alvo pode receber cura E PV temporários na mesma magia. A restrição
  // vale só ao recurso junto ao verbo, não ao documento inteiro.
  return /\b(?:cura|curam|recupera|recuperam|restaura|restauram)\b[^.!?;]{0,65}?\b(?:pv|pontos? de vida)\b(?!\s+temporarios\b)/.test(text);
}

function classifyFunctions({ text, conditions, defenses, rolls }) {
  const found = [];

  const damage = hasDamageRoll(rolls) || causesDamage(text);
  const healing = healsHitPoints(text);
  const defense = defenses.length > 0;

  const movement = hasAny(text, [
    /\bteletransport/,
    /\bdeslocamento\b/,
    /\bvoo\b|\bvoar\b/,
    /\bempurr/,
    /\bpux/,
    /\barremess/,
    /\bmove(?:r|-se)?\s+\d+\s*m\b/,
    /\btransporta\b/,
    /\bcai(?:r|ndo)?\s+lentamente\b|\bqueda suave\b/
  ]);

  const summon = hasAny(text, [
    /\binvoca\s+(?:um|uma|uns|umas|\d+)?\s*(?:criaturas?|monstros?|espiritos?|animais?|mortos?-vivos?|construtos?|enxames?|servos?|elementais?|aliados?|seres?|cavalos?|montarias?|esqueletos?)\b/,
    /\bconjura[^.!?;]{0,60}\b(?:criatura|monstro|espirito|animal|morto-vivo|construto|enxame|esqueleto|montaria|cavalo)s?\b/,
    /\bergu[ea][^.!?;]{0,35}\bmortos?-vivos?\b/,
    /\bcria[^.!?;]{0,60}\b(?:criatura|monstro|espirito|animal|morto-vivo|construto|parceiro|enxame)\b/
  ]);

  const control = conditions.some(condition => CONTROL_CONDITIONS.has(condition))
    || hasAny(text, [
      /\bnao pode(?:m)?\s+(?:agir|se mover|fazer acoes|realizar acoes|atacar)\b/,
      /\bterreno dificil\b/,
      /\bobriga[^.!?;]{0,55}\b(?:ordem|obedecer|agir|fazer)\b/,
      /\bdomina(?:r|do|da)?\b/,
      /\bcontrola(?:r|do|da)?\b/,
      /\bsilencio\b[^.!?;]{0,60}\b(?:magia|conjurar|lancar)\b/
    ]);

  const debuff = conditions.length > 0
    || hasAny(text, [
      /\bsofre(?:m)?\s+(?:uma\s+)?penalidades?\b/,
      /\brecebe(?:m)?\s+[-−–]\d+/,
      /\breduz[^.!?;]{0,45}\b(?:defesa|deslocamento|teste|atributo|dano|ataque)\b/,
      /\bvulneravel\b/
    ]);

  const buff = hasAny(text, [
    /\brecebe(?:m)?\s+\+\d+/,
    /\bganha(?:m)?\s+\+\d+/,
    /\bbonus\s+(?:de\s+)?\+?\d+/,
    /\baumenta[^.!?;]{0,45}\b(?:defesa|deslocamento|atributo|teste|ataque|dano|cd)\b/,
    /\btorna-se treinad[oa]\b|\bse torna treinad[oa]\b/,
    /\b(?:recebe|recebem|ganha|ganham|concede|fornece)[^.!?;]{0,45}\b(?:forca|destreza|constituicao|inteligencia|sabedoria|carisma)\s+\+\d+\b/
  ]) || defense;

  if (damage) pushUnique(found, "damage");
  if (healing) pushUnique(found, "healing");
  if (buff) pushUnique(found, "buff");
  if (debuff) pushUnique(found, "debuff");
  if (defense) pushUnique(found, "defense");
  if (movement) pushUnique(found, "movement");
  if (summon) pushUnique(found, "summon");
  if (control) pushUnique(found, "control");

  return found;
}

export function buildSemanticProfile({
  descriptionText = "",
  target = "",
  area = "",
  effect = "",
  extraText = "",
  rolls = []
} = {}) {
  const text = norm([
    descriptionText,
    target,
    area,
    effect,
    extraText
  ].filter(Boolean).join(" "));

  const elements = extractElements(text);
  const conditions = extractConditions(text);
  const targetTypes = extractTargetTypes(target);
  const targetRelations = extractTargetRelations(target, [descriptionText, effect, extraText].filter(Boolean).join(" "));
  const targetCount = extractTargetCount(target, area);
  const defenses = extractDefenseKinds(text);
  const functions = classifyFunctions({ text, conditions, defenses, rolls });

  return {
    functions,
    elements,
    conditions,
    targetTypes,
    targetRelations,
    targetCount,
    defenses
  };
}

export function buildEnhancementSemanticEntries(enhancements = []) {
  return (Array.isArray(enhancements) ? enhancements : [])
    .map(enhancement => {
      const changeText = (enhancement?.changes ?? [])
        .map(change => change?.value ?? "")
        .filter(Boolean)
        .join(" ");

      const text = clean(
        enhancement?.searchText
        || [enhancement?.text, changeText].filter(Boolean).join(" ")
      );

      if (!text) return null;

      const normalized = norm(text);
      // Uma mera menção a "criatura" ou "você" não muda necessariamente os
      // alvos da magia. Só extraímos os alvos quando há uma instrução explícita
      // de alteração, ou um campo estruturado que altera system.alvo.
      const targetChange = normalized.match(
        /\b(?:muda|altera|modifica|amplia|aumenta|reduz)\s+(?:o\s+)?alvo(?:s)?\s+(?:da magia\s+)?(?:para|a)\s+([^.!?;]+)/
      ) || normalized.match(
        /\b(?:muda|altera|modifica)\s+(?:o|a)\s+(?:alcance|duracao|area|efeito)\b[^.!?;]{0,85}?\be\s+(?:o\s+)?alvo(?:s)?\s+para\s+([^.!?;]+)/
      ) || normalized.match(
        /\b(?:passa a afetar|agora afeta|afeta tambem)\s+([^.!?;]+)/
      );
      const directTargetChange = (enhancement?.changes ?? []).find(change =>
        /(?:^|\.)alvo(?:$|\.)|(?:^|\.)target(?:$|\.)/i.test(String(change?.key ?? ""))
      );
      const countChange = normalized.match(
        /\b(?:muda|altera|aumenta|reduz)\s+(?:o\s+)?(?:numero|quantidade)\s+de\s+alvos\s+(?:para|a)\s+(ate\s+)?(\d+)\b/
      );
      const changedTarget = targetChange?.[1]
        ?? (countChange ? `${countChange[1] ?? ""}${countChange[2]} alvos` : clean(directTargetChange?.value));
      const mentionsArea = /\b(?:muda|altera|amplia|aumenta|reduz)\s+(?:a\s+)?area\b|\b(?:area|cone|linha|esfera|cilindro|explosao)\s+(?:de|com)\s+\d+/.test(normalized);

      return {
        text: clean(enhancement?.text || text),
        cost: Number.isFinite(Number(enhancement?.cost))
          ? Number(enhancement.cost)
          : null,
        profile: buildSemanticProfile({
          descriptionText: text,
          target: changedTarget,
          area: mentionsArea ? text : "",
          extraText: changeText
        })
      };
    })
    .filter(Boolean);
}

export function refreshSpellSemantics(spell, { rolls = null } = {}) {
  if (!spell) return spell;

  const effectiveRolls = rolls
    ?? spell._semanticRolls
    ?? spell.rolls
    ?? [];

  spell._semanticRolls = Array.isArray(effectiveRolls) ? effectiveRolls : [];
  spell.semantics = buildSemanticProfile({
    descriptionText: spell.descriptionText,
    target: spell.target,
    area: spell.area,
    effect: spell.effect,
    rolls: spell._semanticRolls
  });
  spell.enhancementSemantics = buildEnhancementSemanticEntries(spell.enhancements);
  return spell;
}

export function semanticProfileMatches(profile, category, value) {
  if (!value) return true;
  const data = profile ?? {};

  if (category === "function") return data.functions?.includes(value) ?? false;
  if (category === "element") return data.elements?.includes(value) ?? false;
  if (category === "conditionType") return data.conditions?.includes(value) ?? false;
  if (category === "targetType") return data.targetTypes?.includes(value) ?? false;
  if (category === "targetRelation") return data.targetRelations?.includes(value) ?? false;
  if (category === "targetCount") return data.targetCount?.category === value;
  if (category === "defenseType") return data.defenses?.includes(value) ?? false;

  if (category === "conditionPresence") {
    const has = Boolean(data.conditions?.length);
    if (value === "yes") return has;
    if (value === "no") return !has;
  }

  return true;
}

export function runSpellSemanticsSelfTest() {
  const tests = [];
  const test = (name, fn) => {
    try {
      const passed = Boolean(fn());
      tests.push({ name, passed, error: passed ? "" : "resultado inesperado" });
    }
    catch (error) {
      tests.push({ name, passed: false, error: error?.message ?? String(error) });
    }
  };

  test("fogo utilitário reconhece elemento sem inventar dano", () => {
    const p = buildSemanticProfile({ descriptionText: "Você controla uma chama e pode movê-la." });
    return p.elements.includes("fire") && !p.functions.includes("damage");
  });

  test("dano de fogo reconhece função e elemento", () => {
    const p = buildSemanticProfile({ descriptionText: "Uma explosão causa 6d6 pontos de dano de fogo." });
    return p.elements.includes("fire") && p.functions.includes("damage");
  });

  test("atributo mental não vira elemento psíquico", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo recebe +2 em um atributo mental." });
    return !p.elements.includes("psychic");
  });

  test("sombra comum não vira automaticamente Trevas", () => {
    const p = buildSemanticProfile({ descriptionText: "Você cria uma sombra ilusória que acompanha o alvo." });
    return !p.elements.includes("darkness");
  });

  test("cura de PV é reconhecida", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo recupera 2d8+2 PV." });
    return p.functions.includes("healing");
  });

  test("PV temporários são defesa e não cura", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo recebe 20 PV temporários." });
    return p.functions.includes("defense")
      && p.defenses.includes("temporary-hp")
      && !p.functions.includes("healing");
  });

  test("bônus de Defesa é buff defensivo", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo recebe +5 na Defesa." });
    return p.functions.includes("buff")
      && p.functions.includes("defense")
      && p.defenses.includes("defense");
  });

  test("RD é reconhecida como proteção", () => {
    const p = buildSemanticProfile({ descriptionText: "Você recebe RD 10." });
    return p.defenses.includes("damage-reduction");
  });

  test("movimentação reconhece teleporte", () => {
    const p = buildSemanticProfile({ descriptionText: "Você se teletransporta para um espaço em alcance médio." });
    return p.functions.includes("movement");
  });

  test("invocação reconhece criatura conjurada", () => {
    const p = buildSemanticProfile({ descriptionText: "Você invoca um espírito para auxiliá-lo." });
    return p.functions.includes("summon");
  });

  test("condição causada é detectada", () => {
    const p = buildSemanticProfile({ descriptionText: "Se falhar, o alvo fica abalado por 1 rodada." });
    return p.conditions.includes("abalado") && p.functions.includes("debuff");
  });

  test("remoção de condição não é confundida com causar", () => {
    const p = buildSemanticProfile({ descriptionText: "Você remove a condição fatigado do alvo." });
    return !p.conditions.includes("fatigado");
  });

  test("condição incapacitante também é controle", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo fica paralisado por 1 rodada." });
    return p.conditions.includes("paralisado") && p.functions.includes("control");
  });

  test("animal também conta como criatura", () => {
    const p = buildSemanticProfile({ target: "1 animal" });
    return p.targetTypes.includes("animal") && p.targetTypes.includes("creature");
  });

  test("alvo único é reconhecido", () => {
    const p = buildSemanticProfile({ target: "1 criatura" });
    return p.targetCount.category === "one" && p.targetCount.value === 1;
  });

  test("criatura genérica é relação qualquer criatura", () => {
    const p = buildSemanticProfile({ target: "1 criatura" });
    return p.targetRelations.includes("any-creature")
      && !p.targetRelations.includes("ally")
      && !p.targetRelations.includes("enemy");
  });

  test("aliado é reconhecido como relação de alvo", () => {
    const p = buildSemanticProfile({ target: "até 3 aliados" });
    return p.targetRelations.includes("ally")
      && !p.targetRelations.includes("any-creature");
  });

  test("inimigos são reconhecidos como relação de alvo", () => {
    const p = buildSemanticProfile({ target: "inimigos no alcance" });
    return p.targetRelations.includes("enemy");
  });

  test("você é reconhecido como relação própria", () => {
    const p = buildSemanticProfile({ target: "você" });
    return p.targetRelations.includes("self");
  });

  test("contagem exata é exibida sem perder categoria", () => {
    const p = buildSemanticProfile({ target: "6 criaturas" });
    return p.targetCount.category === "three-plus"
      && p.targetCount.value === 6
      && targetCountDisplay(p.targetCount) === "6 alvos";
  });

  test("até dez alvos preserva valor e categoria", () => {
    const p = buildSemanticProfile({ target: "até 10 criaturas" });
    return p.targetCount.category === "up-to" && p.targetCount.value === 10;
  });

  test("área sem alvo usa categoria área", () => {
    const p = buildSemanticProfile({ area: "esfera com 6m de raio" });
    return p.targetCount.category === "area";
  });

  test("descrição de área pode distinguir aliados", () => {
    const p = buildSemanticProfile({
      area: "esfera com 9m de raio",
      descriptionText: "Aliados na área recebem +5 na Defesa."
    });
    return p.targetRelations.includes("ally") && !p.targetRelations.includes("enemy");
  });

  test("descrição de área pode distinguir aliados e inimigos", () => {
    const p = buildSemanticProfile({
      area: "esfera com 9m de raio",
      descriptionText: "Aliados na área recebem +5 na Defesa. Inimigos na área ficam lentos."
    });
    return p.targetRelations.includes("ally") && p.targetRelations.includes("enemy");
  });

  test("menção incidental a aliado não vira relação de alvo", () => {
    const p = buildSemanticProfile({
      target: "1 criatura",
      descriptionText: "Você reconhece se a criatura possui aliados próximos."
    });
    return p.targetRelations.includes("any-creature") && !p.targetRelations.includes("ally");
  });

  test("absorção de dano é tratada como proteção", () => {
    const p = buildSemanticProfile({ descriptionText: "Uma película protetora absorve 20 pontos de dano." });
    return p.functions.includes("defense") && p.defenses.includes("damage-reduction");
  });

  test("aprimoramento preserva custo e semântica", () => {
    const [entry] = buildEnhancementSemanticEntries([{
      text: "Muda o alvo para animais e humanoides escolhidos.",
      searchText: "+2 PM: muda o alvo para animais e humanoides escolhidos.",
      cost: 2,
      changes: []
    }]);
    return entry.cost === 2
      && entry.profile.targetTypes.includes("animal")
      && entry.profile.targetTypes.includes("humanoid")
      && entry.profile.targetRelations.includes("any-creature");
  });

  test("negação explícita não causa condição", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo não fica abalado ao ser atingido." });
    return !p.conditions.includes("abalado") && !p.functions.includes("debuff");
  });

  test("bônus contra condição não aplica condição", () => {
    const p = buildSemanticProfile({ descriptionText: "A criatura recebe bônus nos testes contra a condição paralisado." });
    return !p.conditions.includes("paralisado") && !p.functions.includes("control");
  });

  test("menção de condição numa frase e aplicação em outra", () => {
    const p = buildSemanticProfile({ descriptionText: "Remove a condição fatigado. Em seguida o inimigo fica abalado." });
    return !p.conditions.includes("fatigado") && p.conditions.includes("abalado");
  });

  test("cura e PV temporários podem coexistir", () => {
    const p = buildSemanticProfile({ descriptionText: "A magia cura 2d8 PV e concede 10 PV temporários." });
    return p.functions.includes("healing") && p.functions.includes("defense") && p.defenses.includes("temporary-hp");
  });

  test("rolagem de dano concedida não é dano direto", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo recebe +2 nas rolagens de dano." });
    return p.functions.includes("buff") && !p.functions.includes("damage");
  });

  test("proteção por RD não inflige dano", () => {
    const p = buildSemanticProfile({ descriptionText: "Você recebe RD 10 e ignora 10 pontos de dano." });
    return p.functions.includes("defense") && !p.functions.includes("damage");
  });

  test("redução de RD alheia não concede RD", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo perde RD 10." });
    return !p.defenses.includes("damage-reduction");
  });

  test("ignorar imunidade não concede imunidade", () => {
    const p = buildSemanticProfile({ descriptionText: "Seus ataques ignoram imunidade a fogo." });
    return !p.defenses.includes("immunity");
  });

  test("invocar uma palavra não invoca criatura", () => {
    const p = buildSemanticProfile({ descriptionText: "Você invoca o nome de uma divindade e recebe +2 em testes." });
    return !p.functions.includes("summon");
  });

  test("1 criatura por nível usa contagem variável", () => {
    const p = buildSemanticProfile({ target: "1 criatura por nível" });
    return p.targetCount.category === "variable";
  });

  test("aprimoramento narrativo não altera tipo/quantidade de alvo", () => {
    const [entry] = buildEnhancementSemanticEntries([{ text: "+2 PM: você protege uma criatura de dano de frio.", cost: 2 }]);
    return entry.profile.targetTypes.length === 0
      && !entry.profile.targetCount.category
      && entry.profile.elements.includes("cold");
  });

  test("aprimoramento com mudança explícita classifica alvo e contagem", () => {
    const [entry] = buildEnhancementSemanticEntries([{ text: "+2 PM: muda o alvo para até 3 aliados.", cost: 2 }]);
    return entry.profile.targetRelations.includes("ally")
      && entry.profile.targetCount.category === "up-to" && entry.profile.targetCount.value === 3;
  });

  test("dano estruturado continua tendo prioridade", () => {
    const p = buildSemanticProfile({ descriptionText: "Uma explosão de impacto.", rolls: [{ type: "dano" }] });
    return p.functions.includes("damage");
  });

  test("negativa de dano não cria função ofensiva", () => {
    const p = buildSemanticProfile({ descriptionText: "Esta barreira não causa dano de fogo." });
    return p.elements.includes("fire") && !p.functions.includes("damage");
  });

  test("bônus de resistência seguido de redução não apaga o benefício", () => {
    const p = buildSemanticProfile({ descriptionText: "O alvo recebe resistência a fogo +5, mas perde resistência a frio." });
    return p.defenses.includes("effect-resistance") && p.functions.includes("defense");
  });

  test("invocação plural numérica é reconhecida", () => {
    const p = buildSemanticProfile({ descriptionText: "Você invoca 6 mortos-vivos que lutam por você." });
    return p.functions.includes("summon");
  });

  test("aprimoramento que altera quantidade gera contagem adequada", () => {
    const [entry] = buildEnhancementSemanticEntries([{ text: "+3 PM: muda o número de alvos para até 6.", cost: 3 }]);
    return entry.profile.targetCount.category === "up-to" && entry.profile.targetCount.value === 6;
  });

  test("palavras maiores não contam como condições", () => {
    const p = buildSemanticProfile({ descriptionText: "Você recebe +2 em um talento especial." });
    return !p.conditions.includes("lento");
  });

  const failures = tests.filter(result => !result.passed);
  return {
    ok: failures.length === 0,
    total: tests.length,
    passed: tests.length - failures.length,
    failures,
    tests
  };
}
