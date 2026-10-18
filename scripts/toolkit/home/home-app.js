/**
 * Início = painel do personagem.
 * Mostra o personagem (PV, PM, classes, devoção), o que está pendente em cada ferramenta com um botão
 * que leva direto à solução, e as ferramentas que fazem sentido para ele. Sem personagem: escolha um dos seus.
 * Só lê a ficha; nada aqui altera dados.
 */
import { watchActor } from '../ui/live-refresh.js';
import { MODULE_ID, MODULE_VERSION } from '../../constants.js';
import { openReport } from '../beta.js';
import { escapeHtml, fold, actorClasses, actorSpells, arcanistPaths } from '../core/t20.js';
import { toolFrame, onNavigate, switchTheme, reopen } from '../ui/frame.js';
import { replaceKeepingPlace } from '../ui/render.js';
import { TOOLKIT_FEATURES } from '../features.js';
import { buildCasterProfiles, learningCapacity } from '../core/caster-rules.js';
import { buildTimeline, gainsAt } from '../planner/planner-rules.js';
import { getTableRules, retrainStatus } from '../core/table-rules.js';
import { engenhocaState, isEngenhoca } from '../engenhocas/engenhocas-rules.js';
import { dayKey } from '../grimorio/grimorio-rules.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const GLYPH = { leveler: '↗', buscador: '⌕', grimorio: '✦', escriba: '≡', usurpador: '◆', engenhocas: '⚙', regras: '⚖' };
const TOOL_OF = { leveler: 'planner' };

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const today = () => dayKey(globalThis.game?.time?.components, globalThis.game?.time?.worldTime);

