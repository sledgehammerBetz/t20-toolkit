/**
 * Engenhocas (JdA p. 68-70; HdA p. 158 e 236): círculo, custo, CD, limite, fabricação e teste de ativação.
 * Personagem: Inventor 1 com Int 4, Engenhoqueiro e Engenhosidade (Inventor), treinado em Ofício (engenhoqueiro).
 */
import { tk, makeActor, addItems, classData, itemData, cleanup, openApp, compendiumItem } from '../helpers.js';

export function engenhocasBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe('Engenhocas', function () {
    this.timeout(30000);
    let R, A, inventor;

    before(async () => {
      R = await tk('engenhocas/engenhocas-rules.js');
      A = await tk('engenhocas/engenhocas-actions.js');
      inventor = await makeActor('Inventor', {
        attrs: { int: 4 },
        system: { pericias: { enge: { treinado: true } } },
        items: [classData('Inventor', 1), itemData('Engenhoqueiro'), itemData('Engenhosidade (Inventor)')]
      });
    });
    after(cleanup);

    it('círculo máximo: 1º até o 5º nível, 2º no 6º e +1 a cada 4 níveis', () => {
      assert.deepEqual([1, 5, 6, 9, 10, 14, 18, 20].map(R.maxCircle), [1, 1, 2, 2, 3, 4, 5, 5]);
    });

    it('fabricar: T$ 100 × PM, CD 20 + PM, uma semana', () => {
      const c = R.craftCheck({ circle: 2, type: 'arc' }, { inventorLevel: 6, owned: 0, limit: 4 });
      assert.include(c, { ok: true, pm: 3, dc: 23, price: 300 });
      assert.equal(R.craftTime(), '1 semana');
    });

    it('Engenhocaria Goblinoide: metade do preço e 1 dia', () => {
      assert.equal(R.craftPrice(3, { goblinoide: true }), 150);
      assert.equal(R.craftTime({ goblinoide: true }), '1 dia');
    });

    it('lê a ficha do Inventor: nível, círculo e limite pela Inteligência', () => {
      const inv = A.actorInventor(inventor);
      assert.include(inv, { level: 1, maxCircle: 1, engenhoqueiro: true, limit: 4, int: 4 });
    });

    it('Manutenção Eficiente soma +3 no limite', async () => {
      const [p] = await addItems(inventor, [itemData('Manutenção Eficiente')]);
      assert.equal(A.actorInventor(inventor).limit, 7);
      await inventor.deleteEmbeddedDocuments('Item', [p.id]);
    });

    it('não fabrica magia acima do círculo nem passa do limite', () => {
      assert.isFalse(R.craftCheck({ circle: 3, type: 'arc' }, { inventorLevel: 1, owned: 0, limit: 4 }).ok);
      assert.isFalse(R.craftCheck({ circle: 1, type: 'arc' }, { inventorLevel: 1, owned: 4, limit: 4 }).ok);
    });

    let eng;
    it('fabrica Armadura Arcana (sem teste e sem custo) e a ficha passa a ter a engenhoca', async () => {
      const spell = await compendiumItem('Armadura Arcana', { type: 'magia' });
      eng = await A.craftEngenhoca(inventor, { uuid: spell.uuid, roll: false, pay: false });
      assert.ok(eng, 'engenhoca criada');
      assert.isTrue(R.isEngenhoca(eng));
      assert.lengthOf(A.actorEngenhocas(inventor), 1);
      assert.equal(R.limitCount(A.actorEngenhocas(inventor)), 1);
    });

    it('CD de ativação: 15 + PM, +5 por ativação no mesmo dia, +1 por PM de aprimoramento', () => {
      const st = R.engenhocaState(eng);
      assert.equal(R.activationDC(st).dc, 16);
      assert.equal(R.activationDC({ ...st, usesToday: 2 }).dc, 26);
      assert.equal(R.activationDC(st, { upgradePM: 2 }).dc, 18);
    });

    it('Engenhosidade soma a Inteligência no teste (resolve @int com os dados da ficha)', () => {
      const inv = A.actorInventor(inventor);
      const st = R.engenhocaState(eng);
      const base = A.activationTest(inventor, st, inv, { skill: R.SKILL_KEY, fx: {}, text: {} });
      const fx = base.effects.find(e => /engenhosidade/i.test(e.name));
      assert.ok(fx, 'Engenhosidade aparece entre os efeitos do teste');
      const on = A.activationTest(inventor, st, inv, { skill: R.SKILL_KEY, fx: { [fx.id]: 1 }, text: {} });
      assert.equal(on.bonus - base.bonus, 4, 'Int 4 entra no bônus');
      assert.equal(on.pmCost - base.pmCost, fx.cost, 'paga o custo do efeito');
    });

    it('a janela abre para o Inventor sem erro', async () => {
      const app = await openApp(() => game.t20Toolkit.engenhocas.open({ actor: inventor }));
      assert.match(app.element.textContent, /Armadura Arcana/);
      await app.close();
    });
  });
}
