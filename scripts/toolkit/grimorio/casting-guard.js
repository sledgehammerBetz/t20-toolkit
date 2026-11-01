/**
 * Aviso/bloqueio ao lançar magia não memorizada (Mago, JdA p. 37).
 * O sistema 1.5.015 não tem hook antes de usar um item, então envolvemos Item#roll
 * da classe de documento do sistema. Configurável pelo mestre: desligado, avisar, bloquear.
 */
import { MODULE_ID } from '../../constants.js';
import { isMago } from './grimorio-state.js';
import { escapeHtml } from '../core/t20.js';

export const GUARD_SETTING = 'grimorioGuard';

export function registerCastingGuardSetting() {
  game.settings.register(MODULE_ID, GUARD_SETTING, {
    name: 'Grimório: magia não memorizada',
    hint: 'O que acontece quando um Mago tenta lançar uma magia arcana que não memorizou hoje.',
    scope: 'world', config: true, type: String,
    choices: { off: 'Nada (desligado)', warn: 'Perguntar antes de lançar', block: 'Impedir (o mestre ainda pode lançar)' },
    default: 'warn'
  });
}

/** Precisa de verificação? Exportada para testes. */
export function needsGuard(item, actor) {
  if (item?.type !== 'magia' || !actor || actor.type !== 'character') return false;
  if (!['arc', 'uni'].includes(item.system?.tipo)) return false;
  if (item.system?.preparada) return false;
  return isMago(actor);
}

export function installCastingGuard() {
  const cls = CONFIG.Item?.documentClass;
  const original = cls?.prototype?.roll;
  if (typeof original !== 'function' || original.__t20tkGuard) return false;
  const wrapped = async function (...args) {
    let mode = 'off';
    try { mode = game.settings.get(MODULE_ID, GUARD_SETTING); } catch {}
    if (mode !== 'off' && needsGuard(this, this.actor)) {
      if (mode === 'block' && !game.user.isGM) {
        ui.notifications.warn(`${this.name} não está memorizada. O Mago só lança magias memorizadas (estude o grimório).`);
        return;
      }
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Magia não memorizada' },
        content: `<p><b>${escapeHtml(this.name)}</b> não está memorizada hoje. O Mago só pode lançar magias memorizadas.</p><p>Lançar mesmo assim?</p>`,
        rejectClose: false
      });
      if (!ok) return;
    }
    return original.apply(this, args);
  };
  wrapped.__t20tkGuard = true;
  cls.prototype.roll = wrapped;
  return true;
}
