/**
 * Fabricação (parte a): comidas e alquímicos. JdA, Ofício (Fabricar) e Alimentação (p. 162).
 * Personagem: Inventor 1 com Int 3, treinado em Ofício (alquimista) e Ofício (cozinheiro), com Mestre Cuca e T$ 200.
 * Registrar em scripts/main.js: ['t20-toolkit.fabricacao', 'T20 Toolkit: Fabricação', fabricacaoBatch].
 */
import { tk, makeActor, addItems, classData, itemData, cleanup, openApp, compendiumItem, waitFor } from '../helpers.js';

export function fabricacaoBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe('Fabricação', function () {
    this.timeout(30000);
    let R, A, W, cook;

    before(async () => {
      R = await tk('fabricacao/fabricacao-rules.js');
      A = await tk('fabricacao/fabricacao-actions.js');
      W = await tk('core/wallet.js');
      cook = await makeActor('Cozinheiro', {
        attrs: { int: 3 },
        system: { pericias: { alqu: { treinado: true }, cozi: { treinado: true } }, dinheiro: { tp: 200 } },
        items: [classData('Inventor', 1), itemData('Mestre Cuca')]
      });
    });
    after(cleanup);

    it('carteira: paga com cobre, prata e ouro e devolve o troco', () => {
      assert.deepEqual(W.payCoins({ tc: 0, tp: 0, to: 2 }, 167), { tc: 3, tp: 3, to: 0 });
      assert.isNull(W.payCoins({ tc: 0, tp: 1, to: 0 }, 11));
    });

    it('lê os itens do sistema: CD, tipo e matéria-prima', async () => {
      const cat = await A.getRecipeCatalog({ refresh: true });
      const by = n => cat.find(r => r.name === n && r.core);
      assert.include(by('Bomba'), { kind: 'preparado', skill: 'alqu', dc: 15 });
      assert.include(by('Saco de Sal'), { kind: 'catalisador', dc: 15 });
      assert.include(by('Peçonha Comum'), { kind: 'veneno', dc: 20 });
      assert.include(by('Beladona'), { kind: 'veneno', dc: 25 });
      assert.include(by('Batata Ambiciosa'), { kind: 'prato', skill: 'cozi' });
      assert.equal(R.materialCost(50), 167);
    });

    it('teste: duas unidades e sem instrumentos dão −5 cada', async () => {
      const cat = await A.getRecipeCatalog();
      const bomba = cat.find(r => r.name === 'Bomba' && r.core);
      const base = A.craftTest(cook, bomba, { units: 1, tools: true });
      const worse = A.craftTest(cook, bomba, { units: 2, tools: false });
      assert.equal(base.bonus - worse.bonus, 10);
    });

    it('comer Macarrão de Mineiro feito com Mestre Cuca: +6 PV temporários e refeição do dia', async () => {
      const src = await compendiumItem('Macarrão de Mineiro', { type: 'consumivel' });
      const recipe = (await A.getRecipeCatalog()).find(r => r.uuid === src.uuid);
      const data = A.craftedItemData(game.items.fromCompendium(src), recipe, { mestreCuca: true });
      const [item] = await addItems(cook, [data]);
      await A.eatFood(cook, item);
      await waitFor(() => A.activeFood(cook).length, { what: 'a refeição do dia' });
      assert.equal(cook.system.attributes.pv.temp, 6);
      const fx = A.activeFood(cook)[0];
      assert.equal(fx.duration.seconds, 86400);
    });

    it('Prato do Aventureiro soma +1 PV por nível no descanso e só uma vez', async () => {
      await A.clearFood(cook, { silent: true });
      const src = await compendiumItem('Prato do Aventureiro', { type: 'consumivel' });
      const [item] = await addItems(cook, [game.items.fromCompendium(src)]);
      await A.eatFood(cook, item);
      await waitFor(() => A.activeFood(cook).length, { what: 'a refeição do dia' });
      await cook.update({ 'system.attributes.pv.value': 1 });
      await cook.descanso(1, 0, 0, false, false, false);
      assert.equal(cook.system.attributes.pv.value, 1 + 2, 'nível 1: 1 do descanso normal + 1 do prato');
      assert.isTrue(!!A.activeFood(cook)[0].flags['t20-toolkit'].food.restUsed);
    });

    it('a janela abre sem erro', async () => {
      const app = await openApp(() => game.t20Toolkit.fabricacao.open({ actor: cook }));
      assert.match(app.element.textContent, /Bomba/);
      await app.close();
    });
  });
}
