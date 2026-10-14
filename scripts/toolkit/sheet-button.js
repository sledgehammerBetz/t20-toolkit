/** Acesso ao hub sem alterar os botões legados. */

function actorFromApplication(app) {
  for (const c of [app?.actor, app?.document, app?.object, app?.document?.actor, app?.object?.actor]) {
    if (c?.documentName === 'Actor') return c;
    if (c?.actor?.documentName === 'Actor') return c.actor;
  }
  return null;
}
import { MODULE_ID } from '../constants.js';

const BUTTON_CLASS='t20-toolkit-sheet-button';
const ACTION='t20-toolkit-open';

export function makeToolkitSheetButton(api,app,buttons) {
  if (!Array.isArray(buttons)) return false;
  const actor=actorFromApplication(app);
  if (!actor) return false;
  if (buttons.some(button=>button.class===BUTTON_CLASS || button.action===ACTION)) return false;
  buttons.unshift({
    class:BUTTON_CLASS,action:ACTION,icon:'fa-solid fa-book-open',label:'Toolkit',
    onclick: event=>{
      event?.preventDefault?.();
      Promise.resolve(api.open({actor})).catch(error=>{
        console.error('[T20 Toolkit] Falha ao abrir o hub:',error);
        globalThis.ui?.notifications?.error?.('T20 Toolkit: erro ao abrir o hub. Consulte o console (F12).');
      });
    }
  });
  return true;
}

export function installToolkitSheetButton(api,{hooks=globalThis.Hooks,gameRef=globalThis.game}={}) {
  if (!hooks?.on) return false;
  const enabled=()=>{try{return gameRef?.settings?.get?.(MODULE_ID,'toolkitSheetButton')!==false;}catch{return true;}};
  for (const event of ['getActorSheetHeaderButtons','getApplicationHeaderButtons','getApplicationV1HeaderButtons']) {
    hooks.on(event,(app,buttons)=>{if(enabled()) makeToolkitSheetButton(api,app,buttons);});
  }
  return true;
}
