/** Metadados de aprimoramentos (execução, alcance, duração, resistência, alvo/área/efeito). Portado do Criador de Engenhocas 0.43. */
import {
  eng5PushUnique,
  eng5Truthy,
  eng5ResistanceKeyFromText,
  eng5ResistanceRemoved,
  eng5RangeKeyFromText,
  eng5ExecutionKeyFromText,
  eng5DurationKeyFromText,
  eng5EmptyMeta,
  eng5RelevantChangeKey
} from "./enhancement-parsers.js";

import {
  SCHOOL_LABELS,
  eng4ExecutionKey,
  eng4ExecutionLabel,
  eng4RangeKey,
  eng4RangeLabel,
  labelFrom,
  spellTypeLabel,
  resistanceSkillLabel,
  eng4TranslateDurationLiteral,
  eng4DurationKey,
  eng4DurationLabel
} from "./spell-metadata.js";

import {
  semanticProfileMatches,
  buildSemanticProfile,
  buildEnhancementSemanticEntries,
  functionLabel,
  elementLabel,
  conditionLabel,
  targetTypeLabel,
  targetRelationLabel,
  targetCountLabel,
  defenseLabel
} from "./spell-semantics.js";

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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rangeKeyFromChange(value) {
  const parsed = eng5RangeKeyFromText(value);
  if (parsed) return parsed;
  const exact = eng4RangeKey(value);
  return exact === "spec" ? "" : exact;
}

function executionKeyFromChange(value) {
  const parsed = eng5ExecutionKeyFromText(value);
  if (parsed) return parsed;
  const exact = eng4ExecutionKey(value);
  return exact === "special" ? "" : exact;
}

function durationKeyFromChange(value) {
  const parsed = eng5DurationKeyFromText(value);
  if (parsed) return parsed;
  const exact = eng4DurationKey(eng4TranslateDurationLiteral(value));
  return exact === "special" ? "" : exact;
}

/**
 * Constrói os metadados de aprimoramentos a partir do índice/Document já
 * disponível. Esta função é propositalmente independente do estado da janela,
 * pois também é reutilizada pelo cache de Documents.
 */
