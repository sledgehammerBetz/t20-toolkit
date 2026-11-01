/**
 * Cartões de chat do T20 Toolkit: cabeçalho com ícone da ferramenta, título, linhas de dados,
 * lista de itens (com imagem) e observação. Estilo em styles/toolkit-chat.css.
 */
import { escapeHtml } from '../core/t20.js';

const ICONS = { planner: 'fa-route', buscador: 'fa-magnifying-glass', grimorio: 'fa-book', escriba: 'fa-feather', usurpador: 'fa-hand-sparkles', engenhocas: 'fa-gears', fabricacao: 'fa-mortar-pestle', hub: 'fa-house' };
const icon = tool => `<i class="fa-solid ${ICONS[tool] ?? 'fa-wand-sparkles'}" inert></i>`;
const LABELS = { planner: 'Planejador', buscador: 'Buscador de Magias', grimorio: 'Grimório', escriba: 'Escriba Arcano', usurpador: 'Usurpador', engenhocas: 'Engenhocas', fabricacao: 'Fabricação', hub: 'T20 Toolkit' };

/**
 * @param {object} o
 * @param {string} o.tool       id da ferramenta (ícone e rótulo)
 * @param {string} o.title      título (texto)
 * @param {string} [o.subtitle]
 * @param {'info'|'success'|'warning'|'error'} [o.tone]
 * @param {Array<[string,string]>} [o.rows]   rótulo → valor (texto)
 * @param {Array<{name:string,img?:string,note?:string}>} [o.items]
 * @param {string} [o.itemsTitle]
 * @param {string} [o.note]     observação (texto)
 * @param {string} [o.html]     HTML extra já seguro
 */
export function chatCard({ tool = 'hub', title = '', subtitle = '', tone = 'info', rows = [], items = [], itemsTitle = '', note = '', html = '' }) {
  const rowsHtml = rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  const itemsHtml = items.length ? `${itemsTitle ? `<p class="t20tk-chat-sub">${escapeHtml(itemsTitle)}</p>` : ''}<ul class="t20tk-chat-items">${items.map(i => `<li>${i.img ? `<img src="${escapeHtml(i.img)}" alt="">` : '<span class="t20tk-chat-dot"><i class="fa-solid fa-wand-sparkles" inert></i></span>'}<span><b>${escapeHtml(i.name)}</b>${i.note ? `<small>${escapeHtml(i.note)}</small>` : ''}</span></li>`).join('')}</ul>` : '';
  return `<div class="t20tk-chat" data-tone="${tone}">
    <header><span class="t20tk-chat-icon">${icon(tool)}</span><span><small>${escapeHtml(LABELS[tool] ?? 'T20 Toolkit')}</small><strong>${escapeHtml(title)}</strong>${subtitle ? `<em>${escapeHtml(subtitle)}</em>` : ''}</span></header>
    ${rowsHtml ? `<dl class="t20tk-chat-rows">${rowsHtml}</dl>` : ''}
    ${itemsHtml}${html}
    ${note ? `<p class="t20tk-chat-note">${escapeHtml(note)}</p>` : ''}
  </div>`;
}

/** Cabeçalho curto para o `flavor` de rolagens. */
export function chatFlavor({ tool = 'hub', title = '', result = '', tone = 'info' }) {
  return `<div class="t20tk-chat t20tk-chat--flavor" data-tone="${tone}"><header><span class="t20tk-chat-icon">${icon(tool)}</span><span><small>${escapeHtml(LABELS[tool] ?? 'T20 Toolkit')}</small><strong>${escapeHtml(title)}</strong>${result ? `<em>${escapeHtml(result)}</em>` : ''}</span></header></div>`;
}

export async function postCard(actor, opts) {
  return globalThis.ChatMessage?.create?.({ speaker: globalThis.ChatMessage.getSpeaker({ actor }), content: chatCard(opts) });
}
