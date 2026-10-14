/**
 * T20 Engenhocas — enhancement presentation/content helpers.
 *
 * This module deliberately contains only the logic that turns spell
 * ActiveEffects and rich descriptions into the data shown in the Creator.
 * Loading compendium documents, caching and filter orchestration remain in
 * runtime.js so this extraction does not change the async behavior validated
 * in v0.7.1.
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

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

export function htmlToPlainText(value) {
  const html = clean(value);
  if (!html) return "";

  let text;

  try {
    const template = document.createElement("template");
    template.innerHTML = html;
    text = clean(template.content.textContent);
  }
  catch (_error) {
    text = html.replace(/<[^>]+>/g, " ");
  }

  // Foundry stores content links in source descriptions as inline tokens such
  // as @UUID[...]{Abalado}. When rich-text enrichment is unavailable (for
  // example in a plain-text enhancement/search path), keep the human label
  // instead of leaking the raw UUID token to the player.
  text = text
    .replace(/@UUID\[[^\]]+\](?:\{([^}]+)\})?/g, (match, label) => label || match)
    .replace(/@(Actor|Item|JournalEntry|Scene|RollTable|Macro|Playlist|Cards|Compendium)\[[^\]]+\](?:\{([^}]+)\})?/g, (match, _type, label) => label || match);

  return clean(text).replace(/\s+/g, " ");
}


export function safeRichHTML(value) {
  const html = clean(value);
  if (!html) return "";

  try {
    const template = document.createElement("template");
    template.innerHTML = html;

    for (const blocked of template.content.querySelectorAll(
      "script, iframe, object, embed, style"
    )) {
      blocked.remove();
    }

    for (const element of template.content.querySelectorAll("*")) {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        const valueText = clean(attribute.value).toLowerCase();
        if (
          name.startsWith("on")
          || (["href", "src"].includes(name) && valueText.startsWith("javascript:"))
        ) {
          element.removeAttribute(attribute.name);
        }
      }
    }

    return template.innerHTML;
  }
  catch (_error) {
    return `<p>${esc(htmlToPlainText(html))}</p>`;
  }
}

export function extractEnhancements(effects) {
  const list = Array.isArray(effects)
    ? effects
    : (Array.isArray(effects?.contents) ? effects.contents : []);

  return list
    .map(effect => {
      const flags = effect?.flags?.tormenta20 ?? {};
      const label = clean(effect?.label ?? effect?.name);

      const hasCostFlag =
        flags.custo !== undefined
        && flags.custo !== null
        && clean(flags.custo) !== "";

      const onUse =
        flags.onuse === true
        || flags.onuse === 1
        || ["sim", "true", "yes", "1"].includes(norm(flags.onuse));

      // Alguns compêndios/suplementos não mantêm flags.custo/onuse no
      // ActiveEffect, mas preservam o custo diretamente no nome.
      const labelCostMatch = label.match(/^\s*\+?\s*(\d+)\s*PM\b\s*:?\s*/i);
      const isTrick = /^\s*truque\b\s*:?\s*/i.test(label);
      const looksLikeEnhancement = !!labelCostMatch || isTrick;

      if (!onUse && !hasCostFlag && !looksLikeEnhancement) return null;

      const changes = (Array.isArray(effect?.changes) ? effect.changes : [])
        .map(change => ({
          key: clean(change?.key),
          mode: change?.mode,
          value: clean(change?.value)
        }))
        .filter(change => change.key || change.value);

      const descriptionText = [
        effect?.description,
        effect?.system?.description?.value,
        effect?.system?.description,
        flags.descricao,
        flags.description
      ]
        .map(value => htmlToPlainText(value))
        .filter(Boolean)
        .join(" ");

      const changeText = changes
        .map(change => htmlToPlainText(change.value))
        .filter(Boolean)
        .join(" ");

      let text = label;

      // Se o nome for apenas o custo (por exemplo "+2 PM"), usa a
      // descrição/alteração como texto apresentado ao jogador.
      if (
        /^\s*\+?\s*\d+\s*PM\s*:?\s*$/i.test(label)
        || /^\s*truque\s*:?\s*$/i.test(label)
      ) {
        text = clean(descriptionText || changeText || label);
      }

      if (!text) text = clean(descriptionText || changeText);
      if (!text) return null;

      let cost = null;
      const flaggedCost = Number(flags.custo);

      if (Number.isFinite(flaggedCost)) cost = flaggedCost;
      else if (labelCostMatch) cost = Number(labelCostMatch[1]);
      else if (isTrick) cost = 0;

      const detailText = clean(
        [label, descriptionText, changeText]
          .filter(Boolean)
          .join(" ")
      );

      return {
        text,
        cost,
        increases:
          flags.aumenta === true
          || flags.aumenta === 1
          || ["sim", "true", "yes", "1"].includes(norm(flags.aumenta)),
        changes,
        searchText: detailText
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      (a.cost ?? Number.MAX_SAFE_INTEGER) - (b.cost ?? Number.MAX_SAFE_INTEGER)
      || a.text.localeCompare(b.text, "pt-BR")
    );
}

/**
 * Regression tests for the ActiveEffect -> enhancement presentation layer.
 * No Foundry globals are required. In Node, htmlToPlainText intentionally
 * exercises its safe fallback because `document` is unavailable.
 */
export function runEnhancementContentSelfTest() {
  const effects = [
    {
      name: "+2 PM",
      flags: { tormenta20: { custo: 2, onuse: true } },
      description: "<p>Muda o alcance para <strong>longo</strong>.</p>",
      changes: [{ key: "system.alcance", mode: 5, value: "long" }]
    },
    {
      name: "Truque: muda a duração para 1 rodada.",
      changes: []
    },
    {
      name: "+3 PM: aumenta o dano em +2d6.",
      changes: []
    },
    {
      name: "Efeito passivo que não é aprimoramento",
      changes: []
    }
  ];

  const extracted = extractEnhancements(effects);
  const cases = [
    ["quantidade", extracted.length, 3],
    ["custo via flag", extracted[1]?.cost ?? extracted[0]?.cost, 2],
    ["truque custo zero", extracted.some(e => e.cost === 0 && /truque/i.test(e.text)), true],
    ["custo via nome", extracted.some(e => e.cost === 3), true],
    ["descrição do +2 PM", extracted.some(e => e.cost === 2 && /alcance para longo/i.test(e.text)), true],
    ["texto simples de HTML", htmlToPlainText("<p>Olá <strong>Arton</strong></p>"), "Olá Arton"],
    ["UUID em texto vira rótulo", htmlToPlainText("Falha: @UUID[JournalEntry.abc.JournalEntryPage.def]{Abalado}."), "Falha: Abalado."]
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
