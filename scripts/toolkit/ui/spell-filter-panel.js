/**
 * Painel de filtros de magias compartilhado (Buscador, Oficina, Escriba, Grimório, Usurpador).
 * Uso:
 *   html  = spellFilterPanel(state, options, { count, maxCircle, extra })
 *   bindSpellFilterPanel(root, state, onChange)   // onChange(kind) — 'query' (digitação) ou 'filter'
 * `state` é um objeto mutável (comece com { ...EMPTY_FILTERS, panel: false }).
 */
import { escapeHtml } from '../core/t20.js';
import { FILTER_GROUPS, FILTER_LABELS, SORTS, activeFilterTags, EMPTY_FILTERS, ENHANCEABLE } from '../core/spells/spell-filter.js';

const CIRCLES = [1, 2, 3, 4, 5];

export function spellFilterPanel(state, options, { count = null, maxCircle = 0, extra = '', packs = [], placeholder = 'Buscar magia pelo nome ou descrição…' } = {}) {
  const tags = activeFilterTags(state, packs).filter(t => t.key !== 'circle');
  const advanced = tags.length;
  const chip = (value, label) => {
    const off = maxCircle && value && Number(value) > maxCircle;
    return `<button type="button" class="t20tk-chip ${String(state.circle ?? '') === String(value) ? 'is-on' : ''}" data-sf-action="circle" data-value="${value}" ${off ? 'data-off="true" title="Acima do seu círculo"' : ''}>${label}</button>`;
  };
  const select = key => {
    const opts = options[key] ?? [];
    return `<label class="t20tk-pl-field"><span>${escapeHtml(FILTER_LABELS[key])}</span><select data-sf="${key}"><option value="">Todos</option>${opts.map(o => `<option value="${escapeHtml(o.value)}" ${String(state[key] ?? '') === String(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></label>`;
  };
  const groups = FILTER_GROUPS.map(g => `<fieldset class="t20tk-sf-group"><legend>${escapeHtml(g.label)}</legend><div class="t20tk-sf-grid">${g.filters.filter(k => (options[k] ?? []).length).map(select).join('')}</div></fieldset>`).join('');
  return `<section class="t20tk-bz-filters t20tk-sf">
    <label class="t20tk-search"><span aria-hidden="true"><i class="fa-solid fa-magnifying-glass" inert></i></span><input type="search" name="sfQuery" data-sf-query value="${escapeHtml(state.query ?? '')}" placeholder="${escapeHtml(placeholder)}" aria-label="Buscar magia"></label>
    <button type="button" class="t20tk-ui-button t20tk-filter-toggle" data-sf-action="panel" aria-expanded="${!!state.panel}">Filtros <span class="t20tk-count">${advanced}</span></button>
    <button type="button" class="t20tk-ui-button" data-sf-action="clear">Limpar</button>
    <div class="t20tk-chips" role="group" aria-label="Círculo"><span class="t20tk-chips-label">Círculo</span>${chip('', 'Todos')}${CIRCLES.map(c => chip(c, `${c}º`)).join('')}</div>
    <label class="t20tk-sf-sort"><span>Ordenar</span><select data-sf="sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${(state.sort ?? 'circle') === k ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></label>
    ${extra}
    ${count !== null ? `<span class="t20tk-bz-count" data-sf-count>${count}</span>` : ''}
    ${tags.length ? `<div class="t20tk-sf-tags">${tags.map(t => `<button type="button" class="t20tk-sf-tag" data-sf-action="untag" data-value="${t.key}" title="Remover">${escapeHtml(t.label)} <span aria-hidden="true">✕</span></button>`).join('')}</div>` : ''}
    <div class="t20tk-filter-panel t20tk-sf-panel" ${state.panel ? '' : 'hidden'}>
      ${groups}
      <label class="t20tk-bz-check t20tk-sf-enh"><input type="checkbox" data-sf="useEnhancements" ${state.useEnhancements ? 'checked' : ''}> Considerar aprimoramentos nos filtros <small>(mostra a magia quando um aprimoramento atende ao filtro, com o custo)</small></label>
      ${state.useEnhancements && !ENHANCEABLE.some(k => state[k]) ? '<p class="t20tk-bz-note t20tk-sf-enh-hint">Ligado. Agora escolha um filtro acima (execução, alcance, duração, resistência, função, elemento, condição…) — as magias que só atendem com aprimoramento aparecem marcadas com <b><i class="fa-solid fa-star" inert></i> Por aprimoramento</b>.</p>' : ''}
    </div>
  </section>`;
}

/** Liga o painel. `onChange('query')` na digitação (150 ms), `onChange('filter')` nas outras mudanças. */
export function bindSpellFilterPanel(root, state, onChange) {
  const box = root.querySelector('.t20tk-sf');
  if (!box) return;
  let timer = null;
  box.querySelector('[data-sf-query]')?.addEventListener('input', ev => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = ev.target.value; onChange('query'); }, 150);
  });
  box.querySelectorAll('[data-sf]').forEach(el => el.addEventListener('change', () => {
    const key = el.dataset.sf;
    state[key] = el.type === 'checkbox' ? el.checked : el.value;
    onChange('filter');
  }));
  box.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-sf-action]');
    if (!btn) return;
    ev.preventDefault();
    const { sfAction: action, value } = btn.dataset;
    if (action === 'circle') state.circle = value;
    else if (action === 'panel') state.panel = !state.panel;
    else if (action === 'clear') Object.assign(state, { ...EMPTY_FILTERS, panel: state.panel });
    else if (action === 'untag') state[value] = value === 'useEnhancements' ? false : '';
    onChange('filter');
  });
}

/** Marcador "aparece por aprimoramento": diz qual filtro, qual aprimoramento e o custo. */
export const viaTags = via => via?.length ? `<span class="t20tk-sf-via" title="${escapeHtml(via.map(v => v.title).join('\n'))}"><b><i class="fa-solid fa-star" inert></i> Por aprimoramento</b>${via.map(v => `<i>${escapeHtml(v.filter ? `${v.filter}: ${v.value}` : v.label)}${v.cost ? ` · <em>${escapeHtml(v.cost)}</em>` : ''}</i>`).join('')}</span>` : '';
