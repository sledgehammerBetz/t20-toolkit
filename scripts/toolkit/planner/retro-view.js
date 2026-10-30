/**
 * Seleção retroativa: níveis feitos fora do Planejador.
 * O jogador diz de onde veio cada coisa da ficha: a classe de cada nível, qual poder da ficha ocupou cada vaga da
 * tabela (inclusive as vagas "pelo poder" de outra classe) e a origem do que sobrou.
 * Rascunho:  flags['t20-toolkit'].plan.retro[N] = { cls, picks: { [gainId]: itemId } } (via plan-draft.js).
 * Registro:  history[N] = { cls, classLevel, classId, created: [itemIds], slots, viaSet: [itemIds], retro: true };
 *            os itens ganham plannerLevel (e via, na vaga de uma fonte). "Refazer registro" só apaga o registro.
 * Sobras:    flags['t20-toolkit'].source = { kind, via? } no item; "Ganho extra" entra também em extraGains (retro: true).
 * Assim retreino, pré-requisitos e nível efetivo leem tudo pelos mesmos campos dos níveis aplicados pelo Planejador.
 */
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, fold, plainText } from '../core/t20.js';
import { draftUpdate, flushDraft } from './plan-draft.js';
import { gainsAt } from './planner-rules.js';
import { CROSS_CLASS_SOURCES, sourceAccepts, baseClassKey } from '../core/class-levels.js';
import { viaSlots, viaFlag, almaLivreClass, sheetGrantSources } from './cross-class.js';
import { postCard } from '../ui/chat.js';

const RETRO = `flags.${MODULE_ID}.plan.retro`;
const flagsOf = item => item?.flags?.[MODULE_ID] ?? {};
const SOURCE_LABEL = { raca: 'Raça', origem: 'Origem', devocao: 'Devoção', extra: 'Ganho extra', outro: 'Outro' };
const TIPO_LABEL = { classe: 'Poder de classe', geral: 'Poder geral', distincao: 'Distinção', concedido: 'Poder concedido', origem: 'Poder de origem', ability: 'Habilidade de classe', racial: 'Habilidade racial', complicacao: 'Complicação' };
const EXTRA_TYPE = { classe: 'classe', geral: 'geral', concedido: 'concedido', distincao: 'distincao' };

/* ---------- estado ---------- */

/** Níveis de personagem já na ficha e sem registro (nem do Planejador, nem retroativo). */
export function unrecordedLevels(c) {
  const out = [];
  for (let lv = 1; lv <= c.current; lv++) if (!c.history[lv]) out.push(lv);
  return out;
}

/** Ids de itens que já têm dono: registrados num nível, ganhos extras ou com origem marcada. Rascunhos de outros níveis também. */
function claimedIds(app, { exceptLevel = null } = {}) {
  const c = app.ctxData;
  const ids = new Set();
  for (const [lv, h] of Object.entries(c.history)) if (Number(lv) !== exceptLevel) (h.created ?? []).forEach(id => ids.add(id));
  for (const [lv, d] of Object.entries(c.retro ?? {})) if (Number(lv) !== exceptLevel) Object.values(d?.picks ?? {}).forEach(id => id && ids.add(id));
  for (const g of app.actor?.getFlag?.(MODULE_ID, 'extraGains') ?? []) if (g.itemId) ids.add(g.itemId);
  for (const i of app.actor?.items ?? []) {
    const f = flagsOf(i);
    if (f.source || f.extraGain || (f.plannerLevel && Number(f.plannerLevel) !== exceptLevel)) ids.add(i.id);
  }
  return ids;
}

/** Itens da ficha sem origem: poderes e habilidades fora de qualquer registro. */
export function looseItems(app) {
  const claimed = claimedIds(app);
  return [...(app.actor?.items ?? [])].filter(i => i.type === 'poder' && !claimed.has(i.id));
}

