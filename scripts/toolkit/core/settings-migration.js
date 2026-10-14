/** Migração não destrutiva das preferências da versão antiga do módulo. */
import { MODULE_ID } from '../../constants.js';
export const LEGACY_MODULE_ID = 't20-engenhocas';
export const MIGRATABLE_KEYS = Object.freeze(['directUse', 'actorSheetButton', 'toolkitSheetButton']);

function worldStore(gameRef) {
  return gameRef?.settings?.storage?.get?.('world') ?? null;
}

function readBooleanSetting(store, id) {
  // Storage retorna Setting document {key,value}, não o resultado de game.settings.get().
  const record = store?.get?.(id);
  const raw = record?.value;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return null; // Nunca aplicar dados inesperados ou defaults inexistentes.
}

/**
 * GM copia apenas valores explicitamente salvos no escopo antigo.
 * Valores já persistidos no novo módulo têm prioridade.
 * Não chama unset, delete nem remove flags existentes.
 */
export async function migrateLegacyWorldSettings({gameRef=globalThis.game,logger=console}={}) {
  if (!gameRef?.user?.isGM) return {status:'skipped-not-gm',copied:[],preserved:[]};
  if (gameRef?.modules?.get?.(LEGACY_MODULE_ID)?.active) {
    return {status:'conflict-legacy-active',copied:[],preserved:[]};
  }
  const store = worldStore(gameRef);
  if (!store) return {status:'no-storage',copied:[],preserved:[]};
  const copied=[];
  const preserved=[];
  const failed=[];
  for (const key of MIGRATABLE_KEYS) {
    const oldValue = readBooleanSetting(store,`${LEGACY_MODULE_ID}.${key}`);
    if (oldValue === null) continue;
    if (store.get?.(`${MODULE_ID}.${key}`)) {
      preserved.push(key);
      continue;
    }
    try {
      await gameRef.settings.set(MODULE_ID,key,oldValue);
      copied.push(key);
    } catch (error) {
      failed.push(key);
      logger?.warn?.(`[T20 Toolkit] Não foi possível migrar a opção ${key}:`,error);
    }
  }
  return {status:failed.length?'partial-failure':'ok',copied,preserved,failed};
}
