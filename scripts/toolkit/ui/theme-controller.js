/** Tema visual do Toolkit: preferência individual; não escreve em Actor/Item/world flags. */
import { MODULE_ID } from '../../constants.js';

export const TOOLKIT_THEME_SETTING = 'theme';
export const TOOLKIT_THEMES = Object.freeze(['light', 'dark']);
export const DEFAULT_TOOLKIT_THEME = 'light';

export function normalizeToolkitTheme(theme) {
  return TOOLKIT_THEMES.includes(theme) ? theme : DEFAULT_TOOLKIT_THEME;
}

export function registerToolkitThemeSetting({gameRef=globalThis.game}={}) {
  if (!gameRef?.settings?.register) return false;
  gameRef.settings.register(MODULE_ID, TOOLKIT_THEME_SETTING, {
    name: 'Tema visual do T20 Toolkit',
    hint: 'Escolha individual: Pergaminho Claro ou Arquivo Noturno. Não altera o tema do Foundry nem o dos outros jogadores.',
    scope: 'client', config: true, type: String,
    choices: {light:'Pergaminho Claro',dark:'Arquivo Noturno'},
    default: DEFAULT_TOOLKIT_THEME, requiresReload: false
  });
  return true;
}

export function getToolkitTheme({gameRef=globalThis.game}={}) {
  try { return normalizeToolkitTheme(gameRef?.settings?.get?.(MODULE_ID,TOOLKIT_THEME_SETTING)); }
  catch { return DEFAULT_TOOLKIT_THEME; }
}

export async function setToolkitTheme(theme,{gameRef=globalThis.game}={}) {
  const normalized = normalizeToolkitTheme(theme);
  if (!TOOLKIT_THEMES.includes(theme)) throw new RangeError('Tema desconhecido. Use light ou dark.');
  if (!gameRef?.settings?.set) throw new Error('Configurações de usuário indisponíveis.');
  await gameRef.settings.set(MODULE_ID,TOOLKIT_THEME_SETTING,normalized);
  return normalized;
}

/** Atualiza somente a janela do Toolkit recebida, sem alterar CSS global. */
export function applyToolkitTheme(root,theme) {
  const shell = root?.matches?.('.t20tk-shell') ? root : root?.querySelector?.('.t20tk-shell');
  if (!shell) return false;
  const resolved = normalizeToolkitTheme(theme);
  shell.dataset.theme=resolved;
  shell.querySelectorAll?.('[data-toolkit-theme]').forEach(button=>{
    const selected=button.dataset.toolkitTheme===resolved;
    button.setAttribute?.('aria-pressed',String(selected));
    button.classList?.toggle?.('is-active',selected);
  });
  return true;
}