/** Classe e nível de classe do nível N no registro: rascunho > classe inicial (1º nível); o nível de classe conta os registros anteriores. */
export function retroRow(app, level) {
  const c = app.ctxData;
  const draft = c.retro?.[level] ?? {};
  const initial = c.classes.find(x => x.initial) ?? (c.classes.length === 1 ? c.classes[0] : null);
  const cls = draft.cls || (level === 1 ? initial?.name : '') || '';
  const clsOf = lv => c.history[lv]?.cls || c.retro?.[lv]?.cls || '';
  let classLevel = null;
  if (cls) {
    classLevel = 1;
    for (let lv = 1; lv < level; lv++) if (fold(clsOf(lv)) === fold(cls)) classLevel++;
  }
  // Classes da ficha que ainda têm níveis sem dono (fora este).
  const used = key => Object.keys({ ...c.history, ...(c.retro ?? {}) }).map(Number).filter(lv => lv !== level && lv <= c.current && fold(clsOf(lv)) === key).length;
  const options = c.classes.map(x => ({ ...x, left: x.level - used(x.key) }));
  const missingBefore = [];
  for (let lv = 1; lv < level; lv++) if (!c.history[lv]) missingBefore.push(lv);
  return { level, cls, classLevel, picks: draft.picks ?? {}, options, missingBefore, draft };
}

const itemKey = app => id => fold(app.actor?.items?.get(id)?.name ?? '');

function slotsOf(app, r) {
  if (!r.cls) return { gains: [], vias: [] };
  const g = gainsAt(r.cls, r.classLevel);
  const vias = viaSlots(app, r.level, { cls: r.cls, classLevel: r.classLevel }, { picks: r.picks }, itemKey(app));
  return { g, gains: g.gains, vias };
}

/** Item da ficha da habilidade de classe `name` (o que ainda não foi registrado num nível anterior). */
function abilityItem(app, name, claimed) {
  const items = [...(app.actor?.items ?? [])].filter(i => i.type === 'poder' && fold(i.name) === fold(name));
  const free = items.find(i => !claimed.has(i.id));
  return { item: free ?? items[0] ?? null, already: !free && items.length ? items[0] : null };
}

/** O item cabe na vaga? (path: uma das opções; fonte: classe aceita pela fonte; poder: classe da vaga, geral, distinção, racial). */
function fits(app, item, gain, r) {
  const tipo = item.system?.tipo;
  const sub = fold(item.system?.subtipo ?? '');
  if (gain.kind === 'path') return (gain.options ?? []).some(n => fold(n) === fold(item.name));
  if (gain.def) {
    const own = app.ctxData.classes.flatMap(x => [x.key, baseClassKey(x.name)]);
    return (tipo === 'classe' && sourceAccepts(gain.def, sub, { own, chosen: almaLivreClass(app.actor) })) || (!!gain.def.general && tipo === 'geral');
  }
  if (['geral', 'distincao', 'racial'].includes(tipo)) return true;
  if (tipo !== 'classe') return false;
  const slot = gain.powerClass || r.cls;
  return [fold(slot), baseClassKey(slot), 'geral', almaLivreClass(app.actor)].filter(Boolean).includes(sub);
}

/** Dá para refazer o registro do nível N? Só o último registro retroativo (os seguintes dependem da ordem das classes). */
export const canRedo = (c, level) => !!c.history[level]?.retro && !Object.entries(c.history).some(([lv, h]) => Number(lv) > level && h?.retro);

/* ---------- página de um nível sem registro ---------- */

