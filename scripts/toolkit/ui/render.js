/**
 * Troca o HTML de uma janela sem perder o lugar do usuário:
 * rolagem de cada área rolável, seções abertas (<details>) e o campo com foco.
 */

function keyOf(el, root) {
  const parts = [];
  for (let node = el; node && node !== root; node = node.parentElement) {
    if (node.dataset?.region) { parts.unshift(`[${node.dataset.region}]`); break; }
    const sig = `${node.tagName}.${[...node.classList].sort().join('.')}`;
    let i = 0;
    for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
      if (`${s.tagName}.${[...s.classList].sort().join('.')}` === sig) i++;
    }
    parts.unshift(`${sig}:${i}`);
  }
  return parts.join('>');
}

const summaryKey = d => (d.dataset.key ?? d.querySelector(':scope > summary')?.textContent ?? '').replace(/\d+\s*$/, '').trim();

export function captureState(root) {
  const scroll = new Map();
  if (root.scrollTop || root.scrollLeft) scroll.set('', [root.scrollTop, root.scrollLeft]);
  for (const el of root.querySelectorAll('*')) {
    if (el.scrollTop || el.scrollLeft) scroll.set(keyOf(el, root), [el.scrollTop, el.scrollLeft]);
  }
  const open = new Set([...root.querySelectorAll('details[open]')].map(summaryKey));
  const a = document.activeElement;
  let focus = null;
  if (a && root.contains(a) && a.name) {
    focus = { name: a.name, start: a.selectionStart ?? null, end: a.selectionEnd ?? null };
  }
  return { scroll, open, focus };
}

export function restoreState(root, { scroll, open, focus }) {
  for (const d of root.querySelectorAll('details')) if (open.has(summaryKey(d))) d.open = true;
  const apply = () => {
    for (const [key, [top, left]] of scroll) {
      const el = key === '' ? root : (() => { for (const e of root.querySelectorAll('*')) if (keyOf(e, root) === key) return e; return null; })();
      if (el) { el.scrollTop = top; el.scrollLeft = left; }
    }
  };
  apply();
  // imagens e fontes podem mudar a altura depois do primeiro quadro
  requestAnimationFrame?.(apply);
  if (focus) {
    const el = root.querySelector(`[name="${CSS.escape(focus.name)}"]`);
    if (el && el.focus) {
      el.focus({ preventScroll: true });
      try { if (focus.start !== null) el.setSelectionRange(focus.start, focus.end); } catch { /* select não aceita */ }
    }
  }
}

/** Use dentro de _replaceHTML(result, content). */
export function replaceKeepingPlace(content, html) {
  const state = captureState(content);
  content.innerHTML = html;
  restoreState(content, state);
}
