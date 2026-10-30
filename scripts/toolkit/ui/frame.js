/**
 * Moldura comum das janelas do Toolkit: abas das ferramentas no estilo do Foundry, título e personagem.
 * As cores vêm do tema claro/escuro do Foundry (toolkit-theme.css); o Toolkit não tem tema próprio.
 * Usada pelas janelas ApplicationV2 (toolFrame) e pelos DialogV2 das Engenhocas (frameParts).
 */
import { escapeHtml } from '../core/t20.js';

export const TOOLS = Object.freeze([
  { id: 'hub', icon: 'fa-solid fa-house', label: 'Início' },
  { id: 'planner', icon: 'fa-solid fa-route', label: 'Planejador' },
  { id: 'buscador', icon: 'fa-solid fa-magnifying-glass', label: 'Buscador', title: 'Buscador de Magias' },
  { id: 'grimorio', icon: 'fa-solid fa-book', label: 'Grimório' },
  { id: 'escriba', icon: 'fa-solid fa-feather', label: 'Escriba', title: 'Escriba Arcano' },
  { id: 'usurpador', icon: 'fa-solid fa-hand-sparkles', label: 'Usurpador' },
  { id: 'engenhocas', icon: 'fa-solid fa-gears', label: 'Engenhocas' },
  { id: 'regras', icon: 'fa-solid fa-scale-balanced', label: 'Regras', title: 'Regras da mesa', bottom: true }
]);

/** Pedaços da moldura, em HTML. */
export function frameParts({ tool, actor = null, who = '', eyebrow = '', title = '', subtitle = '' }) {
  const tabs = `<nav class="t20tk-tools" aria-label="Ferramentas do T20 Toolkit">${TOOLS.map(t => {
    const name = t.title ?? t.label;
    return `<button type="button" class="t20tk-tools-tab${t.bottom ? ' t20tk-tools-tab--gm' : ''}${t.id === tool ? ' active' : ''}" data-action="t20nav" data-tool="${t.id}" data-tooltip="${escapeHtml(name)}" aria-label="${escapeHtml(name)}"${t.id === tool ? ' aria-current="page"' : ''}><i class="${t.icon}" inert></i><span>${escapeHtml(t.label)}</span></button>`;
  }).join('')}</nav>`;
  const person = actor === false ? '' : actor
    ? `<span class="t20tk-head-actor"><b>${escapeHtml(actor.name)}</b>${who ? `<span>${who}</span>` : ''}<button type="button" class="t20tk-bz-link" data-action="openSheet">Abrir ficha</button></span>`
    : '<span class="t20tk-head-actor"><b>Sem personagem</b><span>abra pela ficha (botão Toolkit)</span></span>';
  const heading = title ? `<div class="t20tk-titlebar-text">${eyebrow ? `<p class="t20tk-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}<h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="t20tk-subtitle">${subtitle}</p>` : ''}</div>` : '';
  const titlebar = heading || person ? `<header class="t20tk-titlebar">${heading}${person}</header>` : '';
  return { tabs, titlebar };
}

/**
 * @param {object} o  { tool, extra, actor, who, eyebrow, title, subtitle }
 * @param {string} content  HTML da ferramenta
 */
export function toolFrame({ tool, extra = '', ...rest }, content = '') {
  const { tabs, titlebar } = frameParts({ tool, ...rest });
  return `<div class="t20tk-shell t20tk-bz t20tk-frame ${extra}" data-tool="${tool}">
    ${tabs}
    <div class="t20tk-main">${titlebar}${content}</div>
  </div>`;
}

/** Abre outra ferramenta para o mesmo personagem (ação "t20nav"). */
export async function navigateTool(app, target) {
  const tool = target?.dataset?.tool;
  const api = globalThis.game?.t20Toolkit;
  const actor = app?.actor ?? null;
  try {
    if (tool === 'hub') return await api?.open?.({ actor });
    if (api?.[tool]?.open) return await api[tool].open({ actor });
  } catch (error) {
    console.error(`[T20 Toolkit] Falha ao abrir ${tool}:`, error);
    globalThis.ui?.notifications?.error?.(`T20 Toolkit: não foi possível abrir ${tool}.`);
  }
}

/** Handler para DEFAULT_OPTIONS.actions (this = a janela). */
export function onNavigate(event, target) { return navigateTool(this, target); }

/** Traz para frente uma janela já aberta; se ela falhou ao desenhar, tenta desenhar de novo. */
export async function reopen(app) {
  if (app.rendered && app.element) { app.bringToFront?.(); return app; }
  await app.render({ force: true });
  return app;
}