/** Pendências e resumo do personagem (função pura sobre o ator). */
export function homeSummary(actor, { rules = getTableRules(), isGM = false, day = today() } = {}) {
  const classes = actorClasses(actor);
  const level = classes.reduce((s, c) => s + c.level, 0);
  const items = [...(actor?.items ?? [])];
  const todo = [];
  const info = [];
  const relevant = new Set(['leveler', 'buscador']);

  // Planejador
  const plan = actor?.getFlag?.(MODULE_ID, 'plan')?.levels ?? {};
  if (level === 0) todo.push({ tone: 'warn', tool: 'leveler', text: 'O personagem ainda não foi criado.', action: 'Criar personagem' });
  else if (level < 20) {
    const next = level + 1;
    const row = buildTimeline(classes.map(c => ({ name: c.name, level: c.level })), plan).find(r => r.level === next);
    if (!row?.cls) todo.push({ tone: 'info', tool: 'leveler', text: `${next}º nível ainda sem plano.`, action: 'Planejar' });
    else {
      const g = gainsAt(row.cls, row.classLevel);
      const missing = g.gains.filter(x => ['power', 'path'].includes(x.kind) && !plan[next]?.picks?.[x.id]);
      if (missing.length) todo.push({ tone: 'warn', tool: 'leveler', text: `${next}º nível (${row.cls} ${row.classLevel}): falta escolher ${missing.map(x => x.label).join(', ')}.`, action: 'Escolher' });
      else info.push({ tool: 'leveler', text: `${next}º nível planejado: ${row.cls} ${row.classLevel}. Pronto para aplicar quando subir.` });
    }
  }
  const rt = retrainStatus(rules, { level, usedAt: num(actor?.getFlag?.(MODULE_ID, 'retrain')?.usedAt), isGM });
  if (level > 0 && rt.allowed && rules.retrain === 'levelUp') info.push({ tool: 'leveler', text: 'Retreino disponível neste nível (uma troca).' });
  const extras = actor?.getFlag?.(MODULE_ID, 'extraGains') ?? [];
  if (extras.length) info.push({ tool: 'leveler', text: `${extras.length} ganho(s) fora da progressão registrado(s).` });

  // Magias
  const profiles = buildCasterProfiles({ classes, arcanistPaths: arcanistPaths(actor) });
  const known = actorSpells(actor);
  const casters = profiles.filter(p => p.maxCircle > 0 && p.id !== 'usurpador');
  if (casters.length) {
    const cap = learningCapacity(casters, known);
    if (cap.remaining > 0) todo.push({ tone: 'warn', tool: 'buscador', text: `Pode aprender ${cap.remaining} magia(s) nova(s) (até ${Math.max(...casters.map(p => p.maxCircle))}º círculo).`, action: 'Escolher magias' });
    else info.push({ tool: 'buscador', text: `${cap.current} magia(s) conhecida(s)${cap.extra ? ` + ${cap.extra} copiada(s)` : ''}.` });
  }

  // Grimório (Mago)
  if (arcanistPaths(actor).includes('mago')) {
    relevant.add('grimorio'); relevant.add('escriba');
    const g = actor?.getFlag?.(MODULE_ID, 'grimorio') ?? {};
    const prepared = known.filter(s => s.prepared).length;
    if (g.lastStudyDay !== day) todo.push({ tone: 'info', tool: 'grimorio', text: `Ainda não estudou hoje (${prepared} magia(s) memorizada(s) de ontem).`, action: 'Estudar' });
    else info.push({ tool: 'grimorio', text: `Estudou hoje: ${prepared} magia(s) memorizada(s).` });
  }
  if (items.some(i => i.type === 'poder' && fold(i.name) === 'escriba arcano')) relevant.add('escriba');

  // Usurpador
  const usurp = profiles.find(p => p.id === 'usurpador');
  if (usurp) {
    relevant.add('usurpador');
    const cap = actor?.getFlag?.(MODULE_ID, 'usurpador')?.capture;
    if (usurp.level >= 4) {
      if (cap?.day === day && cap.power) info.push({ tool: 'usurpador', text: `Poder Capturado hoje: ${cap.power} (${cap.god}).` });
      else todo.push({ tone: 'info', tool: 'usurpador', text: 'Nenhum poder capturado hoje.', action: 'Capturar' });
    }
  }

  // Engenhocas
  const engs = items.filter(i => { try { return isEngenhoca(i); } catch { return false; } });
  const inventor = classes.some(c => c.key === 'inventor');
  if (engs.length || inventor) {
    relevant.add('engenhocas');
    const jammed = engs.filter(i => { try { return engenhocaState(i).jammed; } catch { return false; } });
    if (jammed.length) todo.push({ tone: 'warn', tool: 'engenhocas', text: `${jammed.length} engenhoca(s) enguiçada(s): ${jammed.map(i => i.name).join(', ')}.`, action: 'Consertar' });
    else if (engs.length) info.push({ tool: 'engenhocas', text: `${engs.length} engenhoca(s) prontas.` });
    else todo.push({ tone: 'info', tool: 'engenhocas', text: 'Inventor sem engenhocas ainda.', action: 'Fabricar' });
  }

  const sys = actor?.system ?? {};
  return {
    level, classes, todo, info, relevant,
    race: items.find(i => i.type === 'race')?.name ?? '',
    origin: sys.detalhes?.origem ?? '',
    god: sys.detalhes?.divindade ?? '',
    pv: { value: num(sys.attributes?.pv?.value), max: num(sys.attributes?.pv?.max), temp: num(sys.attributes?.pv?.temp) },
    pm: { value: num(sys.attributes?.pm?.value), max: num(sys.attributes?.pm?.max) },
    attrs: Object.fromEntries(['for', 'des', 'con', 'int', 'sab', 'car'].map(k => [k, num(sys.atributos?.[k]?.value)]))
  };
}