export function renderRetroLevel(app) {
  const c = app.ctxData;
  const level = app.selected;
  const r = retroRow(app, level);
  if (app.browse?.kind === 'retro' && app.browse.level === level) return renderRetroBrowser(app, r);
  app.browse = null;
  const can = !!app.actor?.isOwner;
  const claimed = claimedIds(app, { exceptLevel: level });

  const clsCard = x => {
    const on = fold(r.cls) === x.key;
    const off = !on && x.left <= 0;
    return `<button type="button" class="t20tk-lv-class ${on ? 'is-on' : ''}" data-action="rtrClass" data-value="${escapeHtml(x.name)}" ${off || !can ? 'disabled' : ''}>
      <span class="t20tk-wz-noimg">✦</span><span><b>${escapeHtml(x.name)}</b><small>${on ? `${r.classLevel}º nível de ${escapeHtml(x.name)}` : off ? 'todos os níveis já registrados' : `${x.left} nível(is) sem registro`}</small></span></button>`;
  };
  const classes = `<section class="t20tk-wz-box"><header><b>Classe deste nível</b><small>Em qual classe da ficha o personagem subiu no ${level}º nível?</small></header>
    <div class="t20tk-lv-classes">${r.options.map(clsCard).join('')}</div></section>`;

  let gains = '';
  let race = '';
  const { g, gains: list, vias } = slotsOf(app, r);
  if (r.cls) {
    const rows = [...list, ...vias].map(gain => {
      if (gain.kind === 'ability') {
        const a = abilityItem(app, gain.item, claimed);
        const em = a.already ? `já registrada no ${flagsOf(a.already).plannerLevel || '?'}º nível (melhora sozinha)` : a.item ? 'está na ficha: entra no registro deste nível' : 'não está na ficha';
        return `<div class="t20tk-lv-gain" data-kind="ability">${a.item?.img ? `<img src="${escapeHtml(a.item.img)}" alt="">` : '<span class="t20tk-wz-noimg">◆</span>'}<span><small>Habilidade de classe</small><b>${escapeHtml(gain.item)}</b><em>${escapeHtml(em)}</em></span></div>`;
      }
      if (gain.kind === 'spells') return `<div class="t20tk-lv-gain" data-kind="spells"><span class="t20tk-wz-noimg">✦</span><span><small>Magias</small><b>${escapeHtml(gain.label)}</b><em>as magias da ficha não precisam de registro</em></span></div>`;
      if (gain.kind === 'note') return `<div class="t20tk-lv-gain" data-kind="note"><span class="t20tk-wz-noimg">!</span><span><small>Habilidade</small><b>${escapeHtml(gain.label)}</b><em>só referência</em></span></div>`;
      if (gain.kind !== 'power' && gain.kind !== 'path') return '';
      const item = r.picks[gain.id] ? app.actor.items.get(r.picks[gain.id]) : null;
      const body = item
        ? `<div class="t20tk-lv-gain" data-kind="power">${item.img ? `<img src="${escapeHtml(item.img)}" alt="">` : '<span class="t20tk-wz-noimg">✦</span>'}<span><small>${escapeHtml(TIPO_LABEL[item.system?.tipo] ?? 'Poder')}</small><b>${escapeHtml(item.name)}</b>${gain.def ? `<em>por ${escapeHtml(gain.def.name)}: nível efetivo vale para este poder</em>` : ''}</span></div>`
        : '<p class="t20tk-lv-empty">Não indicado (deixe vazio se o personagem não pegou nada aqui)</p>';
      return `<div class="t20tk-lv-slot ${item ? 'is-done' : ''}"><header><small>${escapeHtml(gain.label)}</small>
        <span>${item && can ? `<button type="button" class="t20tk-bz-link" data-action="rtrUnpick" data-gain="${gain.id}">remover</button>` : ''}${can ? `<button type="button" class="t20tk-ui-button ${item ? '' : 't20tk-ui-button--primary'}" data-action="rtrBrowse" data-gain="${gain.id}">${item ? 'Trocar…' : 'Indicar da ficha…'}</button>` : ''}</span></header>${body}</div>`;
    }).join('');
    gains = `<section class="t20tk-wz-box"><header><b>${escapeHtml(r.cls)} — ${r.classLevel}º nível</b>${g.text ? `<small>${escapeHtml(g.text)}</small>` : ''}</header>
      ${g.modeled ? '' : '<p class="t20tk-bz-warn">Progressão desta classe não está no Planejador: o registro guarda só a classe do nível.</p>'}
      <div class="t20tk-lv-gains">${rows || '<p class="t20tk-bz-note">Só o nível (PV, PM e perícias da classe).</p>'}</div></section>`;
  }
  if (level === 1) {
    const raceItem = [...(app.actor?.items ?? [])].find(i => i.type === 'race');
    const origin = app.actor?.system?.detalhes?.origem ?? '';
    race = `<section class="t20tk-wz-box"><header><b>Criação</b><small>Raça e origem entram no registro do 1º nível. Habilidades raciais, poderes de origem e o resto vão na página "De onde veio".</small></header>
      <div class="t20tk-lv-gains">
        <div class="t20tk-lv-gain"><span class="t20tk-wz-noimg">☉</span><span><small>Raça</small><b>${escapeHtml(raceItem?.name ?? 'sem raça na ficha')}</b></span></div>
        <div class="t20tk-lv-gain"><span class="t20tk-wz-noimg">⌂</span><span><small>Origem</small><b>${escapeHtml(origin || 'campo Origem vazio na ficha')}</b></span></div>
      </div></section>`;
  }

  const blocked = r.missingBefore.length
    ? `<p class="t20tk-bz-warn">Registre antes o ${r.missingBefore[0]}º nível: o nível de classe depende da ordem. <button type="button" class="t20tk-bz-link" data-action="pickLevel" data-level="${r.missingBefore[0]}">Ir para o ${r.missingBefore[0]}º nível</button></p>` : '';
  const empty = [...list, ...vias].filter(x => (x.kind === 'power' || x.kind === 'path') && !r.picks[x.id]).length;
  const footer = `<footer class="t20tk-wz-foot t20tk-lv-foot">
    ${r.draft.cls || Object.keys(r.picks).length ? `<button type="button" class="t20tk-ui-button" data-action="rtrClear" ${can ? '' : 'disabled'}>Limpar</button>` : '<span></span>'}
    <span>${empty ? `<span class="t20tk-bz-note">${empty} vaga(s) sem indicação. </span>` : ''}<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="rtrConfirm" ${r.cls && !r.missingBefore.length && can ? '' : 'disabled'}>Registrar ${level}º nível</button></span>
  </footer>`;
  return `<div class="t20tk-lv-page">
    <h3 class="t20tk-lv-title">${level}º nível de personagem <span class="t20tk-rt-badge">na ficha · sem registro</span></h3>
    <p class="t20tk-bz-note">Este nível foi feito fora do Planejador. Diga de onde veio cada coisa e o Planejador passa a tratá-lo como os outros (retreino, pré-requisitos, nível efetivo). Nada é criado nem apagado na ficha.</p>
    ${blocked}${classes}${race}${gains}
  </div>${footer}`;
}

