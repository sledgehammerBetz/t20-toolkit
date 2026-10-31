import { fold, escapeHtml } from '../core/t20.js';

/** Origens: 35 do Tormenta20 JdA (escolha 2 benefícios) e 30 de Heróis de Arton (cap. 1, "Novas origens":
 * benefício fixo = o poder de origem com o mesmo nome + as perícias em `fixed.skills`). */
const BASE_ORIGINS = [
 {
  "name": "Acólito",
  "skills": [
   "Cura",
   "Religião",
   "Vontade"
  ],
  "powers": [
   "Medicina",
   "Membro da Igreja",
   "Vontade de Ferro"
  ],
  "items": "Símbolo sagrado, traje de sacerdote.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Amigo dos Animais",
  "skills": [
   "Adestramento",
   "Cavalgar"
  ],
  "powers": [
   "Amigo Especial"
  ],
  "items": "Cão de caça, cavalo, pônei ou trobo (escolha um).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Amnésico",
  "skills": [],
  "powers": [
   "Lembranças Graduais"
  ],
  "items": "Um ou mais itens (somando até T$ 500), aprovados pelo mestre, que podem ser uma pista misteriosa do seu passado.",
  "special": "Uma perícia e um poder escolhidos pelo mestre e o poder Lembranças Graduais",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Aristocrata",
  "skills": [
   "Diplomacia",
   "Enganação",
   "Nobreza"
  ],
  "powers": [
   "Comandar",
   "Sangue Azul"
  ],
  "items": "Joia de família no valor de T$ 300, traje da corte.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Artesão",
  "skills": [
   "Ofício",
   "Vontade"
  ],
  "powers": [
   "Frutos do Trabalho",
   "Sortudo"
  ],
  "items": "Instrumentos de ofício (qualquer), um item que você possa fabricar de até T$ 50.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Artista",
  "skills": [
   "Atuação",
   "Enganação"
  ],
  "powers": [
   "Atraente",
   "Dom Artístico",
   "Sortudo",
   "Torcida"
  ],
  "items": "Estojo de disfarces ou um instrumento musical a sua escolha.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Assistente de Laboratório",
  "skills": [
   "Ofício (alquimista)",
   "Misticismo"
  ],
  "powers": [
   "Esse Cheiro...",
   "Venefício",
   "um poder da Tormenta a sua escolha"
  ],
  "items": "Instrumentos de Ofício (alquimista).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Batedor",
  "skills": [
   "Furtividade",
   "Percepção",
   "Sobrevivência"
  ],
  "powers": [
   "À Prova de Tudo",
   "Estilo de Disparo",
   "Sentidos Aguçados"
  ],
  "items": "Barraca, equipamento de viagem, uma arma simples ou marcial de ataque à distância.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Capanga",
  "skills": [
   "Luta",
   "Intimidação"
  ],
  "powers": [
   "Confissão",
   "um poder de combate a sua escolha"
  ],
  "items": "Tatuagem ou outro adereço de sua gangue (+1 em Intimidação), uma arma simples corpo a corpo.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Charlatão",
  "skills": [
   "Enganação",
   "Jogatina"
  ],
  "powers": [
   "Alpinista Social",
   "Aparência Inofensiva",
   "Sortudo"
  ],
  "items": "Estojo de disfarces, joia falsificada (valor aparente de T$ 100, sem valor real).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Circense",
  "skills": [
   "Acrobacia",
   "Atuação",
   "Reflexos"
  ],
  "powers": [
   "Acrobático",
   "Torcida",
   "Truque de Mágica"
  ],
  "items": "Três bolas coloridas para malabarismo (+1 em Atuação).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Criminoso",
  "skills": [
   "Enganação",
   "Furtividade",
   "Ladinagem"
  ],
  "powers": [
   "Punguista",
   "Venefício"
  ],
  "items": "Estojo de disfarces ou gazua.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Curandeiro",
  "skills": [
   "Cura",
   "Vontade"
  ],
  "powers": [
   "Medicina",
   "Médico de Campo",
   "Venefício"
  ],
  "items": "Bálsamo restaurador x2, maleta de medicamentos.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Eremita",
  "skills": [
   "Misticismo",
   "Religião",
   "Sobrevivência"
  ],
  "powers": [
   "Busca Interior",
   "Lobo Solitário"
  ],
  "items": "Barraca, equipamento de viagem.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Escravo",
  "skills": [
   "Atletismo",
   "Fortitude",
   "Furtividade"
  ],
  "powers": [
   "Desejo de Liberdade",
   "Vitalidade"
  ],
  "items": "Algemas, uma ferramenta pesada (mesmas estatísticas de uma maça).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Estudioso",
  "skills": [
   "Conhecimento",
   "Guerra",
   "Misticismo"
  ],
  "powers": [
   "Aparência Inofensiva",
   "Palpite Fundamentado"
  ],
  "items": "Coleção de livros (+1 em Conhecimento, Guerra, Misticismo ou Nobreza, a sua escolha).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Fazendeiro",
  "skills": [
   "Adestramento",
   "Cavalgar",
   "Ofício",
   "Sobrevivência"
  ],
  "powers": [
   "Água no Feijão",
   "Ginete"
  ],
  "items": "Carroça, uma ferramenta agrícola (mesmas estatísticas de uma lança), 10 rações de viagem, um animal não combativo (como uma galinha, porco ou ovelha).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Forasteiro",
  "skills": [
   "Cavalgar",
   "Pilotagem",
   "Sobrevivência"
  ],
  "powers": [
   "Cultura Exótica",
   "Lobo Solitário"
  ],
  "items": "Equipamento de viagem, instrumento musical exótico (+1 em uma perícia de Carisma aprovada pelo mestre), traje estrangeiro.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Gladiador",
  "skills": [
   "Atuação",
   "Luta"
  ],
  "powers": [
   "Atraente",
   "Pão e Circo",
   "Torcida",
   "um poder de combate a sua escolha"
  ],
  "items": "Uma arma marcial ou exótica, um item sem valor recebido de um admirador.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Guarda",
  "skills": [
   "Investigação",
   "Luta",
   "Percepção"
  ],
  "powers": [
   "Detetive",
   "Investigador",
   "um poder de combate a sua escolha"
  ],
  "items": "Apito, insígnia da milícia, uma arma marcial.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Herdeiro",
  "skills": [
   "Misticismo",
   "Nobreza",
   "Ofício"
  ],
  "powers": [
   "Comandar",
   "Herança"
  ],
  "items": "Um símbolo de sua herança, como um anel de sinete ou manto cerimonial.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Herói Camponês",
  "skills": [
   "Adestramento",
   "Ofício"
  ],
  "powers": [
   "Coração Heroico",
   "Sortudo",
   "Surto Heroico",
   "Torcida"
  ],
  "items": "Instrumentos de ofício ou uma arma simples, traje de plebeu.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Marujo",
  "skills": [
   "Atletismo",
   "Jogatina",
   "Pilotagem"
  ],
  "powers": [
   "Acrobático",
   "Passagem de Navio"
  ],
  "items": "T$ 2d6 (seu último salário), corda.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Mateiro",
  "skills": [
   "Atletismo",
   "Furtividade",
   "Sobrevivência"
  ],
  "powers": [
   "Lobo Solitário",
   "Sentidos Aguçados",
   "Vendedor de Carcaças"
  ],
  "items": "Arco curto, barraca, equipamento de viagem, 20 flechas.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Membro de Guilda",
  "skills": [
   "Diplomacia",
   "Enganação",
   "Misticismo",
   "Ofício"
  ],
  "powers": [
   "Foco em Perícia",
   "Rede de Contatos"
  ],
  "items": "Gazua ou instrumentos de ofício.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Mercador",
  "skills": [
   "Diplomacia",
   "Intuição",
   "Ofício"
  ],
  "powers": [
   "Negociação",
   "Proficiência",
   "Sortudo"
  ],
  "items": "Carroça, trobo, mercadorias para vender no valor de T$ 100.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Minerador",
  "skills": [
   "Atletismo",
   "Fortitude",
   "Ofício (minerador)"
  ],
  "powers": [
   "Ataque Poderoso",
   "Escavador",
   "Sentidos Aguçados"
  ],
  "items": "Gemas preciosas no valor de T$ 100, picareta.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Nômade",
  "skills": [
   "Cavalgar",
   "Pilotagem",
   "Sobrevivência"
  ],
  "powers": [
   "Lobo Solitário",
   "Mochileiro",
   "Sentidos Aguçados"
  ],
  "items": "Bordão, equipamento de viagem.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Pivete",
  "skills": [
   "Furtividade",
   "Iniciativa",
   "Ladinagem"
  ],
  "powers": [
   "Acrobático",
   "Aparência Inofensiva",
   "Quebra-Galho"
  ],
  "items": "Gazua, traje de plebeu, um animal urbano (como um cão, gato, rato ou pombo).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Refugiado",
  "skills": [
   "Fortitude",
   "Reflexos",
   "Vontade"
  ],
  "powers": [
   "Estoico",
   "Vontade de Ferro"
  ],
  "items": "Um item estrangeiro de até T$ 100.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Seguidor",
  "skills": [
   "Adestramento",
   "Ofício"
  ],
  "powers": [
   "Antigo Mestre",
   "Proficiência",
   "Surto Heroico"
  ],
  "items": "Um item recebido de seu mestre de até T$ 100.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Selvagem",
  "skills": [
   "Percepção",
   "Reflexos",
   "Sobrevivência"
  ],
  "powers": [
   "Lobo Solitário",
   "Vida Rústica",
   "Vitalidade"
  ],
  "items": "Uma arma simples, um pequeno animal de estimação como um pássaro ou esquilo.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Soldado",
  "skills": [
   "Fortitude",
   "Guerra",
   "Luta",
   "Pontaria"
  ],
  "powers": [
   "Influência Militar",
   "um poder de combate a sua escolha"
  ],
  "items": "Uma arma marcial, um uniforme militar, uma insígnia de seu exército.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Taverneiro",
  "skills": [
   "Diplomacia",
   "Jogatina",
   "Ofício (cozinheiro)"
  ],
  "powers": [
   "Gororoba",
   "Proficiência",
   "Vitalidade"
  ],
  "items": "Rolo de macarrão ou martelo de carne (mesmas estatísticas de uma clava), uma panela, um avental, uma caneca e um pano sujo.",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Trabalhador",
  "skills": [
   "Atletismo",
   "Fortitude"
  ],
  "powers": [
   "Atlético",
   "Esforçado"
  ],
  "items": "Uma ferramenta pesada (mesmas estatísticas de uma maça ou lança, a sua escolha).",
  "source": "Tormenta20 JdA"
 },
 {
  "name": "Bacharel",
  "skills": [],
  "powers": [
   "Bacharel"
  ],
  "items": "Tabardo com o símbolo de Khalmyr, uma coleção de livros a sua escolha.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Bacharel",
   "skills": [
    "Conhecimento",
    "Diplomacia",
    "Nobreza"
   ]
  }
 },
 {
  "name": "Boticário",
  "skills": [],
  "powers": [
   "Boticário"
  ],
  "items": "Bálsamo restaurador, instrumentos de Ofício (alquimista), maleta de medicamentos.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Boticário",
   "skills": [
    "Cura",
    "Ofício (alquimista)"
   ]
  }
 },
 {
  "name": "Carcereiro",
  "skills": [],
  "powers": [
   "Carcereiro"
  ],
  "items": "Algemas, lampião, uma arma de até T$ 500 a sua escolha.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Carcereiro",
   "skills": []
  }
 },
 {
  "name": "Carpinteiro de Guilda",
  "skills": [],
  "powers": [
   "Carpinteiro de Guilda"
  ],
  "items": "Instrumentos de Ofício (carpinteiro), uma arma de corte a sua escolha.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Carpinteiro de Guilda",
   "skills": [
    "Ofício (artesão)"
   ]
  }
 },
 {
  "name": "Catador da Catástrofe",
  "skills": [],
  "powers": [
   "Catador da Catástrofe"
  ],
  "items": "Dois equipamentos de aventura de até T$ 150 cada a sua escolha.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Catador da Catástrofe",
   "skills": [
    "Fortitude",
    "Percepção"
   ]
  }
 },
 {
  "name": "Caçador de Ratos",
  "skills": [],
  "powers": [
   "Caçador de Ratos"
  ],
  "items": "Clava, um gato (parceiro perseguidor iniciante), T$ 50.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Caçador de Ratos",
   "skills": [
    "Furtividade",
    "Investigação",
    "Sobrevivência"
   ]
  }
 },
 {
  "name": "Chef Hynne",
  "skills": [],
  "powers": [
   "Chef Hynne"
  ],
  "items": "Cutelo (mesmas estatísticas de uma foice), instrumentos de cozinheiro aprimorados.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Chef Hynne",
   "skills": [
    "Ofício (cozinheiro)"
   ]
  }
 },
 {
  "name": "Cirurgião-Barbeiro",
  "skills": [],
  "powers": [
   "Cirurgião-Barbeiro"
  ],
  "items": "Dente falso, instrumentos de barbeiro, maleta de medicamentos.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Cirurgião-Barbeiro",
   "skills": [
    "Cura",
    "Ofício (barbeiro)"
   ]
  }
 },
 {
  "name": "Citadino Abastado",
  "skills": [],
  "powers": [
   "Citadino Abastado"
  ],
  "items": "Uma arma, armadura, ferramenta ou vestuário no valor de até T$ 500.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Citadino Abastado",
   "skills": [
    "Nobreza",
    "Ofício"
   ]
  }
 },
 {
  "name": "Cocheiro",
  "skills": [],
  "powers": [
   "Cocheiro"
  ],
  "items": "Cavalo ou trobo, carroça.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Cocheiro",
   "skills": [
    "Adestramento",
    "Pilotagem"
   ]
  }
 },
 {
  "name": "Construtor",
  "skills": [],
  "powers": [
   "Construtor"
  ],
  "items": "Instrumentos de pedreiro ou uma ferramenta pesada (estatísticas de maça ou lança).",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Construtor",
   "skills": [
    "Fortitude",
    "Ofício (pedreiro)"
   ]
  }
 },
 {
  "name": "Contrabandista",
  "skills": [],
  "powers": [
   "Contrabandista"
  ],
  "items": "Uma arma de fogo, ou 10 doses de venenos, com preço total de até T$ 500.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Contrabandista",
   "skills": [
    "Enganação",
    "Ladinagem"
   ]
  }
 },
 {
  "name": "Coureiro",
  "skills": [],
  "powers": [
   "Coureiro"
  ],
  "items": "Faca de corte (como uma adaga, com dano de corte), instrumentos de coureiro, T$ 100 em itens alquímicos.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Coureiro",
   "skills": [
    "Fortitude",
    "Ofício (coureiro)"
   ]
  }
 },
 {
  "name": "Cão de Briga",
  "skills": [],
  "powers": [
   "Cão de Briga"
  ],
  "items": "Manoplas ou uma arma marcial.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Cão de Briga",
   "skills": []
  }
 },
 {
  "name": "Escriba",
  "skills": [],
  "powers": [
   "Escriba"
  ],
  "items": "Instrumentos de escriba, organizador de pergaminhos, uma coleção de livros a sua escolha.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Escriba",
   "skills": [
    "Conhecimento",
    "Ofício (escriba)"
   ]
  }
 },
 {
  "name": "Espião",
  "skills": [],
  "powers": [
   "Espião"
  ],
  "items": "Estojo de disfarces, gazua, luneta, três doses de cosmético.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Espião",
   "skills": [
    "Enganação",
    "Ladinagem"
   ]
  }
 },
 {
  "name": "Ferreiro Militar",
  "skills": [],
  "powers": [
   "Ferreiro Militar"
  ],
  "items": "Instrumentos de armeiro, martelo leve.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Ferreiro Militar",
   "skills": [
    "Ofício (armeiro)"
   ]
  }
 },
 {
  "name": "Freira",
  "skills": [],
  "powers": [
   "Freira"
  ],
  "items": "Maleta de medicamentos, manto eclesiástico, símbolo sagrado.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Freira",
   "skills": [
    "Cura"
   ]
  }
 },
 {
  "name": "Goradista",
  "skills": [],
  "powers": [
   "Goradista"
  ],
  "items": "Instrumentos de cozinheiro, T$ 36 em ingredientes para gorad quente.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Goradista",
   "skills": [
    "Ofício (cozinheiro)"
   ]
  }
 },
 {
  "name": "Insciente",
  "skills": [],
  "powers": [
   "Insciente"
  ],
  "items": "Uma arma simples ou ferramenta a sua escolha de até T$ 100.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Insciente",
   "skills": [
    "Sobrevivência"
   ]
  }
 },
 {
  "name": "Interrogador",
  "skills": [],
  "powers": [
   "Interrogador"
  ],
  "items": "Um ou mais itens somando T$ 100 que pertenciam a antigos interrogados.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Interrogador",
   "skills": [
    "Intimidação",
    "Investigação"
   ]
  }
 },
 {
  "name": "Ladrão de Túmulos",
  "skills": [],
  "powers": [
   "Ladrão de Túmulos"
  ],
  "items": "Pá (mesmas estatísticas de uma lança), pé de cabra.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Ladrão de Túmulos",
   "skills": [
    "Ladinagem",
    "Sobrevivência"
   ]
  }
 },
 {
  "name": "Menestrel",
  "skills": [],
  "powers": [
   "Menestrel"
  ],
  "items": "Um instrumento musical de até T$ 35 a sua escolha.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Menestrel",
   "skills": [
    "Atuação"
   ]
  }
 },
 {
  "name": "Mensageiro",
  "skills": [],
  "powers": [
   "Mensageiro"
  ],
  "items": "Cavalo com sela, mochila de aventureiro, traje de viajante.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Mensageiro",
   "skills": []
  }
 },
 {
  "name": "Náufrago",
  "skills": [],
  "powers": [
   "Náufrago"
  ],
  "items": "Arco curto, 20 flechas, uma bola com uma cara pintada.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Náufrago",
   "skills": []
  }
 },
 {
  "name": "Padeiro",
  "skills": [],
  "powers": [
   "Padeiro"
  ],
  "items": "Instrumentos de Ofício (cozinheiro), rolo de massa (estatísticas de uma clava).",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Padeiro",
   "skills": [
    "Ofício (cozinheiro)"
   ]
  }
 },
 {
  "name": "Pedinte",
  "skills": [],
  "powers": [
   "Pedinte"
  ],
  "items": "Andrajos, esmolas guardadas (1 bálsamo restaurador e 1 essência de mana).",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Pedinte",
   "skills": []
  }
 },
 {
  "name": "Pescador",
  "skills": [],
  "powers": [
   "Pescador"
  ],
  "items": "Bolsa cheia de minhocas, instrumentos de pescador.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Pescador",
   "skills": [
    "Ofício (pescador)",
    "Sobrevivência"
   ]
  }
 },
 {
  "name": "Servo",
  "skills": [],
  "powers": [
   "Servo"
  ],
  "items": "Balde e vassoura (estatísticas de um bordão), tabardo de seu patrono.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Servo",
   "skills": [
    "Diplomacia",
    "Ofício (serviçal)"
   ]
  }
 },
 {
  "name": "Suporte de Tropas",
  "skills": [],
  "powers": [
   "Suporte de Tropas"
  ],
  "items": "Equipamento de viagem, instrumentos de ofício, maleta de medicamentos.",
  "source": "Heróis de Arton",
  "fixed": {
   "power": "Suporte de Tropas",
   "skills": []
  }
 }
];

