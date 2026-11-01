/**
 * Criação do personagem em etapas (estilo do PF2e Leveler):
 * etapas à esquerda com ✔, filtros e "selecionado" no meio, lista com Selecionar à direita, Voltar/Próximo embaixo.
 * Os dados ficam em flags['t20-toolkit'].plan.creation (veja creation-view.js); o estado da tela fica em app.wizard.
 */
import { draftUpdate } from './plan-draft.js';
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, fold, SPELL_SCHOOLS, plainText } from '../core/t20.js';
import { ATTRS, ATTR_LABELS } from './creation-rules.js';
import { ORIGINS, findOriginPower, CUSTOM_ORIGIN, CUSTOM_ORIGIN_SOURCE, originOf, originName, customBenefitDone } from './origins.js';
import { ORIGIN_ITEMS } from './origin-items.js';
import { gainsAt, classSkills, classInfo, prerequisiteText, evaluatePower } from './planner-rules.js';
import { GENERAL_CATS, catOf } from './level-view.js';
import { devotionCheck, mustBeDevout, DEVOTEES, ALT_DEVOTIONS, altDevotionsFor, grantedPowerCount } from '../core/gods.js';
import { GRANTED_POWERS, POWER_ALIASES } from '../usurpador/usurpador-rules.js';
import { getTableRules, allowedAgeRules, remapRacial, racialModifiers } from '../core/table-rules.js';
import { powerGroupFilter, spellSlotFilter, siblingValues } from './race-choices.js';
import { toggleSkill } from './skill-plan.js';
import { getSpellIndex } from '../core/spell-index.js';
import { CASTER_CLASSES } from '../core/caster-rules.js';
import {
  readCreation, raceInfo, creationSkills, creationIssues, ageFor, finalAttributes, originSlots, originSlot, slotPaths,
  otherAttributes, fxUuids, loadAttrEffects, creationPrereqContext, customPicks, customItems, chipField,
  devotionContext, renderAttributes, renderAge, renderOriginItems, craftChips, pickButton,
  skillLabels, skillAbl, sign
} from './creation-view.js';

