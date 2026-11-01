/**
 * Poderes que pedem uma escolha depois de escolhidos (funções puras).
 * Ex.: Familiar (qual animal), Foco em Arma (qual arma), Especialista em Escola (qual escola).
 *
 * kind 'variant'  a escolha é outro item do compêndio (Familiar → Familiar Gato), que entra na ficha junto
 * kind 'options'  lista fixa do livro
 * kind 'skill'    uma perícia (sem `exclude`)
 * kind 'weapon'   uma arma do compêndio
 * `distinct`      poder repetível: cada cópia precisa de uma escolha diferente
 */
import { fold, SPELL_SCHOOLS } from '../core/t20.js';

const BASIC_FAMILIARS = /^familiar (borboleta|cobra|coruja|corvo|falcao|gato|lagarto|morcego|rato|sapo)$/;
/** Familiar de qualquer livro: básicos do Tormenta20 ("Familiar Gato") e de outros livros ("Aquin’ne (Familiar)"). */
const ANY_FAMILIAR = key => BASIC_FAMILIARS.test(key) || /\(familiar\)$/.test(key);
const familiarLabel = name => name.replace(/^Familiar\s+/i, '').replace(/\s*\(Familiar\)$/i, '');

export const POWER_CHOICES = Object.freeze({
  'familiar': { kind: 'variant', label: 'Qual familiar', match: ANY_FAMILIAR, book: 'Tormenta20, p. 38; Ameaças de Arton' },
  // Heróis de Arton: o segundo benefício vem dos tipos comuns (Tormenta20, p. 38).
  'familiar aprimorado': { kind: 'variant', label: 'Segundo benefício', match: key => BASIC_FAMILIARS.test(key), book: 'Heróis de Arton', keepVisible: true },
  // Distinção Mestre de Armearia (Guia de NPCs e DBs): uma inovação por arma; as inovações não são poderes avulsos.
  'inovacao tecnologica': { kind: 'variant', label: 'Inovação', match: key => /^inovacao: /.test(key), hideAlways: true },
  'especialista em escola': { kind: 'options', label: 'Escola de magia', options: Object.values(SPELL_SCHOOLS) },
  'mestre em escola': { kind: 'options', label: 'Escola de magia', options: Object.values(SPELL_SCHOOLS) },
  'totem espiritual': { kind: 'options', label: 'Animal totêmico', options: ['Coruja', 'Corvo', 'Falcão', 'Grifo', 'Lobo', 'Raposa', 'Tartaruga', 'Urso'] },
  'inimigo de (criatura)': { kind: 'options', label: 'Inimigo de', options: ['Animais', 'Construtos', 'Espíritos', 'Monstros', 'Mortos-vivos', 'Duas raças humanoides'], distinct: true },
  'proficiencia': { kind: 'options', label: 'Proficiência', options: ['Armas marciais', 'Armas de fogo', 'Armaduras pesadas', 'Escudos', 'Armas exóticas'], distinct: true },
  'foco em pericia': { kind: 'skill', label: 'Perícia', exclude: ['luta', 'pont'], distinct: true },
  'foco em arma': { kind: 'weapon', label: 'Arma', distinct: true },
  'especializacao em arma': { kind: 'weapon', label: 'Arma', distinct: true },
  'mestre em arma': { kind: 'weapon', label: 'Arma', distinct: true }
});

/** Especificação da escolha do poder (ou null). */
export const powerChoice = power => (power ? POWER_CHOICES[fold(power.name)] ?? null : null);

/**
 * Opções da escolha: [{ value, label }].
 * @param {object} spec
 * @param {{powers:Array, gear?:Array}} idx  índice do Planejador
 * @param {Record<string,string>} labels    rótulos de perícia
 */
export function powerChoiceOptions(spec, idx, labels = {}) {
  if (!spec) return [];
  if (spec.kind === 'variant') {
    const seen = new Set();
    return idx.powers.filter(p => spec.match(p.key) && !seen.has(p.key) && seen.add(p.key))
      .map(p => ({ value: p.uuid, label: familiarLabel(p.name).replace(/^Inova[çc][ãa]o:\s*/i, ''), book: p.packLabel ?? '' }))
      .sort((a, b) => (BASIC_FAMILIARS.test(fold(idx.powerByUuid?.get(b.value)?.name ?? '')) - BASIC_FAMILIARS.test(fold(idx.powerByUuid?.get(a.value)?.name ?? ''))) || a.label.localeCompare(b.label, 'pt-BR'));
  }
  if (spec.kind === 'options') return spec.options.map(o => ({ value: o, label: o }));
  if (spec.kind === 'skill') return Object.entries(labels).filter(([k]) => !(spec.exclude ?? []).includes(k)).map(([k, l]) => ({ value: k, label: l }));
  if (spec.kind === 'weapon') {
    const seen = new Set();
    return (idx.gear ?? []).filter(g => g.type === 'arma' && g.core && !seen.has(g.key) && seen.add(g.key))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(g => ({ value: g.name, label: g.name }));
  }
  return [];
}

/** Texto da escolha para mostrar e gravar na ficha. */
export function powerChoiceLabel(spec, value, idx, labels = {}) {
  if (!spec || !value) return '';
  if (spec.kind === 'variant') return idx.powerByUuid?.get(value)?.name ?? '';
  if (spec.kind === 'skill') return labels[value] ?? value;
  return String(value);
}

/** Variantes que só fazem sentido pela escolha do poder base (somem da lista de poderes). */
export function isChoiceVariant(power, pool) {
  return Object.entries(POWER_CHOICES).some(([base, spec]) => spec.kind === 'variant' && !spec.keepVisible && spec.match(power.key) && (spec.hideAlways || pool.some(p => p.key === base)));
}
