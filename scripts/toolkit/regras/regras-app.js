/**
 * Regras da mesa — janela do mestre (Figma: "Configurações do mestre" e "Política da campanha").
 * Liga regras opcionais dos livros e homebrews. Salva na configuração do mundo (tableRules).
 * Jogadores veem tudo, mas só o mestre altera.
 */
import { replaceKeepingPlace } from '../ui/render.js';
import { escapeHtml } from '../core/t20.js';
import { toolFrame, onNavigate, switchTheme } from '../ui/frame.js';
import { getTableRules, setTableRules, ATTRIBUTE_METHODS, AGE_HEROIS } from '../core/table-rules.js';

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};

/** Cartão de política: título, texto e opções segmentadas. */
function policy({ key, title, text, source = '', options, value, gm }) {
  return `<section class="t20tk-policy">
    <header><h4>${escapeHtml(title)}</h4>${source ? `<span class="t20tk-policy-src">${escapeHtml(source)}</span>` : ''}</header>
    ${text ? `<p class="t20tk-bz-note">${text}</p>` : ''}
    <div class="t20tk-policy-opts" role="radiogroup" aria-label="${escapeHtml(title)}">
      ${options.map(o => `<button type="button" data-action="setRule" data-key="${key}" data-value="${escapeHtml(String(o.value))}" data-tone="${o.tone ?? 'neutral'}" aria-pressed="${String(value) === String(o.value)}" ${gm ? '' : 'disabled'}>${escapeHtml(o.label)}</button>`).join('')}
    </div>
  </section>`;
}

const ONOFF = [{ value: 'true', label: 'Ligada', tone: 'on' }, { value: 'false', label: 'Desligada', tone: 'off' }];

