/**
 * Testes de perícia montados pelo Toolkit (Usurpador, Engenhocas). Funções puras.
 * - Perícias substitutas lidas do texto dos poderes ("use X no lugar de <perícia>").
 * - Bônus escritos no texto dos poderes ("+2 em <perícia>"), para a pessoa marcar.
 * - Partes do teste, fórmula, bônus fixo, chance e "escolher 0".
 *
 * "Escolher 0" (regra da mesa): o resultado é só o bônus, sem acerto crítico nem falha crítica.
 * É opcional e só aparece quando o bônus já alcança a CD (sucesso garantido).
 */

const foldTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Nome de perícia comparável: "Ofício: Artesão" e "Ofício (artesão)" viram "oficio artesao". */
const skillTxt = s => foldTxt(s).replace(/[():]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Poderes da ficha que deixam usar outra perícia no lugar da perícia do teste (lido do texto do poder).
 * `powers`: [{ name, description }]; `skills`: [{ key, label }].
 * `key`: a perícia do teste; `pattern`: trecho de regex que casa o nome dela no texto (ex.: 'engana[cç][aã]o'; pode ter alternativas com |).
 * Devolve [{ key, label, source }].
 */
export function skillSubstitutes(powers = [], skills = [], { key, pattern }) {
  const res = [
    new RegExp(`(?:usar|use|utilizar|utiliza|usa)\\s+(?:a\\s+per[ií]cia\\s+)?([^.;:,]+?)\\s+(?:no lugar de|em vez de|ao inv[eé]s de)\\s+(?:testes?\\s+de\\s+)?(?:${pattern})`, 'i'),
    new RegExp(`substitu\\w*\\s+(?:o\\s+|seus?\\s+)?(?:testes?\\s+de\\s+)?(?:${pattern})\\s+por\\s+(?:um\\s+teste\\s+de\\s+)?([^.;:,]+)`, 'i')
  ];
  const out = [];
  for (const p of powers) {
    const text = String(p.description ?? '');
    for (const re of res) {
      const m = text.match(re);
      if (!m) continue;
      const said = skillTxt(m[1]);
      const skill = skills.filter(s => s.key !== key && said.includes(skillTxt(s.label))).sort((a, b) => b.label.length - a.label.length)[0];
      if (skill && !out.some(o => o.key === skill.key && o.source === p.name)) out.push({ key: skill.key, label: skill.label, source: p.name });
    }
  }
  return out;
}

/**
 * Bônus na perícia escritos no texto de poderes ("+2 em Enganação e Intuição").
 * Não dá para saber se é sempre ou só em certas situações: a janela mostra para a pessoa marcar.
 * `powers`: [{ name, description, uuid, onSheet }] (onSheet = o próprio item já soma na perícia).
 * `skillLabel`: o nome que aparece no texto (comparado sem acento e sem maiúsculas).
 */
export function textBonuses(powers = [], skillLabel) {
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
export function testParts({ skillLabel = 'Perícia', skillValue = 0, armorPenalty = 0, holySymbol = false, extras = [] } = {}) {
  const parts = [{ label: skillLabel, value: Number(skillValue) || 0 }];
  const pda = Math.min(0, Number(armorPenalty) || 0);
  if (pda) parts.push({ label: 'Penalidade de armadura', value: pda });
  if (holySymbol) parts.push({ label: 'Símbolo sagrado visível', value: -5 });
  for (const e of extras) if (e && e.value !== 0 && e.value !== '' && e.value !== undefined) parts.push(e);
  return parts;
}

const isNumeric = v => typeof v === 'number' || /^[+-]?\d+$/.test(String(v).trim());

/** Soma só a parte numérica (para a chance); dados entram na fórmula. */
export const fixedBonus = parts => parts.reduce((s, p) => s + (typeof p.value === 'number' ? p.value : (isNumeric(p.value) ? Number(p.value) : 0)), 0);

/** Todas as partes são números (sem dados)? */
export const allFixed = parts => parts.every(p => isNumeric(p.value));

export function testFormula(parts) {
  return ['1d20', ...parts.map(p => {
    const v = String(p.value).trim();
    return /^-/.test(v) ? `- ${v.slice(1)}` : `+ ${v.replace(/^\+/, '')}`;
  })].join(' ');
}

/** Chance (%) de tirar `dc` ou mais no d20 + bônus. */
export const chanceOf = (dc, bonus) => Math.max(0, Math.min(20, 21 - (dc - bonus))) * 5;

/** "Escolher 0" só vale quando o bônus é fixo e já alcança a CD. */
export const canChooseZero = (dc, parts) => allFixed(parts) && fixedBonus(parts) >= dc;
