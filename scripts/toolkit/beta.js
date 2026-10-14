/**
 * Beta fechada: registro de erros do Toolkit, "Relatar problema" (diagnóstico copiável) e aviso de boas-vindas por versão.
 * Nada aqui envia dados para fora: o diagnóstico só é mostrado para o usuário copiar e colar no canal da beta.
 */
import { MODULE_ID, MODULE_VERSION } from '../constants.js';
import { escapeHtml } from './core/t20.js';

const MAX = 40;
const LOG = [];
const MINE = /t20-toolkit|\[T20 Toolkit\]/i;

const text = v => {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${String(v.stack).split('\n').slice(1, 6).join('\n')}` : ''}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v).slice(0, 400); } catch { return String(v); }
};
const push = (level, parts) => {
  LOG.push({ at: new Date().toISOString().slice(11, 19), level, msg: parts.map(text).join(' ').slice(0, 1500) });
  if (LOG.length > MAX) LOG.shift();
};

/** Guarda os erros e avisos do Toolkit (e erros não tratados vindos dos arquivos do módulo). */
export function installErrorLog(win = globalThis) {
  if (win.__t20tkErrorLog) return;
  win.__t20tkErrorLog = true;
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try { if (typeof args[0] === 'string' && args[0].startsWith('[T20 Toolkit]')) push(level, args); } catch { /* nunca atrapalhar o console */ }
      return orig(...args);
    };
  }
  win.addEventListener?.('error', ev => { if (MINE.test(`${ev.filename ?? ''} ${ev.error?.stack ?? ''}`)) push('error', [ev.error ?? ev.message]); });
  win.addEventListener?.('unhandledrejection', ev => { if (MINE.test(String(ev.reason?.stack ?? ev.reason ?? ''))) push('error', ['Promessa rejeitada:', ev.reason]); });
}

export const errorLog = () => [...LOG];

/** Texto do diagnóstico: versões, módulos ativos, regras da mesa, janela aberta e erros recentes. */
export function diagnostics({ actor = null, gameRef = globalThis.game } = {}) {
  const g = gameRef ?? {};
  const mods = [...(g.modules ?? [])].filter(m => m.active).map(m => `${m.id}@${m.version ?? '?'}`).sort();
  let rules = '';
  try { rules = JSON.stringify(g.settings?.get?.(MODULE_ID, 'tableRules') ?? {}); } catch { rules = '(não foi possível ler)'; }
  const open = [...(globalThis.foundry?.applications?.instances?.values?.() ?? [])].filter(a => a.rendered && /^t20tk-/.test(a.id ?? '')).map(a => a.id.replace(/-[A-Za-z0-9]{16}$/, ''));
  const classes = actor ? [...(actor.items ?? [])].filter(i => i.type === 'classe').map(i => `${i.name} ${i.system?.niveis ?? ''}`.trim()).join(' / ') : '';
  const lines = [
    `T20 Toolkit ${MODULE_VERSION}`,
    `Foundry ${g.version ?? g.release?.version ?? '?'} · sistema ${g.system?.id ?? '?'} ${g.system?.version ?? '?'}`,
    `Usuário: ${g.user?.isGM ? 'mestre' : 'jogador'} · idioma ${g.i18n?.lang ?? '?'} · navegador ${globalThis.navigator?.userAgent?.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/)?.[0] ?? '?'}`,
    actor ? `Personagem: nível ${classes || '0'} · raça ${[...(actor.items ?? [])].find(i => i.type === 'race')?.name ?? '—'}` : 'Personagem: nenhum',
    `Janelas do Toolkit abertas: ${open.join(', ') || 'nenhuma'}`,
    `Regras da mesa: ${rules}`,
    `Módulos ativos (${mods.length}): ${mods.join(', ')}`,
    '',
    `Erros/avisos recentes do Toolkit (${LOG.length}):`,
    ...(LOG.length ? LOG.map(e => `[${e.at}] ${e.level.toUpperCase()} ${e.msg}`) : ['(nenhum)'])
  ];
  return lines.join('\n');
}

export const FEEDBACK_SETTING = 'feedbackUrl';
export const WELCOME_SETTING = 'betaWelcomeSeen';

export function registerBetaSettings(gameRef = globalThis.game) {
  gameRef?.settings?.register?.(MODULE_ID, FEEDBACK_SETTING, {
    name: 'Beta: link para relatar problemas',
    hint: 'Link do canal da beta fechada (Discord, formulário…). Aparece no aviso de boas-vindas e na janela "Relatar problema".',
    scope: 'world', config: true, type: String, default: ''
  });
  gameRef?.settings?.register?.(MODULE_ID, WELCOME_SETTING, { scope: 'client', config: false, type: String, default: '' });
}

const feedbackUrl = () => { try { return String(game.settings.get(MODULE_ID, FEEDBACK_SETTING) || '').trim(); } catch { return ''; } };
const safeUrl = u => (/^https?:\/\//i.test(u) ? u : '');

/** Janela "Relatar problema": modelo de relato + diagnóstico, com botão de copiar. */
export async function openReport({ actor = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const diag = diagnostics({ actor });
  const url = safeUrl(feedbackUrl());
  const template = `O que eu fiz (passo a passo):\n1. \n2. \n\nO que eu esperava:\n\nO que aconteceu:\n\n--- diagnóstico (não apague) ---\n${diag}`;
  const content = `<div class="t20tk-report">
    <p>Descreva o problema e copie tudo para o canal da beta${url ? ` (<a href="${escapeHtml(url)}" target="_blank" rel="noopener">abrir canal</a>)` : ''}. Se puder, mande também um print da tela e do console (F12).</p>
    <textarea name="report" rows="16" style="width:100%;font-family:monospace;font-size:11px">${escapeHtml(template)}</textarea>
  </div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `T20 Toolkit ${MODULE_VERSION} — Relatar problema` },
    position: { width: 640 },
    content,
    buttons: [
      { action: 'copy', label: 'Copiar relato', icon: 'fa-solid fa-copy', default: true, callback: async (ev, button) => {
        const value = button.form?.elements?.report?.value ?? template;
        try {
          if (game.clipboard?.copyPlainText) await game.clipboard.copyPlainText(value);
          else await navigator.clipboard.writeText(value);
          ui.notifications?.info?.('Relato copiado. Cole no canal da beta.');
        } catch { ui.notifications?.warn?.('Não consegui copiar: selecione o texto e use Ctrl+C.'); }
        return 'copy';
      } },
      { action: 'close', label: 'Fechar' }
    ],
    rejectClose: false
  });
}

