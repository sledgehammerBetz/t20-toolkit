/**
 * Moldura comum das janelas do Toolkit (Figma "Design System v0.15", telas compactas):
 * trilho de navegação à esquerda, cabeçalho com caminho + personagem + tema, título editorial.
 * Usada pelas janelas ApplicationV2 (toolFrame) e pelos DialogV2 das Engenhocas (frameParts).
 */
import { escapeHtml } from '../core/t20.js';
import { getToolkitTheme, setToolkitTheme } from './theme-controller.js';

export const TOOLS = Object.freeze([
  { id: 'hub', icon: '⌂', label: 'Início' },
  { id: 'planner', icon: '↗', label: 'Planejador' },
  { id: 'buscador', icon: '⌕', label: 'Buscador de Magias' },
  { id: 'grimorio', icon: '✦', label: 'Grimório' },
  { id: 'escriba', icon: '≡', label: 'Escriba Arcano' },
  { id: 'usurpador', icon: '◆', label: 'Usurpador' },
  { id: 'engenhocas', icon: '⚙', label: 'Engenhocas' },
  { id: 'regras', icon: '⚖', label: 'Regras da mesa', bottom: true }
]);

const themeButton = theme => {
  const next = theme === 'dark' ? 'light' : 'dark';
  return `<button type="button" class="t20tk-theme-btn" data-action="theme" data-theme-value="${next}" title="${next === 'dark' ? 'Tema escuro (Arquivo Noturno)' : 'Tema claro (Pergaminho)'}" aria-label="Trocar tema">${next === 'dark' ? '☾' : '☀'}</button>`;
};

/** Pedaços da moldura, em HTML. `crumb` é o nome mostrado no caminho. */
export function frameParts({ tool, actor = null, who = '', eyebrow = '', title = '', subtitle = '', crumb = '' }) {
  const theme = getToolkitTheme();
  const current = TOOLS.find(t => t.id === tool);
  const rail = `<nav class="t20tk-rail" aria-label="Ferramentas do T20 Toolkit"><span class="t20tk-rail-brand">T20</span>${TOOLS.map(t => `${t.bottom ? '<span class="t20tk-rail-spacer"></span>' : ''}<button type="button" class="t20tk-rail-btn${t.bottom ? ' t20tk-rail-btn--gm' : ''}" data-action="t20nav" data-tool="${t.id}" title="${escapeHtml(t.label)}" aria-label="${escapeHtml(t.label)}"${t.id === tool ? ' aria-current="page"' : ''}>${t.icon}</button>`).join('')}</nav>`;
  const person = actor === false ? '' : actor
    ? `<span class="t20tk-head-actor"><b>${escapeHtml(actor.name)}</b>${who ? `<span>${who}</span>` : ''}<button type="button" class="t20tk-bz-link" data-action="openSheet">Abrir ficha</button></span>`
    : '<span class="t20tk-head-actor"><b>Sem personagem</b><span>abra pela ficha (botão Toolkit)</span></span>';
  const head = `<header class="t20tk-head"><span class="t20tk-crumb">T20 Toolkit <i>/</i> ${escapeHtml(crumb || current?.label || title)}</span>${person}${themeButton(theme)}</header>`;
  const titlebar = title ? `<div class="t20tk-titlebar">${eyebrow ? `<p class="t20tk-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}<h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="t20tk-subtitle">${subtitle}</p>` : ''}</div>` : '';
  return { theme, rail, head, titlebar };
}

/**
 * @param {object} o  { tool, extra, actor, who, eyebrow, title, subtitle }
 * @param {string} content  HTML da ferramenta
 */
export function toolFrame({ tool, extra = '', ...rest }, content = '') {
  const { theme, rail, head, titlebar } = frameParts({ tool, ...rest });
  return `<div class="t20tk-shell t20tk-bz t20tk-frame ${extra}" data-theme="${theme}" data-tool="${tool}">
    ${rail}
    <div class="t20tk-main">${head}${titlebar}${content}</div>
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

/** Aplica o tema em todas as janelas do Toolkit abertas, sem redesenhar nada. */
export function paintTheme(value, doc = globalThis.document) {
  if (!doc?.querySelectorAll) return;
  const next = value === 'dark' ? 'light' : 'dark';
  for (const shell of doc.querySelectorAll('.t20tk-shell[data-theme]')) shell.dataset.theme = value;
  for (const win of doc.querySelectorAll('[data-t20tk-tool-theme]')) win.dataset.t20tkToolTheme = value;
  for (const btn of doc.querySelectorAll('.t20tk-theme-btn')) {
    if (btn.dataset.themeValue) btn.dataset.themeValue = next;
    if (btn.dataset.toolkitTheme) btn.dataset.toolkitTheme = next;
    btn.textContent = next === 'dark' ? '☾' : '☀';
    btn.title = next === 'dark' ? 'Tema escuro (Arquivo Noturno)' : 'Tema claro (Pergaminho)';
  }
  for (const btn of doc.querySelectorAll('[data-toolkit-theme]:not(.t20tk-theme-btn)')) btn.setAttribute('aria-pressed', String(btn.dataset.toolkitTheme === value));
}

/** Troca o tema (preferência do usuário) e repinta todas as janelas abertas. */
export async function switchTheme(value) {
  await setToolkitTheme(value);
  paintTheme(value);
}

/** Handler para DEFAULT_OPTIONS.actions (this = a janela). */
export function onNavigate(event, target) { return navigateTool(this, target); }

/** Traz para frente uma janela já aberta; se ela falhou ao desenhar, tenta desenhar de novo. */
export async function reopen(app) {
  if (app.rendered && app.element) { app.bringToFront?.(); return app; }
  await app.render({ force: true });
  return app;
}
