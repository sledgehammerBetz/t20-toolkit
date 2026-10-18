/**
 * Usurpador (variante de Clérigo, Heróis de Arton p. 40). Funções puras.
 * - Usurpar: lança qualquer magia divina de um círculo que acessa com Enganação CD 20 + custo em PM.
 *   Falhou: a magia é perdida e os PM são gastos. Não pode escolher 10. Sofre penalidade de armadura.
 *   −5 se houver símbolo sagrado visível.
 * - Poder Capturado (4º nível): 1 hora + Enganação CD 20 (+5 por uso adicional no mesmo dia).
 *   Passou: conta como devoto do deus e recebe um poder concedido dele até o fim do dia ou o próximo uso.
 * - Roubo Divino (20º nível): a cada 10 pontos no teste de Usurpar, −1 PM e +1 na CD da magia.
 */

/** Poderes concedidos por divindade (Tormenta20 JdA, cap. 1, Divindades). */
export const GRANTED_POWERS = Object.freeze({
  'Aharadak': ["Afinidade com a Tormenta", "Êxtase da Loucura", "Percepção Temporal", "Rejeição Divina"],
  'Allihanna': ["Compreender os Ermos", "Dedo Verde", "Descanso Natural", "Voz da Natureza"],
  'Arsenal': ["Conjurar Arma", "Coragem Total", "Fé Guerreira", "Sangue de Ferro"],
  'Azgher': ["Espada Solar", "Fulgor Solar", "Habitante do Deserto", "Inimigo de Tenebra"],
  'Hyninn': ["Apostar com o Trapaceiro", "Farsa do Fingidor", "Forma de Macaco", "Golpista Divino"],
  'Kallyadranoch': ["Aura de Medo", "Escamas Dracônicas", "Presas Primordiais", "Servos do Dragão"],
  'Khalmyr': ["Coragem Total", "Dom da Verdade", "Espada Justiceira", "Reparar Injustiça"],
  'Lena': ["Ataque Piedoso", "Aura Restauradora", "Cura Gentil", "Curandeira Perfeita"],
  'Lin-Wu': ["Coragem Total", "Kiai Divino", "Mente Vazia", "Tradição de Lin-Wu"],
  'Marah': ["Aura de Paz", "Dom da Esperança", "Palavras de Bondade", "Talento Artístico"],
  'Megalokk': ["Olhar Amedrontador", "Presas Primordiais", "Urro Divino", "Voz dos Monstros"],
  'Nimb': ["Êxtase da Loucura", "Poder Oculto", "Sorte dos Loucos", "Transmissão da Loucura"],
  'Oceano': ["Anfíbio", "Arsenal das Profundezas", "Mestre dos Mares", "Sopro do Mar"],
  'Sszzaas': ["Astúcia da Serpente", "Familiar Ofídico", "Presas Venenosas", "Sangue Ofídico"],
  'Tanna-Toh': ["Conhecimento Enciclopédico", "Mente Analítica", "Pesquisa Abençoada", "Voz da Civilização"],
  'Tenebra': ["Carícia Sombria", "Manto da Penumbra", "Visão nas Trevas", "Zumbificar"],
  'Thwor': ["Almejar o Impossível", "Fúria Divina", "Olhar Amedrontador", "Tropas Duyshidakk"],
  'Thyatis': ["Ataque Piedoso", "Dom da Imortalidade", "Dom da Profecia", "Dom da Ressurreição"],
  'Valkaria': ["Almejar o Impossível", "Armas da Ambição", "Coragem Total", "Liberdade Divina"],
  'Wynna': ["Bênção do Mana", "Centelha Mágica", "Escudo Mágico", "Teurgista Místico"]
});

/** Nomes no livro que estão diferentes no compêndio do sistema 1.5.015. */
export const POWER_ALIASES = Object.freeze({
  'Tradição de Lin-Wu': 'Tradição de Samurai',
  'Tropas Duyshidakk': 'Tropas Goblinóides'
});

export function usurpDC(spellCost, extraPM = 0) {
  return 20 + (Number(spellCost) || 0) + (Number(extraPM) || 0);
}

export function captureDC(usesToday) {
  return 20 + 5 * Math.max(0, usesToday || 0);
}

/** Roubo Divino: redução de PM e aumento de CD a cada 10 pontos no teste. */
export function divineTheft(level, total) {
  if (level < 20) return 0;
  return Math.floor(Math.max(0, total) / 10);
}

/** Bônus fixo do teste de Usurpar: perícia + penalidade de armadura (≤ 0) − 5 se símbolo sagrado visível. */
export function usurpBonus({ skill = 0, armorPenalty = 0, holySymbol = false }) {
  return (Number(skill) || 0) + Math.min(0, Number(armorPenalty) || 0) - (holySymbol ? 5 : 0);
}

/**
 * Efeito temporário do Roubo Divino: um aprimoramento (flags.tormenta20.onuse) só desta magia,
 * que reduz o custo (custo negativo) e soma na CD (change "cd" → resistencia.bonus).
 * Criado no ator antes de lançar e apagado logo depois.
 */
