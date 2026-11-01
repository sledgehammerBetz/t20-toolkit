import { TOOLKIT_FEATURES } from './features.js';
import { MODULE_ID, MODULE_VERSION } from '../constants.js';
import { readGrimorio } from './grimorio/grimorio-state.js';
import { RegrasApp, openRegras } from './regras/regras-app.js';
import { registerTableRulesSetting, getTableRules } from './core/table-rules.js';
import { registerCastingGuardSetting, installCastingGuard } from './grimorio/casting-guard.js';
import { casterContext } from './core/caster-context.js';
import { installToolkitSheetButton } from './sheet-button.js';
import { actorEngenhocas } from './engenhocas/engenhocas-rules.js';
import { registerDirectUseSetting, installDirectUse } from './engenhocas/direct-use.js';
import { migrateLegacyWorldSettings, LEGACY_MODULE_ID } from './core/settings-migration.js';

import { renderToolkitHub } from './ui/hub-view.js';
import { registerToolkitThemeSetting, getToolkitTheme, setToolkitTheme } from './ui/theme-controller.js';
import { installErrorLog, registerBetaSettings, openReport, diagnostics, errorLog, betaWelcome } from './beta.js';

/**
 * As janelas só são carregadas quando alguém abre a ferramenta: quem entra no mundo baixa só o necessário
 * para os botões, as configurações e os ganchos da ficha.
 */
const lazy = (path, name) => (...args) => import(path).then(m => m[name](...args));
const openGrimorio = lazy('./grimorio/grimorio-app.js', 'openGrimorio');
const openEscriba = lazy('./escriba/escriba-app.js', 'openEscriba');
const openUsurpador = lazy('./usurpador/usurpador-app.js', 'openUsurpador');
const openPlanner = lazy('./planner/planner-app.js', 'openPlanner');
const openBuscador = lazy('./buscador/buscador-app.js', 'openBuscador');
const openEngenhocas = lazy('./engenhocas/engenhocas-app.js', 'openEngenhocas');
const activateEngenhoca = lazy('./engenhocas/engenhocas-actions.js', 'activateEngenhoca');
const openHome = lazy('./home/home-app.js', 'openHome');
const openFabricacao = lazy('./fabricacao/fabricacao-app.js', 'openFabricacao');
const getSpellIndex = lazy('./core/spell-index.js', 'getSpellIndex');
const reloadCompendiums = () => Promise.all([
  import('./core/spells/spell-catalog.js').then(m => m.getSpellCatalog({ refresh: true })),
  import('./core/spell-index.js').then(m => m.refreshCompendiumIndex())
]);
export { renderToolkitHub };

function asRoot(element) {
  if (element?.querySelector) return element;
  if (element?.[0]?.querySelector) return element[0];
  return null;
}

/** Uma única navegação, com comandos para as funcionalidades internas já implementadas. */
export function bindToolkitHub(root,{
  actor=null,gameRef=globalThis.game,
  services={}
}={}) {
  const element=asRoot(root);
  const shell=element?.matches?.('.t20tk-shell')?element:element?.querySelector?.('.t20tk-shell');
  if (!shell) return false;
  const actions={
    engenhocas:()=>openEngenhocas({actor}),
    creator:()=>openEngenhocas({actor,view:'oficina'}),
    activator:()=>openEngenhocas({actor,view:'bancada'}),
    apparatus:()=>openEngenhocas({actor,view:'aparatos'}),
    buscador:()=> (services.openBrowser??openBuscador)({actor}),
    grimorio:()=> (services.openGrimorio??openGrimorio)({actor}),
    escriba:()=> openEscriba({actor}),
    usurpador:()=> openUsurpador({actor}),
    leveler:()=> (services.openLeveler??openPlanner)({actor}),
    fabricacao:()=> openFabricacao({actor}),
    regras:()=> openRegras({actor})
  };
  const onError=(action,error)=>{
    console.error(`[T20 Toolkit] Falha ao abrir ${action}:`,error);
    globalThis.ui?.notifications?.error?.(`T20 Toolkit: não foi possível abrir ${action}. Veja F12.`);
  };
  for(const button of shell.querySelectorAll('[data-toolkit-action],[data-toolkit-nav]')) {
    const action=button.dataset.toolkitAction??button.dataset.toolkitNav;
    if(action==='hub'||button.disabled) continue;
    if(typeof actions[action]!=='function') continue;
    button.addEventListener('click',()=>{
      try {Promise.resolve(actions[action]()).catch(error=>onError(action,error));}
      catch(error){onError(action,error);}
    });
  }
  return true;
}

