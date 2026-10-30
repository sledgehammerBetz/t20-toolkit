/**
 * Itens de origem (Tormenta20 JdA, cap. 1; Heróis de Arton; Atlas de Arton) ligados aos itens do compêndio de equipamentos do sistema.
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
  'Suporte de Tropas': [{ item: 'Equipamento de Viagem' }, { item: 'Instrumentos de Ofício' }, { item: 'Maleta de Medicamentos' }],
  // Atlas de Arton — origens regionais (p. 470-479). Lupa, Treckod e os itens de Barão Arruinado, Catador e Cosmopolita
  // estão no compêndio atlas-de-arton do Suplementos de Arton; o gládio, no ameacas-de-arton.
  'Agricultor Sambur': [{ item: 'Ferramenta agrícola' }, { money: '100', label: 'T$ 100 (presente de despedida da família)' }],
  'Amazona de Hippion': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { note: 'Cavalo de guerra.' }],
  'Amoque Púrpura': [W('Arma simples', ['simples'], null), { note: 'Estandarte da sua tribo.' }],
  'Andarilho Ubaneri': [{ item: 'Escudo pesado' }, { item: 'Lança' }],
  'Anão de Armas': [{ note: 'Arma marcial tradicional anã (machado, martelo, marreta ou picareta).' }, { item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (armeiro)' }],
  'Aprendiz de Dragoeiro': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { note: 'Troféu de caça.' }, { item: 'Treckod' }],
  'Aprendiz de Drogadora': [{ item: 'Bálsamo restaurador', qty: 2 }, { item: 'Poção de Curar Ferimentos (2d8+2 PV)', qty: 2, label: 'Poção de curar ferimentos ×2' }, { item: 'Maleta de Medicamentos' }],
  'Aristocrata Dai’zenshi': [{ item: 'Traje da corte' }, { note: 'Katana superior com uma melhoria (exceto material especial).' }],
  'Armeiro Armado': [W('Arma marcial', ['marcial'], null), { item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (armeiro)' }],
  'Aspirante a herói': [{ item: 'Essência de mana' }, { item: 'Mochila de Aventureiro' }],
  'Assistente Forense': [{ item: 'Lupa', label: 'Lupa (+1 em Investigação)' }],
  'Bandoleiro da Fortaleza': [{ item: 'Adaga' }, { item: 'Gazua' }, { item: 'Manto Camuflado', label: 'Manto camuflado (urbano)' }],
  'Barão Arruinado': [{ item: 'Anel com símbolo da família' }, { item: 'Títulos de terras expirados' }, { item: 'Traje da corte' }],
  'Catador da Cidade Velha': [{ item: 'Luneta' }, { note: 'Luvas de pelica.' }, { item: 'Tranqueiras resgatadas do mar' }],
  'Cativo das Fadas': [{ item: 'Corda (10m)' }, { item: 'Ração de viagem', qty: 10 }, { item: 'Essência de mana' }],
  'Competidor do Circuito': [W('Arma marcial', ['marcial'], null), { money: '100', label: 'T$ 100 (economias para equipamentos de torneio)' }],
  'Cosmopolita': [{ item: 'Equipamento de Viagem' }, { item: 'Traje de viajante' }, { item: 'Item artístico de origem cultural indefinida' }],
  'Cria da Favela': [{ item: 'Andrajos de Aldeão' }, { item: 'Corda (10m)' }, { item: 'Vara de madeira (3m)' }],
  'Criado pelas Voracis': [W('Arma simples', ['simples'], null), { note: 'Armadura leve.' }, { item: 'Lança' }],
  'De Outro Mundo': [{ note: 'Trajes exóticos.' }, { note: 'Um item qualquer de até T$ 100 do seu mundo natal.' }],
  'Descendente colleniano': [W('Arma simples', ['simples'], null), { item: 'Estojo de Disfarces' }, { item: 'Ração de viagem', qty: 5 }],
  'Desertor da Supremacia': [{ item: 'Brunea', label: 'Brunea com símbolo purista raspado' }, { item: 'Escudo pesado' }, { item: 'Espada bastarda' }, { item: 'Ração de viagem', qty: 10 }],
  'Duplo Feérico': [{ item: 'Essência de mana' }, { note: 'Marca no corpo ou característica física que sua versão original não tem.' }],
  'Duyshidakk Infiltrado': [W('Arma marcial', ['marcial'], null), { note: 'Peças sobressalentes (T$ 100 para vender ou construir engenhocas).' }],
  'Emissário Ubaneri': [{ item: 'Essência de mana' }, { item: 'Mochila de Aventureiro' }],
  'Escudeiro da Luz': [{ choose: [{ item: 'Cota de malha' }, { item: 'Escudo pesado' }], label: 'Cota de malha ou escudo pesado' }, { note: 'Enfeite de elmo com o símbolo da Ordem da Luz.' }],
  'Escudeiro Solitário': [{ item: 'Cota de malha' }, { item: 'Escudo pesado' }, { note: 'Enfeite de elmo.' }],
  'Estandarte Vivo': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { item: 'Gibão de peles' }, { note: 'Fragmento do estandarte do seu povo (se vestido, +1 em Vontade).' }],
  'Estudante da Academia': [{ item: 'Coleção de Livros' }, { item: 'Essência de mana', qty: 2 }],
  'Estudante do Colégio Real': [{ item: 'Bálsamo restaurador', qty: 3 }, { item: 'Maleta de Medicamentos' }],
  'Explorador de Ruínas': [{ item: 'Mochila de Aventureiro' }, { item: 'Tocha' }, { item: 'Vara de madeira (3m)' }],
  'Filhote da Revoada': [{ item: 'Instrumentos de Ofício', label: 'Instrumentos de Ofício (artesão)' }, { money: '100', label: 'T$ 100 (para o seu primeiro veículo aéreo)' }],
  'Futura Lenda': [W('Arma simples ou marcial (com nome pomposo)', ['simples', 'marcial'], null), { item: 'Essência de mana', qty: 2 }],
  'Ginete de Tumarkhân': [{ item: 'Bálsamo restaurador' }, { item: 'Sela' }],
  'Grumete Pirata': [{ item: 'Adaga' }, { item: 'Corda (10m)' }, { item: 'Tatuagem', label: 'Tatuagem da antiga tripulação (+1 em Intimidação)' }],
  'Guardião Glacial': [{ item: 'Casaco Longo' }, { note: 'Cavalo glacial.' }],
  'Iniciado dos Caça-Monstros': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { item: 'Gibão de peles' }],
  'Insurgente Tapistano': [{ note: 'Amuleto com um símbolo da resistência, reconhecível por outros rebeldes.' }, W('Arma simples', ['simples'], null)],
  'Irmão sem Esporas': [{ item: 'Bálsamo restaurador' }, { item: 'Sela' }],
  'Legionário': [{ item: 'Brunea', label: 'Brunea com o símbolo da sua legião' }, { item: 'Escudo pesado' }, { item: 'Gládio' }, { item: 'Ração de viagem', qty: 10 }],
  'Lenhador de Tollon': [{ note: 'Item superior de madeira Tollon.' }],
  'Liricista de Lenórienn': [{ item: 'Alaúde Élfico' }, { note: 'Réplica de uma peça artística élfica (1 espaço, T$ 50).' }],
  'Membro do Principado': [{ item: 'Carroça' }, { note: 'Mercadorias sortidas (8 espaços, T$ 400).' }],
  'Nitamuraniano': [{ choose: [{ item: 'Arco longo' }, { item: 'Katana' }], label: 'Arco longo ou katana' }, { note: 'Camisa bufante ou traje de seda.' }],
  'Nobre Zakharoviano': [{ item: 'Traje da corte' }],
  'Nômade Sar-Allan': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { note: 'Corcel do deserto ou dromedário (Ameaças de Arton).' }, { item: 'Manto Camuflado', label: 'Manto camuflado (deserto)' }],
  'Pescador Parrudo': [{ note: 'Vara de pesca (pode usar Sobrevivência para sustento).' }, { note: 'Peixes raros salgados para revenda (1 espaço, T$ 50).' }],
  'Plebeu Arcano': [{ item: 'Bandoleira de Poções' }, { item: 'Gorro de Ervas' }, { note: 'Poção arcana de 1º círculo.' }],
  'Prisioneiro das Catacumbas': [W('Arma marcial (encontrada nas Catacumbas)', ['marcial'], null)],
  'Procurado: Vivo ou Morto': [{ item: 'Pistola' }, { item: 'Balas', qty: 20, label: 'Balas cruéis ×20' }],
  'Profeta do Akzath': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { item: 'Bordão' }, { note: 'Pergaminho com diagrama do Akzath.' }],
  'Querido Filho': [{ item: 'Essência de Sombra' }, { item: 'Manto Camuflado', label: 'Manto camuflado (urbano)' }],
  'Rebelde Agitador': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { note: 'Panfleto revolucionário.' }, { money: '6d12', label: 'T$ 6d12 (impostos que você deixou de pagar)' }],
  'Receptador das Nuvens': [{ note: 'Mercadorias raras e variadas (2 espaços, T$ 300).' }],
  'Recruta Arcano': [{ item: 'Essência de mana', qty: 2 }, { item: 'Varinha Arcana' }],
  'Recruta da Fênix': [W('Arma marcial', ['marcial'], null), { item: 'Brunea' }, { note: 'Grifo (parceiro iniciante).' }],
  'Sábio Matemático': [{ item: 'Coleção de Livros' }, { item: 'Luneta' }],
  'Selvagem Sanguinário': [W('Arma marcial', ['marcial'], null), { item: 'Gibão de peles' }],
  'Sucateiro de Batalhas': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { item: 'Bálsamo restaurador' }, { choose: [{ item: 'Escudo leve' }, { item: 'Escudo pesado' }], label: 'Escudo leve ou pesado' }, { item: 'Essência de mana' }, { item: 'Ração de viagem', qty: 5 }, { money: '4d6', label: 'T$ 4d6' }],
  'Tamalu': [{ item: 'Traje da corte' }],
  'Tocado pela Dama Altiva': [{ item: 'Bordão' }, { item: 'Ração de viagem', qty: 5 }],
  'Tocado pelo Indomável': [{ note: 'Trapos surrados.' }, { item: 'Gibão de peles', label: 'Carcaça de couro de um animal caçado por você (conta como gibão de peles)' }],
  'Tradicionalista Svalano': [W('Arma simples ou marcial', ['simples', 'marcial'], null), { item: 'Corda (10m)' }, { item: 'Mochila de Aventureiro' }, { item: 'Vara de madeira (3m)' }],
  'Trapaceiro Ahleniense': [{ item: 'Essência de Sombra' }, { item: 'Gazua' }, { item: 'Estojo de Disfarces' }],
  'Turista da Academia': [{ note: 'Três pergaminhos de magias arcanas de 1º círculo a sua escolha.' }],
  'Um com os Kami': [{ item: 'Bálsamo restaurador' }, { item: 'Essência de mana' }]
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