function renderRetroBrowser(app, r) {
  const b = app.browse;
  const { gains, vias } = slotsOf(app, r);
  const gain = [...gains, ...vias].find(x => x.id === b.gain);
  if (!gain) { app.browse = null; return renderRetroLevel(app); }
  const claimed = claimedIds(app, { exceptLevel: r.level });
  const taken = new Set(Object.entries(r.picks).filter(([k]) => k !== gain.id).map(([, v]) => v));
  const onlyFit = app.rtrFit ?? true;
  const abilityNames = new Set(gains.filter(x => x.kind === 'ability').map(x => fold(x.item)));
  const rows = [...app.actor.items].filter(i => i.type === 'poder' && !claimed.has(i.id) && !abilityNames.has(fold(i.name)) && (!onlyFit || fits(app, i, gain, r)))
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
  const cur = r.picks[gain.id];
  const list = rows.map(i => {
    const sel = cur === i.id;
    const off = taken.has(i.id);
    const sub = plainText(i.system?.description?.value ?? '').slice(0, 140);
    return `<li class="t20tk-wz-card ${sel ? 'is-selected' : ''} ${off ? 'is-off' : ''}">${i.img ? `<img src="${escapeHtml(i.img)}" alt="" loading="lazy">` : '<span class="t20tk-wz-noimg">✦</span>'}
      <span class="t20tk-wz-copy"><b>${escapeHtml(i.name)}</b><small>${escapeHtml(sub)}${sub.length >= 140 ? '…' : ''}</small>
        <span class="t20tk-wz-tags"><i>${escapeHtml(TIPO_LABEL[i.system?.tipo] ?? 'Poder')}</i>${i.system?.subtipo ? `<i>${escapeHtml(i.system.subtipo)}</i>` : ''}${off ? '<i data-tone="warn">em outra vaga</i>' : ''}</span></span>
      <button type="button" class="t20tk-ui-button ${sel ? 't20tk-ui-button--primary' : ''}" data-action="rtrPick" data-gain="${gain.id}" data-value="${i.id}" ${off && !sel ? 'disabled' : ''}>${sel ? 'Selecionado' : 'Selecionar'}</button></li>`;
  }).join('');
  return `<div class="t20tk-lv-browser">
    <header class="t20tk-lv-bhead"><button type="button" class="t20tk-ui-button" data-action="lvBack">← Voltar ao ${r.level}º nível</button><h3>${escapeHtml(gain.label)} — ${escapeHtml(r.cls)} ${r.classLevel}º</h3></header>
    <div class="t20tk-wz-split">
      <aside class="t20tk-wz-filters">
        <p class="t20tk-bz-note">Poderes da ficha ainda sem nível registrado.${gain.def ? ` ${escapeHtml(gain.def.name)} (${escapeHtml(gain.def.book)}): o poder fica marcado com a fonte.` : ''}</p>
        <label class="t20tk-bz-check t20tk-lv-toggle"><input type="checkbox" data-rtrfit ${onlyFit ? 'checked' : ''}> Só os que cabem nesta vaga</label>
      </aside>
      <div class="t20tk-wz-results"><header class="t20tk-wz-listhead"><span>${rows.length} poder(es)</span></header><ul class="t20tk-wz-list">${list || '<li class="t20tk-bz-empty">Nenhum poder livre na ficha cabe aqui. Desligue o filtro para ver todos.</li>'}</ul></div>
    </div></div>`;
}

