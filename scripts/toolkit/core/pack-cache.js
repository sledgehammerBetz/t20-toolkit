/**
 * Cache dos compêndios no navegador (IndexedDB), para não baixar tudo de novo a cada sessão.
 * Só guarda compêndios trancados do sistema ou de módulos: o conteúdo deles só muda quando o pacote
 * muda de versão, e a versão faz parte da assinatura. Compêndios do mundo ou destrancados sempre vêm do servidor.
 * Qualquer falha (navegador sem IndexedDB, cota cheia, aba anônima) cai no download normal.
 */
import { MODULE_VERSION } from '../../constants.js';

const DB_NAME = 't20-toolkit';
const STORE = 'packs';
const SCHEMA = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const req = globalThis.indexedDB?.open(DB_NAME, SCHEMA);
      if (!req) return resolve(null);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

/** Assinatura do conteúdo do compêndio, ou null quando ele não pode ir para o cache. Exportada para testes. */
export function packSignature(pack, gameRef = globalThis.game) {
  const md = pack?.metadata ?? {};
  if (!pack?.locked || !['system', 'module'].includes(md.packageType)) return null;
  const pkg = md.packageType === 'system' ? gameRef?.system : gameRef?.modules?.get?.(md.packageName);
  if (!pkg?.version) return null;
  return [MODULE_VERSION, md.packageType, md.packageName, pkg.version, gameRef?.version ?? ''].join('|');
}

const keyOf = (kind, pack) => `${kind}:${pack.collection}`;

/** Lê o que foi guardado para este compêndio; null se não houver ou se a assinatura mudou. */
export async function readPack(kind, pack, gameRef) {
  const sig = packSignature(pack, gameRef);
  if (!sig) return null;
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyOf(kind, pack));
      req.onsuccess = () => resolve(req.result?.sig === sig ? req.result.data : null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Guarda sem esperar; erro só vira aviso no console. */
export async function writePack(kind, pack, data, gameRef) {
  const sig = packSignature(pack, gameRef);
  if (!sig) return;
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put({ sig, data }, keyOf(kind, pack));
  } catch (error) {
    console.warn(`[T20 Toolkit] Não foi possível guardar ${pack.collection} no cache do navegador:`, error);
  }
}