export async function openToolkitHub({
  actor=null,gameRef=globalThis.game,
  DialogClass=globalThis.foundry?.applications?.api?.DialogV2
}={}) {
  if (!DialogClass?.wait) throw new Error('DialogV2 indisponível: necessário Foundry V13.');
  return DialogClass.wait({
    window:{title:'T20 Toolkit — Ferramentas de Arton',resizable:true},
    position:{width:1050,height:'auto'},
    content:renderToolkitHub(TOOLKIT_FEATURES),
    buttons:[{action:'close',label:'Fechar',default:true,callback:()=>null}],
    render:(_event,app)=>{
      const root=asRoot(app?.element)??asRoot(_event?.target)??asRoot(_event?.currentTarget);
      bindToolkitHub(root,{actor,gameRef});
    }
  });
}

if (globalThis.Hooks?.once) {
  installErrorLog();
  Hooks.once('init',()=>{
    registerBetaSettings();
    registerToolkitThemeSetting();
    registerCastingGuardSetting();
    registerTableRulesSetting();
    registerDirectUseSetting();
    game.settings.registerMenu?.(MODULE_ID, 'tableRulesMenu', { name: 'Regras da mesa', label: 'Abrir Regras da mesa', hint: 'Regras opcionais dos livros e homebrews (atributos, raças e devoções abertas, complicações, idade, origens, distinções).', icon: 'fa-solid fa-scale-balanced', type: RegrasApp, restricted: true });
    globalThis.game.t20Toolkit=Object.freeze({
      version:MODULE_VERSION, features:TOOLKIT_FEATURES,
      engenhocas:Object.freeze({open:openEngenhocas,activate:activateEngenhoca,list:actorEngenhocas}),
      theme:Object.freeze({get:getToolkitTheme,set:setToolkitTheme}),
      open:openHome,
      home:Object.freeze({open:openHome}),
      hub:Object.freeze({open:openToolkitHub}),
      leveler:Object.freeze({open:openPlanner}),
      planner:Object.freeze({open:openPlanner}),
      regras:Object.freeze({open:openRegras,get:()=>getTableRules()}),
      grimorio:Object.freeze({open:openGrimorio,read:readGrimorio}),
      escriba:Object.freeze({open:openEscriba}),
      usurpador:Object.freeze({open:openUsurpador}),
      fabricacao:Object.freeze({open:openFabricacao}),
      buscador:Object.freeze({open:openBuscador,profiles:actor=>casterContext(actor),index:getSpellIndex,invalidate:reloadCompendiums}),
      report:openReport,
      diagnostics:(o={})=>diagnostics(o),
      errors:errorLog,
    });
    game.settings.register(MODULE_ID,'toolkitHubButton',{
      name:'Reservado: atalho do T20 Toolkit',
      hint:'Configuração experimental reservada para o futuro botão do hub; atualmente o hub é aberto pela API.',
      scope:'world',config:false,type:Boolean,default:true,requiresReload:true
    });
    game.settings.register(MODULE_ID,'toolkitSheetButton',{
      name:'Exibir atalho Toolkit na ficha',
      hint:'Exibe o botão único do Toolkit na ficha, incluindo a ferramenta Engenhocas.',
      scope:'world',config:true,type:Boolean,default:true,requiresReload:true
    });
    installToolkitSheetButton(game.t20Toolkit);
  });
  Hooks.once('setup',()=>{
    installCastingGuard(); installDirectUse();
    import('./fabricacao/fabricacao-actions.js').then(m=>m.installFabricacao()).catch(error=>console.error('[T20 Toolkit] Fabricação:',error));
  });
  Hooks.once('ready',async()=>{
    try {
      const m=await migrateLegacyWorldSettings();
      if (m.copied?.length) console.info('[T20 Toolkit] Preferências antigas copiadas:',m.copied);
    } catch(error) { console.warn('[T20 Toolkit] Migração de preferências:',error); }
    if (game.modules?.get?.(LEGACY_MODULE_ID)?.active) ui.notifications?.warn?.('T20 Toolkit: desative o módulo T20 Engenhocas original; as Engenhocas agora fazem parte do Toolkit.');
    if (game.system?.id === 'tormenta20' && game.system.version && game.system.version !== '1.5.015') console.warn(`[T20 Toolkit] Testado no Tormenta20 1.5.015; este mundo usa ${game.system.version}.`);
    await betaWelcome();
  });
}
