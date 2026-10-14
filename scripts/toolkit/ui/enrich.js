/**
 * Descrições com links que funcionam.
 * As magias e poderes do sistema apontam para as condições como `@UUID[JournalEntry.<id>.JournalEntryPage.<id>]`,
 * ou seja, para um diário do MUNDO. Se o diário não foi importado, o Foundry desenha o link como quebrado
 * (dá para clicar, mas nada abre). Aqui o link é reescrito para o diário do compêndio (ex.: tormenta20.basico)
 * quando o mundo não tem aquele diário.
 */

let journalPacks = null;

/** id do diário → coleção do compêndio que o contém. */
async function journalPackMap(gameRef = globalThis.game) {
  if (journalPacks) return journalPacks;
  const map = new Map();
  for (const pack of [...(gameRef?.packs ?? [])].filter(p => p.documentName === 'JournalEntry')) {
    try {
      const index = pack.index?.size ? pack.index : await pack.getIndex();
      for (const e of index) if (!map.has(e._id)) map.set(e._id, pack.collection);
    } catch (error) {
      console.warn(`[T20 Toolkit] Não foi possível ler o diário ${pack.collection}:`, error);
    }
  }
  journalPacks = map;
  return map;
}

/** Reescreve `@UUID[JournalEntry.X…]` para `@UUID[Compendium.<pack>.JournalEntry.X…]` quando o mundo não tem X. */
export async function fixWorldLinks(html, gameRef = globalThis.game) {
  const text = String(html ?? '');
  if (!text.includes('@UUID[JournalEntry.')) return text;
  const map = await journalPackMap(gameRef);
  return text.replace(/@UUID\[JournalEntry\.([A-Za-z0-9]{16})([^\]]*)\]/g, (all, id, rest) => {
    if (gameRef?.journal?.get?.(id)) return all;
    const pack = map.get(id);
    return pack ? `@UUID[Compendium.${pack}.JournalEntry.${id}${rest}]` : all;
  });
}

/** enrichHTML com os links consertados. */
export async function enrichDescription(html, relativeTo) {
  const TE = foundry.applications.ux.TextEditor.implementation;
  return TE.enrichHTML(await fixWorldLinks(html), { relativeTo });
}
