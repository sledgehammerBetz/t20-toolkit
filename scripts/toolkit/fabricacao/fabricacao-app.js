/**
 * Fabricação — janela do Toolkit.
 * Receitas: comidas, preparados alquímicos, catalisadores e venenos dos compêndios, com o teste de Ofício,
 * a matéria-prima (um terço do preço) e o tempo (JdA, Ofício).
 * Refeições: comidas da ficha, comer (refeição do dia, efeito de 1 dia) e encerrar o dia.
 */
import { watchActor } from '../ui/live-refresh.js';
import { replaceKeepingPlace } from '../ui/render.js';
import { escapeHtml, fold } from '../core/t20.js';
import { toolFrame, onNavigate, onTheme, reopen } from '../ui/frame.js';
import { cardHTML, metric } from '../ui/components.js';
import { formatTC } from '../core/wallet.js';
import { KINDS, CRAFT_SKILLS, CRAFT_TIME, materialCost, foodBenefit, benefitLines } from './fabricacao-rules.js';
import { getRecipeCatalog, crafterInfo, craftRecipe, sheetFoods, eatFood, activeFood, clearFood } from './fabricacao-actions.js';
import { MODULE_ID } from '../../constants.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const VIEWS = [['receitas', 'Receitas'], ['refeicoes', 'Refeições']];
const sign = n => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export class FabricacaoApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-fabricacao-app'],
    tag: 'section',
    window: { title: 'Fabricação', icon: 'fa-solid fa-mortar-pestle', resizable: true },
    position: { width: 920, height: 740 },
    actions: {
      view: FabricacaoApp.#onView,
      kind: FabricacaoApp.#onKind,
      craft: FabricacaoApp.#onCraft,
      eat: FabricacaoApp.#onEat,
      endFood: FabricacaoApp.#onEndFood,
      newDay: FabricacaoApp.#onNewDay,
      t20nav: onNavigate,
      theme: onTheme,
      openSheet: FabricacaoApp.#onOpenSheet
    }
  };

  constructor({ actor = null, view = null, ...options } = {}) {
    super({ id: `t20tk-fabricacao-${actor?.id ?? 'livre'}`, ...options });
    this.actor = actor;
    this.ui = { view: view ?? 'receitas', kind: '', query: '' };
    this.recipes = null;
    this._hooks = [];
  }

  get title() { return this.actor ? `Fabricação — ${this.actor.name}` : 'Fabricação'; }

  async _prepareContext() {
    this.recipes ??= await getRecipeCatalog();
    return {};
  }

  /* ---------- dados ---------- */

  rows() {
    const q = fold(this.ui.query);
    return (this.recipes ?? []).filter(r => (!this.ui.kind || r.kind === this.ui.kind) && (!q || r.key.includes(q) || fold(r.packLabel).includes(q)));
  }

  /* ---------- render ---------- */

  async _renderHTML() {
    const info = this.actor ? crafterInfo(this.actor) : null;
    const tabs = `<div class="t20tk-es-tabs" role="tablist">${VIEWS.map(([id, label]) => `<button type="button" role="tab" data-action="view" data-view="${id}" aria-pressed="${this.ui.view === id}">${label}${id === 'refeicoes' && this.actor ? ` <span class="t20tk-count">${activeFood(this.actor).filter(e => e.flags?.[MODULE_ID]?.food?.day).length}</span>` : ''}</button>`).join('')}
      ${this.ui.view === 'refeicoes' && this.actor ? '<span class="t20tk-eng-tools"><button type="button" class="t20tk-ui-button" data-action="newDay" title="Encerra as refeições do dia"><i class="fa-solid fa-sun" inert></i> Novo dia</button></span>' : ''}</div>`;
    const body = this.ui.view === 'refeicoes' ? this.#renderMeals() : this.#renderRecipes(info);
    return toolFrame({
      tool: 'fabricacao', extra: 't20tk-eng t20tk-fab', actor: this.actor, who: '',
      eyebrow: 'Ofício', title: 'Fabricação',
      subtitle: 'Comidas e alquimia: teste de Ofício, matéria-prima (um terço do preço) e um dia de trabalho.'
    }, `${this.#renderStatus(info)}${tabs}${body}`);
  }

  #renderStatus(info) {
    if (!info) return '<p class="t20tk-eng-status t20tk-bz-note">Abra pela ficha (botão Toolkit) para fabricar e comer.</p>';
    const skill = k => {
      const s = info.skills[k];
      return s ? `${sign(s.value)}${s.trained ? '' : ' (não treinado)'}` : '—';
    };
    const tools = ['cozi', 'alqu'].filter(k => info.tools[k]).map(k => CRAFT_SKILLS[k].short);
    return `<section class="t20tk-eng-status"><div class="t20tk-metrics">
      ${metric('Ofício (cozinheiro)', skill('cozi'))}
      ${metric('Ofício (alquimista)', skill('alqu'))}
      ${metric('Instrumentos', tools.length ? tools.join(', ') : 'nenhum')}
      ${metric('Dinheiro', formatTC(info.money))}
      ${metric('PM', String(info.pm))}
    </div>${info.mestreCuca || info.instavel ? `<p class="t20tk-bz-note">${[info.mestreCuca ? 'Mestre Cuca: +1 nos bônus numéricos das comidas que você faz.' : '', info.instavel ? 'Catalizador Instável: preparados na hora, por 3 PM.' : ''].filter(Boolean).join(' ')}</p>` : ''}</section>`;
  }

  #renderRecipes(info) {
    const counts = Object.fromEntries(Object.keys(KINDS).map(k => [k, (this.recipes ?? []).filter(r => r.kind === k).length]));
    const chip = (value, label, n = null) => `<button type="button" class="t20tk-chip ${this.ui.kind === value ? 'is-on' : ''}" data-action="kind" data-value="${value}">${escapeHtml(label)}${n !== null ? ` <span class="t20tk-count">${n}</span>` : ''}</button>`;
    const filters = `<section class="t20tk-bz-filters">
      <label class="t20tk-search"><span aria-hidden="true"><i class="fa-solid fa-magnifying-glass" inert></i></span><input type="search" data-fab-query value="${escapeHtml(this.ui.query)}" placeholder="Buscar pelo nome ou livro…" aria-label="Buscar receita"></label>
      <div class="t20tk-chips" role="group" aria-label="Tipo">${chip('', 'Todos')}${Object.values(KINDS).map(k => chip(k.id, k.plural, counts[k.id])).join('')}</div>
      <span class="t20tk-bz-count" data-fab-count>${this.rows().length} receitas</span>
    </section>`;
    return `${filters}<ol class="t20tk-bz-list" data-region="results">${this.#renderRows(info)}</ol>`;
  }

  #renderRows(info = this.actor ? crafterInfo(this.actor) : null) {
    const rows = this.rows();
    if (!rows.length) return '<li class="t20tk-bz-empty">Nenhuma receita encontrada.</li>';
    const gm = !!game.user?.isGM;
    return rows.map(r => {
      const cost = materialCost(r.price);
      const skill = info?.skills?.[r.skill];
      const trained = !!skill?.trained || r.substitutes.length > 0;
      const status = !r.priced ? 'review' : trained ? 'allowed' : 'blocked';
      const benefit = r.kind === 'prato' ? benefitLines(foodBenefit(r.description, { mestreCuca: info?.mestreCuca })) : [];
      const sub = !r.priced ? 'Sem preço no compêndio: combine o custo com o mestre.' : !trained && info ? `Precisa de ${CRAFT_SKILLS[r.skill].label} treinado.` : benefit.join('; ');
      const canClick = this.actor?.isOwner && (r.priced || gm);
      return cardHTML({
        img: r.img, status, name: r.name,
        metaHtml: `${escapeHtml(r.kindLabel)} • ${escapeHtml(CRAFT_SKILLS[r.skill].short)} • <b>CD ${r.dc}</b> • matéria-prima <b>${escapeHtml(r.priced ? formatTC(cost) : '—')}</b> • ${CRAFT_TIME}`,
        sub, source: r.book || r.packLabel,
        side: `<span class="t20tk-pill">${escapeHtml(r.priced ? `T$ ${r.price.toLocaleString('pt-BR')}` : 'sem preço')}</span>${canClick ? `<button type="button" class="t20tk-ui-button ${status === 'allowed' ? 't20tk-ui-button--primary' : ''}" data-action="craft" data-uuid="${escapeHtml(r.uuid)}">Fabricar…</button>` : ''}`
      });
    }).join('');
  }

  #renderMeals() {
    if (!this.actor) return '<p class="t20tk-bz-empty">Abra pela ficha (botão Toolkit).</p>';
    const now = game.time?.worldTime ?? 0;
    const fx = activeFood(this.actor).filter(e => e.flags?.[MODULE_ID]?.food?.day);
    const left = until => {
      const h = Math.max(0, Math.ceil((Number(until) - now) / 3600));
      return h >= 24 ? '1 dia' : `${h} h`;
    };
    const today = fx.length ? `<ol class="t20tk-bz-list">${fx.map(e => {
      const f = e.flags[MODULE_ID].food;
      const lines = [f.tempPV ? `+${f.tempPV} PV temporários` : '', f.tempPM ? `+${f.tempPM} PM temporários` : '', f.restPV && !f.restUsed ? `+${f.restPV} PV/nível no próximo descanso` : '', f.restPM && !f.restUsed ? `+${f.restPM} PM/nível no próximo descanso` : '', f.restUsed ? 'bônus de descanso já usado' : ''].filter(Boolean);
      return cardHTML({ img: e.img, name: f.name, meta: `Refeição do dia · resta ${left(f.until)}`, sub: lines.join('; ') || 'Efeito descrito no texto do prato.', side: `<button type="button" class="t20tk-ui-button" data-action="endFood" data-id="${e.id}">Encerrar</button>` });
    }).join('')}</ol>` : '<p class="t20tk-bz-empty">Nenhuma refeição especial hoje.</p>';
    const foods = sheetFoods(this.actor);
    const pantry = foods.length ? `<ol class="t20tk-bz-list">${foods.map(({ item, benefit, special, mestreCuca }) => cardHTML({
      img: item.img, status: special ? 'allowed' : 'review', name: item.name,
      meta: `${Number(item.system?.qtd) || 0} unidade(s)${mestreCuca ? ' · Mestre Cuca' : ''}${special ? ' · prato especial' : ''}`,
      sub: benefitLines(benefit).join('; '),
      side: this.actor.isOwner ? `<button type="button" class="t20tk-ui-button ${special ? 't20tk-ui-button--primary' : ''}" data-action="eat" data-id="${item.id}">Comer</button>` : ''
    })).join('')}</ol>` : '<p class="t20tk-bz-empty">Nenhuma comida no inventário. Fabrique uma em Receitas ou compre.</p>';
    return `<section class="t20tk-fab-section"><h3>Hoje</h3>${today}</section>
      <section class="t20tk-fab-section"><h3>No inventário</h3>${pantry}
      <p class="t20tk-bz-note">Os benefícios de um prato especial duram um dia. Prato do Aventureiro e Sopa de Peixe somam no próximo descanso do sistema; o bônus em teste (Batata Ambiciosa) aparece desmarcado na janela de rolagem.</p></section>`;
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  _onRender() {
    const input = this.element.querySelector('[data-fab-query]');
    let timer = null;
    input?.addEventListener('input', ev => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.ui.query = ev.target.value;
        const list = this.element.querySelector('[data-region="results"]');
        if (list) list.innerHTML = this.#renderRows();
        const count = this.element.querySelector('[data-fab-count]');
        if (count) count.textContent = `${this.rows().length} receitas`;
      }, 150);
    });
  }

  _onFirstRender() {
    watchActor(this, { hooks: ['createItem', 'deleteItem', 'updateItem', 'updateActor', 'createActiveEffect', 'deleteActiveEffect', 'updateActiveEffect'], ignore: ['system.attributes.pv'] });
  }

  _onClose(options) {
    for (const [hook, id] of this._hooks) Hooks.off(hook, id);
    this._hooks = [];
    super._onClose?.(options);
  }

  static #onView(event, target) { this.ui.view = target.dataset.view; this.render(); }
  static #onKind(event, target) { this.ui.kind = target.dataset.value; this.render(); }

  static async #onCraft(event, target) {
    if (!this.actor) return ui.notifications.warn('Abra a Fabricação pela ficha do personagem.');
    const recipe = this.recipes?.find(r => r.uuid === target.dataset.uuid);
    if (!recipe) return;
    try { await craftRecipe(this.actor, recipe); }
    catch (error) {
      console.error('[T20 Toolkit] Fabricação:', error);
      ui.notifications.error(`Não foi possível fabricar: ${error.message}`);
    }
  }

  static async #onEat(event, target) {
    const item = this.actor?.items.get(target.dataset.id);
    if (item) await eatFood(this.actor, item);
  }

  static async #onEndFood(event, target) {
    const effect = this.actor?.effects.get(target.dataset.id);
    if (!effect) return;
    const name = effect.flags?.[MODULE_ID]?.food?.name;
    const ids = this.actor.effects.filter(e => e.flags?.[MODULE_ID]?.food?.name === name).map(e => e.id);
    await this.actor.deleteEmbeddedDocuments('ActiveEffect', ids);
  }

  static async #onNewDay() { if (this.actor) await clearFood(this.actor); }

  static #onOpenSheet() { this.actor?.sheet?.render(true); }
}

export async function openFabricacao({ actor = null, view = null } = {}) {
  actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
  const id = `t20tk-fabricacao-${actor?.id ?? 'livre'}`;
  const existing = foundry.applications.instances.get(id);
  if (existing) {
    if (view) existing.ui.view = view;
    return reopen(existing);
  }
  const app = new FabricacaoApp({ actor, view });
  await app.render({ force: true });
  return app;
}
