/**
 * Troca o HTML de uma janela sem perder o lugar do usuário:
 * rolagem de cada área rolável, seções abertas (<details>) e o campo com foco.
 */

const sigOf = node => `${node.tagName}.${[...node.classList].sort().join('.')}`;

/**
 * Chave estável de um elemento dentro da janela. A posição entre irmãos iguais é calculada uma vez por pai
 * (em listas longas, olhar os irmãos anteriores de cada item deixava o redesenho quadrático).
 */
function keyer(root) {
  const positions = new WeakMap();
  const position = node => {
    const parent = node.parentElement;
    if (!parent) return 0;
    let map = positions.get(parent);
    if (!map) {
      map = new Map();
      const seen = new Map();
      for (const child of parent.children) {
        const sig = sigOf(child);
        const i = seen.get(sig) ?? 0;
        seen.set(sig, i + 1);
        map.set(child, i);
      }
      positions.set(parent, map);
    }
    return map.get(node) ?? 0;
  };
  return el => {
    const parts = [];
    for (let node = el; node && node !== root; node = node.parentElement) {
      if (node.dataset?.region) { parts.unshift(`[${node.dataset.region}]`); break; }
      parts.unshift(`${sigOf(node)}:${position(node)}`);
    }
    return parts.join('>');
  };
}

const summaryKey = d => (d.dataset.key ?? d.querySelector(':scope > summary')?.textContent ?? '').replace(/\d+\s*$/, '').trim();

export function captureState(root) {
  const scroll = new Map();
  const keyOf = keyer(root);
  if (root.scrollTop || root.scrollLeft) scroll.set('', [root.scrollTop, root.scrollLeft]);
  for (const el of root.querySelectorAll('*')) {
    if (el.scrollTop || el.scrollLeft) scroll.set(keyOf(el), [el.scrollTop, el.scrollLeft]);
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
  // Acha os elementos rolados uma vez (uma passada pela janela, não uma por área rolada).
  const targets = [];
  if (scroll.size) {
    const keyOf = keyer(root);
    const wanted = new Map(scroll);
    if (wanted.has('')) { targets.push([root, wanted.get('')]); wanted.delete(''); }
    if (wanted.size) for (const e of root.querySelectorAll('*')) {
      const k = keyOf(e);
      if (wanted.has(k)) { targets.push([e, wanted.get(k)]); wanted.delete(k); if (!wanted.size) break; }
    }
  }
  const apply = () => { for (const [el, [top, left]] of targets) { el.scrollTop = top; el.scrollLeft = left; } };
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
