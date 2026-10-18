/**
 * Níveis já aplicados: o que entrou na ficha em cada nível e o Retreino (regra da mesa).
 * Retreino = trocar um poder escolhido num nível por outro. O Planejador apaga o item antigo,
 * cria o novo (marcado com o mesmo nível) e avisa se algum poder da ficha dependia do antigo.
 * Registro: flags['t20-toolkit'].retrain = { usedAt } e flags['t20-toolkit'].retrains = [{ level, from, to, by, at }].
 */
import { MODULE_ID } from '../../constants.js';
import { escapeHtml, fold, plainText } from '../core/t20.js';
import { prerequisiteText, evaluatePrerequisites } from './planner-rules.js';
import { getTableRules, retrainStatus } from '../core/table-rules.js';
import { postCard } from '../ui/chat.js';
import { powerCard, chipRow, toggleRow, bf, catOf, GENERAL_CATS } from './level-view.js';

const SWAPPABLE = ['classe', 'geral', 'distincao', 'concedido', 'origem'];
const TIPO_LABEL = { classe: 'Poder de classe', geral: 'Poder geral', distincao: 'Distinção', concedido: 'Poder concedido', origem: 'Poder de origem', ability: 'Habilidade de classe', racial: 'Habilidade racial', complicacao: 'Complicação' };
const strip = html => plainText(html);

const levelOf = item => Number(item?.flags?.[MODULE_ID]?.plannerLevel) || 0;
const isSwappable = item => item?.type === 'poder' && SWAPPABLE.includes(item.system?.tipo);

export function retrainState(app) {
  const c = app.ctxData;
  const usedAt = Number(app.actor?.getFlag?.(MODULE_ID, 'retrain')?.usedAt) || 0;
  return retrainStatus(getTableRules(), { level: c.current, usedAt, isGM: !!game.user?.isGM });
}

/** Itens que entraram na ficha no nível N (marcados pelo Planejador ou listados no histórico). */
function itemsAt(app, level) {
  const h = app.ctxData.history[level] ?? {};
  const ids = new Set(h.created ?? []);
  return [...(app.actor?.items ?? [])].filter(i => ids.has(i.id) || levelOf(i) === level);
}

/* ---------- página de um nível já aplicado ---------- */

export function renderDoneLevel(app) {
  const c = app.ctxData;
  const level = app.selected;
  if (app.browse && app.browse.level === level && app.browse.kind === 'retrain') return renderRetrainBrowser(app);
  app.browse = null;
  const h = c.history[level];
  const st = retrainState(app);
  const can = st.allowed && app.actor?.isOwner;
  const items = itemsAt(app, level);
  const cls = h?.cls ? `${h.cls}${h.classLevel ? ` ${h.classLevel}º` : ''}` : '';
  const row = item => {
    const tipo = item.system?.tipo;
    const label = item.type === 'poder' ? (TIPO_LABEL[tipo] ?? 'Poder') : item.type === 'classe' ? 'Classe' : item.type === 'race' ? 'Raça' : item.type === 'magia' ? 'Magia' : 'Item';
    const from = item.flags?.[MODULE_ID]?.retrainedFrom;
    return `<div class="t20tk-lv-gain" data-kind="${isSwappable(item) ? 'power' : 'ability'}">
      ${item.img ? `<img src="${escapeHtml(item.img)}" alt="">` : '<span class="t20tk-wz-noimg">◆</span>'}
      <span><small>${escapeHtml(label)}</small><b>${escapeHtml(item.name)}</b>${from ? `<em>retreinado (antes: ${escapeHtml(from)})</em>` : ''}</span>
      ${isSwappable(item) && can ? `<button type="button" class="t20tk-ui-button" data-action="rtBrowse" data-item="${item.id}">Retreinar…</button>` : ''}
    </div>`;
  };
  const gained = items.length
    ? `<div class="t20tk-lv-gains">${items.map(row).join('')}</div>`
    : `<p class="t20tk-bz-note">${h ? 'Nenhum item registrado neste nível (só o nível da classe).' : 'Este nível foi feito fora do Planejador: os itens dele não estão registrados. Use "Outros poderes da ficha" abaixo para retreinar.'}</p>`;

  // poderes da ficha sem nível registrado (fichas antigas / adicionados à mão)
  const loose = [...(app.actor?.items ?? [])].filter(i => isSwappable(i) && !levelOf(i) && !Object.values(c.history).some(x => (x.created ?? []).includes(i.id)));
  const others = can && loose.length ? `<details class="t20tk-disclosure t20tk-wz-box" data-key="rt-loose"><summary>Outros poderes da ficha <span class="t20tk-count">${loose.length}</span></summary>
    <div class="t20tk-disclosure-body"><p class="t20tk-bz-note">Poderes sem nível registrado (vindos de antes do Planejador ou adicionados pela ficha). Retreinar aqui conta como troca no ${level}º nível.</p>
    <div class="t20tk-lv-gains">${loose.map(row).join('')}</div></div></details>` : '';

  const log = (app.actor?.getFlag?.(MODULE_ID, 'retrains') ?? []).filter(r => r.level === level);
  const logHtml = log.length ? `<ul class="t20tk-rt-log">${log.map(r => `<li><b>${escapeHtml(r.from)}</b> → <b>${escapeHtml(r.to)}</b> <small>no ${r.at}º nível${r.by ? ` · ${escapeHtml(r.by)}` : ''}</small></li>`).join('')}</ul>` : '';

  const canUndo = level === c.current && h;
  const footer = `<footer class="t20tk-wz-foot t20tk-lv-foot">
    ${canUndo ? `<button type="button" class="t20tk-ui-button" data-action="undo" data-level="${level}">Desfazer este nível</button>` : '<span></span>'}
    ${c.current < 20 ? `<button type="button" class="t20tk-ui-button t20tk-ui-button--primary" data-action="pickLevel" data-level="${c.current + 1}">Ir para o ${c.current + 1}º nível →</button>` : '<span></span>'}
  </footer>`;

  return `<div class="t20tk-lv-page">
    <h3 class="t20tk-lv-title">${level}º nível de personagem <span class="t20tk-rt-badge">na ficha</span></h3>
    <section class="t20tk-wz-box"><header><b>${h?.creation ? 'Criação do personagem' : cls ? `${escapeHtml(cls)}` : 'O que entrou neste nível'}</b><small>${canUndo ? 'Último nível aplicado: dá para desfazer.' : 'Itens adicionados à ficha neste nível.'}</small></header>${gained}</section>
    <section class="t20tk-wz-box t20tk-rt"><header><b>Retreino</b><small>${escapeHtml(st.reason)}</small></header>
      ${st.allowed ? '<p class="t20tk-bz-note">Clique em <b>Retreinar…</b> num poder para trocá-lo por outro que você cumpra os pré-requisitos neste nível.</p>' : `<p class="t20tk-bz-note">${st.mode === 'off' ? 'O mestre pode ligar o retreino nas Regras da mesa (Progressão → Retreino).' : ''}</p>`}
      ${logHtml}</section>
    ${others}
  </div>${footer}`;
}