/** Origens regionais do Atlas de Arton (p. 470-479, 66 origens): benefício único = o poder de origem com o mesmo nome
 * (as perícias treinadas citadas no poder ficam em `fixed.skills`). Região no `region`.
 * `text`: texto do livro para origens cujo poder não está no Suplementos de Arton (vira o poder na ficha). */
const ATLAS_ORIGINS = [
 {
  "name": "Agricultor Sambur",
  "region": "Sambúrdia",
  "skills": [
   "Adestramento",
   "Sobrevivência"
  ]
 },
 {
  "name": "Amazona de Hippion",
  "region": "Deheon, Namalkah",
  "skills": [
   "Cavalgar"
  ]
 },
 {
  "name": "Amoque Púrpura",
  "region": "Ermos Púrpuras",
  "skills": [
   "Intimidação"
  ]
 },
 {
  "name": "Andarilho Ubaneri",
  "region": "Ubani",
  "skills": []
 },
 {
  "name": "Anão de Armas",
  "region": "Doherimm",
  "skills": [
   "Ofício (armeiro)"
  ]
 },
 {
  "name": "Aprendiz de Dragoeiro",
  "region": "Sckharshantallas",
  "skills": []
 },
 {
  "name": "Aprendiz de Drogadora",
  "region": "Galrasia",
  "skills": [
   "Cura",
   "Ofício (alquimista)"
  ]
 },
 {
  "name": "Aristocrata Dai’zenshi",
  "region": "Tamu-ra",
  "skills": [
   "Nobreza"
  ]
 },
 {
  "name": "Armeiro Armado",
  "region": "Zakharov",
  "skills": [
   "Ofício (armeiro)"
  ]
 },
 {
  "name": "Aspirante a herói",
  "region": "Deheon",
  "skills": [],
  "note": "+1 em um atributo à sua escolha: ajuste na ficha."
 },
 {
  "name": "Assistente Forense",
  "region": "Salistick",
  "skills": [
   "Investigação"
  ]
 },
 {
  "name": "Bandoleiro da Fortaleza",
  "region": "Khalifor",
  "skills": [
   "Furtividade",
   "Intimidação"
  ]
 },
 {
  "name": "Barão Arruinado",
  "region": "Khalifor",
  "skills": [
   "Nobreza"
  ]
 },
 {
  "name": "Catador da Cidade Velha",
  "region": "Nova Malpetrim",
  "skills": [
   "Fortitude",
   "Percepção"
  ]
 },
 {
  "name": "Cativo das Fadas",
  "region": "Pondsmânia",
  "skills": []
 },
 {
  "name": "Competidor do Circuito",
  "region": "Trebuck",
  "skills": [],
  "note": "Também recebe o poder Torcida: adicione pela ficha."
 },
 {
  "name": "Cosmopolita",
  "region": "Valkaria",
  "skills": [],
  "note": "Escolha um poder geral ou de classe (com 2 níveis na classe) e adicione pela ficha."
 },
 {
  "name": "Cria da Favela",
  "region": "Valkaria",
  "skills": [],
  "note": "+1 em Constituição: ajuste na ficha."
 },
 {
  "name": "Criado pelas Voracis",
  "region": "Galrasia",
  "skills": []
 },
 {
  "name": "De Outro Mundo",
  "region": "Éter Divino",
  "skills": [],
  "note": "Escolha uma magia de 1º círculo e um atributo-chave (veja o poder)."
 },
 {
  "name": "Descendente colleniano",
  "region": "Ahlen",
  "skills": []
 },
 {
  "name": "Desertor da Supremacia",
  "region": "Supremacia Purista",
  "skills": [
   "Guerra"
  ],
  "page": 473,
  "text": "Você passou pelo treinamento padrão dos batalhões puristas e talvez tenha visto de perto as atrocidades desses vilões. Seja como for, decidiu que não podia ficar neutro frente à Supremacia. Benefício. Você é treinado em Guerra e recebe proficiência com espadas bastardas e escudos. Se estiver empunhando uma espada bastarda e um escudo pesado, recebe +2 em testes de ataque."
 },
 {
  "name": "Duplo Feérico",
  "region": "Pondsmânia",
  "skills": [],
  "note": "Escolha uma habilidade de 1º nível de outra classe (veja o poder)."
 },
 {
  "name": "Duyshidakk Infiltrado",
  "region": "Tyrondir",
  "skills": []
 },
 {
  "name": "Emissário Ubaneri",
  "region": "Ubani",
  "skills": []
 },
 {
  "name": "Escudeiro Solitário",
  "region": "Bielefeld",
  "skills": [
   "Enganação",
   "Ladinagem"
  ]
 },
 {
  "name": "Escudeiro da Luz",
  "region": "Bielefeld",
  "skills": [
   "Nobreza"
  ]
 },
 {
  "name": "Estandarte Vivo",
  "region": "Ermos Púrpuras",
  "skills": [],
  "note": "Escolha um poder de combate ou da Tormenta e adicione pela ficha."
 },
 {
  "name": "Estudante da Academia",
  "region": "Academia Arcana",
  "skills": [],
  "note": "Escolha uma magia arcana de 1º círculo e adicione pela ficha."
 },
 {
  "name": "Estudante do Colégio Real",
  "region": "Salistick",
  "skills": [
   "Cura"
  ]
 },
 {
  "name": "Explorador de Ruínas",
  "region": "Tyrondir",
  "skills": []
 },
 {
  "name": "Filhote da Revoada",
  "region": "Lamnor",
  "skills": [
   "Acrobacia",
   "Pilotagem"
  ]
 },
 {
  "name": "Futura Lenda",
  "region": "Nova Malpetrim",
  "skills": [],
  "note": "Escolha um poder da sua classe (de 2º nível) e adicione pela ficha."
 },
 {
  "name": "Ginete de Tumarkhân",
  "region": "Khubar",
  "skills": [
   "Cavalgar"
  ]
 },
 {
  "name": "Grumete Pirata",
  "region": "Três Mares",
  "skills": [
   "Acrobacia",
   "Atletismo",
   "Reflexos"
  ]
 },
 {
  "name": "Guardião Glacial",
  "region": "Uivantes",
  "skills": []
 },
 {
  "name": "Iniciado dos Caça-Monstros",
  "region": "Sanguinárias",
  "skills": []
 },
 {
  "name": "Insurgente Tapistano",
  "region": "Império de Tauron",
  "skills": []
 },
 {
  "name": "Irmão sem Esporas",
  "region": "Namalkah",
  "skills": []
 },
 {
  "name": "Legionário",
  "region": "Império de Tauron",
  "skills": [
   "Guerra"
  ]
 },
 {
  "name": "Lenhador de Tollon",
  "region": "Tollon",
  "skills": [
   "Ofício (artesão)"
  ]
 },
 {
  "name": "Liricista de Lenórienn",
  "region": "Lamnor",
  "skills": [
   "Atuação"
  ]
 },
 {
  "name": "Membro do Principado",
  "region": "Sambúrdia",
  "skills": [
   "Diplomacia",
   "Intuição"
  ]
 },
 {
  "name": "Nitamuraniano",
  "region": "Valkaria",
  "skills": []
 },
 {
  "name": "Nobre Zakharoviano",
  "region": "Zakharov",
  "skills": [
   "Ofício (armeiro)"
  ]
 },
 {
  "name": "Nômade Sar-Allan",
  "region": "Halak-Tûr",
  "skills": []
 },
 {
  "name": "Pescador Parrudo",
  "region": "Khubar",
  "skills": []
 },
 {
  "name": "Plebeu Arcano",
  "region": "Wynlla",
  "skills": []
 },
 {
  "name": "Prisioneiro das Catacumbas",
  "region": "Leverick",
  "skills": [
   "Percepção",
   "Reflexos"
  ]
 },
 {
  "name": "Procurado: Vivo ou Morto",
  "region": "Smokestone",
  "skills": []
 },
 {
  "name": "Profeta do Akzath",
  "region": "Lamnor",
  "skills": [
   "Religião"
  ]
 },
 {
  "name": "Querido Filho",
  "region": "Aslothia",
  "skills": []
 },
 {
  "name": "Rebelde Agitador",
  "region": "Sckharshantallas",
  "skills": [
   "Iniciativa"
  ]
 },
 {
  "name": "Receptador das Nuvens",
  "region": "Vectora",
  "skills": []
 },
 {
  "name": "Recruta Arcano",
  "region": "Wynlla",
  "skills": []
 },
 {
  "name": "Recruta da Fênix",
  "region": "Triunphus",
  "skills": [
   "Cavalgar"
  ]
 },
 {
  "name": "Selvagem Sanguinário",
  "region": "Sanguinárias",
  "skills": [
   "Sobrevivência"
  ]
 },
 {
  "name": "Sucateiro de Batalhas",
  "region": "Conflagração do Aço",
  "skills": [
   "Guerra",
   "Investigação"
  ]
 },
 {
  "name": "Sábio Matemático",
  "region": "Halak-Tûr",
  "skills": [
   "Conhecimento"
  ]
 },
 {
  "name": "Tamalu",
  "region": "Khubar",
  "skills": [
   "Diplomacia",
   "Nobreza"
  ],
  "note": "Escolha uma tatuagem mística (veja o poder)."
 },
 {
  "name": "Tocado pela Dama Altiva",
  "region": "Moreania",
  "skills": [
   "Adestramento"
  ]
 },
 {
  "name": "Tocado pelo Indomável",
  "region": "Moreania",
  "skills": [
   "Atletismo"
  ]
 },
 {
  "name": "Tradicionalista Svalano",
  "region": "Svalas",
  "skills": []
 },
 {
  "name": "Trapaceiro Ahleniense",
  "region": "Ahlen",
  "skills": []
 },
 {
  "name": "Turista da Academia",
  "region": "Academia Arcana",
  "skills": []
 },
 {
  "name": "Um com os Kami",
  "region": "Tamu-ra",
  "skills": []
 }
];

