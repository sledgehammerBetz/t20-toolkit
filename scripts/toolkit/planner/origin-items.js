/**
 * Itens de origem (Tormenta20 JdA, cap. 1) ligados aos itens do compêndio de equipamentos do sistema.
 * Tipos de entrada:
 *  { item: 'Nome', qty }                         → cria o item do compêndio
 *  { choose: [opção...], label }                 → o jogador escolhe uma opção (item ou arma)
 *  { weapon: { prof: [...], proposito: [...] } } → o jogador escolhe uma arma do compêndio que se encaixe
 *  { money: '2d6' }                              → rola e soma em T$
 *  { note: 'texto' }                             → não há item: fica no chat para o mestre aprovar
 * prof: simples | marcial | exotica | fogo · proposito: corpo-a-corpo | arremesso | disparo
 */
import { fold } from '../core/t20.js';

const W = (label, prof, proposito) => ({ weapon: { prof, proposito }, label });
const MELEE = ['corpo-a-corpo', 'corpo-a-corpo-arremesso'];
const RANGED = ['disparo', 'arremesso', 'corpo-a-corpo-arremesso'];

export const ORIGIN_ITEMS = Object.freeze({
  'Acólito': [{ item: 'Símbolo Sagrado' }, { item: 'Traje de sacerdote' }],
  'Amigo dos Animais': [{ note: 'Cão de caça, cavalo, pônei ou trobo (escolha um).' }],
  'Amnésico': [{ note: 'Um ou mais itens (somando até T$ 500), aprovados pelo mestre, que podem ser uma pista misteriosa do seu passado.' }],
  'Aristocrata': [{ item: 'Joia de família' }, { item: 'Traje da corte' }],
  'Artesão': [{ item: 'Instrumentos de Ofício' }, { note: 'Um item que você possa fabricar de até T$ 50.' }],
  'Artista': [{ choose: [{ item: 'Estojo de Disfarces' }, { item: 'Instrumento Musical' }], label: 'Estojo de disfarces ou instrumento musical' }],
  'Assistente de Laboratório': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (alquimista)' }],
  'Batedor': [{ item: 'Barraca' }, { item: 'Equipamento de Viagem' }, W('Arma simples ou marcial de ataque à distância', ['simples', 'marcial'], RANGED)],
  'Capanga': [{ item: 'Tatuagem', label: 'Tatuagem ou adereço da gangue (+1 em Intimidação)' }, W('Arma simples corpo a corpo', ['simples'], MELEE)],
  'Charlatão': [{ item: 'Estojo de Disfarces' }, { item: 'Joia falsificada' }],
  'Circense': [{ item: 'Três bolas coloridas para malabarismo' }],
  'Criminoso': [{ choose: [{ item: 'Estojo de Disfarces' }, { item: 'Gazua' }], label: 'Estojo de disfarces ou gazua' }],
  'Curandeiro': [{ item: 'Bálsamo restaurador', qty: 2 }, { item: 'Maleta de Medicamentos' }],
  'Eremita': [{ item: 'Barraca' }, { item: 'Equipamento de Viagem' }],
  'Escravo': [{ item: 'Algemas' }, { item: 'Ferramenta pesada' }],
  'Estudioso': [{ item: 'Coleção de Livros', label: 'Coleção de livros (+1 em Conhecimento, Guerra, Misticismo ou Nobreza)' }],
  'Fazendeiro': [{ item: 'Carroça' }, { item: 'Ferramenta agrícola' }, { item: 'Ração de viagem', qty: 10 }, { item: 'Animal Comum' }],
  'Forasteiro': [{ item: 'Equipamento de Viagem' }, { item: 'Instrumento musical exótico' }, { item: 'Traje estrangeiro' }],
  'Gladiador': [W('Arma marcial ou exótica', ['marcial', 'exotica'], null), { item: 'Item Admirador' }],
  'Guarda': [{ item: 'Apito' }, { item: 'Insígnia de milícia' }, W('Arma marcial', ['marcial'], null)],
  'Herdeiro': [{ choose: [{ item: 'Anel de sinete' }, { item: 'Manto cerimonial' }], label: 'Símbolo da sua herança' }],
  'Herói Camponês': [{ choose: [{ item: 'Instrumentos de Ofício' }, W('Arma simples', ['simples'], null)], label: 'Instrumentos de ofício ou arma simples' }, { item: 'Andrajos de Aldeão', label: 'Traje de plebeu (Andrajos de Aldeão)' }],
  'Marujo': [{ money: '2d6', label: 'T$ 2d6 (seu último salário)' }, { item: 'Corda (10m)' }],
  'Mateiro': [{ item: 'Arco curto' }, { item: 'Barraca' }, { item: 'Equipamento de Viagem' }, { item: 'Flechas', qty: 20 }],
  'Membro de Guilda': [{ choose: [{ item: 'Gazua' }, { item: 'Instrumentos de Ofício' }], label: 'Gazua ou instrumentos de ofício' }],
  'Mercador': [{ item: 'Carroça' }, { note: 'Trobo (animal de carga).' }, { note: 'Mercadorias para vender no valor de T$ 100.' }],
  'Minerador': [{ item: 'Gemas preciosas' }, { item: 'Picareta' }],
  'Nômade': [{ item: 'Bordão' }, { item: 'Equipamento de Viagem' }],
  'Pivete': [{ item: 'Gazua' }, { item: 'Andrajos de Aldeão', label: 'Traje de plebeu (Andrajos de Aldeão)' }, { item: 'Animal Urbano' }],
  'Refugiado': [{ item: 'Item estrangeiro' }],
  'Seguidor': [{ note: 'Um item recebido de seu mestre de até T$ 100.' }],
  'Selvagem': [W('Arma simples', ['simples'], null), { item: 'Animal de Estimação' }],
  'Soldado': [W('Arma marcial', ['marcial'], null), { item: 'Uniforme militar' }, { item: 'Insígnia do exército' }],
  'Taverneiro': [{ choose: [{ item: 'Rolo de macarrão' }, { item: 'Martelo de carne' }], label: 'Rolo de macarrão ou martelo de carne' }, { item: 'Panela' }, { item: 'Avental' }, { item: 'Caneca' }, { item: 'Pano sujo' }],
  'Trabalhador': [{ item: 'Ferramenta pesada', label: 'Ferramenta pesada (estatísticas de maça ou lança)' }],
  // Heróis de Arton — novas origens
  'Bacharel': [{ item: 'Tabardo', label: 'Tabardo com o símbolo de Khalmyr' }, { item: 'Coleção de Livros' }],
  'Boticário': [{ item: 'Bálsamo restaurador' }, { item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (alquimista)' }, { item: 'Maleta de Medicamentos' }],
  'Carcereiro': [{ item: 'Algemas' }, { item: 'Lampião' }, { note: 'Uma arma de até T$ 500 a sua escolha (talvez de um antigo detento).' }],
  'Carpinteiro de Guilda': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (carpinteiro)' }, { note: 'Uma arma de corte a sua escolha.' }],
  'Catador da Catástrofe': [{ note: 'Dois equipamentos de aventura de até T$ 150 cada a sua escolha.' }],
  'Caçador de Ratos': [{ item: 'Clava' }, { note: 'Um gato (parceiro perseguidor iniciante).' }, { money: '50', label: 'T$ 50 (recompensa da última caçada)' }],
  'Chef Hynne': [{ item: 'Foice', label: 'Cutelo (estatísticas de uma foice)' }, { item: 'Instrumentos de Ofício', label: 'Instrumentos de cozinheiro aprimorados' }],
  'Cirurgião-Barbeiro': [{ note: 'Dente falso.' }, { item: 'Instrumentos de Ofício', label: 'Instrumentos de barbeiro' }, { item: 'Maleta de Medicamentos' }],
  'Citadino Abastado': [{ note: 'Uma arma, armadura, ferramenta ou vestuário de até T$ 500.' }],
  'Cocheiro': [{ note: 'Cavalo ou trobo.' }, { item: 'Carroça' }],
  'Construtor': [{ choose: [{ item: 'Instrumentos de Ofício' }, { item: 'Ferramenta pesada' }], label: 'Instrumentos de pedreiro ou ferramenta pesada' }],
  'Contrabandista': [{ note: 'Uma arma de fogo, ou 10 doses de venenos, com preço total de até T$ 500.' }],
  'Coureiro': [{ item: 'Adaga', label: 'Faca de corte (adaga com dano de corte)' }, { item: 'Instrumentos de Ofício', label: 'Instrumentos de coureiro' }, { note: 'T$ 100 em itens alquímicos.' }],
  'Cão de Briga': [{ choose: [{ item: 'Manopla' }, W('Arma marcial', ['marcial'], null)], label: 'Manoplas ou uma arma marcial' }],
  'Escriba': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de escriba' }, { item: 'Organizador de Pergaminhos' }, { item: 'Coleção de Livros' }],
  'Espião': [{ item: 'Estojo de Disfarces' }, { item: 'Gazua' }, { item: 'Luneta' }, { item: 'Cosmético', qty: 3 }],
  'Ferreiro Militar': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de armeiro' }, { note: 'Martelo leve.' }],
  'Freira': [{ item: 'Maleta de Medicamentos' }, { item: 'Manto Eclesiástico' }, { item: 'Símbolo Sagrado' }],
  'Goradista': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de cozinheiro' }, { note: 'T$ 36 em ingredientes para gorad quente.' }],
  'Insciente': [{ note: 'Uma arma simples ou ferramenta a sua escolha de até T$ 100.' }],
  'Interrogador': [{ note: 'Um ou mais itens somando T$ 100 que pertenciam a antigos interrogados.' }],
  'Ladrão de Túmulos': [{ item: 'Lança', label: 'Pá (estatísticas de uma lança)' }, { item: 'Pé de cabra' }],
  'Menestrel': [{ item: 'Instrumento Musical' }],
  'Mensageiro': [{ note: 'Cavalo.' }, { item: 'Sela' }, { item: 'Mochila de Aventureiro' }, { item: 'Traje de viajante' }],
  'Náufrago': [{ item: 'Arco curto' }, { item: 'Flechas', qty: 20 }, { note: 'Uma bola (ou objeto simples) com uma cara pintada e nome de gente.' }],
  'Padeiro': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (cozinheiro)' }, { item: 'Clava', label: 'Rolo de massa (estatísticas de uma clava)' }],
  'Pedinte': [{ item: 'Andrajos de Aldeão', label: 'Andrajos' }, { item: 'Bálsamo restaurador' }, { item: 'Essência de mana' }],
  'Pescador': [{ note: 'Bolsa cheia de minhocas.' }, { item: 'Instrumentos de Ofício', label: 'Instrumentos de pescador' }],
  'Servo': [{ item: 'Bordão', label: 'Balde e vassoura (estatísticas de um bordão)' }, { item: 'Tabardo', label: 'Tabardo de seu patrono' }],
  'Suporte de Tropas': [{ item: 'Equipamento de Viagem' }, { item: 'Instrumentos de Ofício' }, { item: 'Maleta de Medicamentos' }]
});

/** Texto dos itens de uma origem (para o chat e para a tela). */
export function originItemsText(origin) {
  return (ORIGIN_ITEMS[origin] ?? []).map(e => e.label ?? (e.item ? (e.qty > 1 ? `${e.item} ×${e.qty}` : e.item) : e.note ?? '')).join('; ');
}

/** A arma do índice encaixa na exigência? */
export function weaponFits(w, spec) {
  if (!w || w.type !== 'arma') return false;
  if (spec.prof?.length && !spec.prof.includes(w.prof)) return false;
  if (spec.proposito?.length && !spec.proposito.includes(w.proposito)) return false;
  return true;
}

/** Entradas que exigem escolha do jogador, com o id usado em cr.originItems. */
export function originItemChoices(origin) {
  return (ORIGIN_ITEMS[origin] ?? []).map((e, i) => ({ ...e, id: `i${i}` })).filter(e => e.choose || e.weapon);
}

/** Armas comuns para a escolha: sem itens mágicos nem ataques de criaturas, um por nome (sistema primeiro). */
export function weaponOptions(gear, spec) {
  const seen = new Set();
  return gear.filter(g => weaponFits(g, spec) && !/magic|habilidad|criatura|ameaca/i.test(g.pack ?? '')).filter(g => !seen.has(g.key) && seen.add(g.key));
}

/** Item do compêndio pelo nome (o do sistema primeiro). */
export function findGear(gear, name) {
  const k = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return gear.find(g => g.key === k) ?? null;
}
