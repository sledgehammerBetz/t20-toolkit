/**
 * Página de um nível (2–20) no estilo do PF2e Leveler: sem menus suspensos.
 * Classe por cartões; cada vaga de poder mostra "Não escolhido · Escolher…" e abre uma lista com filtros
 * (grupo, categoria, só elegíveis, ocultar os que já tenho) e botão Selecionar.
 * Estado da tela: app.browse (o que está sendo escolhido) e app.bf (filtros da lista).
 */
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, fold, actorClasses, plainText } from '../core/t20.js';
import { BASE_CLASSES, classInfo, gainsAt, prerequisiteText, evaluatePrerequisites } from './planner-rules.js';
import { CASTER_CLASSES } from '../core/caster-rules.js';
import { getTableRules } from '../core/table-rules.js';
import { skillLabels } from './creation-view.js';

const strip = html => plainText(html);
const STATUS = { ok: ['✔', 'Cumpre'], missing: ['✘', 'Não cumpre'], review: ['?', 'Conferir'], none: ['', 'Sem pré-requisitos'] };
export const GENERAL_CATS = [['combate', 'Combate'], ['destino', 'Destino'], ['magia', 'Magia'], ['tormenta', 'Tormenta'], ['grupo', 'Grupo e parceiros'], ['raca', 'Raciais']];
export const catOf = p => {
  const s = fold(p.subtipo);
  if (['combate', 'destino', 'magia', 'tormenta'].includes(s)) return s;
  if (['grupo', 'geupo', 'parceiro', 'montaria'].includes(s)) return 'grupo';
  return 'raca';
};

const flag = (app, path, value) => app.actor.update({ [`flags.${MODULE_ID}.plan.levels.${app.selected}${path ? `.${path}` : ''}`]: value });
/* ---------- Aumento de Atributo: uma vez por patamar para o mesmo atributo (JdA, poderes gerais) ---------- */
const AUMENTO = { forca: 'for', destreza: 'des', constituicao: 'con', inteligencia: 'int', sabedoria: 'sab', carisma: 'car' };
/** "Aumento de Atributo (Força)" → 'for'; o genérico → null. */
export const aumentoAttr = name => { const m = fold(name).match(/^aumento de atributo \((\w+)\)/); return m ? AUMENTO[m[1]] ?? null : null; };
export const tierOf = level => (level <= 4 ? 1 : level <= 10 ? 2 : level <= 16 ? 3 : 4);
const TIER_LABEL = { 1: 'iniciante', 2: 'veterano', 3: 'campeão', 4: 'lenda' };

/** Atributos que já receberam Aumento no patamar do nível `level` (ficha + plano), exceto a vaga `skipGain` deste nível. */
export function aumentosNoPatamar(app, level, skipGain = null) {
  const tier = tierOf(level);
  const out = new Map();
  for (const i of app.actor?.items ?? []) {
    const a = i.type === 'poder' ? aumentoAttr(i.name) : null;
    const lv = Number(i.flags?.[MODULE_ID]?.plannerLevel) || 0;
    if (a && lv && tierOf(lv) === tier) out.set(a, `${lv}º nível (na ficha)`);
  }
  for (const [lv, entry] of Object.entries(app.ctxData.plan ?? {})) {
    if (tierOf(Number(lv)) !== tier) continue;
    for (const [gid, uuid] of Object.entries(entry?.picks ?? {})) {
      if (Number(lv) === level && gid === skipGain) continue;
      const a = aumentoAttr(app.index.powers.find(p => p.uuid === uuid)?.name ?? '');
      if (a) out.set(a, `${lv}º nível (plano)`);
    }
  }
  return out;
}

export const bf = app => (app.bf ??= { q: '', group: '', cat: '', eligible: true, hideOwned: true });

/* ---------- página do nível ---------- */