/** Aviso de boas-vindas: uma vez por versão, só para quem está usando (mensagem sussurrada para si). */
export async function betaWelcome(gameRef = globalThis.game) {
  try {
    if (gameRef.settings.get(MODULE_ID, WELCOME_SETTING) === MODULE_VERSION) return;
    await gameRef.settings.set(MODULE_ID, WELCOME_SETTING, MODULE_VERSION);
  } catch { return; }
  const url = safeUrl(feedbackUrl());
  const content = `<div class="t20tk-chat-card" data-tool="hub">
    <p class="t20tk-chat-title"><b>T20 Toolkit ${escapeHtml(MODULE_VERSION)}</b> — beta fechada</p>
    <p>Obrigado por testar! Abra pelo botão <b>Toolkit</b> na ficha. Achou algo estranho? No <b>Início</b> do Toolkit, use <b>Relatar problema</b> (ou a macro <code>game.t20Toolkit.report()</code>) e cole o relato no canal da beta${url ? `: <a href="${escapeHtml(url)}" target="_blank" rel="noopener">abrir canal</a>` : ''}.</p>
    <p><small>Faça backup do mundo antes de testar.</small></p>
  </div>`;
  try { await ChatMessage.create({ content, whisper: [gameRef.user.id], speaker: { alias: 'T20 Toolkit' } }); } catch { /* chat indisponível */ }
}