/* ---------- escolher o substituto ---------- */

function poolFor(app, old) {
  const tipo = old.system?.tipo;
  const P = app.index.powers;
  if (tipo === 'concedido') return P.filter(p => p.tipo === 'concedido');
  if (tipo === 'origem') return P.filter(p => p.tipo === 'origem');
  const classKeys = new Set(app.ctxData.classes.map(x => x.key));
  return P.filter(p => (p.tipo === 'classe' && (classKeys.has(p.subtipo) || p.subtipo === 'geral')) || p.tipo === 'geral' || (p.tipo === 'distincao' && getTableRules().distinctions));
}

function retrainContext(app, old) {
  const ctx = app.prereqContext(app.selected);
  ctx.powers = new Set([...ctx.powers].filter(k => k !== fold(old.name)));
  return ctx;
}

function renderRetrainBrowser(app) {
  const b = app.browse;
  const old = app.actor.items.get(b.item);
  if (!old) { app.browse = null; return renderDoneLevel(app); }
  const f = bf(app);
  const q = fold(f.q);
  const ctx = retrainContext(app, old);
  const groupOf = p => (p.tipo === 'classe' ? 'classe' : p.tipo);
  const pool = poolFor(app, old);
  const rows = pool.filter(p => fold(p.name) !== fold(old.name)
    && (!f.group || groupOf(p) === f.group)
    && (!q || p.key.includes(q) || fold(p.description).includes(q))
    && (!f.cat || p.tipo !== 'geral' || catOf(p) === f.cat)
    && (!f.hideOwned || !app.ownsPower(p.name))
    && (!f.eligible || evaluatePrerequisites(prerequisiteText(p.description), ctx).status !== 'missing'));
  const groups = ['classe', 'geral', 'distincao'].includes(old.system?.tipo)
    ? chipRow('Grupo', 'group', [['', 'Todos'], ['classe', 'De classe'], ['geral', 'Gerais'], ...(getTableRules().distinctions ? [['distincao', 'Distinções']] : [])], f.group) : '';
  const filters = `${groups}${chipRow('Categoria (poderes gerais)', 'cat', [['', 'Todas'], ...GENERAL_CATS], f.cat)}${toggleRow('Só os que cumpro (pré-requisitos)', 'eligible', f.eligible)}${toggleRow('Ocultar os que já tenho', 'hideOwned', f.hideOwned)}`;
  const list = rows.map(p => powerCard(app, p, ctx, { action: 'rtPick', gain: old.id })).join('');
  return `<div class="t20tk-lv-browser">
    <header class="t20tk-lv-bhead"><button type="button" class="t20tk-ui-button" data-action="lvBack">← Voltar ao ${app.selected}º nível</button><h3>Retreinar ${escapeHtml(old.name)}</h3></header>
    <p class="t20tk-bz-note t20tk-rt-old">Sai da ficha: <b>${escapeHtml(old.name)}</b> <small>${escapeHtml(strip(old.system?.description?.value).slice(0, 140))}…</small></p>
    <div class="t20tk-wz-split">
      <aside class="t20tk-wz-filters">
        <label class="t20tk-wz-field"><span>Buscar</span><input type="search" name="lvq" data-lvq value="${escapeHtml(f.q)}" placeholder="Nome ou texto…"></label>
        ${filters}
        <button type="button" class="t20tk-bz-link t20tk-wz-clear" data-action="lvFilterClear">Limpar filtros</button>
      </aside>
      <div class="t20tk-wz-results"><header class="t20tk-wz-listhead"><span>${rows.length} resultado(s)</span></header><ul class="t20tk-wz-list">${list || '<li class="t20tk-bz-empty">Nada com esses filtros. Tente desligar "Só os que cumpro".</li>'}</ul></div>
    </div></div>`;
}