export class RegrasApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 't20tk-regras',
    classes: ['t20tk-app', 't20tk-buscador-app', 't20tk-regras-app'],
    tag: 'section',
    window: { title: 'Regras da mesa', icon: 'fa-solid fa-scale-balanced', resizable: true },
    position: { width: 760, height: 760 },
    actions: {
      setRule: RegrasApp.#onSetRule,
      toggleMethod: RegrasApp.#onToggleMethod,
      toggleAge: RegrasApp.#onToggleAge,
      theme: RegrasApp.#onTheme,
      t20nav: onNavigate,
      openSheet: () => {}
    }
  };

  constructor({ actor = null, ...options } = {}) { super(options); this.actor = actor; }

  async _prepareContext() { return { rules: getTableRules(), gm: !!game.user?.isGM }; }

  async _renderHTML({ rules, gm }) {
    const methods = Object.entries(ATTRIBUTE_METHODS).map(([id, m]) => `<button type="button" class="t20tk-chip ${rules.methods[id] ? 'is-on' : ''}" data-action="toggleMethod" data-method="${id}" aria-pressed="${!!rules.methods[id]}" title="${escapeHtml(m.source)}" ${gm ? '' : 'disabled'}>${escapeHtml(m.label)}</button>`).join('');
    const AGES = { jda: ['Livro Básico', 'JdA p. 108: Maduro e Velho mudam atributos.'], herois: ['Heróis de Arton', 'p. 288: sete faixas etárias, níveis extras e complicações de idade.'] };
    const ages = Object.entries(AGES).map(([id, [label, tip]]) => `<button type="button" class="t20tk-chip ${rules.ages[id] ? 'is-on' : ''}" data-action="toggleAge" data-age="${id}" aria-pressed="${!!rules.ages[id]}" title="${escapeHtml(tip)}" ${gm ? '' : 'disabled'}>${escapeHtml(label)}</button>`).join('');
    const body = `<div class="t20tk-regras">
      ${gm ? '' : '<p class="t20tk-bz-warn">Só o mestre altera estas regras. Você vê o que vale na mesa.</p>'}
      <p class="t20tk-eyebrow">Atributos</p>
      <section class="t20tk-policy"><header><h4>Métodos permitidos</h4><span class="t20tk-policy-src">JdA · Heróis de Arton p. 280</span></header>
        <p class="t20tk-bz-note">Os jogadores escolhem entre os métodos marcados. Valkaria (7d6 distribuídos) ainda não está no Planejador.</p>
        <div class="t20tk-chips">${methods}</div></section>
      ${policy({ key: 'pointBudget', title: 'Pontos da compra', source: 'Pontos Variados, Heróis p. 281', text: '"Pé no chão": 5 · padrão: 10 · épica: 15.', value: rules.pointBudget, gm,
        options: [{ value: 5, label: '5 pontos' }, { value: 10, label: '10 pontos', tone: 'on' }, { value: 15, label: '15 pontos' }] })}
      <p class="t20tk-eyebrow">Raças e devoções</p>
      ${policy({ key: 'openRaces', title: 'Raças Abertas', source: 'Heróis p. 281', text: 'Cada modificador de atributo da raça pode ir para qualquer atributo (sem repetir).', value: rules.openRaces, gm, options: ONOFF })}
      ${policy({ key: 'openDevotions', title: 'Devoções Abertas', source: 'Heróis p. 281', value: rules.openDevotions, gm,
        text: '<b>Livro:</b> a raça <i>ou</i> a classe precisa estar na lista do deus. <b>Qualquer raça:</b> a raça deixa de contar; vale a classe (clérigo: qualquer deus). <b>Qualquer classe:</b> a classe deixa de contar; vale a raça (humano: qualquer deus). <b>As duas:</b> qualquer personagem, qualquer deus. O usurpador continua sem devoção.',
        options: [{ value: 'off', label: 'Livro', tone: 'off' }, { value: 'race', label: 'Qualquer raça' }, { value: 'class', label: 'Qualquer classe' }, { value: 'both', label: 'As duas', tone: 'on' }] })}
      <p class="t20tk-eyebrow">Criação do personagem</p>
      ${policy({ key: 'complications', title: 'Complicações', source: 'Heróis p. 282', text: 'Na criação, o jogador pode escolher uma complicação (geral ou da classe) e recebe um poder geral extra.', value: rules.complications, gm, options: ONOFF })}
      <section class="t20tk-policy"><header><h4>Idade</h4><span class="t20tk-policy-src">JdA p. 108 · Heróis p. 288</span></header>
        <p class="t20tk-bz-note">Marque as regras liberadas. Cada personagem escolhe a sua na criação (ou nenhuma). Sem nenhuma marcada, a idade é só descritiva.</p>
        <div class="t20tk-chips">${ages}</div></section>
      ${policy({ key: 'originsCount', title: 'Origens por personagem', source: 'homebrew', text: 'Quantas origens o personagem escolhe na criação. Cada uma dá seus benefícios e itens.', value: rules.originsCount, gm,
        options: [{ value: 1, label: '1 (livro)', tone: 'on' }, { value: 2, label: '2 origens' }, { value: 3, label: '3 origens' }] })}
      <p class="t20tk-eyebrow">Progressão</p>
      ${policy({ key: 'distinctions', title: 'Distinções', source: 'Heróis cap. 2', text: 'Os poderes de distinção aparecem como opção ao escolher poderes no Planejador. A admissão é combinada com o mestre.', value: rules.distinctions, gm, options: ONOFF })}
      ${policy({ key: 'extraGains', title: 'Ganhos fora da progressão', source: 'homebrew', text: 'Poderes, perícias ou +1 em atributo dados pela campanha (treino, recompensa, item, bênção). Ficam registrados no Planejador.', value: rules.extraGains, gm,
        options: [{ value: 'off', label: 'Desligado', tone: 'off' }, { value: 'gm', label: 'Só o mestre' }, { value: 'all', label: 'Todos', tone: 'on' }] })}
      ${policy({ key: 'retrain', title: 'Retreino', source: 'homebrew', text: 'Voltar num nível já aplicado e trocar um poder escolhido nele por outro (o Planejador troca o item na ficha e avisa se algum poder dependia do antigo). <b>Um por nível:</b> uma troca a cada nível de personagem. <b>Livre:</b> sem limite. O mestre sempre pode trocar quando a regra está ligada.', value: rules.retrain, gm,
        options: [{ value: 'off', label: 'Desligado', tone: 'off' }, { value: 'levelUp', label: 'Um por nível' }, { value: 'free', label: 'Livre', tone: 'on' }] })}
      <p class="t20tk-bz-note">As mudanças valem na hora para todo o mundo. Personagens já criados não mudam.</p>
    </div>`;
    return toolFrame({ tool: 'regras', extra: 't20tk-rg', actor: false, eyebrow: 'Mestre', title: 'Regras da mesa', subtitle: 'Regras opcionais dos livros e homebrews da campanha.' }, body);
  }

  _replaceHTML(result, content) { replaceKeepingPlace(content, result); }

  async #save(patch) {
    if (!game.user?.isGM) return;
    await setTableRules(patch);
    this.render();
    for (const app of foundry.applications.instances.values()) if (app !== this && app.rendered && app.constructor?.name === 'PlannerApp') app.render();
  }

  static async #onSetRule(event, target) {
    const { key, value } = target.dataset;
    const v = value === 'true' ? true : value === 'false' ? false : /^\d+$/.test(value) ? Number(value) : value;
    await this.#save({ [key]: v });
  }

  static async #onToggleMethod(event, target) {
    const r = getTableRules();
    await this.#save({ methods: { ...r.methods, [target.dataset.method]: !r.methods[target.dataset.method] } });
  }

  static async #onToggleAge(event, target) {
    const r = getTableRules();
    await this.#save({ ages: { ...r.ages, [target.dataset.age]: !r.ages[target.dataset.age] } });
  }

  static async #onTheme(event, target) { await switchTheme(target.dataset.themeValue); }
}

export async function openRegras({ actor = null } = {}) {
  const existing = foundry.applications.instances.get('t20tk-regras');
  if (existing) { existing.render({ force: true }); existing.bringToFront?.(); return existing; }
  return new RegrasApp({ actor }).render({ force: true });
}