export function renderLevelEditor(app) {
  const c = app.ctxData;
  const level = app.selected;
  const row = c.timeline.find(r => r.level === level);
  if (!row) return '';
  if (app.browse && app.browse.level === level) return renderBrowser(app, row);
  app.browse = null;
  const entry = c.plan[level] ?? {};
  const isNext = level === c.current + 1;

  // classe: cartões das classes da ficha + "outra classe"
  const sheet = c.classes;
  const chosenOther = entry.cls && !sheet.some(x => fold(x.name) === fold(entry.cls)) ? entry.cls : null;
  const clsCard = (name, sub, img) => `<button type="button" class="t20tk-lv-class ${fold(entry.cls ?? '') === fold(name) ? 'is-on' : ''}" data-action="lvClass" data-value="${escapeHtml(name)}">
      ${img ? `<img src="${escapeHtml(img)}" alt="">` : '<span class="t20tk-wz-noimg">✦</span>'}<span><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></span></button>`;
  const imgOf = name => app.index.classes.find(x => x.key === fold(name))?.img;
  const classes = `<section class="t20tk-wz-box"><header><b>Classe deste nível</b><small>Continue numa classe da ficha ou entre numa nova (multiclasse).</small></header>
    <div class="t20tk-lv-classes">
      ${sheet.map(x => clsCard(x.name, fold(entry.cls ?? '') === x.key ? `vai para o ${row.classLevel}º nível` : `na ficha (${x.level}º)`, imgOf(x.name))).join('')}
      ${chosenOther ? clsCard(chosenOther, `nova classe · ${row.classLevel}º nível`, imgOf(chosenOther)) : ''}
      <button type="button" class="t20tk-lv-class t20tk-lv-class--add" data-action="lvBrowse" data-kind="class"><span class="t20tk-wz-noimg">+</span><span><b>Outra classe…</b><small>escolher na lista</small></span></button>
    </div></section>`;

  let gains = '';
  if (row.cls) {
    const g = gainsAt(row.cls, row.classLevel);
    const ctx = app.prereqContext(level);
    gains = `<section class="t20tk-wz-box"><header><b>${escapeHtml(row.cls)} — ${row.classLevel}º nível</b>${g.text ? `<small>${escapeHtml(g.text)}</small>` : ''}</header>
      ${g.modeled ? '' : '<p class="t20tk-bz-warn">Progressão desta classe não está no Planejador: aplicar sobe o nível; adicione as habilidades pela ficha.</p>'}
      <div class="t20tk-lv-gains">${g.gains.map(gain => renderGain(app, gain, row, entry, ctx)).join('') || '<p class="t20tk-bz-note">Só o nível (PV, PM e perícias da classe).</p>'}</div>
      ${row.classLevel === 1 ? devotionNote(app, row.cls) : ''}</section>`;
  }
  const footer = `<footer class="t20tk-wz-foot t20tk-lv-foot">
    ${entry.cls ? `<button type="button" class="t20tk-ui-button" data-action="clearLevel" data-level="${level}">Limpar plano</button>` : '<span></span>'}
    ${isNext ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="apply" data-level="${level}" ${row.cls && app.actor.isOwner ? '' : 'disabled'}>Aplicar ${level}º nível à ficha</button>`
      : `<span class="t20tk-bz-note">Só o ${c.current + 1}º nível pode ser aplicado agora; este fica salvo como plano.</span>`}
  </footer>`;
  return `<div class="t20tk-lv-page"><h3 class="t20tk-lv-title">${level}º nível de personagem</h3>${classes}${gains}</div>${footer}`;
}

export function powerCard(app, p, ctx, { action = '', gain = '', selected = false, taken = false, takenLabel = '' } = {}) {
  const ev = ctx ? evaluatePrerequisites(prerequisiteText(p.description), ctx) : { status: 'none', parts: [] };
  const owned = app.ownsPower(p.name) && !aumentoAttr(p.name);
  const [mark, label] = STATUS[ev.status];
  const prereq = ev.parts.length ? `<span class="t20tk-lv-prereq">${ev.parts.map(x => `<i data-ok="${x.ok}">${x.ok === true ? '✔' : x.ok === false ? '✘' : '?'} ${escapeHtml(x.text)}</i>`).join('')}</span>` : '';
  const sub = strip(p.description).replace(/Pr[ée]-?requisitos?:.*$/i, '').slice(0, 150);
  return `<li class="t20tk-wz-card ${selected ? 'is-selected' : ''} ${owned || taken ? 'is-off' : ''}" data-status="${ev.status}">
    ${p.img ? `<img src="${escapeHtml(p.img)}" alt="" loading="lazy">` : '<span class="t20tk-wz-noimg">✦</span>'}
    <span class="t20tk-wz-copy"><b>${escapeHtml(p.name)}</b><small title="${escapeHtml(strip(p.description))}">${escapeHtml(sub)}${sub.length >= 150 ? '…' : ''}</small>
      <span class="t20tk-wz-tags"><i data-tone="${ev.status === 'missing' ? 'warn' : ev.status === 'ok' ? 'ok' : ''}">${mark} ${label}</i>${p.subtipo ? `<i>${escapeHtml(p.subtipo)}</i>` : ''}${owned && !aumentoAttr(p.name) ? '<i data-tone="warn">já tem</i>' : ''}${takenLabel ? `<i data-tone="warn">${escapeHtml(takenLabel)}</i>` : ''}${p.tipo === 'distincao' ? '<i data-tone="accent">distinção</i>' : ''}</span>${prereq}</span>
    ${action ? `<button type="button" class="t20tk-ui-button ${selected ? 't20tk-ui-button--primary' : ''}" data-action="${action}" data-gain="${gain}" data-value="${p.uuid}" ${(owned || taken) && !selected ? 'disabled' : ''}>${selected ? 'Selecionado' : 'Selecionar'}</button>` : ''}
  </li>`;
}

function renderGain(app, gain, row, entry, ctx) {
  const picks = entry.picks ?? {};
  if (gain.kind === 'ability') {
    const found = app.findAbility(row.cls, gain.item);
    const owned = app.ownsPower(gain.item);
    return `<div class="t20tk-lv-gain" data-kind="ability">${found?.img ? `<img src="${escapeHtml(found.img)}" alt="">` : '<span class="t20tk-wz-noimg">◆</span>'}<span><small>Habilidade de classe</small><b>${escapeHtml(gain.item)}</b><em>${owned ? 'já está na ficha (melhora sozinha)' : found ? 'entra ao aplicar' : 'não está no compêndio'}</em></span></div>`;
  }
  if (gain.kind === 'spells') return `<div class="t20tk-lv-gain" data-kind="spells"><span class="t20tk-wz-noimg">✦</span><span><small>Magias</small><b>${escapeHtml(gain.label)}</b><em>escolha no Buscador depois de aplicar</em></span></div>`;
  if (gain.kind === 'note') return `<div class="t20tk-lv-gain" data-kind="note"><span class="t20tk-wz-noimg">!</span><span><small>Habilidade</small><b>${escapeHtml(gain.label)}</b><em>${app.ownsPower(gain.label) ? 'já está na ficha' : 'adicione pela ficha (não está no compêndio)'}</em></span></div>`;
  if (gain.kind === 'path') {
    const options = gain.options.map(n => app.index.powers.find(p => p.name === n)).filter(Boolean);
    return `<div class="t20tk-lv-slot"><header><small>${escapeHtml(gain.label)}</small></header><ul class="t20tk-wz-tiles">${options.map(p => `<li><button type="button" class="t20tk-wz-tile ${picks[gain.id] === p.uuid ? 'is-on' : ''}" data-action="lvPick" data-gain="${gain.id}" data-value="${p.uuid}"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(strip(p.description).slice(0, 110))}…</small></button></li>`).join('')}</ul></div>`;
  }
  if (gain.kind === 'power') {
    const chosen = picks[gain.id] ? app.index.powers.find(p => p.uuid === picks[gain.id]) : null;
    const body = chosen
      ? `<ul class="t20tk-wz-list t20tk-lv-chosen">${powerCard(app, chosen, ctx)}</ul>${physicalNote(app, chosen)}${chosen.tipo === 'distincao' ? '<p class="t20tk-bz-note">Distinção: só vale se o personagem foi admitido (combine com o mestre).</p>' : ''}`
      : '<p class="t20tk-lv-empty">Não escolhido</p>';
    return `<div class="t20tk-lv-slot ${chosen ? 'is-done' : ''}"><header><small>${escapeHtml(gain.label)}</small>
      <span>${chosen ? `<button type="button" class="t20tk-bz-link" data-action="lvUnpick" data-gain="${gain.id}">remover</button>` : ''}<button type="button" class="t20tk-ui-button ${chosen ? '' : 't20tk-ui-button--primary'}" data-action="lvBrowse" data-kind="power" data-gain="${gain.id}">${chosen ? 'Trocar…' : 'Escolher…'}</button></span></header>${body}</div>`;
  }
  return '';
}

function physicalNote(app, power) {
  if (!power || !/^aumento de atributo/i.test(power.name)) return '';
  return app.actor?.getFlag?.(MODULE_ID, 'creationRules')?.noPhysicalIncrease
    ? '<p class="t20tk-bz-warn">Pela idade do personagem, o Aumento de Atributo não pode ir para Força, Destreza ou Constituição.</p>' : '';
}

function devotionNote(app, clsName) {
  return app.devotionNoteHtml?.(clsName) ?? '';
}

/* ---------- lista para escolher (classe ou poder) ---------- */

export function chipRow(label, key, options, cur) {
  return `<div class="t20tk-wz-field"><span>${escapeHtml(label)}</span><div class="t20tk-wz-chips">${options.map(([v, l]) => `<button type="button" class="t20tk-chip ${String(cur ?? '') === String(v) ? 'is-on' : ''}" data-action="lvFilter" data-key="${key}" data-value="${escapeHtml(v)}">${escapeHtml(l)}</button>`).join('')}</div></div>`;
}
export const toggleRow = (label, key, on) => `<label class="t20tk-bz-check t20tk-lv-toggle"><input type="checkbox" data-lvtoggle="${key}" ${on ? 'checked' : ''}> ${escapeHtml(label)}</label>`;

function renderBrowser(app, row) {
  const b = app.browse;
  const f = bf(app);
  const c = app.ctxData;
  const entry = c.plan[app.selected] ?? {};
  const q = fold(f.q);
  let title, filters, list, count;
  if (b.kind === 'class') {
    const known = new Set(BASE_CLASSES.map(fold));
    const caster = x => CASTER_CLASSES[x.key]?.tradition ?? CASTER_CLASSES[fold(classInfo(x.name)?.variantOf ?? '')]?.tradition ?? '';
    const rows = app.index.classes.filter(x => (!q || x.key.includes(q)) && (!f.caster || (f.caster === 'none' ? !caster(x) : caster(x) === f.caster)) && (!f.variant || (f.variant === 'variant') === !!classInfo(x.name)?.variantOf));
    title = 'Escolher classe';
    filters = `${chipRow('Magias', 'caster', [['', 'Todas'], ['arc', 'Arcanas'], ['div', 'Divinas'], ['none', 'Sem magias']], f.caster)}${chipRow('Tipo', 'variant', [['', 'Todas'], ['base', 'Base'], ['variant', 'Variantes']], f.variant)}`;
    count = rows.length;
    list = rows.map(x => {
      const tags = [x.packLabel, classInfo(x.name)?.variantOf ? `variante de ${classInfo(x.name).variantOf}` : '', known.has(x.key) ? '' : 'progressão manual'].filter(Boolean);
      const sel = fold(entry.cls ?? '') === x.key;
      return `<li class="t20tk-wz-card ${sel ? 'is-selected' : ''}">${x.img ? `<img src="${escapeHtml(x.img)}" alt="" loading="lazy">` : '<span class="t20tk-wz-noimg">✦</span>'}
        <span class="t20tk-wz-copy"><b>${escapeHtml(x.name)}</b><small>PV ${x.pv ?? '?'} · PM ${x.pm ?? '?'} por nível</small><span class="t20tk-wz-tags">${tags.map(t => `<i>${escapeHtml(t)}</i>`).join('')}</span></span>
        <button type="button" class="t20tk-ui-button ${sel ? 't20tk-ui-button--primary' : ''}" data-action="lvClass" data-value="${escapeHtml(x.name)}">${sel ? 'Selecionado' : 'Selecionar'}</button></li>`;
    }).join('');
  } else {
    const gain = (b.kind !== 'extra' && row?.cls ? gainsAt(row.cls, row.classLevel).gains.find(g => g.id === b.gain) : null) ?? { label: 'Poder extra', powerClass: '' };
    const ctx = app.prereqContext(b.kind === 'extra' ? app.ctxData.current : app.selected);
    const picks = entry.picks ?? {};
    const taken = new Set(Object.entries(picks).filter(([k]) => k !== b.gain).map(([, v]) => v));
    let pool;
    if (b.kind === 'extra') pool = app.index.powers.filter(p => p.tipo === b.type);
    else {
      const o = app.powerOptions(row.cls, gain.powerClass);
      pool = [...o.cls.map(p => ({ p, g: 'classe' })), ...o.general.map(p => ({ p, g: 'geral' })), ...o.distinction.map(p => ({ p, g: 'distincao' }))].filter(x => !f.group || x.g === f.group).map(x => x.p);
    }
    const rows = pool.filter(p => (!q || p.key.includes(q) || fold(p.description).includes(q))
      && (!f.cat || p.tipo !== 'geral' || catOf(p) === f.cat)
      && (!f.hideOwned || aumentoAttr(p.name) || !app.ownsPower(p.name))
      && !(fold(p.name) === 'aumento de atributo' && pool.some(x => aumentoAttr(x.name)))
      && (!f.eligible || evaluatePrerequisites(prerequisiteText(p.description), ctx).status !== 'missing'));
    title = b.kind === 'extra' ? 'Ganho fora da progressão' : `${gain.label} — ${row.cls} ${row.classLevel}º`;
    const groups = b.kind === 'extra' ? '' : chipRow('Grupo', 'group', [['', 'Todos'], ['classe', `De ${gain.powerClass || row.cls}`], ['geral', 'Gerais'], ...(getTableRules().distinctions ? [['distincao', 'Distinções']] : [])], f.group);
    filters = `${groups}${chipRow('Categoria (poderes gerais)', 'cat', [['', 'Todas'], ...GENERAL_CATS], f.cat)}${toggleRow('Só os que cumpro (pré-requisitos)', 'eligible', f.eligible)}${toggleRow('Ocultar os que já tenho', 'hideOwned', f.hideOwned)}`;
    count = rows.length;
    const action = b.kind === 'extra' ? 'lvExtraValue' : 'lvPick';
    const cur = b.kind === 'extra' ? app.extra?.value : picks[b.gain];
    const tierUsed = b.kind === 'extra' ? new Map() : aumentosNoPatamar(app, app.selected, b.gain);
    const noPhysical = !!app.actor?.getFlag?.(MODULE_ID, 'creationRules')?.noPhysicalIncrease;
    const block = p => {
      const a = aumentoAttr(p.name);
      if (!a) return '';
      if (noPhysical && ['for', 'des', 'con'].includes(a)) return 'idade: sem atributo físico';
      if (tierUsed.has(a)) return `já no patamar ${TIER_LABEL[tierOf(app.selected)]}: ${tierUsed.get(a)}`;
      return '';
    };
    list = rows.map(p => { const why = block(p); return powerCard(app, p, ctx, { action, gain: b.gain ?? '', selected: cur === p.uuid, taken: taken.has(p.uuid) || !!why, takenLabel: why }); }).join('');
  }
  return `<div class="t20tk-lv-browser">
    <header class="t20tk-lv-bhead"><button type="button" class="t20tk-ui-button" data-action="lvBack">${b.kind === 'extra' ? '← Voltar aos ganhos extras' : `← Voltar ao ${app.selected}º nível`}</button><h3>${escapeHtml(title)}</h3></header>
    <div class="t20tk-wz-split">
      <aside class="t20tk-wz-filters">
        <label class="t20tk-wz-field"><span>Buscar</span><input type="search" name="lvq" data-lvq value="${escapeHtml(f.q)}" placeholder="Nome ou texto…"></label>
        ${filters}
        <button type="button" class="t20tk-bz-link t20tk-wz-clear" data-action="lvFilterClear">Limpar filtros</button>
      </aside>
      <div class="t20tk-wz-results"><header class="t20tk-wz-listhead"><span>${count} resultado(s)</span></header><ul class="t20tk-wz-list">${list || '<li class="t20tk-bz-empty">Nada com esses filtros. Tente desligar "Só os que cumpro".</li>'}</ul></div>
    </div></div>`;
}

/* ---------- ganhos fora da progressão: página própria ---------- */

const XG_TYPES = [
  { v: 'geral', icon: '✦', label: 'Poder geral', hint: 'combate, destino, magia, Tormenta…' },
  { v: 'classe', icon: '◆', label: 'Poder de classe', hint: 'de qualquer classe' },
  { v: 'concedido', icon: '☀', label: 'Poder concedido', hint: 'dado por um deus' },
  { v: 'distincao', icon: '♛', label: 'Distinção', hint: 'admissão combinada com o mestre', needs: 'distinctions' },
  { v: 'pericia', icon: '✎', label: 'Perícia treinada', hint: 'uma perícia nova' },
  { v: 'atributo', icon: '▲', label: '+1 em atributo', hint: 'soma 1 no valor base' }
];

export function renderExtraPage(app) {
  const c = app.ctxData;
  if (app.browse?.level === 'extra') return renderBrowser(app, c.timeline.find(r => r.level === Math.min(c.current + 1, 20)));
  const mode = getTableRules().extraGains;
  const list = app.actor.getFlag(MODULE_ID, 'extraGains') ?? [];
  const can = app.canExtraGain();
  const x = app.extra ??= { type: 'geral', value: '', reason: '' };
  const type = XG_TYPES.find(t => t.v === x.type) ?? XG_TYPES[0];
  const done = list.length
    ? `<ul class="t20tk-xg-list">${list.map((g, i) => `<li class="t20tk-xg-item">
        ${g.img ? `<img src="${escapeHtml(g.img)}" alt="">` : `<span class="t20tk-wz-noimg">${XG_TYPES.find(t => t.v === g.type)?.icon ?? '+'}</span>`}
        <span class="t20tk-xg-copy"><small>${escapeHtml(g.kindLabel ?? '')}</small><b>${escapeHtml(g.label)}</b>
          <em>${[g.level ? `${g.level}º nível` : '', g.by ? `por ${g.by}` : ''].filter(Boolean).map(escapeHtml).join(' · ')}</em>
          ${g.reason ? `<q>${escapeHtml(g.reason)}</q>` : ''}</span>
        ${can ? `<button type="button" class="t20tk-bz-link" data-action="removeExtra" data-index="${i}">desfazer</button>` : ''}</li>`).join('')}</ul>`
    : '<p class="t20tk-xg-empty">Nenhum ganho extra ainda. Treinos, recompensas, bênçãos e itens que dão poderes entram aqui.</p>';

  let form = '';
  if (can) {
    const types = XG_TYPES.filter(t => !t.needs || getTableRules()[t.needs]).map(t => `<button type="button" class="t20tk-xg-type ${x.type === t.v ? 'is-on' : ''}" data-action="lvExtraType" data-value="${t.v}" aria-pressed="${x.type === t.v}">
        <span aria-hidden="true">${t.icon}</span><b>${t.label}</b><small>${t.hint}</small></button>`).join('');
    let pick;
    if (x.type === 'pericia') {
      const labels = skillLabels();
      const opts = Object.entries(labels).filter(([k]) => !app.actor.system?.pericias?.[k]?.treinado).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
      pick = `<ul class="t20tk-wz-skills">${opts.map(([k, l]) => `<li><button type="button" class="t20tk-wz-skill" data-state="${x.value === k ? 'on' : ''}" data-action="lvExtraValue" data-value="${k}"><b>${escapeHtml(l)}</b></button></li>`).join('')}</ul>`;
    } else if (x.type === 'atributo') {
      pick = `<div class="t20tk-xg-attrs">${['for', 'des', 'con', 'int', 'sab', 'car'].map(k => {
        const cur = Number(app.actor.system?.atributos?.[k]?.value) || 0;
        return `<button type="button" class="t20tk-xg-attr ${x.value === k ? 'is-on' : ''}" data-action="lvExtraValue" data-value="${k}"><small>${k.toUpperCase()}</small><b>${cur >= 0 ? '+' : ''}${cur} → ${cur + 1 >= 0 ? '+' : ''}${cur + 1}</b></button>`;
      }).join('')}</div>`;
    } else {
      const chosen = x.value ? app.index.powers.find(p => p.uuid === x.value) : null;
      pick = chosen
        ? `<div class="t20tk-lv-gain" data-kind="power">${chosen.img ? `<img src="${escapeHtml(chosen.img)}" alt="">` : '<span class="t20tk-wz-noimg">✦</span>'}<span><small>${escapeHtml(type.label)}</small><b>${escapeHtml(chosen.name)}</b><em>${escapeHtml(strip(chosen.description).slice(0, 120))}…</em></span><button type="button" class="t20tk-ui-button" data-action="lvBrowse" data-kind="extra">Trocar…</button></div>`
        : `<button type="button" class="t20tk-xg-choose" data-action="lvBrowse" data-kind="extra"><b>Escolher ${escapeHtml(type.label.toLowerCase())}…</b><small>abre a lista com busca e filtros</small></button>`;
    }
    const label = x.type === 'pericia' ? skillLabels()[x.value] : x.type === 'atributo' ? (x.value ? `+1 em ${x.value.toUpperCase()}` : '') : app.index.powers.find(p => p.uuid === x.value)?.name;
    form = `<section class="t20tk-wz-box t20tk-xg-new"><header><b>Novo ganho</b><small>Registre o que a campanha deu ao personagem. Fica no histórico e pode ser desfeito.</small></header>
      <div class="t20tk-xg-step"><span>1</span><b>Tipo</b></div><div class="t20tk-xg-types">${types}</div>
      <div class="t20tk-xg-step"><span>2</span><b>Escolha</b></div><div class="t20tk-xg-pick">${pick}</div>
      <div class="t20tk-xg-step"><span>3</span><b>Motivo</b> <small>(opcional)</small></div>
      <input type="text" class="t20tk-xg-reason" name="extraReason" value="${escapeHtml(x.reason ?? '')}" placeholder="ex.: treino com o mestre de armas de Valkaria">
      <footer class="t20tk-xg-foot"><span>${label ? `Vai para a ficha: <b>${escapeHtml(label)}</b>` : 'Escolha o que entra na ficha.'}</span>
        <button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="addExtra" ${x.value ? '' : 'disabled'}>Adicionar à ficha</button></footer>
    </section>`;
  } else if (mode === 'gm') form = '<p class="t20tk-bz-note">Só o mestre registra ganhos extras (Regras da mesa).</p>';

  return `<div class="t20tk-lv-page">
    <h3 class="t20tk-lv-title">Ganhos fora da progressão</h3>
    <p class="t20tk-bz-note">Poderes, perícias ou atributos dados pela campanha, fora da tabela de níveis da classe.</p>
    <section class="t20tk-wz-box"><header><b>Registrados</b><small>${list.length} ganho${list.length === 1 ? '' : 's'}</small></header>${done}</section>
    ${form}
  </div>`;
}

/* ---------- ações (this = PlannerApp) ---------- */

export const LEVEL_ACTIONS = {
  async lvClass(event, target) {
    const value = target.dataset.value;
    const cur = this.ctxData.plan[this.selected]?.cls;
    this.browse = null;
    if (fold(cur ?? '') === fold(value)) return this.render();
    await this.actor.update({ [`flags.${MODULE_ID}.plan.levels.-=${this.selected}`]: null });
    await flag(this, '', { cls: value, picks: {} });
  },
  lvBrowse(event, target) {
    const { kind, gain } = target.dataset;
    this.browse = { kind, gain, level: kind === 'extra' ? 'extra' : this.selected, type: this.extra?.type };
    this.bf = { q: '', group: '', cat: '', eligible: kind !== 'class', hideOwned: true };
    this.render();
  },
  lvBack() { this.browse = null; this.render(); },
  async lvPick(event, target) {
    const { gain, value } = target.dataset;
    this.browse = null;
    await flag(this, `picks.${gain}`, value);
    this.render();
  },
  async lvUnpick(event, target) { await flag(this, `picks.${target.dataset.gain}`, null); },
  lvFilter(event, target) { bf(this)[target.dataset.key] = target.dataset.value; this.render(); },
  lvFilterClear() { this.bf = { q: '', group: '', cat: '', eligible: false, hideOwned: false }; this.render(); },
  lvExtraPage() { this.page = 'extra'; this.browse = null; this.render(); },
  lvExtraType(event, target) { this.extra = { ...(this.extra ?? {}), type: target.dataset.value, value: '', touched: true }; this.render(); },
  lvExtraValue(event, target) { this.extra = { ...(this.extra ?? {}), value: target.dataset.value, touched: true }; this.browse = null; this.render(); }
};

/** Campos de texto e caixas da página do nível. */
export function bindLevelEditor(app, root) {
  let timer = null;
  root.querySelector('[data-lvq]')?.addEventListener('input', ev => {
    clearTimeout(timer);
    timer = setTimeout(() => { bf(app).q = ev.target.value; app.render(); }, 150);
  });
  root.querySelectorAll('[data-lvtoggle]').forEach(cb => cb.addEventListener('change', () => { bf(app)[cb.dataset.lvtoggle] = cb.checked; app.render(); }));
  root.querySelector('input[name="extraReason"]')?.addEventListener('change', ev => { (app.extra ??= {}).reason = ev.target.value; });
}

export { actorClasses };
