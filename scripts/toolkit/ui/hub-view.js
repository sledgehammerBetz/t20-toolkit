/** Apresentação do Hub. Sem side-effects, importação nem alteração de ficha. */
import { TOOLKIT_FEATURES } from '../features.js';

const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabel = Object.freeze({available:'Disponível',preview:'Prévia funcional',planned:'Em desenvolvimento'});
const groups = Object.freeze([
  {label:'INÍCIO', ids:['hub']},
  {label:'PERSONAGEM',ids:['leveler']},
  {label:'CONSULTA',ids:['buscador']},
  {label:'MAGIAS E ESTUDO',ids:['grimorio','escriba']},
  {label:'MECÂNICAS ESPECIAIS',ids:['usurpador','engenhocas']},
  {label:'MESTRE',ids:['regras']}
]);
const glyph = Object.freeze({hub:'fa-house',leveler:'fa-route',buscador:'fa-magnifying-glass',grimorio:'fa-book',escriba:'fa-feather',usurpador:'fa-hand-sparkles',engenhocas:'fa-gears',regras:'fa-scale-balanced'});
const supportedActions = Object.freeze({leveler:'Abrir Planejador',engenhocas:'Abrir Engenhocas',grimorio:'Abrir Grimório',buscador:'Abrir Buscador',escriba:'Abrir Escriba',usurpador:'Abrir Usurpador',regras:'Abrir Regras da mesa'});
const featureById=(features,id)=>features.find(f=>f?.id===id);

export function orderedToolkitFeatures(features=TOOLKIT_FEATURES) {
  if (!Array.isArray(features)) return [];
  const order = groups.flatMap(g=>g.ids).filter(id=>id!=='hub');
  return [...features].sort((a,b)=>{
    const ia=order.indexOf(a.id),ib=order.indexOf(b.id);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
}

function card(f) {
  const id=esc(f.id),active=['available','preview'].includes(f.status);
  const extras=active&&f.id==='engenhocas'
    ? `<div class="t20tk-ui-card__actions"><button type="button" class="t20tk-ui-button" data-toolkit-action="activator">Bancada</button><button type="button" class="t20tk-ui-button" data-toolkit-action="creator">Oficina</button><button type="button" class="t20tk-ui-button" data-toolkit-action="apparatus">Aparatos</button></div>` : '';
  const open=active&&supportedActions[f.id]
    ? `<button type="button" class="t20tk-ui-card__open" data-toolkit-action="${id}" title="${esc(f.description)}"><span><b>${esc(f.title)}</b><small>${esc(f.short??f.description)}</small></span><span class="t20tk-ui-card__arrow" aria-hidden="true">→</span></button>`
    : `<div class="t20tk-ui-card__open is-off"><span><b>${esc(f.title)}</b><small>${esc(statusLabel[f.status]||statusLabel.planned)}</small></span></div>`;
  return `<article class="t20tk-ui-card" data-toolkit-feature="${id}"><div class="t20tk-ui-card__stripe" aria-hidden="true"></div><div class="t20tk-ui-card__body">${open}${extras}</div></article>`;
}

function nav(features) {
  return groups.map(g=>`<section class="t20tk-ui-navgroup" aria-label="${esc(g.label)}"><p class="t20tk-ui-navheading">${esc(g.label)}</p>${g.ids.map(id=>{
    const title=id==='hub'?'Início':featureById(features,id)?.title;
    if(!title) return '';
    const enabled=id==='hub'||['available','preview'].includes(featureById(features,id)?.status);
    return `<button type="button" class="t20tk-ui-navitem${id==='hub'?' is-current':''}" data-toolkit-nav="${esc(id)}" title="${esc(title)}" aria-label="${esc(title)}" ${id==='hub'?'aria-current="page"':''} ${enabled?'':'disabled aria-disabled="true"'}><i class="t20tk-ui-navicon fa-solid ${glyph[id]??'fa-circle'}" aria-hidden="true"></i><span class="t20tk-ui-navtext">${esc(title)}</span></button>`;
  }).join('')}</section>`).join('');
}

/** As cores seguem o tema claro/escuro do Foundry. */
export function renderToolkitHub(features=TOOLKIT_FEATURES) {
  const safeFeatures=orderedToolkitFeatures(features);
  return `<section class="t20tk-shell t20tk-hub" aria-label="T20 Toolkit">
    <aside class="t20tk-ui-sidebar"><div class="t20tk-ui-brand"><strong>T20 TOOLKIT</strong><small>FERRAMENTAS DE ARTON</small></div>
    <nav class="t20tk-ui-navigation" aria-label="Ferramentas do Toolkit">${nav(safeFeatures)}</nav></aside>
    <div class="t20tk-ui-workspace"><header class="t20tk-ui-toolbar"><span>T20 Toolkit <i>/</i> Início</span>
    </header><div class="t20tk-ui-content"><div class="t20tk-ui-intro"><p class="t20tk-ui-eyebrow">INÍCIO</p><h2>Ferramentas de Arton</h2><p>Uma instalação, ferramentas independentes. Abra pela ficha para usar com um personagem.</p></div>
    <div class="t20tk-ui-grid">${safeFeatures.map(card).join('')}</div>
    <aside class="t20tk-ui-notice"><strong>Regras da mesa</strong><p>As ferramentas avisam quando algo foge da regra; o mestre sempre pode liberar. Abra pela ficha (botão Toolkit) para usar com um personagem.</p></aside>
    </div></div></section>`;
}