export function buildEnhancementMetaFromIndex(spell) {
  if (spell?._eng6EnhancementMeta) return spell._eng6EnhancementMeta;

  const meta = eng5EmptyMeta();
  const rawEffects = Array.isArray(spell?._eng6RawEffects)
    ? spell._eng6RawEffects
    : [];

  for (const effect of rawEffects) {
    const flags = effect?.flags?.tormenta20 ?? {};
    const changes = Array.isArray(effect?.changes) ? effect.changes : [];
    const label = clean(effect?.name ?? effect?.label ?? "");
    const hasCost = flags.custo !== undefined
      && flags.custo !== null
      && clean(flags.custo) !== "";

    const looksLikeEnhancement = hasCost
      || eng5Truthy(flags.onuse)
      || eng5Truthy(flags.aumenta)
      || /^\s*\+\s*\d+\s*pm\b/i.test(label)
      || changes.some(change => eng5RelevantChangeKey(change?.key));

    if (!looksLikeEnhancement) continue;

    for (const change of changes) {
      const key = norm(change?.key);
      const value = clean(change?.value);
      if (!key) continue;

      if (key.includes("alcance")) {
        eng5PushUnique(meta.ranges, rangeKeyFromChange(value));
      }

      if (key.includes("execucao")) {
        eng5PushUnique(meta.executions, executionKeyFromChange(value));
      }

      if (key.includes("duracao")) {
        eng5PushUnique(meta.durations, durationKeyFromChange(value));
      }

      if (key.includes("resistencia")) {
        const resistanceKey = eng5ResistanceKeyFromText(value);

        if (resistanceKey) {
          eng5PushUnique(meta.resistanceSkills, resistanceKey);
          eng5PushUnique(meta.resistancePresence, "yes");
        }
        else if (eng5ResistanceRemoved(value)) {
          eng5PushUnique(meta.resistancePresence, "no");
        }
        else if (value) {
          eng5PushUnique(meta.resistanceSkills, "other");
          eng5PushUnique(meta.resistancePresence, "yes");
        }
      }

      if (key.includes("alvo")) eng5PushUnique(meta.applicationKinds, "target");
      if (key.includes("area")) eng5PushUnique(meta.applicationKinds, "area");
      if (key.includes("efeito")) eng5PushUnique(meta.applicationKinds, "effect");
    }

    const text = norm([
      label,
      flags.descricao,
      flags.description,
      ...changes.map(change => change?.value ?? "")
    ].filter(Boolean).join(" "));

    if (!text) continue;

    if (text.includes("alcance")) {
      eng5PushUnique(meta.ranges, eng5RangeKeyFromText(text));
    }

    if (
      text.includes("execucao")
      || text.includes("acao ")
      || text.includes("action")
    ) {
      eng5PushUnique(meta.executions, eng5ExecutionKeyFromText(text));
    }

    if (
      text.includes("duracao")
      || text.includes("passa a durar")
      || text.includes("dura por")
      || text.includes("ate o fim da cena")
    ) {
      eng5PushUnique(meta.durations, eng5DurationKeyFromText(text));
    }

    if (text.includes("resist")) {
      const resistanceKey = eng5ResistanceKeyFromText(text);
      if (resistanceKey) {
        eng5PushUnique(meta.resistanceSkills, resistanceKey);
        eng5PushUnique(meta.resistancePresence, "yes");
      }
      if (eng5ResistanceRemoved(text)) {
        eng5PushUnique(meta.resistancePresence, "no");
      }
    }

    if (/\balvos?\b/.test(text)) {
      eng5PushUnique(meta.applicationKinds, "target");
    }

    if (
      text.includes("area")
      || /\b(?:cone|linha|esfera|explosao|cilindro)\b/.test(text)
    ) {
      eng5PushUnique(meta.applicationKinds, "area");
    }
  }

  for (const enhancement of spell?.enhancements ?? []) {
    const text = norm(
      enhancement?.searchText
      || enhancement?.text
      || ""
    );

    if (!text) continue;

    if (text.includes("alcance")) {
      eng5PushUnique(meta.ranges, eng5RangeKeyFromText(text));
    }

    if (
      text.includes("execucao")
      || text.includes("acao ")
      || text.includes("action")
    ) {
      eng5PushUnique(meta.executions, eng5ExecutionKeyFromText(text));
    }

    if (
      text.includes("duracao")
      || text.includes("passa a durar")
      || text.includes("dura por")
      || text.includes("ate o fim da cena")
    ) {
      eng5PushUnique(meta.durations, eng5DurationKeyFromText(text));
    }

    if (text.includes("resist")) {
      const resistanceKey = eng5ResistanceKeyFromText(text);
      if (resistanceKey) {
        eng5PushUnique(meta.resistanceSkills, resistanceKey);
        eng5PushUnique(meta.resistancePresence, "yes");
      }
      if (eng5ResistanceRemoved(text)) {
        eng5PushUnique(meta.resistancePresence, "no");
      }
    }

    if (/\balvos?\b/.test(text)) {
      eng5PushUnique(meta.applicationKinds, "target");
    }

    if (
      text.includes("area")
      || /\b(?:cone|linha|esfera|explosao|cilindro)\b/.test(text)
    ) {
      eng5PushUnique(meta.applicationKinds, "area");
    }
  }

  spell._eng6EnhancementMeta = meta;
  return meta;
}

function controlValue(root, selector, fallback = "") {
  return root?.querySelector?.(selector)?.value ?? fallback;
}

function controlChecked(root, selector) {
  return Boolean(root?.querySelector?.(selector)?.checked);
}

/**
 * Motor completo de filtros do Criador.
 *
 * O estado mutável da janela é recebido por callbacks. Dessa forma o motor
 * permanece isolado, mas preserva o comportamento validado do runtime antigo.
 */
