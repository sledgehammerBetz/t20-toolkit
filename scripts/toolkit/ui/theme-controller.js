/**
 * Tema visual do Toolkit: preferência individual; não escreve em Actor/Item/world flags.
 * Por padrão segue o tema das janelas do Foundry (Configurar interface); o botão de tema
 * grava uma escolha só do Toolkit, que pode ser desfeita voltando a configuração para "Seguir o Foundry".
 */
import { MODULE_ID } from '../../constants.js';

export const TOOLKIT_THEME_SETTING = 'theme';
export const TOOLKIT_THEMES = Object.freeze(['light', 'dark']);

export function registerToolkitThemeSetting({ gameRef = globalThis.game } = {}) {
  if (!gameRef?.settings?.register) return false;
  gameRef.settings.register(MODULE_ID, TOOLKIT_THEME_SETTING, {
    name: 'Tema visual do T20 Toolkit',
    hint: 'Escolha individual. "Seguir o Foundry" usa o mesmo tema das janelas do Foundry (Configurar interface). Não altera o tema dos outros jogadores.',
    scope: 'client', config: true, type: String,
    choices: { '': 'Seguir o Foundry', light: 'Claro', dark: 'Escuro' },
    default: '', requiresReload: false,
    onChange: value => paintTheme(resolveToolkitTheme(value))
  });
  return true;
}

/** Tema das janelas do Foundry: a classe que ele põe no body (ver game.configureUI). */
export function foundryTheme(doc = globalThis.document) {
  return doc?.body?.classList?.contains?.('theme-light') ? 'light' : 'dark';
}

/** Tema efetivo: a escolha do Toolkit, se houver; senão o do Foundry. */
export function resolveToolkitTheme(choice, doc = globalThis.document) {
  return TOOLKIT_THEMES.includes(choice) ? choice : foundryTheme(doc);
}

export function getToolkitTheme({ gameRef = globalThis.game } = {}) {
  let choice = '';
  try { choice = gameRef?.settings?.get?.(MODULE_ID, TOOLKIT_THEME_SETTING) ?? ''; } catch { /* configuração ainda não registrada */ }
  return resolveToolkitTheme(choice);
}

export async function setToolkitTheme(theme, { gameRef = globalThis.game } = {}) {
  if (!TOOLKIT_THEMES.includes(theme)) throw new RangeError('Tema desconhecido. Use light ou dark.');
  if (!gameRef?.settings?.set) throw new Error('Configurações de usuário indisponíveis.');
  await gameRef.settings.set(MODULE_ID, TOOLKIT_THEME_SETTING, theme);
  return theme;
}

/** Classes que fazem o CSS do Foundry (variáveis, botões, campos) desenhar a janela no tema escolhido. */
export const themeClasses = theme => `themed theme-${theme === 'light' ? 'light' : 'dark'}`;

const themeTitle = next => next === 'dark' ? 'Modo noturno' : 'Modo diurno';
const themeIcon = next => next === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';

/** Botão que troca para o outro tema. */
export function themeButton(theme, { action = 'data-action="theme"' } = {}) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return `<button type="button" class="t20tk-theme-btn" ${action} data-theme-value="${next}" data-tooltip="${themeTitle(next)}" aria-label="${themeTitle(next)}"><i class="${themeIcon(next)}" inert></i></button>`;
}

/** Aplica o tema em todas as janelas do Toolkit abertas, sem redesenhar nada. */
export function paintTheme(theme, doc = globalThis.document) {
  if (!doc?.querySelectorAll) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  for (const shell of doc.querySelectorAll('.t20tk-shell')) {
    shell.classList.remove('theme-light', 'theme-dark');
    shell.classList.add('themed', `theme-${theme}`);
    shell.dataset.theme = theme;
  }
  for (const btn of doc.querySelectorAll('.t20tk-theme-btn')) {
    btn.dataset.themeValue = next;
    btn.dataset.tooltip = themeTitle(next);
    btn.setAttribute('aria-label', themeTitle(next));
    btn.innerHTML = `<i class="${themeIcon(next)}" inert></i>`;
  }
}

/** Troca o tema (preferência do usuário) e repinta todas as janelas abertas. */
export async function switchTheme(theme) {
  await setToolkitTheme(theme);
  paintTheme(theme);
}