export class HomeApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-home-app'],
    tag: 'section',
    window: { title: 'T20 Toolkit', icon: 'fa-solid fa-dungeon', resizable: true },
    position: { width: 940, height: 700 },
    actions: {
      t20nav: onNavigate,
      theme: HomeApp.#onTheme,
      openSheet: HomeApp.#onOpenSheet,
      openTool: HomeApp.#onOpenTool,
      pickActor: HomeApp.#onPickActor,
      report: HomeApp.#onReport
    }
  };

  constructor({ actor = null, ...options } = {}) {
    super({ id: `t20tk-home-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this._hooks = [];
  }

  get title() { return this.actor ? `T20 Toolkit — ${this.actor.name}` : 'T20 Toolkit'; }

  async _prepareContext() {
    this.summary = this.actor ? homeSummary(this.actor, { isGM: !!game.user?.isGM }) : null;
    return {};
  }

  async _renderHTML() {
    const s = this.summary;
    const frame = { tool: 'hub', extra: 't20tk-home', actor: this.actor, who: s ? `Nível ${s.level}` : '', eyebrow: 'Início', title: this.actor ? this.actor.name : 'Ferramentas de Arton', subtitle: this.actor ? 'O que o personagem tem e o que falta fazer.' : 'Escolha um personagem para ver o painel dele.' };
    return toolFrame(frame, this.actor ? this.#renderActor(s) : this.#renderPicker());
  }

  #renderPicker() {
    const mine = [...(game.actors ?? [])].filter(a => a.type === 'character' && a.isOwner).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const cards = mine.map(a => {
      const cls = actorClasses(a).map(c => `${c.name} ${c.level}`).join(' / ') || 'sem classe';
      return `<li><button type="button" class="t20tk-home-pick" data-action="pickActor" data-id="${a.id}"><img src="${escapeHtml(a.img)}" alt=""><span><b>${escapeHtml(a.name)}</b><small>${escapeHtml(cls)}</small></span></button></li>`;
    }).join('');
    return `<div class="t20tk-home-body">
      ${mine.length ? `<section class="t20tk-home-card"><header><b>Seus personagens</b><small>${mine.length}</small></header><ul class="t20tk-home-picks">${cards}</ul></section>` : '<p class="t20tk-bz-note">Você não tem personagens. Crie um na aba Atores e abra o Toolkit pela ficha.</p>'}
      ${this.#renderTools(new Set())}
      ${this.#renderBeta()}
    </div>`;
  }

  #renderActor(s) {
    const bar = (label, v, max, tone, extra = '') => {
      const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((v / max) * 100))) : 0;
      return `<div class="t20tk-home-bar" data-tone="${tone}"><span><small>${label}</small><b>${v}<i>/${max}</i>${extra}</b></span><div><i style="width:${pct}%"></i></div></div>`;
    };
    const facts = [s.race, s.origin ? `origem: ${s.origin}` : '', s.god ? `devoto de ${s.god}` : ''].filter(Boolean);
    const hero = `<section class="t20tk-home-hero">
      <img src="${escapeHtml(this.actor.img)}" alt="">
      <div class="t20tk-home-id"><b>${escapeHtml(s.classes.map(c => `${c.name} ${c.level}`).join(' / ') || 'Sem classe')}</b>
        <small>${facts.map(escapeHtml).join(' · ') || 'raça, origem e divindade na ficha'}</small>
        <div class="t20tk-home-attrs">${Object.entries(s.attrs).map(([k, v]) => `<span><small>${k.toUpperCase()}</small><b>${v >= 0 ? '+' : ''}${v}</b></span>`).join('')}</div></div>
      <div class="t20tk-home-bars">${bar('PV', s.pv.value, s.pv.max, 'pv', s.pv.temp ? ` <em>+${s.pv.temp}</em>` : '')}${bar('PM', s.pm.value, s.pm.max, 'pm')}</div>
    </section>`;
    const toolName = id => TOOLKIT_FEATURES.find(f => f.id === id)?.title ?? id;
    const task = t => `<li class="t20tk-home-task" data-tone="${t.tone ?? 'info'}"><span class="t20tk-home-glyph">${GLYPH[t.tool] ?? '•'}</span><span><small>${escapeHtml(toolName(t.tool))}</small><b>${escapeHtml(t.text)}</b></span>
      ${t.action ? `<button type="button" class="t20tk-ui-button ${t.tone === 'warn' ? 't20tk-ui-button--primary' : ''}" data-action="openTool" data-tool="${t.tool}">${escapeHtml(t.action)} →</button>` : ''}</li>`;
    const todo = s.todo.length
      ? `<ul class="t20tk-home-tasks">${s.todo.map(task).join('')}</ul>`
      : '<p class="t20tk-home-clear">✔ Nada pendente. Bom jogo!</p>';
    const info = s.info.length ? `<ul class="t20tk-home-tasks t20tk-home-info">${s.info.map(task).join('')}</ul>` : '';
    return `<div class="t20tk-home-body">${hero}
      <section class="t20tk-home-card"><header><b>Pendências</b><small>${s.todo.length || 'nenhuma'}</small></header>${todo}${info ? `<p class="t20tk-home-sub">Situação</p>${info}` : ''}</section>
      ${this.#renderTools(s.relevant)}
      ${this.#renderBeta()}
    </div>`;
  }

  #renderTools(relevant) {
    const tool = f => `<button type="button" class="t20tk-home-tool" data-action="openTool" data-tool="${f.id}" title="${escapeHtml(f.description)}"><span class="t20tk-home-glyph">${GLYPH[f.id] ?? '•'}</span><span><b>${escapeHtml(f.title)}</b><small>${escapeHtml(f.short ?? '')}</small></span></button>`;
    const avail = TOOLKIT_FEATURES.filter(f => ['available', 'preview'].includes(f.status) && (f.id !== 'regras' || game.user?.isGM));
    const mine = avail.filter(f => relevant.has(f.id));
    const rest = avail.filter(f => !relevant.has(f.id));
    return `<section class="t20tk-home-card"><header><b>${mine.length ? 'Ferramentas deste personagem' : 'Ferramentas'}</b></header>
      <div class="t20tk-home-tools">${(mine.length ? mine : rest).map(tool).join('')}</div>
      ${mine.length && rest.length ? `<details class="t20tk-home-more" data-key="home-more"><summary>Outras ferramentas (${rest.length})</summary><div class="t20tk-home-tools">${rest.map(tool).join('')}</div></details>` : ''}
    </section>`;
  }

  #renderBeta() {
    const url = (() => { try { return String(game.settings.get(MODULE_ID, 'feedbackUrl') || ''); } catch { return ''; } })();
    const link = /^https?:\/\//i.test(url) ? `<a class="t20tk-ui-button" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir canal da beta</a>` : '';
    return `<section class="t20tk-home-card t20tk-home-beta"><header><b>Beta fechada</b><small>versão ${escapeHtml(MODULE_VERSION)}</small></header>
      <p class="t20tk-bz-note">Achou um erro ou algo confuso? O relato já vem com as versões, os módulos ativos e os erros recentes do Toolkit — é só descrever o que aconteceu e colar no canal.</p>
      <div class="t20tk-home-beta-actions"><button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="report">Relatar problema</button>${link}</div></section>`;
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onFirstRender() {
    watchActor(this);
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  static async #onOpenTool(event, target) {
    const id = target.dataset.tool;
    const api = game.t20Toolkit;
    const key = TOOL_OF[id] ?? id;
    try { await api?.[key]?.open?.({ actor: this.actor }); } catch (error) {
      console.error(`[T20 Toolkit] Falha ao abrir ${id}:`, error);
      ui.notifications?.error?.(`T20 Toolkit: não foi possível abrir ${id}.`);
    }
  }

  static async #onPickActor(event, target) {
    const actor = game.actors?.get(target.dataset.id);
    if (!actor) return;
    await this.close();
    await openHome({ actor });
  }

  static async #onReport() { await openReport({ actor: this.actor }); }

  static async #onTheme(event, target) { await switchTheme(target.dataset.themeValue); }
  static #onOpenSheet() { this.actor?.sheet?.render(true); }
}

export async function openHome({ actor = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-home-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) return reopen(existing);
  const app = new HomeApp({ actor });
  await app.render({ force: true });
  return app;
}
