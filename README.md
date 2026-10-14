# T20 Toolkit — Ferramentas para Tormenta20

Módulo para **Foundry VTT V13** com o sistema **Tormenta20 1.5.015**. Automatiza a criação de personagem, a subida de nível e as mecânicas especiais de magia e engenhocas, sempre conferindo as regras dos livros (Tormenta20 Jogo do Ano, Heróis de Arton, Ameaças de Arton, Atlas de Arton, Deuses de Arton).

> **Beta fechada.** Use num mundo de teste ou faça backup antes.

## Requisitos

- Foundry VTT V13 (testado na 13.351)
- Sistema Tormenta20 1.5.015
- Os suplementos são opcionais: o que estiver nos compêndios ativos aparece nas listas

## Instalação

No Foundry: *Add-on Modules* → *Install Module* → cole no campo **Manifest URL**:

```
https://raw.githubusercontent.com/sledgehammerBetz/t20-toolkit/main/module.json
```

Depois ative **T20 Toolkit** no mundo (*Manage Modules*). Atualizações chegam pelo botão *Update* do Foundry.

## Como abrir

- Botão **Toolkit** no topo da ficha do personagem, ou
- Macro: `game.t20Toolkit.open()`

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| **Início** | Painel do personagem: PV, PM, atributos e o que falta fazer, com um botão para cada pendência |
| **Planejador** | Criação em etapas (raça, escolhas da raça, idade, atributos, origem, classe, perícias, complicação, divindade) e os níveis 2–20 com pré-requisitos, retreino e ganhos fora da progressão |
| **Buscador de Magias** | Todas as magias dos compêndios, com 18 filtros (inclusive "considerar aprimoramentos"), e o que o personagem pode aprender |
| **Grimório** | Memorização diária do Mago |
| **Escriba Arcano** | Copiar magias de pergaminhos e grimórios |
| **Usurpador** | Usurpar magias divinas, Poder Capturado e Roubo Divino |
| **Engenhocas** | Fabricar, ativar, consertar e instalar aparatos |
| **Regras da mesa** (mestre) | Métodos de atributos (pontos, 4d6, 3d6, épica, Khalmyr, Nimb, Valkaria), raças e devoções abertas, complicações, idade, origens extras, distinções, ganhos extras e retreino |

## Para o mestre

- **Configurações do módulo → Regras da mesa:** liga as regras opcionais da campanha.
- **Configurações do módulo → Beta: link para relatar problemas:** link do canal da beta (aparece para os jogadores).

## Relatar problemas

No **Início** do Toolkit, clique em **Relatar problema** (ou rode `game.t20Toolkit.report()`). A janela já traz as versões, os módulos ativos e os erros recentes do Toolkit; descreva o que aconteceu, copie e cole no canal da beta.

## Créditos

Autor: Bet. Tormenta20 é © Jambô Editora; este módulo é um projeto de fãs, sem afiliação. Fontes Inter e Lora sob a SIL Open Font License (veja `fonts/`).