/* ---------- página "De onde veio": o que sobrou na ficha ---------- */

/** Origem sugerida pelo tipo do poder. */
export const suggestedSource = item => ({ racial: 'raca', origem: 'origem', concedido: 'devocao' }[item.system?.tipo] ?? '');

function sourceOptions(app) {
  return [...['raca', 'origem', 'devocao'].map(k => [k, SOURCE_LABEL[k]]), ...sheetGrantSources(app.actor).map(s => [`via:${s.key}`, `Pelo poder: ${s.def.name}`]), ['extra', SOURCE_LABEL.extra], ['outro', SOURCE_LABEL.outro]];
}

const sourceText = s => (s?.via ? `Pelo poder: ${CROSS_CLASS_SOURCES[s.via]?.name ?? s.via}` : SOURCE_LABEL[s?.kind] ?? '');

export function renderRetroPage(app) {
  const c = app.ctxData;
  const can = !!app.actor?.isOwner;
  const missing = unrecordedLevels(c);
  const loose = looseItems(app);
  const pick = app.rtrSrc ??= {};
  const opts = sourceOptions(app);
  const levels = missing.length
    ? `<p class="t20tk-bz-warn">Níveis sem registro: ${missing.map(lv => `<button type="button" class="t20tk-bz-link" data-action="pickLevel" data-level="${lv}">${lv}º</button>`).join(', ')}. Registre os níveis primeiro: os poderes que ocuparam vagas da tabela saem desta lista.</p>`
    : '<p class="t20tk-bz-note">Todos os níveis da ficha estão registrados.</p>';
  const row = i => {
    const cur = pick[i.id] ?? suggestedSource(i);
    const chips = opts.map(([v, l]) => `<button type="button" class="t20tk-chip ${cur === v ? 'is-on' : ''}" data-action="rtrSource" data-item="${i.id}" data-value="${escapeHtml(v)}" ${can ? '' : 'disabled'}>${escapeHtml(l)}</button>`).join('');
    return `<li class="t20tk-xg-item">${i.img ? `<img src="${escapeHtml(i.img)}" alt="">` : '<span class="t20tk-wz-noimg">✦</span>'}
      <span class="t20tk-xg-copy"><small>${escapeHtml(TIPO_LABEL[i.system?.tipo] ?? 'Poder')}${i.system?.subtipo ? ` · ${escapeHtml(i.system.subtipo)}` : ''}</small><b>${escapeHtml(i.name)}</b>
        <div class="t20tk-wz-chips">${chips}</div></span></li>`;
  };
  const chosen = loose.filter(i => pick[i.id] ?? suggestedSource(i)).length;
  const todo = loose.length
    ? `<ul class="t20tk-xg-list">${loose.map(row).join('')}</ul>
      ${loose.some(i => (pick[i.id] ?? suggestedSource(i)) === 'extra') ? `<input type="text" class="t20tk-xg-reason" name="retroReason" value="${escapeHtml(app.rtrReason ?? '')}" placeholder="Motivo dos ganhos extras (opcional), ex.: recompensa da campanha">` : ''}
      <footer class="t20tk-xg-foot"><span>${chosen} de ${loose.length} com origem escolhida.</span>
        <button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="rtrSources" ${chosen && can ? '' : 'disabled'}>Registrar origens</button></footer>`
    : '<p class="t20tk-xg-empty">Nenhum poder da ficha sem origem.</p>';
  const done = [...(app.actor?.items ?? [])].filter(i => flagsOf(i).source);
  const doneHtml = done.length ? `<section class="t20tk-wz-box"><header><b>Já com origem</b><small>${done.length} item(ns)</small></header>
    <ul class="t20tk-xg-list">${done.map(i => `<li class="t20tk-xg-item">${i.img ? `<img src="${escapeHtml(i.img)}" alt="">` : '<span class="t20tk-wz-noimg">✦</span>'}
      <span class="t20tk-xg-copy"><small>${escapeHtml(sourceText(flagsOf(i).source))}</small><b>${escapeHtml(i.name)}</b></span>
      ${can ? `<button type="button" class="t20tk-bz-link" data-action="rtrSourceUndo" data-item="${i.id}">desfazer</button>` : ''}</li>`).join('')}</ul></section>` : '';
  return `<div class="t20tk-lv-page">
    <h3 class="t20tk-lv-title">De onde veio cada coisa</h3>
    <p class="t20tk-bz-note">Poderes da ficha que não ocupam nenhuma vaga registrada. Diga de onde vieram; nada é criado nem apagado na ficha.</p>
    ${levels}
    <section class="t20tk-wz-box"><header><b>Sem origem</b><small>${loose.length} item(ns)</small></header>${todo}</section>
    ${doneHtml}
  </div>`;
}