export const ORIGINS = Object.freeze([
  ...BASE_ORIGINS,
  ...ATLAS_ORIGINS.map(o => ({ name: o.name, skills: [], powers: [o.name], items: '', source: 'Atlas de Arton', region: o.region, note: o.note, text: o.text, page: o.page, fixed: { power: o.name, skills: o.skills } }))
]);

/** Poder citado na lista de uma origem: prefere o de origem ou geral (há homônimos em Habilidades de Criaturas e no Guia de NPCs). */
export function findOriginPower(powers, name) {
  const key = fold(name);
  return powers.find(p => p.key === key && (p.tipo === 'origem' || p.tipo === 'geral')) ?? powers.find(p => p.key === key) ?? null;
}

/** Poder de origem montado com o texto do livro, para a origem cujo poder não está em nenhum compêndio (ou null). */
export function originPowerData(origin) {
  if (!origin?.text) return null;
  const [intro, benefit] = origin.text.split(/\s*Benefício\.\s*/);
  return {
    name: origin.fixed?.power ?? origin.name,
    type: 'poder',
    system: {
      tipo: 'origem',
      subtipo: '',
      description: { value: `<p>${intro}</p>${benefit ? `<p><strong>Benefício.</strong> ${benefit}</p>` : ''}` },
      source: `T20 - ${origin.source}${origin.page ? ` (pág. ${origin.page})` : ''}`
    }
  };
}