export function divineTheftEffect(theft, spellName, img) {
  return {
    name: `Roubo Divino (−${theft} PM, CD +${theft})`,
    img: img || 'icons/svg/aura.svg',
    disabled: false,
    transfer: false,
    changes: [{ key: 'cd', value: String(theft), mode: 2, priority: 20 }],
    flags: {
      tormenta20: { onuse: true, magia: true, spell: true, items: spellName, custo: String(-theft) },
      't20-toolkit': { temp: 'roubo-divino' }
    }
  };
}

/* ---------- teste (Enganação ou o que um poder puser no lugar) ---------- */

export const TEST_SKILL = 'enga';
const foldTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Custo final em PM como a janela de conjuração do sistema calcula: custo base + custo × vezes de cada
 * aprimoramento marcado. Truque zera. Com algum custo, o mínimo é 1 PM.
 * `picks`: [{ cost: '2' | '-1' | 'Truque' | '0', qty }]
 */
export function castCost(base, picks = []) {
  let total = Number(base) || 0;
  let has = total > 0;
  for (const p of picks) {
    const qty = Number(p.qty) || 0;
    if (!qty) continue;
    if (p.cost === 'Truque') return 0;
    const c = Number(p.cost);
    if (Number.isFinite(c) && c) { total += c * qty; has = true; }
  }
  return has ? Math.max(1, total) : 0;
}

/** Custo de um aprimoramento como o diálogo do sistema escreve: '' vira '0', ou 'Truque' se for da própria magia. */
export function effectCost(flags = {}, { spell = true } = {}) {
  const raw = flags.custo;
  if (raw === '' || raw === undefined || raw === null) return spell && flags.self ? 'Truque' : '0';
  return String(raw);
}

const SUB_PATTERNS = [
  /(?:usar|use|utilizar|utiliza|usa)\s+(?:a\s+per[ií]cia\s+)?([^.;:,]+?)\s+(?:no lugar de|em vez de|ao inv[eé]s de)\s+(?:testes?\s+de\s+)?engana[cç][aã]o/i,
  /substitu\w*\s+(?:o\s+|seus?\s+)?(?:testes?\s+de\s+)?engana[cç][aã]o\s+por\s+(?:um\s+teste\s+de\s+)?([^.;:,]+)/i
];

/**
 * Poderes da ficha que deixam usar outra perícia no lugar de Enganação (lido do texto do poder).
 * `powers`: [{ name, description }]; `skills`: [{ key, label }]. Devolve [{ key, label, source }].
 */
export function skillSubstitutes(powers = [], skills = []) {
  const out = [];
  for (const p of powers) {
    const text = String(p.description ?? '');
    for (const re of SUB_PATTERNS) {
      const m = text.match(re);
      if (!m) continue;
      const said = foldTxt(m[1]);
      const skill = skills.filter(s => s.key !== TEST_SKILL && said.includes(foldTxt(s.label))).sort((a, b) => b.label.length - a.label.length)[0];
      if (skill && !out.some(o => o.key === skill.key && o.source === p.name)) out.push({ key: skill.key, label: skill.label, source: p.name });
    }
  }
  return out;
}

/**
 * Bônus em Enganação escritos no texto de poderes ("+2 em Enganação e Intuição").
 * Não dá para saber se é sempre ou só em certas situações: a janela mostra para a pessoa marcar.
 * `powers`: [{ name, description, uuid, onSheet }] (onSheet = o próprio item já soma na perícia).
 */
export function textBonuses(powers = [], skillLabel = 'Enganação') {
  const want = foldTxt(skillLabel);
  const out = [];
  for (const p of powers) {
    const text = String(p.description ?? '');
    for (const m of text.matchAll(/\+\s?(\d+)\s+(?:de\s+b[oô]nus\s+)?(?:em|nos?|nas?)\s+(?:testes?\s+de\s+)?([^.;:]+)/gi)) {
      if (!foldTxt(m[2]).includes(want)) continue;
      out.push({ id: p.uuid ?? p.name, value: Number(m[1]), source: p.name, onSheet: !!p.onSheet, text: m[0].trim() });
      break;
    }
  }
  return out;
}

/** Partes do teste: [{ label, value }] (value número ou fórmula como '1d4'). */
export function testParts({ skillLabel = 'Enganação', skillValue = 0, armorPenalty = 0, holySymbol = false, extras = [] } = {}) {
  const parts = [{ label: skillLabel, value: Number(skillValue) || 0 }];
  const pda = Math.min(0, Number(armorPenalty) || 0);
  if (pda) parts.push({ label: 'Penalidade de armadura', value: pda });
  if (holySymbol) parts.push({ label: 'Símbolo sagrado visível', value: -5 });
  for (const e of extras) if (e && e.value !== 0 && e.value !== '' && e.value !== undefined) parts.push(e);
  return parts;
}

/** Soma só a parte numérica (para a chance); dados entram na fórmula. */
export const fixedBonus = parts => parts.reduce((s, p) => s + (typeof p.value === 'number' ? p.value : (/^[+-]?\d+$/.test(String(p.value).trim()) ? Number(p.value) : 0)), 0);

export function testFormula(parts) {
  return ['1d20', ...parts.map(p => {
    const v = String(p.value).trim();
    return /^-/.test(v) ? `- ${v.slice(1)}` : `+ ${v.replace(/^\+/, '')}`;
  })].join(' ');
}

/** Chance (%) de tirar `dc` ou mais no d20 + bônus. */
export const chanceOf = (dc, bonus) => Math.max(0, Math.min(20, 21 - (dc - bonus))) * 5;
