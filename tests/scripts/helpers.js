/**
 * Peças comuns dos testes: carregar módulos do Toolkit, montar personagens de exemplo a partir dos compêndios
 * e limpar tudo no fim. Os personagens ficam na pasta "Testes automáticos" e são apagados depois de cada bateria.
 */
export const TK = '/modules/t20-toolkit/scripts/toolkit';
export const tk = path => import(`${TK}/${path}`);

export const FOLDER_NAME = 'Testes automáticos';
export const wait = ms => new Promise(r => setTimeout(r, ms));

/** Espera `fn()` devolver algo verdadeiro (ou estoura depois de `timeout` ms). */
export async function waitFor(fn, { timeout = 8000, step = 100, what = 'condição' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Tempo esgotado esperando ${what}.`);
    await wait(step);
  }
}

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Documento de compêndio pelo nome exato (procura em todos os compêndios de Item, ou só em `pack`). */
export async function compendiumItem(name, { pack = null, type = null } = {}) {
  const packs = pack ? [game.packs.get(pack)] : game.packs.filter(p => p.documentName === 'Item');
  for (const p of packs) {
    const entry = p?.index.find(e => fold(e.name) === fold(name) && (!type || e.type === type));
    if (entry) return p.getDocument(entry._id);
  }
  throw new Error(`Item "${name}" não encontrado nos compêndios.`);
}

/** Dados de item prontos para a ficha, com origem no compêndio e mudanças opcionais (`patch` em notação de ponto). */
export async function itemData(name, { patch = {}, ...opts } = {}) {
  const doc = await compendiumItem(name, opts);
  const data = doc.toObject();
  data._stats = { ...(data._stats ?? {}), compendiumSource: doc.uuid };
  for (const [k, v] of Object.entries(patch)) foundry.utils.setProperty(data, k, v);
  return data;
}

/** Classe com nível. */
export const classData = (name, level) => itemData(name, { type: 'classe', patch: { 'system.niveis': level } });

/** Magia com a origem gravada pelo Buscador (`flags.t20-toolkit.learnedBy`). */
export const spellData = (name, learnedBy = null) =>
  itemData(name, { type: 'magia', patch: learnedBy ? { 'flags.t20-toolkit.learnedBy': learnedBy } : {} });

async function testFolder() {
  return game.folders.find(f => f.type === 'Actor' && f.name === FOLDER_NAME)
    ?? Folder.create({ name: FOLDER_NAME, type: 'Actor', color: '#7a1f1f' });
}

/**
 * Cria um personagem de exemplo.
 * @param {string} name
 * @param {{attrs?:Record<string,number>, items?:Promise<object>[]|object[], system?:object, flags?:object}} o
 */
export async function makeActor(name, { attrs = {}, items = [], system = {}, flags = {} } = {}) {
  const folder = await testFolder();
  const atributos = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { base: v }]));
  const actor = await Actor.create({
    name: `[Teste] ${name}`, type: 'character', folder: folder.id,
    system: foundry.utils.mergeObject({ atributos }, system), flags
  });
  // Itens entram depois, como no arrastar para a ficha: só assim os efeitos dos poderes passam para o ator.
  if (items.length) await addItems(actor, items);
  return actor;
}

/**
 * Adiciona itens a uma ficha já criada e espera os efeitos transferidos chegarem ao ator
 * (o Tormenta20 usa a transferência antiga, que cria os efeitos do ator logo depois dos itens).
 */
export async function addItems(actor, items) {
  const before = actor.effects.size;
  const created = await actor.createEmbeddedDocuments('Item', await Promise.all(items));
  const expected = created.reduce((n, i) => n + i.effects.filter(e => e.transfer).length, 0);
  if (expected) await waitFor(() => actor.effects.size >= before + expected, { what: 'os efeitos dos poderes' });
  return created;
}

/** Apaga os personagens de teste, as mensagens que eles geraram e as janelas abertas por eles. */
export async function cleanup() {
  const folder = game.folders.find(f => f.type === 'Actor' && f.name === FOLDER_NAME);
  const actors = game.actors.filter(a => a.folder?.id === folder?.id || a.name.startsWith('[Teste] '));
  const ids = new Set(actors.map(a => a.id));
  for (const app of foundry.applications.instances.values()) {
    if (app.options?.actor && ids.has(app.options.actor.id) || app.actor && ids.has(app.actor.id)) await app.close?.();
  }
  const messages = game.messages.filter(m => ids.has(m.speaker?.actor));
  if (messages.length) await ChatMessage.deleteDocuments(messages.map(m => m.id));
  if (actors.length) await Actor.deleteDocuments([...ids]);
}

/** Abre uma janela do Toolkit e espera ela aparecer no DOM. */
export async function openApp(open, { selector = '.window-content' } = {}) {
  const app = await open();
  await waitFor(() => app?.rendered && app.element?.querySelector(selector), { what: 'a janela abrir' });
  return app;
}

/** Clica num elemento da janela e espera o próximo render. */
export async function clickAndRender(app, selector, { timeout = 8000 } = {}) {
  const el = app.element.querySelector(selector);
  if (!el) throw new Error(`Elemento não encontrado: ${selector}`);
  const before = app.element.querySelector('.window-content')?.innerHTML;
  el.click();
  await waitFor(() => app.element.querySelector('.window-content')?.innerHTML !== before, { timeout, what: `a janela atualizar depois de ${selector}` }).catch(() => null);
  await wait(150);
  return app;
}