/**
 * Sua Própria Origem (Tormenta20 JdA p. 95): negociando com o mestre, o jogador monta a origem.
 * Segue a base das origens (p. 84): dois benefícios, que podem ser perícias ou poderes (gerais, de origem ou um
 * poder único inventado, "usando as outras como referência"). Itens combinados com o mestre.
 * Na criação, a vaga guarda `origin: CUSTOM_ORIGIN` e os dados em `custom`:
 * { name, story, b: { 0: { kind: 'skill'|'power'|'unique', value, name, text } , 1: {…} }, items: { n: uuid }, itemsNote }.
 */
export const CUSTOM_ORIGIN = '@propria';
export const CUSTOM_ORIGIN_SOURCE = 'Sua Própria Origem (JdA p. 95)';

/** Benefícios da origem própria, na ordem (só os que têm tipo). */
export function customBenefits(custom, need = 2) {
  return Array.from({ length: need }, (_, i) => custom?.b?.[i] ?? {});
}

/** Benefício preenchido? */
export function customBenefitDone(b) {
  if (b?.kind === 'unique') return !!(b.name?.trim() && b.text?.trim());
  return !!(b?.kind && b.value);
}

/** Origem da vaga: a do livro ou a montada pelo jogador (com `custom: true`). */
export function originOf(S) {
  if (!S?.origin) return null;
  if (S.origin !== CUSTOM_ORIGIN) return ORIGINS.find(o => o.name === S.origin) ?? null;
  const c = S.custom ?? {};
  return { name: c.name?.trim() || 'Origem própria', skills: [], powers: [], items: c.itemsNote ?? '', source: CUSTOM_ORIGIN_SOURCE, custom: true };
}

/** Nome da origem da vaga, para resumo e ficha. */
export const originName = S => originOf(S)?.name ?? '';

/** Poder único da origem própria, criado na ficha como poder de origem. */
export function customPowerData(b, originLabel) {
  return {
    name: b.name.trim(),
    type: 'poder',
    system: {
      tipo: 'origem',
      subtipo: '',
      description: { value: `<p>${b.text.trim().split(/\n+/).map(escapeHtml).join('</p><p>')}</p><p><em>Origem própria: ${escapeHtml(originLabel)}. Combinado com o mestre.</em></p>` },
      source: CUSTOM_ORIGIN_SOURCE
    }
  };
}
