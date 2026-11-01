# Testes automáticos do T20 Toolkit

Bateria de testes que roda **dentro do Foundry**, num mundo só de teste, com o [Quench](https://github.com/Ethaks/FVTT-Quench).
A pasta `tests/` não entra no pacote publicado (`.gitattributes` com `export-ignore`).

## Como rodar

1. Monte e abra a instância de teste (porta 30001, pasta de dados `FoundryVTT-Testes`, mundo `t20-testes`).
   Ela roda ao lado do Foundry de jogo (porta 30000) sem mexer nele:
   ```
   powershell -ExecutionPolicy Bypass -File tests\instancia-teste.ps1
   ```
   Use `-Atualizar` para recopiar o sistema Tormenta20 e o Suplementos de Arton depois de atualizá-los no Foundry de jogo.
2. Abra `http://localhost:30001`, entre como **Gamemaster** (sem senha).
3. Só na primeira vez, ative os módulos pelo console (F12) e recarregue:
   ```js
   await game.settings.set('core', 'moduleConfiguration', { quench: true, 't20-toolkit': true, 't20-toolkit-tests': true, 'suplementos-de-arton': true }); location.reload();
   ```
4. Clique no frasco do Quench e em **Run**, ou no console:
   ```js
   await game.t20ToolkitTests.run()                         // todas
   await game.t20ToolkitTests.run(['t20-toolkit.engenhocas']) // uma bateria
   ```

O módulo `t20-toolkit` da instância de teste é uma ligação para este repositório: o teste roda o código do checkout atual
(troque de branch e recarregue o mundo para testar uma PR).

Cada bateria cria seus personagens na pasta **Testes automáticos** e apaga tudo no fim
(`game.t20ToolkitTests.cleanup()` limpa à mão se um teste for interrompido).

## O que é conferido

| Bateria | Personagem de exemplo | Regras |
|---|---|---|
| Buscador de Magias | Arcanista (Mago) 1 com Teurgista Místico; Mago 5 | 4 magias no 1º nível, 9 no 5º; Bola de Fogo fora; uma divina por círculo pelo Teurgista; magias de raça e de poderes fora da conta; Escriba Arcano soma; Conhecimento Mágico +2 |
| Grimório | Mago 3 com magias de várias origens | só magias do Mago contam (arcanas, divina do Teurgista, copiadas, fichas antigas); metade para baixo; um estudo por dia |
| Engenhocas | Inventor 1, Int 4, Engenhoqueiro, Engenhosidade | círculo por nível; preço, CD e tempo (e Goblinoide); limite pela Int e Manutenção Eficiente; fabricar; CD de ativação; Engenhosidade soma a Int |
| Planejador | Moreau da Raposa (criação); Familiar | ordem das etapas; Esperteza Vulpina só Int/Car e sem repetir; Ofícios de poderes (Escriba); Familiar pede o animal e esconde os itens de cada familiar |

Cada bateria também abre a janela correspondente para conferir que ela renderiza sem erro.

## Escrevendo testes

- `scripts/helpers.js`: `makeActor`, `itemData` (busca nos compêndios pelo nome), `spellData` (magia com `learnedBy`),
  `openApp`, `clickAndRender`, `waitFor`, `cleanup`.
- Itens entram na ficha depois de criada (como ao arrastar), para os efeitos dos poderes passarem para o ator.
- Uma bateria nova é um arquivo em `scripts/batches/` registrado em `scripts/main.js`.
