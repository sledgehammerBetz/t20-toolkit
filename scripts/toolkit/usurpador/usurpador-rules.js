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