const FLAG = `flags.${MODULE_ID}.plan.creation`;
const set = (app, patch) => draftUpdate(app, Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${FLAG}.${k}`, v])));
const strip = html => plainText(html);

/* ---------- etapas ---------- */

function steps(app, cr, rules, info) {
  const slots = originSlots(cr, rules, info.noOrigin);
  return [
    { id: 'race', label: 'Raça' },
    info.choices.length || info.pools.length ? { id: 'raceChoices', label: 'Escolhas da raça' } : null,
    allowedAgeRules(rules).length ? { id: 'age', label: 'Idade' } : null,
    // Conceito antes dos números: raça, classe e origem primeiro; assim os Atributos já mostram
    // todos os bônus (raça, idade, origem) e quem distribui sabe o que a classe pede.
    { id: 'class', label: 'Classe' },
    { id: 'origin', label: slots.length > 1 ? 'Origens' : 'Origem', skip: !slots.length },
    { id: 'attributes', label: 'Atributos' },
    { id: 'skills', label: 'Perícias' },
    rules.complications ? { id: 'complication', label: 'Complicação' } : null,
    { id: 'god', label: 'Divindade' },
    { id: 'summary', label: 'Resumo' }
  ].filter(Boolean);
}

export function wizardState(app) {
  return (app.wizard ??= { step: 'race', q: {}, src: {}, view: {}, slot: 0, spells: null, f: {} });
}

/* ---------- componentes ---------- */

const card = ({ img, name, sub = '', tags = [], selected = false, value, kind, disabled = false, reason = '' }) => `
  <li class="t20tk-wz-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-off' : ''}">
    ${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : '<span class="t20tk-wz-noimg" aria-hidden="true"><i class="fa-solid fa-star" inert></i></span>'}
    <span class="t20tk-wz-copy"><b>${escapeHtml(name)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}
      ${tags.length ? `<span class="t20tk-wz-tags">${tags.map(t => `<i data-tone="${t.tone ?? ''}">${escapeHtml(t.text)}</i>`).join('')}</span>` : ''}</span>
    <button type="button" class="t20tk-ui-button ${selected ? 't20tk-ui-button--primary' : ''}" data-action="wzSelect" data-kind="${kind}" data-value="${escapeHtml(value)}" ${disabled ? `disabled title="${escapeHtml(reason)}"` : ''}>${selected ? 'Selecionado' : 'Selecionar'}</button>
  </li>`;

const selectedBar = (kind, item, extra = '', label = 'Selecionado') => item
  ? `<div class="t20tk-wz-selected">${item.img ? `<img src="${escapeHtml(item.img)}" alt="">` : '<span class="t20tk-wz-noimg"><i class="fa-solid fa-star" inert></i></span>'}<span><small>${escapeHtml(label)}</small><b>${escapeHtml(item.name)}</b>${extra}</span><button type="button" class="t20tk-wz-x" data-action="wzClear" data-kind="${kind}" aria-label="Limpar">✕</button></div>`
  : `<div class="t20tk-wz-selected is-empty"><span><small>${escapeHtml(label)}</small><b>Nada ainda</b></span></div>`;

function filterBox(app, kind, sources) {
  const w = wizardState(app);
  return `<label class="t20tk-wz-field"><span>Buscar</span><input type="search" name="wzq-${kind}" data-wzq="${kind}" value="${escapeHtml(w.q[kind] ?? '')}" placeholder="Nome…"></label>
    ${sources.length > 1 ? `<div class="t20tk-wz-field"><span>Fonte</span><div class="t20tk-wz-chips">${['', ...sources].map(s => `<button type="button" class="t20tk-chip ${(w.src[kind] ?? '') === s ? 'is-on' : ''}" data-action="wzSource" data-kind="${kind}" data-value="${escapeHtml(s)}">${escapeHtml(s || 'Todas')}</button>`).join('')}</div></div>` : ''}`;
}

/* filtros extras (estilo Leveler): grupos de chips com "Qualquer / Todos" */
const fstate = (app, kind) => (wizardState(app).f[kind] ??= {});
function multiFilter(app, kind, key, label, options, { modes = true } = {}) {
  const st = fstate(app, kind);
  const sel = new Set(st[key] ?? []);
  const mode = st[`${key}Mode`] ?? 'any';
  return `<div class="t20tk-wz-field"><span class="t20tk-wz-fhead">${escapeHtml(label)}${modes ? `<span class="t20tk-wz-seg">${[['any', 'Qualquer'], ['all', 'Todos']].map(([m, l]) => `<button type="button" data-action="wzFilterMode" data-kind="${kind}" data-key="${key}" data-value="${m}" aria-pressed="${mode === m}">${l}</button>`).join('')}</span>` : ''}</span>
    <div class="t20tk-wz-chips">${options.map(o => `<button type="button" class="t20tk-chip ${sel.has(o.value) ? 'is-on' : ''}" data-action="wzFilterToggle" data-kind="${kind}" data-key="${key}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')}</div></div>`;
}
function oneFilter(app, kind, key, label, options) {
  const cur = fstate(app, kind)[key] ?? '';
  return `<div class="t20tk-wz-field"><span>${escapeHtml(label)}</span><div class="t20tk-wz-chips">${[{ value: '', label: 'Todos' }, ...options].map(o => `<button type="button" class="t20tk-chip ${cur === o.value ? 'is-on' : ''}" data-action="wzFilterOne" data-kind="${kind}" data-key="${key}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')}</div></div>`;
}
/** Passa no filtro de chips? `has(v)` diz se o item tem o valor v. */
function multiOk(app, kind, key, has) {
  const st = fstate(app, kind);
  const sel = st[key] ?? [];
  if (!sel.length) return true;
  return (st[`${key}Mode`] ?? 'any') === 'all' ? sel.every(has) : sel.some(has);
}
const activeCount = (app, kind) => Object.entries(fstate(app, kind)).filter(([k, v]) => !k.endsWith('Mode') && (Array.isArray(v) ? v.length : v)).length;
const clearBtn = (app, kind) => activeCount(app, kind) || wizardState(app).q[kind] || wizardState(app).src[kind] ? `<button type="button" class="t20tk-bz-link t20tk-wz-clear" data-action="wzFilterClear" data-kind="${kind}">Limpar filtros</button>` : '';

const matches = (app, kind, name, source) => {
  const w = wizardState(app);
  const q = fold(w.q[kind] ?? '');
  return (!q || fold(name).includes(q)) && (!w.src[kind] || w.src[kind] === source);
};

const viewToggle = (app, kind, hasDetail, count) => {
  const v = wizardState(app).view[kind] ?? (hasDetail ? 'detail' : 'list');
  return `<header class="t20tk-wz-listhead"><span>${count}</span>${hasDetail ? `<div class="t20tk-wz-seg"><button type="button" data-action="wzView" data-kind="${kind}" data-value="list" aria-pressed="${v === 'list'}">Lista</button><button type="button" data-action="wzView" data-kind="${kind}" data-value="detail" aria-pressed="${v === 'detail'}">Detalhes</button></div>` : ''}</header>`;
};
const showDetail = (app, kind, hasDetail) => hasDetail && (wizardState(app).view[kind] ?? 'detail') === 'detail';

const chips = (action, items, current, extra = '') => `<div class="t20tk-wz-chips">${items.map(i => `<button type="button" class="t20tk-chip ${String(current ?? '') === String(i.value) ? 'is-on' : ''}" data-action="${action}" data-value="${escapeHtml(i.value)}" ${extra}${i.attrs ?? ''} ${i.disabled ? 'disabled' : ''}>${escapeHtml(i.label)}</button>`).join('')}</div>`;

/* ---------- etapas: Raça ---------- */

function stepRace(app, cr, rules, info) {
  const idx = app.index;
  const sources = [...new Set(idx.races.map(r => r.packLabel))];
  const ATTR_OPTS = ATTRS.map(a => ({ value: a, label: a.toUpperCase() }));
  const rows = idx.races.filter(r => matches(app, 'race', r.name, r.packLabel)
    && multiOk(app, 'race', 'plus', a => Number(r.atributos?.[a]) > 0 || r.dynamic.includes(a))
    && multiOk(app, 'race', 'minus', a => Number(r.atributos?.[a]) < 0));
  const race = info.race;
  const modText = r => ATTRS.filter(a => Number(r.atributos?.[a])).map(a => `${a.toUpperCase()} ${sign(Number(r.atributos[a]))}`).join(' · ') || (r.dynamic.length ? 'atributos à escolha' : '');
  const list = `<ul class="t20tk-wz-list">${rows.map(r => card({ img: r.img, name: r.name, sub: modText(r), tags: [{ text: r.packLabel }], selected: r.uuid === cr.race, value: r.uuid, kind: 'race' })).join('') || '<li class="t20tk-bz-empty">Nenhuma raça com esse filtro.</li>'}</ul>`;
  let detail = '';
  if (race) {
    const mods = racialModifiers(race.atributos);
    let modsHtml = `<p class="t20tk-wz-mods">${ATTRS.map(a => `<span><small>${a.toUpperCase()}</small><b>${sign(Number(race.atributos?.[a]) || 0) || '0'}</b></span>`).join('')}</p>`;
    if (rules.openRaces && mods.length) {
      const map = cr.raceMap ?? {};
      const check = remapRacial(race.atributos, map);
      modsHtml += `<p class="t20tk-bz-note"><b>Raças Abertas:</b> mova cada modificador para qualquer atributo, sem repetir.</p>
        ${mods.map((m, i) => `<div class="t20tk-wz-row"><span>Modificador ${sign(m.value)}</span>${chips('wzRaceMap', ATTRS.map(a => ({ value: a, label: a.toUpperCase() })), map[i] || m.attr, `data-index="${i}"`)}</div>`).join('')}
        ${check.ok ? '' : `<p class="t20tk-bz-warn">${escapeHtml(check.error)}</p>`}`;
    }
    if (race.dynamic.length) modsHtml += `<p class="t20tk-bz-note">Atributos à escolha (${escapeHtml(race.dynamicText || race.dynamic.join(', '))}): o sistema pergunta ao criar a ficha.</p>`;
    const abil = info.abilities.map(p => `<li><b>${escapeHtml(p.name)}</b><small>${escapeHtml(strip(p.description).slice(0, 220))}${strip(p.description).length > 220 ? '…' : ''}</small></li>`).join('');
    detail = `<div class="t20tk-wz-detail"><h4>${escapeHtml(race.name)}</h4>${modsHtml}
      <p class="t20tk-eyebrow">Habilidades raciais</p><ul class="t20tk-wz-abil">${abil || '<li><small>Sem habilidades cadastradas no compêndio.</small></li>'}</ul>
      ${info.choices.length || info.pools.length ? '<p class="t20tk-bz-note">Esta raça tem escolhas: veja a etapa <b>Escolhas da raça</b>.</p>' : ''}</div>`;
  }
  const hasDetail = !!race;
  return split(`${selectedBar('race', race)}${filterBox(app, 'race', sources)}${multiFilter(app, 'race', 'plus', 'Atributos com bônus', ATTR_OPTS)}${multiFilter(app, 'race', 'minus', 'Atributos com penalidade', ATTR_OPTS)}${clearBtn(app, 'race')}`,
    `${viewToggle(app, 'race', hasDetail, `${rows.length} raças`)}${showDetail(app, 'race', hasDetail) ? detail : list}`);
}

const split = (left, right) => `<div class="t20tk-wz-split"><aside class="t20tk-wz-filters">${left}</aside><div class="t20tk-wz-results">${right}</div></div>`;

/* ---------- etapa: Escolhas da raça ---------- */

async function ensureSpells(app) {
  const w = wizardState(app);
  if (w.spells) return w.spells;
  w.spells = (await getSpellIndex()).spells;
  return w.spells;
}

function stepRaceChoices(app, cr, rules, info) {
  const idx = app.index;
  const w = wizardState(app);
  const labels = skillLabels();
  const picks = cr.raceChoices ?? {};
  const spells = w.spells ?? [];
  const blocks = info.choices.map(c => {
    const rows = c.slots.map((slot, i) => {
      const p = picks[c.key]?.[i] ?? {};
      const base = `data-ability="${c.key}" data-slot="${i}"`;
      const path = `raceChoices.${c.key}.${i}.value`;
      const powerSel = group => pickButton({ path, pool: group, title: `${c.name}: escolher poder`, item: idx.powerByUuid.get(p.value) });
      const used = siblingValues(c, picks, i);   // "duas perícias" = duas diferentes
      const opt = (value, label) => ({ value, label, disabled: used.has(value) && p.value !== value });
      const skillChips = list => chips('wzChoice', list.filter(([k]) => !slot.abl || slot.abl.includes(skillAbl(k))).map(([k, l]) => opt(k, l)), p.value, base);
      const mode = (a, b) => `<div class="t20tk-wz-seg">${[['skill', a], ['power', b]].map(([m, l]) => `<button type="button" data-action="wzChoiceMode" ${base} data-value="${m}" aria-pressed="${(p.mode ?? 'skill') === m}">${l}</button>`).join('')}</div>`;
      switch (slot.kind) {
        case 'skill': return `<div class="t20tk-wz-row"><span>Perícia ${i + 1}</span><small class="t20tk-bz-meta">escolha na etapa Perícias (vaga "Raça")</small></div>`;
        case 'skillFrom': {
          const opts = slot.from.flatMap(n => { const k = Object.entries(labels).filter(([key, l]) => fold(l).startsWith(fold(n))); return k.map(([key, l]) => ({ value: key, label: l })); });
          return `<div class="t20tk-wz-row"><span>Perícia</span>${chips('wzChoice', opts.map(o => opt(o.value, o.label)), p.value, base)}</div>`;
        }
        case 'skillOrPower': return `<div class="t20tk-wz-row"><span>Vaga ${i + 1}</span>${mode('Perícia', 'Poder geral')}${(p.mode ?? 'skill') === 'power' ? powerSel(slot.power) : '<small class="t20tk-bz-meta">perícia na etapa Perícias</small>'}</div>`;
        case 'bonusOrPower': return `<div class="t20tk-wz-row"><span>Vaga ${i + 1}</span>${mode('+2 em perícia', 'Poder da Tormenta')}${(p.mode ?? 'skill') === 'power' ? powerSel(slot.power) : skillChips(Object.entries(labels))}</div>`;
        case 'power': return `<div class="t20tk-wz-row"><span>Poder</span>${powerSel(slot.power)}</div>`;
        case 'spell': {
          const chosen = spells.find(x => x.uuid === p.value);
          return `<div class="t20tk-wz-row"><span>Magia${slot.school ? ` (${SPELL_SCHOOLS[slot.school]})` : ''}</span>${pickButton({ path, pool: 'spell', title: `${c.name}: ${slot.names ? 'magia da lista' : 'magia de 1º círculo'}`, item: chosen, type: slot.type ?? '', school: slot.school ?? '', names: slot.names ?? [], asNote: !!slot.asNote })}</div>`;
        }
        case 'attr': return `<div class="t20tk-wz-row"><span>+1 em atributo</span><small class="t20tk-bz-meta">escolha na etapa <b>Atributos</b> (entra direto no total)</small></div>`;
        case 'attrDyn': return `<div class="t20tk-wz-row"><span>+1 em atributo</span><small class="t20tk-bz-meta">já faz parte dos atributos à escolha da raça (etapa Atributos)</small></div>`;
        case 'note': {
          if (slot.options) return `<div class="t20tk-wz-row"><span>${escapeHtml(slot.label)}</span>${chips('wzChoice', slot.options.map(o => opt(o, o)), p.value, base)}</div>`;
          const opts = Object.entries(labels).filter(([, l]) => !slot.crafts || /^of[íi]cio/i.test(fold(l)));
          return `<div class="t20tk-wz-row"><span>${escapeHtml(slot.label)}</span>${skillChips(opts)}</div>`;
        }
        default: return '';
      }
    }).join('');
    return `<section class="t20tk-wz-box"><header><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.text)}</small></header>${rows}</section>`;
  }).join('');
  const pools = info.pools.map(pool => {
    const chosen = new Set(cr.racePool?.[pool.id] ?? []);
    const full = chosen.size >= pool.count;
    return `<section class="t20tk-wz-box"><header><b>${escapeHtml(pool.label)}</b><small>Escolha ${pool.min === pool.count ? pool.count : `até ${pool.count}`} (${chosen.size}/${pool.count}).${pool.note ? ` ${escapeHtml(pool.note)}` : ''}</small></header>
      <ul class="t20tk-wz-tiles">${pool.options.map(o => `<li><button type="button" class="t20tk-wz-tile ${chosen.has(o.uuid) ? 'is-on' : ''}" data-action="wzPool" data-pool="${pool.id}" data-value="${o.uuid}" ${full && !chosen.has(o.uuid) ? 'disabled' : ''} title="${escapeHtml(strip(o.description).slice(0, 300))}"><b>${escapeHtml(o.name)}</b><small>${escapeHtml(strip(o.description).slice(0, 110))}…</small></button></li>`).join('')}</ul></section>`;
  }).join('');
  return `<div class="t20tk-wz-page">${pools}${blocks}${info.problems.length ? `<p class="t20tk-bz-warn">Falta: ${info.problems.map(escapeHtml).join('; ')}</p>` : ''}</div>`;
}

/** Etiqueta de pré-requisitos de um poder na criação: { tag, blocked } (blocked = não cumpre). */
function prereqTag(p, pctx) {
  const ev = evaluatePower(p, pctx);
  if (ev.status === 'missing') return { tag: { text: `✘ Não cumpre: ${ev.parts.filter(x => x.ok === false).map(x => x.text).join(', ')}`, tone: 'warn' }, blocked: true };
  if (ev.status === 'review') return { tag: { text: '? Conferir pré-requisitos' }, blocked: false };
  if (ev.status === 'ok') return { tag: { text: '✔ Cumpre', tone: 'ok' }, blocked: false };
  return { tag: null, blocked: false };
}

/* ---------- etapa: Origem ---------- */

function stepOrigin(app, cr, rules, info) {
  const idx = app.index;
  const w = wizardState(app);
  const slots = originSlots(cr, rules, info.noOrigin);
  if (!slots.length) return `<div class="t20tk-wz-page"><p class="t20tk-bz-note"><b>Sem origem.</b> ${info.noOrigin ? 'Golem: Propósito de Criação (recebe um poder geral no lugar da origem).' : 'Pela idade, o personagem não tem benefícios de origem.'}</p></div>`;
  const k = slots.includes(w.slot) ? w.slot : 0;
  const S = originSlot(cr, k);
  const P = slotPaths(k);
  const taken = new Set(slots.filter(j => j !== k).map(j => originSlot(cr, j).origin).filter(o => o && o !== CUSTOM_ORIGIN));
  const sources = [...new Set(ORIGINS.map(o => o.source))];
  const originSkills = o => o.fixed ? o.fixed.skills : o.skills;
  const allSkills = [...new Set(ORIGINS.flatMap(originSkills))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const atlasOnly = w.src.origin === 'Atlas de Arton';
  const regions = [...new Set(ORIGINS.flatMap(o => (o.region ?? '').split(/,\s*/)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const rows = ORIGINS.filter(o => (matches(app, 'origin', o.name, o.source) || (o.region && matches(app, 'origin', o.region, o.source)))
    && multiOk(app, 'origin', 'region', v => (o.region ?? '').split(/,\s*/).includes(v))
    && multiOk(app, 'origin', 'skills', v => originSkills(o).includes(v))
    && (!fstate(app, 'origin').kind || (fstate(app, 'origin').kind === 'fixed' ? !!o.fixed : fstate(app, 'origin').kind === 'items' ? (ORIGIN_ITEMS[o.name] ?? []).length > 0 : !o.fixed)));
  const origin = originOf(S);
  const slotTabs = slots.length > 1 ? `<div class="t20tk-wz-field"><span>Origem</span>${chips('wzSlot', slots.map(j => ({ value: j, label: `${j + 1}ª${originSlot(cr, j).origin ? ` · ${originName(originSlot(cr, j))}` : ''}` })), k)}</div>` : '';
  const benefits = o => o.fixed ? `${o.fixed.power}${o.fixed.skills.length ? ` · ${o.fixed.skills.join(', ')}` : ''}` : [...o.skills, ...o.powers].join(', ');
  // Sua Própria Origem (JdA p. 95): primeiro cartão da lista, se a mesa permite.
  const own = rules.customOrigins && !w.src.origin ? card({ name: 'Criar origem', sub: 'Monte a sua: nome, dois benefícios (perícias, poderes ou um poder único) e itens, combinando com o mestre.', tags: [{ text: CUSTOM_ORIGIN_SOURCE, tone: 'accent' }], selected: S.origin === CUSTOM_ORIGIN, value: CUSTOM_ORIGIN, kind: `origin:${k}` }) : '';
  const list = `<ul class="t20tk-wz-list">${own}${rows.map(o => card({ name: o.name, sub: benefits(o), tags: [{ text: o.source }, ...(o.region ? [{ text: o.region, tone: 'info' }] : [])], selected: o.name === S.origin, value: o.name, kind: `origin:${k}`, disabled: taken.has(o.name), reason: 'Já escolhida em outra vaga' })).join('')}</ul>`;
  let detail = '';
  if (origin) {
    const labels = skillLabels();
    const age = ageFor(cr, rules);
    if (origin.custom) detail = customOriginDetail(app, cr, rules, info, k, S, P);
    else if (origin.fixed) {
      const needsCraft = origin.fixed.skills.some(n => /^of[íi]cio$/i.test(n.trim()));
      const pw = idx.powers.find(x => x.tipo === 'origem' && x.key === fold(origin.fixed.power));
      detail = `<p class="t20tk-bz-note">${origin.region ? `Origem regional (${escapeHtml(origin.region)}) do ${escapeHtml(origin.source)}` : `Origem especial de ${escapeHtml(origin.source)}`}: benefício fixo.</p>
        ${origin.note ? `<p class="t20tk-bz-warn">${escapeHtml(origin.note)}</p>` : ''}
        <ul class="t20tk-wz-abil"><li><b>${escapeHtml(origin.fixed.power)}</b><small>${pw ? escapeHtml(strip(pw.description).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1')) : origin.text ? `${escapeHtml(origin.text)} (o Toolkit cria o poder na ficha: não está no Suplementos de Arton)` : 'poder de origem — não está nos compêndios ativos'}</small></li>${origin.fixed.skills.length ? `<li><b>Treinado em</b><small>${origin.fixed.skills.map(escapeHtml).join(', ')}</small></li>` : ''}</ul>
        ${needsCraft ? `<div class="t20tk-wz-row"><span>Qual Ofício</span>${craftChips(P.craft, S.craft, labels)}</div>` : ''}`;
    } else {
      const need = Math.min(2, age.originBenefits ?? 2);
      const picks = new Set(S.picks);
      const full = picks.size >= need;
      const pctx = creationPrereqContext(idx, cr, rules, info);
      const tile = (value, label, sub = '', blocked = false) => `<li><button type="button" class="t20tk-wz-tile ${picks.has(value) ? 'is-on' : ''}" data-action="wzOriginPick" data-slot="${k}" data-value="${escapeHtml(value)}" ${(full || blocked) && !picks.has(value) ? 'disabled' : ''}><b>${escapeHtml(label)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</button></li>`;
      const skillTiles = origin.skills.map(s => tile(`skill:${s}`, s, 'perícia')).join('');
      const powerTiles = origin.powers.map(p => {
        if (/^um poder/i.test(p)) return tile(`generic:${p}`, p, 'poder à escolha');
        const found = findOriginPower(idx.powers, p);
        const ev = found ? evaluatePower(found, pctx) : null;
        const miss = ev?.parts.filter(x => x.ok === false).map(x => x.text) ?? [];
        if (found) return tile(`power:${found.uuid}`, p, miss.length ? `poder · não cumpre: ${miss.join(', ')}` : ev.status === 'review' ? `poder · conferir: ${ev.parts.filter(x => x.ok === null).map(x => x.text).join(', ')}` : 'poder', miss.length > 0);
        return `<li><span class="t20tk-wz-tile is-off"><b>${escapeHtml(p)}</b><small>não está no compêndio</small></span></li>`;
      }).join('');
      const craftNeeded = [...picks].some(x => /^skill:of[íi]cio$/i.test(x.trim()));
      const generic = [...picks].find(x => x.startsWith('generic:'));
      const genericSel = generic
        ? `<div class="t20tk-wz-row"><span>${escapeHtml(generic.slice(8))}</span>${pickButton({ path: P.choice, pool: /tormenta/i.test(generic) ? 'tormenta' : 'combate', title: `${origin.name}: ${generic.slice(8)}`, item: idx.powerByUuid.get(S.choice) })}</div>`
        : '';
      detail = `${origin.special ? `<p class="t20tk-bz-warn">${escapeHtml(origin.special)}</p>` : ''}
        <p class="t20tk-bz-note">Escolha <b>${need}</b> benefício${need > 1 ? 's' : ''} (${picks.size}/${need}).</p>
        <ul class="t20tk-wz-tiles">${skillTiles}${powerTiles}</ul>
        ${craftNeeded ? `<div class="t20tk-wz-row"><span>Qual Ofício</span>${craftChips(P.craft, S.craft, labels)}</div>` : ''}${genericSel}`;
    }
    detail = `<div class="t20tk-wz-detail"><h4>${escapeHtml(origin.name)}</h4>${detail}${!origin.custom && (ORIGIN_ITEMS[origin.name] ?? []).length ? renderOriginItems(idx, origin.name, S, P) : ''}</div>`;
  }
  const hasDetail = !!origin;
  return split(`${slotTabs}${selectedBar(`origin:${k}`, origin ? { name: origin.name } : null, origin ? `<small>${escapeHtml(origin.source)}</small>` : '')}${filterBox(app, 'origin', sources)}
      ${oneFilter(app, 'origin', 'kind', 'Benefícios', [{ value: 'choose', label: 'Escolher 2' }, { value: 'fixed', label: 'Fixos' }, { value: 'items', label: 'Com itens' }])}
      ${multiFilter(app, 'origin', 'skills', 'Perícias', allSkills.map(v => ({ value: v, label: v })))}
      ${atlasOnly || (fstate(app, 'origin').region ?? []).length ? multiFilter(app, 'origin', 'region', 'Região', regions.map(v => ({ value: v, label: v })), { modes: false }) : '<p class="t20tk-bz-meta">Escolha a fonte "Atlas de Arton" para filtrar por região.</p>'}${clearBtn(app, 'origin')}`,
    `${viewToggle(app, 'origin', hasDetail, `${rows.length} origens`)}${showDetail(app, 'origin', hasDetail) ? detail : list}`);
}

/** Detalhe da origem própria (JdA p. 95): nome, história, benefícios e itens. */
function customOriginDetail(app, cr, rules, info, k, S, P) {
  const idx = app.index;
  const c = S.custom ?? {};
  const labels = skillLabels();
  const bs = customPicks(cr, S, rules);
  const pctx = creationPrereqContext(idx, cr, rules, info);
  const text = (field, value, placeholder, area = false) => area
    ? `<textarea class="t20tk-wz-text" data-wzinput="${escapeHtml(field)}" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value ?? '')}</textarea>`
    : `<input type="text" class="t20tk-wz-text" data-wzinput="${escapeHtml(field)}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(placeholder)}">`;
  const KINDS = [{ value: 'skill', label: 'Perícia' }, { value: 'power', label: 'Poder' }, { value: 'unique', label: 'Poder único' }];
  const benefit = (b, i) => {
    const path = `${P.custom}.b.${i}`;
    const other = bs[1 - i] ?? {};
    const kinds = `<div class="t20tk-wz-chips">${KINDS.map(o => `<button type="button" class="t20tk-chip ${b.kind === o.value ? 'is-on' : ''}" data-action="wzCustomKind" data-path="${escapeHtml(path)}" data-value="${o.value}">${o.label}</button>`).join('')}</div>`;
    let body = '';
    if (b.kind === 'skill') {
      const opts = Object.entries(labels).sort((x, y) => x[1].localeCompare(y[1], 'pt-BR'))
        .map(([key, label]) => ({ value: key, label, disabled: other.kind === 'skill' && other.value === key, reason: 'Já é o outro benefício' }));
      body = chipField(`${path}.value`, opts, b.value);
    } else if (b.kind === 'power') {
      const item = idx.powerByUuid.get(b.value);
      const ev = item ? evaluatePower(item, pctx) : null;
      const miss = ev?.parts.filter(x => x.ok === false).map(x => x.text) ?? [];
      body = `${pickButton({ path: `${path}.value`, pool: 'origemPropria', title: `${c.name?.trim() || 'Origem própria'}: poder`, item })}${miss.length ? `<p class="t20tk-bz-warn">Não cumpre: ${escapeHtml(miss.join(', '))}. Você recebe o poder, mas ainda precisa cumprir os pré-requisitos (JdA p. 85).</p>` : ''}`;
    } else if (b.kind === 'unique') {
      body = `${text(`${path}.name`, b.name, 'Nome do poder')}${text(`${path}.text`, b.text, 'O que ele faz. Use os poderes de origem do livro como referência de força.', true)}`;
    }
    return `<div class="t20tk-wz-row"><span>${i + 1}º benefício${customBenefitDone(b) ? ' ✔' : ''}</span><div class="t20tk-wz-stack">${kinds}${body}</div></div>`;
  };
  const items = customItems(S);
  const itemKeys = Object.keys(c.items ?? {}).map(Number);
  const next = itemKeys.length ? Math.max(...itemKeys) + 1 : 0;
  const itemChips = Object.entries(c.items ?? {}).filter(([, u]) => u).map(([n, u]) => {
    const g = (idx.gear ?? []).find(x => x.uuid === u);
    return `<button type="button" class="t20tk-chip is-on" data-action="wzSet" data-field="${escapeHtml(`${P.custom}.items.${n}`)}" data-value="${escapeHtml(u)}" title="Tirar">${escapeHtml(g?.name ?? 'item')} ✕</button>`;
  }).join('');
  return `<p class="t20tk-bz-warn">Origem própria: combine tudo com o mestre antes de aplicar. "Só não vale apelar!" (JdA p. 95)</p>
    <div class="t20tk-wz-row"><span>Nome</span>${text(`${P.custom}.name`, c.name, 'ex.: Alienista de Salistick')}</div>
    <div class="t20tk-wz-row"><span>História</span>${text(`${P.custom}.story`, c.story, 'O que você fazia antes de ser aventureiro (opcional).', true)}</div>
    <p class="t20tk-bz-note">Escolha <b>${bs.length}</b> benefício${bs.length > 1 ? 's' : ''}: perícias, poderes (gerais ou de origem) ou um poder único inventado (${bs.filter(customBenefitDone).length}/${bs.length}).</p>
    ${bs.map(benefit).join('')}
    <div class="t20tk-wz-row"><span>Itens</span><div class="t20tk-wz-stack"><div class="t20tk-wz-chips">${itemChips}${items.length ? '' : '<span class="t20tk-bz-meta">nenhum item do compêndio</span>'}</div>
      ${pickButton({ path: `${P.custom}.items.${next}`, pool: 'gear', title: `${c.name?.trim() || 'Origem própria'}: item inicial` })}
      ${text(`${P.custom}.itemsNote`, c.itemsNote, 'Outros itens combinados com o mestre (vão anotados no chat).')}</div></div>`;
}

/* ---------- etapa: Classe ---------- */

function stepClass(app, cr, rules) {
  const idx = app.index;
  const sources = [...new Set(idx.classes.map(c => c.packLabel))];
  const casterOf = c => CASTER_CLASSES[c.key]?.tradition ?? CASTER_CLASSES[fold(classInfo(c.name)?.variantOf ?? '')]?.tradition ?? '';
  const fc = fstate(app, 'class');
  const rows = idx.classes.filter(c => matches(app, 'class', c.name, c.packLabel)
    && (!fc.caster || (fc.caster === 'none' ? !casterOf(c) : casterOf(c) === fc.caster))
    && (!fc.variant || (fc.variant === 'variant' ? !!classInfo(c.name)?.variantOf : !classInfo(c.name)?.variantOf))
    && (!fc.pv || String(c.pv) === fc.pv));
  const cls = idx.classes.find(c => c.uuid === cr.cls);
  const list = `<ul class="t20tk-wz-list">${rows.map(c => {
    const info = classInfo(c.name);
    const tags = [{ text: c.packLabel }, ...(info?.variantOf ? [{ text: `variante de ${info.variantOf}`, tone: 'accent' }] : []), ...(!gainsAt(c.name, 1).modeled ? [{ text: 'progressão manual', tone: 'warn' }] : [])];
    return card({ img: c.img, name: c.name, sub: `PV ${c.pv ?? '?'} · PM ${c.pm ?? '?'} por nível`, tags, selected: c.uuid === cr.cls, value: c.uuid, kind: 'class' });
  }).join('')}</ul>`;
  let detail = '';
  if (cls) {
    const g1 = gainsAt(cls.name, 1);
    const cs = classSkills(cls.name, cls.skills);
    const path = g1.gains.find(x => x.kind === 'path');
    const pathHtml = path ? `<p class="t20tk-eyebrow">${escapeHtml(path.label)}</p><ul class="t20tk-wz-tiles">${path.options.map(n => idx.powers.find(p => p.name === n)).filter(Boolean).map(p => `<li><button type="button" class="t20tk-wz-tile ${cr.path === p.uuid ? 'is-on' : ''}" data-action="wzField" data-field="path" data-value="${p.uuid}"><b>${escapeHtml(p.name.replace(/^Caminho do Arcanista:\s*/i, ''))}</b><small>${escapeHtml(strip(p.description).slice(0, 120))}…</small></button></li>`).join('')}</ul>` : '';
    const abil = g1.gains.filter(x => x.kind === 'ability').map(x => {
      const ref = idx.powers.find(p => p.tipo === 'ability' && p.key === fold(x.item));
      return `<li><b>${escapeHtml(x.item)}</b><small>${escapeHtml(strip(ref?.description).slice(0, 200))}${ref ? '…' : 'não está no compêndio'}</small></li>`;
    }).join('');
    detail = `<div class="t20tk-wz-detail"><h4>${escapeHtml(cls.name)}</h4>
      <p class="t20tk-wz-mods"><span><small>PV</small><b>${cls.pv ?? '?'}</b></span><span><small>PM</small><b>${cls.pm ?? '?'}</b></span></p>
      <p class="t20tk-bz-note"><b>Perícias:</b> ${escapeHtml(cs.inatas ?? '')}</p>
      ${pathHtml}
      <p class="t20tk-eyebrow">Habilidades de 1º nível</p><ul class="t20tk-wz-abil">${abil || '<li><small>—</small></li>'}</ul>
      ${g1.modeled ? '' : '<p class="t20tk-bz-warn">Classe sem progressão no Planejador: adicione as habilidades de 1º nível pela ficha.</p>'}</div>`;
  }
  const hasDetail = !!cls;
  const pvs = [...new Set(idx.classes.map(c => c.pv).filter(Boolean))].sort((a, b) => a - b).map(v => ({ value: String(v), label: `${v} PV/nível` }));
  return split(`${selectedBar('class', cls)}${filterBox(app, 'class', sources)}
      ${oneFilter(app, 'class', 'caster', 'Magias', [{ value: 'arc', label: 'Arcanas' }, { value: 'div', label: 'Divinas' }, { value: 'none', label: 'Sem magias' }])}
      ${oneFilter(app, 'class', 'variant', 'Tipo', [{ value: 'base', label: 'Classe base' }, { value: 'variant', label: 'Variante' }])}
      ${oneFilter(app, 'class', 'pv', 'Vida', pvs)}${clearBtn(app, 'class')}`,
    `${viewToggle(app, 'class', hasDetail, `${rows.length} classes`)}${showDetail(app, 'class', hasDetail) ? detail : list}`);
}

/* ---------- etapa: Perícias ---------- */

function stepSkills(app, cr, rules, info) {
  const idx = app.index;
  if (!cr.cls) return '<div class="t20tk-wz-page"><p class="t20tk-bz-note">Escolha a classe primeiro.</p></div>';
  const labels = skillLabels();
  const sk = creationSkills(idx, cr, rules, info, labels);
  const p = sk.plan;
  const oneOf = (sk.spec?.oneOf ?? []).map((pair, i) => `<div class="t20tk-wz-row"><span>Escolha uma</span>${chips('wzOneOf', pair.map(n => ({ value: n, label: n })), cr.classOneOf?.[i], `data-index="${i}"`)}</div>`).join('');
  const craft = sk.genericCraft ? `<div class="t20tk-wz-row"><span>Ofício da classe</span>${chips('wzField', Object.entries(labels).filter(([, l]) => /^of[íi]cio/i.test(fold(l))).map(([k, l]) => ({ value: k, label: l.replace(/^Of[íi]cio:\s*/i, '') })), cr.classCraft, 'data-field="classCraft"')}</div>` : '';
  const TAG = { class: 'Classe', race: 'Raça', int: 'Int' };
  const tile = t => {
    const state = t.lockedBy ? 'locked' : t.pickedBy ? 'on' : t.available ? '' : 'off';
    const tag = t.lockedBy ?? (t.pickedBy ? TAG[t.pickedBy] : '');
    const attr = SKILL_ATTR[fold(t.label).replace(/^oficio.*$/, 'oficio')];
    return `<li><button type="button" class="t20tk-wz-skill" data-state="${state}" data-action="wzSkill" data-value="${t.key}" ${t.lockedBy || (!t.pickedBy && !t.available) ? 'disabled' : ''}><b>${escapeHtml(t.label.replace(/^Of[íi]cio:\s*/i, ''))}</b><span>${attr ? `<small>${attr}</small>` : ''}${tag ? `<i>${escapeHtml(tag)}</i>` : ''}</span></button></li>`;
  };
  const isCraft = t => /^of[íi]cio/i.test(fold(t.label));
  const locked = p.tiles.filter(t => t.lockedBy);
  const free = p.tiles.filter(t => !t.lockedBy);
  const classTiles = free.filter(t => t.classOption && !isCraft(t));
  const otherTiles = free.filter(t => !t.classOption && !isCraft(t));
  const craftTiles = free.filter(isCraft);
  const slot = (kind, label, hint) => {
    const want = p.want[kind];
    if (!want) return '';
    const got = p.picks[kind];
    const name = k => p.tiles.find(t => t.key === k)?.label ?? k;
    return `<div class="t20tk-sk-slot ${got.length >= want ? 'is-done' : ''}"><header><b>${label}</b><span>${got.length}/${want}</span></header><small>${hint}</small>
      <div class="t20tk-sk-picked">${got.map(k => `<button type="button" class="t20tk-chip is-on" data-action="wzSkill" data-value="${k}" title="Tirar">${escapeHtml(name(k))} ✕</button>`).join('')}${Array.from({ length: Math.max(0, want - got.length) }, () => '<span class="t20tk-sk-empty">vaga livre</span>').join('')}</div></div>`;
  };
  const section = (title, hint, list) => list.length ? `<section class="t20tk-sk-group"><header><b>${title}</b><small>${hint}</small></header><ul class="t20tk-wz-skills">${list.map(tile).join('')}</ul></section>` : '';
  return `<div class="t20tk-wz-page t20tk-sk">${oneOf}${craft}
    <div class="t20tk-sk-slots">${slot('class', 'Vagas da classe', 'só perícias da lista da classe')}${slot('race', 'Vagas da raça', 'qualquer perícia')}${slot('int', 'Inteligência', 'qualquer perícia')}</div>
    <p class="t20tk-bz-note">Clique numa perícia para treinar; clique de novo (ou no ✕ acima) para tirar. A vaga é preenchida na ordem classe → raça → Inteligência.</p>
    ${locked.length ? `<section class="t20tk-sk-group"><header><b>Já treinadas</b><small>vêm da classe, da origem ou da raça</small></header><ul class="t20tk-sk-locked">${locked.map(t => `<li><b>${escapeHtml(t.label)}</b><i>${escapeHtml(t.lockedBy)}</i></li>`).join('')}</ul></section>` : ''}
    ${section('Perícias da classe', 'contam para as vagas da classe', classTiles)}
    ${section('Outras perícias', p.want.race || p.want.int ? 'só pelas vagas da raça ou de Inteligência' : 'sem vagas livres para elas', otherTiles)}
    ${craftTiles.length ? `<details class="t20tk-sk-group t20tk-sk-craft" data-key="sk-craft" ${craftTiles.some(t => t.pickedBy) ? 'open' : ''}><summary><b>Ofícios</b><small>${craftTiles.length} ofícios${craftTiles.some(t => t.classOption) ? ' · contam como da classe' : ''}</small></summary><ul class="t20tk-wz-skills">${craftTiles.map(tile).join('')}</ul></details>` : ''}
    ${sk.customs.length ? `<p class="t20tk-bz-note">Perícias novas (Ofício fora da lista do sistema): ${sk.customs.map(escapeHtml).join(', ')}.</p>` : ''}</div>`;
}

/** Atributo-chave de cada perícia (Tormenta20 JdA, cap. 2). */
const SKILL_ATTR = Object.freeze({ acrobacia: 'DES', adestramento: 'CAR', atletismo: 'FOR', atuacao: 'CAR', cavalgar: 'DES', conhecimento: 'INT', cura: 'SAB', diplomacia: 'CAR', enganacao: 'CAR', fortitude: 'CON', furtividade: 'DES', guerra: 'INT', iniciativa: 'DES', intimidacao: 'CAR', intuicao: 'SAB', investigacao: 'INT', jogatina: 'CAR', ladinagem: 'DES', luta: 'FOR', misticismo: 'INT', nobreza: 'INT', oficio: 'INT', percepcao: 'SAB', pilotagem: 'DES', pontaria: 'DES', reflexos: 'DES', religiao: 'SAB', sobrevivencia: 'SAB', vontade: 'SAB' });

/* ---------- etapa: Complicação (Heróis de Arton, p. 282) ---------- */

/** Dois buscadores na mesma etapa: a complicação (geral ou da classe) e o poder geral extra que ela dá. */
function stepComplication(app, cr) {
  const idx = app.index;
  const w = wizardState(app);
  const cls = idx.classes.find(c => c.uuid === cr.cls);
  const clsKey = fold(cls?.name ?? '');
  const comp = idx.powerByUuid.get(cr.complication);
  const power = idx.powerByUuid.get(cr.complicationPower);
  const tab = comp && w.compTab === 'power' ? 'power' : 'comp';
  const text = p => strip(p.description).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1');
  const found = (kind, p) => { const q = fold(w.q[kind] ?? ''); return !q || p.key.includes(q) || fold(text(p)).includes(q); };
  const tabs = `<div class="t20tk-wz-field"><span>Escolher</span><div class="t20tk-wz-seg">
    <button type="button" data-action="wzCompTab" data-value="comp" aria-pressed="${tab === 'comp'}">Complicação</button>
    <button type="button" data-action="wzCompTab" data-value="power" aria-pressed="${tab === 'power'}" ${comp ? '' : 'disabled title="Escolha a complicação primeiro"'}>Poder geral extra</button></div></div>`;
  const note = '<p class="t20tk-bz-note">Opcional (Heróis de Arton, p. 282): uma complicação geral ou da sua classe; em troca, um poder geral extra (cumprindo os pré-requisitos).</p>';
  const bars = `${selectedBar('complication', comp, comp ? `<small>${comp.subtipo ? `de ${escapeHtml(cls?.name ?? comp.subtipo)}` : 'geral'}</small>` : '', 'Complicação')}${comp ? selectedBar('complicationPower', power, power ? `<small>${escapeHtml(GENERAL_CATS.find(([k]) => k === catOf(power))?.[1] ?? '')}</small>` : '', 'Poder geral extra') : ''}`;
  const searchBox = kind => `<label class="t20tk-wz-field"><span>Buscar</span><input type="search" name="wzq-${kind}" data-wzq="${kind}" value="${escapeHtml(w.q[kind] ?? '')}" placeholder="Nome ou texto…"></label>`;
  const snippet = p => { const t = text(p); return t.length > 140 ? `${t.slice(0, 140)}…` : t; };
  const detailOf = (p, extra = '') => {
    const pre = prerequisiteText(p.description);
    return `<div class="t20tk-wz-detail"><h4>${escapeHtml(p.name)}</h4>${pre ? `<p class="t20tk-bz-note"><b>Pré-requisitos:</b> ${escapeHtml(pre)}</p>` : ''}<p class="t20tk-bz-note">${escapeHtml(text(p))}</p>${extra}</div>`;
  };
  if (tab === 'comp') {
    const fc = fstate(app, 'comp');
    const pool = idx.powers.filter(p => p.tipo === 'complicacao' && (!p.subtipo || (clsKey && p.subtipo === clsKey)));
    const rows = pool.filter(p => found('comp', p) && (!fc.group || (fc.group === 'class' ? !!p.subtipo : !p.subtipo)));
    const list = `<ul class="t20tk-wz-list">${rows.map(p => card({ img: p.img, name: p.name, sub: snippet(p), tags: [{ text: p.subtipo ? `De ${cls?.name ?? p.subtipo}` : 'Geral', tone: p.subtipo ? 'accent' : '' }, { text: p.packLabel }], selected: p.uuid === cr.complication, value: p.uuid, kind: 'complication' })).join('') || '<li class="t20tk-bz-empty">Nenhuma complicação com esse filtro.</li>'}</ul>`;
    const classNote = comp?.subtipo ? '<p class="t20tk-bz-note">Complicação de classe: o poder só vale enquanto pelo menos metade dos seus níveis forem nessa classe.</p>' : '';
    const detail = comp ? detailOf(comp, `${classNote}<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="wzCompTab" data-value="power">${power ? 'Trocar o poder geral extra →' : 'Escolher o poder geral extra →'}</button>`) : '';
    const groups = [{ value: 'general', label: 'Gerais' }, ...(cls ? [{ value: 'class', label: `De ${cls.name}` }] : [])];
    return split(`${note}${tabs}${bars}${searchBox('comp')}${oneFilter(app, 'comp', 'group', 'Grupo', groups)}${cls ? '' : '<p class="t20tk-bz-meta">Escolha a classe para ver também as complicações dela.</p>'}${clearBtn(app, 'comp')}`,
      `${viewToggle(app, 'comp', !!comp, `${rows.length} complicações`)}${showDetail(app, 'comp', !!comp) ? detail : list}`);
  }
  const fp = fstate(app, 'compPower');
  const rows = idx.powers.filter(p => p.tipo === 'geral' && found('compPower', p) && (!fp.cat || catOf(p) === fp.cat));
  const pctx = creationPrereqContext(idx, cr);
  const list = `<ul class="t20tk-wz-list">${rows.map(p => {
    const pre = prerequisiteText(p.description);
    const pr = prereqTag(p, pctx);
    const selected = p.uuid === cr.complicationPower;
    return card({ img: p.img, name: p.name, sub: pre ? `Pré-requisitos: ${pre}` : snippet(p), tags: [pr.tag, { text: GENERAL_CATS.find(([k]) => k === catOf(p))?.[1] ?? '' }, { text: p.packLabel }].filter(t => t?.text), selected, value: p.uuid, kind: 'complicationPower', disabled: pr.blocked && !selected, reason: 'Não cumpre os pré-requisitos (HA p. 282)' });
  }).join('') || '<li class="t20tk-bz-empty">Nenhum poder com esse filtro.</li>'}</ul>`;
  const detail = power ? detailOf(power) : '';
  return split(`${note}${tabs}${bars}${searchBox('compPower')}${oneFilter(app, 'compPower', 'cat', 'Categoria', GENERAL_CATS.map(([value, label]) => ({ value, label })))}${clearBtn(app, 'compPower')}`,
    `${viewToggle(app, 'compPower', !!power, `${rows.length} poderes gerais`)}${showDetail(app, 'compPower', !!power) ? detail : list}`);
}

/* ---------- etapa: Divindade ---------- */

function stepGod(app, cr, rules) {
  const idx = app.index;
  const dv = devotionContext(app, cr);
  const required = mustBeDevout(dv.classes);
  if (dv.classes.some(c => fold(c.name) === 'usurpador')) return '<div class="t20tk-wz-page"><p class="t20tk-bz-note"><b>Inimigo dos Deuses:</b> o usurpador não pode ter devoção. Use o Usurpador para capturar poderes concedidos.</p></div>';
  const fg = fstate(app, 'god');
  const gods = [...altDevotionsFor(dv.classes), ...Object.keys(GRANTED_POWERS)].filter(g => matches(app, 'god', g, '')
    && (!fg.only || devotionCheck({ god: g, race: dv.race, classes: dv.classes, rules }).level !== 'block'));
  const list = `<ul class="t20tk-wz-list">${gods.map(g => {
    const r = devotionCheck({ god: g, race: dv.race, classes: dv.classes, rules });
    const d = DEVOTEES[g];
    const alt = ALT_DEVOTIONS[g];
    const sub = alt ? `${alt.label}: sem deus` : d?.any ? 'Qualquer devoto' : d ? [...(d.races ?? []), ...(d.classes ?? [])].join(', ') : '';
    const tags = r.level === 'block' ? [{ text: 'não pode', tone: 'warn' }] : r.level === 'warn' ? [{ text: 'confira', tone: 'accent' }] : [];
    return card({ name: alt ? alt.label : g, sub, tags, selected: cr.god === g, value: g, kind: 'god', disabled: r.level === 'block', reason: r.reason });
  }).join('')}</ul>`;
  let detail = '';
  if (cr.god) {
    const r = devotionCheck({ god: cr.god, race: dv.race, classes: dv.classes, rules });
    const opts = (GRANTED_POWERS[cr.god] ?? []).map(n => idx.powers.find(p => p.key === fold(POWER_ALIASES[n] ?? n))).filter(Boolean);
    const want = grantedPowerCount(cr.god, dv.classes);
    const picked = [cr.godPower, cr.godPower2].filter(Boolean);
    const powersHtml = want ? `<p class="t20tk-eyebrow">${want > 1 ? `Poderes concedidos (escolha ${want})` : 'Poder concedido'}</p><ul class="t20tk-wz-tiles">${opts.map(p => `<li><button type="button" class="t20tk-wz-tile ${picked.includes(p.uuid) ? 'is-on' : ''}" data-action="wzGodPower" data-value="${p.uuid}"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(strip(p.description).slice(0, 120))}…</small></button></li>`).join('')}</ul>
      <p class="t20tk-bz-note">Ao se tornar devoto você segue as Obrigações & Restrições do deus.${want > 1 ? ' Como devoto de classe, você recebe dois poderes concedidos em vez de um.' : ''}</p>` : '';
    detail = `<div class="t20tk-wz-detail"><h4>${escapeHtml(ALT_DEVOTIONS[cr.god]?.label ?? cr.god)}</h4>${r.reason ? `<p class="${r.level === 'ok' ? 't20tk-bz-note' : 't20tk-bz-warn'}">${escapeHtml(r.reason)}</p>` : ''}
      ${powersHtml}</div>`;
  }
  const DEV = { both: 'Devoções Abertas: qualquer raça e classe.', race: 'Devoções Abertas: qualquer raça (vale a classe).', class: 'Devoções Abertas: qualquer classe (vale a raça).' };
  const hasDetail = !!cr.god;
  return split(`${selectedBar('god', cr.god ? { name: cr.god } : null)}${filterBox(app, 'god', [])}${oneFilter(app, 'god', 'only', 'Mostrar', [{ value: 'ok', label: 'Só os que posso seguir' }])}
      <p class="t20tk-bz-note">${required ? `<b>${escapeHtml(required)}</b> precisa ser devoto.` : 'Devoção é opcional.'} ${DEV[rules.openDevotions] ?? ''}</p>`,
    `${viewToggle(app, 'god', hasDetail, `${gods.length} divindades`)}${showDetail(app, 'god', hasDetail) ? detail : list}`);
}

/* ---------- etapa: Resumo ---------- */

function stepSummary(app, cr, rules, info, issues) {
  const idx = app.index;
  const w = wizardState(app);
  const labels = skillLabels();
  const cls = idx.classes.find(c => c.uuid === cr.cls);
  const finals = finalAttributes(cr, info.race, rules, info.attrBonus, otherAttributes(idx, cr, rules, info).total);
  const sk = cls ? creationSkills(idx, cr, rules, info, labels) : null;
  const skills = sk ? [...sk.plan.tiles.filter(t => t.lockedBy || t.pickedBy).map(t => t.label)] : [];
  const slots = originSlots(cr, rules, info.noOrigin);
  const age = ageFor(cr, rules);
  const pw = u => idx.powerByUuid.get(u)?.name;
  const fromChoices = info.choices.flatMap(c => c.slots.map((slot, i) => { const v = cr.raceChoices?.[c.key]?.[i] ?? {}; const isP = slot.kind === 'power' || (['skillOrPower', 'bonusOrPower'].includes(slot.kind) && v.mode === 'power'); return isP ? pw(v.value) : slot.kind === 'spell' ? (w.spells ?? []).find(x => x.uuid === v.value)?.name : null; })).filter(Boolean);
  const powers = [pw(cr.path), ...info.poolChosen.map(p => p.name), ...fromChoices, cr.godPower && pw(cr.godPower), cr.godPower2 && pw(cr.godPower2), cr.complication && pw(cr.complication), cr.complicationPower && pw(cr.complicationPower)].filter(Boolean);
  const row = (k, v) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd></div>`;
  return `<div class="t20tk-wz-page"><dl class="t20tk-wz-summary">
    ${row('Raça', info.race?.name)}${row('Atributos', ATTRS.map(a => `${a.toUpperCase()} ${sign(finals[a]) || '0'}`).join(' · '))}
    ${age.label ? row('Idade', age.label) : ''}
    ${row(slots.length > 1 ? 'Origens' : 'Origem', slots.map(k => originName(originSlot(cr, k))).filter(Boolean).join(' / ') || (slots.length ? '' : 'sem origem'))}
    ${row('Classe', cls?.name)}${row('Perícias', skills.join(', '))}${row('Poderes', powers.join(', '))}${row('Divindade', ALT_DEVOTIONS[cr.god]?.label ?? cr.god)}
  </dl>
  ${issues.length ? `<div class="t20tk-wz-issues"><b>Ainda falta</b><ul>${issues.map(i => `<li><button type="button" class="t20tk-bz-link" data-action="wzStep" data-step="${i.step}">${escapeHtml(i.text)}</button></li>`).join('')}</ul></div>` : '<p class="t20tk-bz-note">Tudo pronto. Se a raça tiver atributos à escolha, o sistema pergunta ao criar.</p>'}</div>`;
}

/* ---------- buscador de uma vaga (poder ou magia), no lugar dos menus suspensos ---------- */

const SPELL_TYPES = { arc: 'Arcana', div: 'Divina', uni: 'Universal' };
const POWER_KINDS = { geral: 'Poder geral', origem: 'Poder de origem', classe: 'Poder de classe' };
const valueAt = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

function renderPicker(app, cr) {
  const w = wizardState(app);
  const pk = w.pick;
  const idx = app.index;
  const f = fstate(app, 'pick');
  const q = fold(w.q.pick ?? '');
  const current = valueAt(cr, pk.path);
  const text = p => strip(p.description).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, '$1');
  let filters = '', list, count;
  if (pk.pool === 'gear') {
    const GEAR_TYPES = { arma: 'Arma', equipamento: 'Equipamento', consumivel: 'Consumível', tesouro: 'Tesouro' };
    const all = idx.gear ?? [];
    const rows = all.filter(g => (!q || g.key.includes(q)) && (!f.type || g.type === f.type));
    filters = oneFilter(app, 'pick', 'type', 'Tipo', Object.entries(GEAR_TYPES).map(([value, label]) => ({ value, label })));
    count = `${rows.length} itens`;
    list = rows.slice(0, 300).map(g => card({ img: g.img, name: g.name, sub: GEAR_TYPES[g.type] ?? '', tags: [{ text: g.packLabel }], selected: current === g.uuid, value: g.uuid, kind: 'pick' })).join('');
  } else if (pk.pool === 'spell') {
    const all = (w.spells ?? []).filter(spellSlotFilter({ type: pk.type || undefined, school: pk.school || undefined, names: pk.names ? pk.names.split('|') : null }));
    const rows = all.filter(s => (!q || s.key.includes(q)) && (!f.type || s.type === f.type) && (!f.school || s.school === f.school));
    const types = [...new Set(all.map(s => s.type))].filter(t => SPELL_TYPES[t]);
    const schools = [...new Set(all.map(s => s.school))].filter(Boolean).sort();
    filters = `${types.length > 1 ? oneFilter(app, 'pick', 'type', 'Tipo', types.map(t => ({ value: t, label: SPELL_TYPES[t] }))) : ''}${schools.length > 1 ? oneFilter(app, 'pick', 'school', 'Escola', schools.map(v => ({ value: v, label: SPELL_SCHOOLS[v] ?? v }))) : ''}`;
    count = `${rows.length} magias`;
    list = rows.map(s => card({ img: s.img, name: s.name, sub: [SPELL_TYPES[s.type], SPELL_SCHOOLS[s.school], s.range, s.cost ? `${s.cost} PM` : ''].filter(Boolean).join(' · '), tags: [{ text: s.packLabel }], selected: current === s.uuid, value: s.uuid, kind: 'pick' })).join('');
  } else {
    const all = idx.powers.filter(powerGroupFilter(pk.pool));
    const rows = all.filter(p => (!q || p.key.includes(q) || fold(text(p)).includes(q))
      && (!f.kind || p.tipo === f.kind) && (!f.cat || p.tipo !== 'geral' || catOf(p) === f.cat) && (!f.cls || p.subtipo === f.cls));
    const kinds = [...new Set(all.map(p => p.tipo))];
    const hasGeneral = all.some(p => p.tipo === 'geral') && !['combate', 'tormenta'].includes(pk.pool);
    const classes = pk.pool === 'classe' ? [...new Set(all.map(p => p.subtipo).filter(Boolean))].sort() : [];
    const clsLabel = k => idx.classes.find(c => c.key === k)?.name ?? (k === 'geral' ? 'Qualquer classe' : k);
    filters = `${kinds.length > 1 ? oneFilter(app, 'pick', 'kind', 'Grupo', kinds.map(k => ({ value: k, label: POWER_KINDS[k] ?? k }))) : ''}${hasGeneral ? oneFilter(app, 'pick', 'cat', 'Categoria', GENERAL_CATS.map(([value, label]) => ({ value, label }))) : ''}${classes.length ? oneFilter(app, 'pick', 'cls', 'Classe', classes.map(k => ({ value: k, label: clsLabel(k) }))) : ''}`;
    count = `${rows.length} poderes`;
    const pctx = creationPrereqContext(idx, cr);
    // Poder geral à escolha de uma origem ("um poder de combate", "um poder da Tormenta"): precisa cumprir os pré-requisitos (JdA p. 85).
    const strict = ['combate', 'tormenta', 'origemPropria'].includes(pk.pool);
    list = rows.map(p => {
      const pre = prerequisiteText(p.description);
      const t = text(p);
      const tag = p.tipo === 'classe' ? clsLabel(p.subtipo) : p.tipo === 'geral' ? GENERAL_CATS.find(([k]) => k === catOf(p))?.[1] : POWER_KINDS[p.tipo];
      const pr = pre || p.tipo === 'geral' ? prereqTag(p, pctx) : { tag: null, blocked: false };
      return card({ img: p.img, name: p.name, sub: pre ? `Pré-requisitos: ${pre}` : (t.length > 140 ? `${t.slice(0, 140)}…` : t), tags: [pr.tag, { text: tag ?? '' }, { text: p.packLabel }].filter(x => x?.text), selected: current === p.uuid, value: p.uuid, kind: 'pick', disabled: strict && pr.blocked && current !== p.uuid, reason: 'Não cumpre os pré-requisitos' });
    }).join('');
  }
  const search = `<label class="t20tk-wz-field"><span>Buscar</span><input type="search" name="wzq-pick" data-wzq="pick" value="${escapeHtml(w.q.pick ?? '')}" placeholder="Nome ou texto…"></label>`;
  return `<div class="t20tk-wz-picker"><header class="t20tk-lv-bhead"><button type="button" class="t20tk-ui-button" data-action="wzPickBack">← Voltar</button><h3>${escapeHtml(pk.title)}</h3>${current ? '<button type="button" class="t20tk-bz-link" data-action="wzPickClear">Tirar a escolha</button>' : ''}</header>
    ${split(`${search}${filters}${clearBtn(app, 'pick')}`, `<header class="t20tk-wz-listhead"><span>${count}</span></header><ul class="t20tk-wz-list">${list || '<li class="t20tk-bz-empty">Nada com esse filtro.</li>'}</ul>`)}</div>`;
}

/* ---------- moldura do assistente ---------- */

export function renderWizard(app) {
  const rules = getTableRules();
  const cr = readCreation(app.actor);
  const info = raceInfo(app.index, cr);
  const w = wizardState(app);
  const list = steps(app, cr, rules, info);
  if (!list.some(s => s.id === w.step)) w.step = 'race';
  const issues = creationIssues(app, cr);
  // Etapas opcionais (idade, complicação, divindade) só ficam ✔ depois de visitadas ou preenchidas.
  const OPTIONAL = { age: () => cr.ageRule || cr.age, complication: () => cr.complication, god: () => cr.god };
  const doneOf = id => !issues.some(i => i.step === id) && (!OPTIONAL[id] || !!cr.seen?.[id] || !!OPTIONAL[id]());
  const age = ageFor(cr, rules);
  const i = list.findIndex(s => s.id === w.step);
  const nav = list.map((s, n) => {
    const done = s.id !== 'summary' && doneOf(s.id);
    return `<li><button type="button" data-action="wzStep" data-step="${s.id}" aria-current="${s.id === w.step ? 'step' : 'false'}" data-done="${done}"><span class="t20tk-wz-dot">${done ? '✔' : n + 1}</span>${escapeHtml(s.label)}</button></li>`;
  }).join('');
  const titles = { race: 'Raça', raceChoices: 'Escolhas da raça', age: 'Idade', attributes: 'Atributos', origin: 'Origem', class: 'Classe', skills: 'Perícias', complication: 'Complicação', god: 'Divindade', summary: 'Resumo' };
  if (w.pick && w.pick.step !== w.step) w.pick = null;
  const bodyOf = {
    race: () => stepRace(app, cr, rules, info),
    raceChoices: () => stepRaceChoices(app, cr, rules, info),
    age: () => `<div class="t20tk-wz-page">${renderAge(cr, rules, app.index, age).replace(/name="adultPower"/, 'name="adultPower" data-wzcheck="adultPower"')}</div>`,
    attributes: () => `<div class="t20tk-wz-page">${renderAttributes(cr, rules, info.race, age, info.attrBonus, { info, other: otherAttributes(app.index, cr, rules, info) }).replace(/name="method"/g, 'name="method" data-wzmethod')}</div>`,
    origin: () => stepOrigin(app, cr, rules, info),
    class: () => stepClass(app, cr, rules),
    skills: () => stepSkills(app, cr, rules, info),
    complication: () => stepComplication(app, cr),
    god: () => stepGod(app, cr, rules),
    summary: () => stepSummary(app, cr, rules, info, issues)
  }[w.step];
  const body = w.pick?.step === w.step ? renderPicker(app, cr) : bodyOf();
  const prev = list[i - 1], next = list[i + 1];
  const stepIssues = issues.filter(x => x.step === w.step);
  return `<div class="t20tk-wz">
    <nav class="t20tk-wz-nav" aria-label="Etapas da criação"><p class="t20tk-wz-navtitle">Criação</p><ol>${nav}</ol><button type="button" class="t20tk-wz-navlink" data-action="pickLevel" data-level="2">Planejar níveis 2–20 →</button></nav>
    <section class="t20tk-wz-main">
      <header class="t20tk-wz-head"><h3>${titles[w.step]}</h3>${age.levels && w.step === 'summary' ? `<span class="t20tk-bz-warn">Começa com ${age.levels} nível(is) a mais: suba-os no Planejador depois.</span>` : ''}${stepIssues.length && w.step !== 'summary' ? `<span class="t20tk-wz-missing">Falta: ${stepIssues.map(x => escapeHtml(x.text)).join('; ')}</span>` : ''}</header>
      <div class="t20tk-wz-body">${body}</div>
      <footer class="t20tk-wz-foot">
        ${prev ? `<button type="button" class="t20tk-ui-button" data-action="wzStep" data-step="${prev.id}">← Voltar</button>` : '<span></span>'}
        ${next ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="wzStep" data-step="${next.id}">Próximo →</button>`
          : `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="applyCreation" ${app.actor.isOwner ? '' : 'disabled'}>${issues.length ? 'Criar mesmo assim' : 'Criar personagem'}</button>`}
      </footer>
    </section>
  </div>`;
}

/* ---------- ações (this = PlannerApp) ---------- */

async function patch(app, obj) { await set(app, obj); }

/** Carrega os efeitos de atributo dos poderes escolhidos (origem, raça…) e redesenha se algo mudou. */
async function refreshAttrEffects(app) {
  const cr = readCreation(app.actor);
  if (await loadAttrEffects(fxUuids(app.index, cr, getTableRules()))) app.render();
}

export const WIZARD_ACTIONS = {
  async wzAttrPick(event, target) {
    const { src, value } = target.dataset;
    const cr = readCreation(this.actor);
    if (src === 'dyn') {
      const info = raceInfo(this.index, cr);
      const cur = [...info.dyn.picks];
      const next = cur.includes(value) ? cur.filter(a => a !== value) : (cur.length < info.dyn.want ? [...cur, value] : cur);
      return patch(this, { 'raceDyn.picks': next });
    }
    if (src === 'slot') {
      const path = `raceChoices.${target.dataset.ability}.${target.dataset.slot}.value`;
      const cur = cr.raceChoices?.[target.dataset.ability]?.[Number(target.dataset.slot)]?.value;
      return patch(this, { [path]: cur === value ? '' : value });
    }
    if (src === 'origin') {
      const key = target.dataset.key;
      return patch(this, { [`originAttr.${key}`]: cr.originAttr?.[key] === value ? '' : value });
    }
  },
  async wzDynMode(event, target) { await patch(this, { 'raceDyn.mode': target.dataset.value, 'raceDyn.picks': [] }); },
  async wzVAssign(event, target) {
    const i = target.dataset.die;
    const cr = readCreation(this.actor);
    await patch(this, { [`vAssign.${i}`]: cr.vAssign?.[i] === target.dataset.value ? '' : target.dataset.value });
  },
  async wzStep(event, target) {
    const w = wizardState(this);
    const leaving = w.step;
    w.step = target.dataset.step;
    if (leaving && leaving !== w.step && !readCreation(this.actor).seen?.[leaving]) await draftUpdate(this, { [`${FLAG}.seen.${leaving}`]: true });
    if (w.step === 'raceChoices') await ensureSpells(this);
    this.render();
    if (['attributes', 'skills', 'summary'].includes(w.step)) refreshAttrEffects(this);
  },
  async wzSelect(event, target) {
    const { kind, value } = target.dataset;
    const w = wizardState(this);
    if (kind === 'pick') {
      const path = w.pick?.path;
      w.pick = null;
      if (path) await patch(this, { [path]: value });
      this.render();
      return refreshAttrEffects(this);
    }
    if (kind === 'race') await patch(this, { race: value, '-=raceMap': null, '-=raceChoices': null, '-=racePool': null });
    else if (kind === 'class') await patch(this, { cls: value, path: '', '-=classOneOf': null, classCraft: '', '-=skillPicks': null, complication: '', complicationPower: '' });
    else if (kind === 'god') await patch(this, { god: value, godPower: '', godPower2: '' });
    else if (kind === 'complication') {
      const changed = readCreation(this.actor).complication !== value;
      await patch(this, changed ? { complication: value, complicationPower: '' } : { complication: value });
      w.view.comp = 'detail';
      return this.render();
    } else if (kind === 'complicationPower') {
      await patch(this, { complicationPower: value });
      w.view.compPower = 'detail';
      return this.render();
    } else if (kind.startsWith('origin:')) {
      const P = slotPaths(Number(kind.split(':')[1]));
      await patch(this, { [P.origin]: value, [P.picks]: [], [P.items]: {}, [P.choice]: '' });
    }
    const v = kind.split(':')[0];
    w.view[v] = 'detail';
    this.render();
  },
  async wzClear(event, target) {
    const { kind } = target.dataset;
    if (kind === 'race') await patch(this, { race: '', '-=raceChoices': null, '-=racePool': null });
    else if (kind === 'class') await patch(this, { cls: '', path: '', '-=skillPicks': null });
    else if (kind === 'god') await patch(this, { god: '', godPower: '', godPower2: '' });
    else if (kind === 'complication') { await patch(this, { complication: '', complicationPower: '' }); wizardState(this).view.comp = 'list'; wizardState(this).compTab = 'comp'; return this.render(); }
    else if (kind === 'complicationPower') { await patch(this, { complicationPower: '' }); wizardState(this).view.compPower = 'list'; return this.render(); }
    else if (kind.startsWith('origin:')) { const P = slotPaths(Number(kind.split(':')[1])); await patch(this, { [P.origin]: '', [P.picks]: [] }); }
    wizardState(this).view[kind.split(':')[0]] = 'list';
    this.render();
  },
  wzView(event, target) { wizardState(this).view[target.dataset.kind] = target.dataset.value; this.render(); },
  wzSource(event, target) { wizardState(this).src[target.dataset.kind] = target.dataset.value; wizardState(this).view[target.dataset.kind] = 'list'; this.render(); },
  wzFilterToggle(event, target) {
    const { kind, key, value } = target.dataset;
    const st = fstate(this, kind);
    const set = new Set(st[key] ?? []);
    set.has(value) ? set.delete(value) : set.add(value);
    st[key] = [...set];
    wizardState(this).view[kind] = 'list';
    this.render();
  },
  wzFilterMode(event, target) { fstate(this, target.dataset.kind)[`${target.dataset.key}Mode`] = target.dataset.value; this.render(); },
  wzFilterOne(event, target) { fstate(this, target.dataset.kind)[target.dataset.key] = target.dataset.value; wizardState(this).view[target.dataset.kind] = 'list'; this.render(); },
  wzFilterClear(event, target) { const w = wizardState(this); const k = target.dataset.kind; w.f[k] = {}; w.q[k] = ''; w.src[k] = ''; this.render(); },
  wzCompTab(event, target) { wizardState(this).compTab = target.dataset.value; this.render(); },
  async wzPickOpen(event, target) {
    const w = wizardState(this);
    const { path, pool, title, type, school, names } = target.dataset;
    if (pool === 'spell') await ensureSpells(this);
    w.pick = { step: w.step, path, pool, title, type, school, names };
    w.f.pick = {};
    w.q.pick = '';
    this.render();
  },
  wzPickBack() { wizardState(this).pick = null; this.render(); },
  async wzPickClear() { const w = wizardState(this); const path = w.pick?.path; w.pick = null; if (path) await patch(this, { [path]: '' }); this.render(); },
  /** Chips que gravam um campo (no lugar dos menus suspensos). Clicar no escolhido limpa. */
  async wzSet(event, target) {
    const { field, value } = target.dataset;
    const cr = readCreation(this.actor);
    const cur = valueAt(cr, field);
    const v = target.dataset.num ? Number(value) : value;
    const same = String(cur ?? '') === String(value);
    const special = {
      ageRule: () => patch(this, { ageRule: value, age: 'jovem', ageComps: [], adultPower: false, agePower: '' }),
      age: () => patch(this, { age: value, ageComps: [], adultPower: false })
    };
    if (special[field]) return special[field]();
    await patch(this, { [field]: same ? '' : v });
  },
  async wzAgeComp(event, target) {
    const age = ageFor(readCreation(this.actor), getTableRules());
    const cur = (readCreation(this.actor).ageComps ?? []).filter(Boolean);
    const v = target.dataset.value;
    const next = cur.includes(v) ? cur.filter(x => x !== v) : (cur.length < age.complications ? [...cur, v] : cur);
    await patch(this, { ageComps: next });
  },
  /** Origem própria: tipo do benefício (perícia, poder ou poder único). Trocar o tipo limpa o valor. */
  async wzCustomKind(event, target) {
    const { path, value } = target.dataset;
    const cur = valueAt(readCreation(this.actor), path) ?? {};
    await patch(this, { [path]: cur.kind === value ? { kind: '' } : { kind: value, value: '', name: cur.name ?? '', text: cur.text ?? '' } });
  },
  wzSlot(event, target) { wizardState(this).slot = Number(target.dataset.value); this.render(); },
  /** Poder concedido: alterna; com dois (clérigo, druida, paladino) preenche a vaga livre. */
  async wzGodPower(event, target) {
    const cr = readCreation(this.actor);
    const v = target.dataset.value;
    const want = grantedPowerCount(cr.god, devotionContext(this, cr).classes);
    if (cr.godPower === v) return patch(this, { godPower: cr.godPower2 ?? '', godPower2: '' });
    if (cr.godPower2 === v) return patch(this, { godPower2: '' });
    if (!cr.godPower || want < 2) return patch(this, { godPower: v, godPower2: want < 2 ? '' : (cr.godPower2 ?? '') });
    return patch(this, { godPower2: v });
  },
  async wzField(event, target) {
    const { field, value } = target.dataset;
    const cur = readCreation(this.actor)[field];
    await patch(this, { [field]: cur === value ? '' : value });
  },
  async wzRaceMap(event, target) { await patch(this, { [`raceMap.${target.dataset.index}`]: target.dataset.value }); },
  async wzOneOf(event, target) { await patch(this, { [`classOneOf.${target.dataset.index}`]: target.dataset.value }); },
  async wzSkill(event, target) {
    const cr = readCreation(this.actor);
    const sk = creationSkills(this.index, cr, getTableRules(), raceInfo(this.index, cr));
    await patch(this, { skillPicks: toggleSkill(sk.plan, target.dataset.value) });
  },
  async wzOriginPick(event, target) {
    const k = Number(target.dataset.slot);
    const P = slotPaths(k);
    const cur = new Set(originSlot(readCreation(this.actor), k).picks);
    cur.has(target.dataset.value) ? cur.delete(target.dataset.value) : cur.add(target.dataset.value);
    await patch(this, { [P.picks]: [...cur] });
  },
  async wzPool(event, target) {
    const { pool, value } = target.dataset;
    const cur = new Set(readCreation(this.actor).racePool?.[pool] ?? []);
    cur.has(value) ? cur.delete(value) : cur.add(value);
    await patch(this, { [`racePool.${pool}`]: [...cur] });
  },
  async wzChoice(event, target) {
    const { ability, slot, value } = target.dataset;
    const cur = readCreation(this.actor).raceChoices?.[ability]?.[slot]?.value;
    await patch(this, { [`raceChoices.${ability}.${slot}.value`]: cur === value ? '' : value });
  },
  async wzChoiceMode(event, target) {
    const { ability, slot, value } = target.dataset;
    await patch(this, { [`raceChoices.${ability}.${slot}`]: { mode: value, value: '' } });
  }
};

/** Campos de formulário do assistente (chamado no _onRender). */
export function bindWizard(app, root) {
  let timer = null;
  root.querySelectorAll('[data-wzq]').forEach(input => input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { wizardState(app).q[input.dataset.wzq] = input.value; wizardState(app).view[input.dataset.wzq] = 'list'; app.render(); }, 150);
  }));
  root.querySelectorAll('input[data-wzmethod]').forEach(r => r.addEventListener('change', () => patch(app, { method: r.value, '-=assign': null })));
  // Textos da origem própria: grava ao sair do campo (change), não a cada tecla.
  root.querySelectorAll('[data-wzinput]').forEach(el => el.addEventListener('change', () => patch(app, { [el.dataset.wzinput]: el.value })));
  root.querySelectorAll('input[data-wzcheck]').forEach(cb => cb.addEventListener('change', () => patch(app, { [cb.dataset.wzcheck]: cb.checked })));
}