/* ---------- ações (this = PlannerApp) ---------- */

export const RETRO_ACTIONS = {
  async rtrClass(event, target) {
    const level = this.selected;
    const value = target.dataset.value;
    this.browse = null;
    if (fold(this.ctxData.retro?.[level]?.cls ?? '') === fold(value)) return this.render();
    await draftUpdate(this, { [`${RETRO}.-=${level}`]: null });
    await draftUpdate(this, { [`${RETRO}.${level}`]: { cls: value, picks: {} } });
  },
  rtrBrowse(event, target) { this.browse = { kind: 'retro', gain: target.dataset.gain, level: this.selected }; this.render(); },
  async rtrPick(event, target) {
    const level = this.selected;
    const r = retroRow(this, level);
    this.browse = null;
    // O rascunho guarda a classe junto: no 1º nível ela pode vir só da classe inicial.
    await draftUpdate(this, { [`${RETRO}.${level}.cls`]: r.cls, [`${RETRO}.${level}.picks.${target.dataset.gain}`]: target.dataset.value });
  },
  async rtrUnpick(event, target) { await draftUpdate(this, { [`${RETRO}.${this.selected}.picks.-=${target.dataset.gain}`]: null }); },
  async rtrClear() { this.browse = null; await draftUpdate(this, { [`${RETRO}.-=${this.selected}`]: null }); },
  async rtrConfirm() {
    const actor = this.actor;
    if (!actor?.isOwner) return;
    await flushDraft(actor);
    const level = this.selected;
    const r = retroRow(this, level);
    const cls = this.ctxData.classes.find(x => x.key === fold(r.cls));
    if (!cls || r.missingBefore.length || this.ctxData.history[level]) return;
    const claimed = claimedIds(this, { exceptLevel: level });
    const { gains, vias } = slotsOf(this, r);
    const ids = new Set();
    const viaSet = [];
    const updates = [];
    for (const g of gains) {
      if (g.kind !== 'ability') continue;
      const a = abilityItem(this, g.item, claimed);
      if (a.item && !a.already) ids.add(a.item.id);
    }
    if (level === 1) {
      const raceItem = [...actor.items].find(i => i.type === 'race' && !claimed.has(i.id));
      if (raceItem) ids.add(raceItem.id);
    }
    const slots = {};
    for (const g of [...gains, ...vias]) {
      const id = r.picks[g.id];
      const item = id ? actor.items.get(id) : null;
      if (!item) continue;
      slots[g.id] = id;
      ids.add(id);
      if (g.def) { updates.push({ _id: id, [`flags.${MODULE_ID}.via`]: viaFlag(g.def, item.system ?? {}) }); viaSet.push(id); }
    }
    for (const id of ids) {
      const u = updates.find(x => x._id === id);
      if (u) u[`flags.${MODULE_ID}.plannerLevel`] = level;
      else updates.push({ _id: id, [`flags.${MODULE_ID}.plannerLevel`]: level });
    }
    try {
      if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
      await actor.update({
        [`flags.${MODULE_ID}.history.${level}`]: { cls: cls.name, classLevel: r.classLevel, classId: cls.id, classCreated: false, created: [...ids], trained: [], slots, viaSet, retro: true },
        [`${RETRO}.-=${level}`]: null
      });
      await postCard(actor, { tool: 'planner', tone: 'success', title: `${level}º nível registrado`, subtitle: `${actor.name} · ${cls.name} ${r.classLevel}`,
        itemsTitle: 'Registrado neste nível', items: [...ids].map(id => actor.items.get(id)).filter(Boolean).map(d => ({ name: d.name, img: d.img })) });
      const next = unrecordedLevels(this.ctxData).find(lv => lv > level);
      this.selected = next ?? level;
      this.render();
    } catch (error) {
      console.error('[T20 Toolkit] Registro retroativo:', error);
      ui.notifications.error(`Não foi possível registrar o nível: ${error.message}`);
    }
  },
  async rtrUndo(event, target) {
    const actor = this.actor;
    const level = Number(target.dataset.level);
    const h = this.ctxData.history[level];
    if (!actor?.isOwner || !canRedo(this.ctxData, level)) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Refazer registro do ${level}º nível` },
      content: `<p>Apagar o registro do ${level}º nível? Os itens continuam na ficha; só deixam de estar ligados a este nível.</p>`,
      rejectClose: false
    });
    if (!ok) return;
    const viaSet = new Set(h.viaSet ?? []);
    const updates = (h.created ?? []).filter(id => actor.items.get(id)).map(id => ({
      _id: id, [`flags.${MODULE_ID}.-=plannerLevel`]: null, ...(viaSet.has(id) ? { [`flags.${MODULE_ID}.-=via`]: null } : {})
    }));
    if (updates.length) await actor.updateEmbeddedDocuments('Item', updates);
    // Volta como rascunho, para corrigir só o que estava errado.
    await actor.update({ [`flags.${MODULE_ID}.history.-=${level}`]: null, [`${RETRO}.${level}`]: { cls: h.cls, picks: h.slots ?? {} } });
    this.selected = level;
    this.render();
  },
  rtrPage() { this.page = 'retro'; this.browse = null; this.render(); },
  rtrSource(event, target) {
    const { item, value } = target.dataset;
    const pick = this.rtrSrc ??= {};
    const cur = pick[item] ?? suggestedSource(this.actor.items.get(item) ?? {});
    pick[item] = cur === value ? '' : value;
    this.render();
  },
  async rtrSources() {
    const actor = this.actor;
    if (!actor?.isOwner) return;
    const pick = this.rtrSrc ?? {};
    const reason = this.element?.querySelector?.('input[name="retroReason"]')?.value ?? this.rtrReason ?? '';
    const level = this.ctxData.current;
    const updates = [];
    const extras = [];
    for (const item of looseItems(this)) {
      const v = pick[item.id] ?? suggestedSource(item);
      if (!v) continue;
      const via = v.startsWith('via:') ? v.slice(4) : null;
      const def = via ? CROSS_CLASS_SOURCES[via] : null;
      const u = { _id: item.id, [`flags.${MODULE_ID}.source`]: via ? { kind: 'via', via } : { kind: v } };
      if (def) u[`flags.${MODULE_ID}.via`] = viaFlag(def, item.system ?? {});
      if (v === 'extra') {
        u[`flags.${MODULE_ID}.extraGain`] = true;
        const type = EXTRA_TYPE[item.system?.tipo] ?? 'geral';
        extras.push({ type, itemId: item.id, label: item.name, img: item.img, kindLabel: TIPO_LABEL[item.system?.tipo] ?? 'Poder', reason, level, by: game.user?.name ?? '', retro: true });
      }
      updates.push(u);
    }
    if (!updates.length) return;
    try {
      await actor.updateEmbeddedDocuments('Item', updates);
      if (extras.length) await actor.update({ [`flags.${MODULE_ID}.extraGains`]: [...(actor.getFlag(MODULE_ID, 'extraGains') ?? []), ...extras] });
      this.rtrSrc = {};
      this.render();
    } catch (error) {
      console.error('[T20 Toolkit] Registro retroativo:', error);
      ui.notifications.error(`Não foi possível registrar as origens: ${error.message}`);
    }
  },
  async rtrSourceUndo(event, target) {
    const actor = this.actor;
    const item = actor?.items?.get(target.dataset.item);
    if (!actor?.isOwner || !item) return;
    const s = flagsOf(item).source ?? {};
    const u = { _id: item.id, [`flags.${MODULE_ID}.-=source`]: null };
    if (s.via) u[`flags.${MODULE_ID}.-=via`] = null;
    if (s.kind === 'extra') u[`flags.${MODULE_ID}.-=extraGain`] = null;
    await actor.updateEmbeddedDocuments('Item', [u]);
    if (s.kind === 'extra') await actor.update({ [`flags.${MODULE_ID}.extraGains`]: (actor.getFlag(MODULE_ID, 'extraGains') ?? []).filter(g => g.itemId !== item.id) });
    this.render();
  }
};

/** Caixas e campos das páginas do registro. */
export function bindRetro(app, root) {
  root.querySelector('[data-rtrfit]')?.addEventListener('change', ev => { app.rtrFit = ev.target.checked; app.render(); });
  root.querySelector('input[name="retroReason"]')?.addEventListener('change', ev => { app.rtrReason = ev.target.value; });
}