/** Poderes da ficha cujo pré-requisito cita o poder `name`. */
export function dependentsOf(items, name) {
  const key = fold(name);
  return [...items].filter(i => i.type === 'poder' && fold(i.name) !== key && fold(prerequisiteText(i.system?.description?.value)).includes(key)).map(i => i.name);
}

/* ---------- ações (this = PlannerApp) ---------- */

export const RETRAIN_ACTIONS = {
  rtBrowse(event, target) {
    if (!retrainState(this).allowed) return;
    this.browse = { kind: 'retrain', item: target.dataset.item, level: this.selected };
    this.bf = { q: '', group: '', cat: '', eligible: true, hideOwned: true };
    this.render();
  },
  async rtPick(event, target) {
    const actor = this.actor;
    const st = retrainState(this);
    if (!actor?.isOwner || !st.allowed) return;
    const old = actor.items.get(target.dataset.gain);
    const ref = this.index.powerByUuid.get(target.dataset.value);
    if (!old || !ref) return;
    const level = this.selected;
    const deps = dependentsOf(actor.items, old.name);
    const ev = evaluatePrerequisites(prerequisiteText(ref.description), retrainContext(this, old));
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Retreino' },
      content: `<p>Trocar <b>${escapeHtml(old.name)}</b> por <b>${escapeHtml(ref.name)}</b> (${level}º nível)?</p>
        ${ev.status === 'missing' ? '<p><b>O novo poder não cumpre os pré-requisitos.</b> Confirme com o mestre.</p>' : ''}
        ${deps.length ? `<p><b>Atenção:</b> estes poderes da ficha citam ${escapeHtml(old.name)} como pré-requisito: ${deps.map(escapeHtml).join(', ')}.</p>` : ''}
        ${st.mode === 'levelUp' && !game.user?.isGM ? '<p>Esta é a sua troca deste nível.</p>' : ''}`,
      rejectClose: false
    });
    if (!ok) return;
    try {
      const doc = await fromUuid(ref.uuid);
      if (!doc) throw new Error('Poder não encontrado no compêndio.');
      const data = game.items.fromCompendium(doc);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.plannerLevel`, levelOf(old) || level);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.retrainedFrom`, old.name);
      const [item] = await actor.createEmbeddedDocuments('Item', [data]);
      const oldId = old.id, oldName = old.name;
      const c = this.ctxData;
      const hLevel = Object.entries(c.history).find(([, x]) => (x.created ?? []).includes(oldId))?.[0];
      const patch = {};
      if (hLevel) patch[`flags.${MODULE_ID}.history.${hLevel}.created`] = c.history[hLevel].created.map(id => (id === oldId ? item.id : id));
      if (st.mode === 'levelUp' && !game.user?.isGM) patch[`flags.${MODULE_ID}.retrain.usedAt`] = c.current;
      patch[`flags.${MODULE_ID}.retrains`] = [...(actor.getFlag(MODULE_ID, 'retrains') ?? []), { level, from: oldName, to: item.name, by: game.user?.name ?? '', at: c.current }];
      await Promise.all([old.delete(), actor.update(patch)]);
      this.browse = null;
      await postCard(actor, { tool: 'planner', tone: 'success', title: 'Retreino', subtitle: `${actor.name} · ${level}º nível`, rows: [['Saiu', oldName], ['Entrou', item.name]], note: deps.length ? `Confira: ${deps.join(', ')} dependia de ${oldName}.` : '' });
      this.render();
    } catch (error) {
      console.error('[T20 Toolkit] Retreino:', error);
      ui.notifications.error(`Não foi possível retreinar: ${error.message}`);
    }
  }
};
