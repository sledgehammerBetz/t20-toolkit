/**
 * Componentes de HTML comuns às ferramentas (padrões do Criador de Engenhocas):
 * cartão com imagem, pílulas, métricas e seções que abrem e fecham.
 * Recebem textos já escapados (`html`) ou crus (`text`), conforme o nome do campo.
 */
import { escapeHtml } from '../core/t20.js';

/** Cartão de lista. `meta`/`sub`/`source` são texto cru; `metaHtml` aceita HTML pronto; `side` é HTML. */
export function cardHTML({ img = '', name = '', nameHtml = '', meta = '', metaHtml = '', sub = '', source = '', side = '', status = 'allowed', selected = false, action = '', uuid = '', metaExtra = '' }) {
  const tag = action ? 'button' : 'span';
  const attrs = action ? ` type="button" data-action="${action}" data-uuid="${escapeHtml(uuid)}" aria-pressed="${selected}"` : '';
  return `<li class="t20tk-bz-row t20tk-card ${selected ? 'is-selected' : ''}" data-status="${status}">
    <${tag} class="t20tk-bz-main"${attrs}>
      ${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : '<span class="t20tk-card-noimg" aria-hidden="true"><i class="fa-solid fa-star" inert></i></span>'}
      <span class="t20tk-card-copy">
        <span class="t20tk-bz-name">${nameHtml || escapeHtml(name)}</span>
        ${metaHtml || meta ? `<span class="t20tk-card-meta">${metaHtml || escapeHtml(meta)}</span>` : ''}
        ${sub ? `<span class="t20tk-card-sub">${escapeHtml(sub)}</span>` : ''}
        ${source ? `<span class="t20tk-card-source">${escapeHtml(source)}</span>` : ''}${metaExtra}
      </span>
    </${tag}>
    <span class="t20tk-card-side">${side}</span>
  </li>`;
}

export const pill = text => `<span class="t20tk-pill">${escapeHtml(text)}</span>`;
export const metric = (label, value) => `<div class="t20tk-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '—')}</strong></div>`;
export const disclosure = (title, body, { open = false, count = null } = {}) =>
  `<details class="t20tk-disclosure" ${open ? 'open' : ''}><summary>${escapeHtml(title)}${count !== null ? ` <span class="t20tk-count">${count}</span>` : ''}</summary><div class="t20tk-disclosure-body">${body}</div></details>`;
