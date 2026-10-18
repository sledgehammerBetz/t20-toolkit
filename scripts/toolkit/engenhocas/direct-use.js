/**
 * Uso direto: usar uma engenhoca pela ficha (clique no item) abre a ativação do Toolkit
 * em vez do cartão comum do equipamento. Com libWrapper usa o modo MIXED; sem ele, troca o método.
 */
import { MODULE_ID } from '../../constants.js';
import { isEngenhoca } from './engenhocas-rules.js';

const TARGET = 'CONFIG.Item.documentClass.prototype.roll';
let installed = false;

export function registerDirectUseSetting() {
  game.settings.register(MODULE_ID, 'directUse', {
    name: 'Engenhocas: usar pela ficha',
    hint: 'Usar uma engenhoca pela ficha faz o teste de ativação do Toolkit (com aprimoramentos e aparatos).',
    scope: 'world', config: true, type: Boolean, default: true
  });
}

const enabled = () => { try { return game.settings.get(MODULE_ID, 'directUse') !== false; } catch { return true; } };

export function installDirectUse() {
  if (installed) return;
  const busy = new Set();
  const handle = async item => {
    if (busy.has(item.uuid)) return null;
    busy.add(item.uuid);
    try {
      // A ativação só é carregada quando alguém usa uma engenhoca.
      const { activateEngenhoca } = await import('./engenhocas-actions.js');
      return await activateEngenhoca(item);
    }
    catch (error) {
      console.error('[T20 Toolkit] Erro ao ativar engenhoca:', error);
      ui.notifications.error(`Erro ao ativar "${item.name}". Veja o console (F12).`);
      return null;
    } finally { busy.delete(item.uuid); }
  };
  if (globalThis.libWrapper?.register) {
    libWrapper.register(MODULE_ID, TARGET, function (wrapped, ...args) {
      if (!enabled() || !isEngenhoca(this) || this.type === 'magia') return wrapped(...args);
      return handle(this);
    }, 'MIXED');
  } else {
    const proto = CONFIG.Item.documentClass.prototype;
    const original = proto.roll;
    proto.roll = function (...args) {
      if (!enabled() || !isEngenhoca(this) || this.type === 'magia') return original.apply(this, args);
      return handle(this);
    };
  }
  installed = true;
}
