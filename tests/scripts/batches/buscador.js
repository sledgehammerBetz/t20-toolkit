/**
 * Buscador de Magias: capacidade da classe e magias da outra tradição (JdA p. 36-37, 135 e 171).
 * Personagens: Arcanista (Mago) com Teurgista Místico; o mesmo com Conhecimento Mágico; Mago de 5º nível.
 */
import { tk, makeActor, addItems, classData, itemData, spellData, cleanup, openApp, waitFor } from '../helpers.js';

export function buscadorBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe('Buscador de Magias', function () {
    this.timeout(30000);
    let ctxOf, evaluateSpell, mago;
    const spell = async name => {
      const d = await itemData(name, { type: 'magia' });
      return { name, circle: Number(d.system.circulo), type: d.system.tipo, school: d.system.escola };
    };

    before(async () => {
      ({ casterContext: ctxOf } = await tk('core/caster-context.js'));
      ({ evaluateSpell } = await tk('core/caster-rules.js'));
      mago = await makeActor('Arcanista Teurgista', {
        attrs: { int: 4 },
        items: [classData('Arcanista', 1), itemData('Caminho do Arcanista: Mago'), itemData('Teurgista Místico')]
      });
    });
    after(cleanup);

    it('Mago de 1º nível conhece 4 magias e lança até o 1º círculo', () => {
      const { profiles, capacity } = ctxOf(mago);
      assert.lengthOf(profiles, 1);
      assert.equal(profiles[0].label, 'Arcanista (Mago)');
      assert.equal(profiles[0].maxCircle, 1);
      assert.equal(capacity.allowed, 4);
    });

    it('Bola de Fogo (3º círculo) fica fora para o 1º nível', async () => {
      const r = evaluateSpell(await spell('Bola de Fogo'), ctxOf(mago).profiles);
      assert.equal(r.status, 'blocked');
    });

    it('Teurgista Místico libera uma divina de 1º círculo', async () => {
      const r = evaluateSpell(await spell('Curar Ferimentos'), ctxOf(mago).profiles);
      assert.equal(r.status, 'allowed');
      assert.equal(r.grant, 'Teurgista Místico');
    });

    it('depois de aprender uma divina de 1º, as outras divinas de 1º voltam a ficar fora', async () => {
      await addItems(mago, [spellData('Curar Ferimentos', 'arcanista')]);
      const r = evaluateSpell(await spell('Escudo da Fé'), ctxOf(mago).profiles);
      assert.equal(r.status, 'blocked');
      const arc = evaluateSpell(await spell('Seta Infalível'), ctxOf(mago).profiles);
      assert.equal(arc.status, 'allowed', 'arcanas de 1º continuam liberadas');
    });

    it('a divina aprendida pelo Teurgista conta como magia da classe', () => {
      const { capacity } = ctxOf(mago);
      assert.equal(capacity.current, 1);
      assert.equal(capacity.remaining, 3);
    });

    it('magias de raça e de ganhos extras de poderes ficam fora da conta', async () => {
      const [a, b] = await addItems(mago, [spellData('Sono', 'raca'), spellData('Luz', 'poder')]);
      const { capacity } = ctxOf(mago);
      assert.equal(capacity.current, 1, 'só a magia da classe conta');
      await mago.deleteEmbeddedDocuments('Item', [a.id, b.id]);
    });

    it('magias copiadas com Escriba Arcano entram no total', async () => {
      const [c] = await addItems(mago, [spellData('Armadura Arcana', 'escriba')]);
      const { capacity } = ctxOf(mago);
      assert.equal(capacity.allowed, 5, '4 do Mago + 1 copiada');
      assert.equal(capacity.current, 2);
      await mago.deleteEmbeddedDocuments('Item', [c.id]);
    });

    it('Conhecimento Mágico (Arcanista) soma +2 na capacidade da classe', async () => {
      const [p] = await addItems(mago, [itemData('Conhecimento Mágico (Arcanista)')]);
      assert.equal(ctxOf(mago).capacity.allowed, 6);
      await mago.deleteEmbeddedDocuments('Item', [p.id]);
    });

    it('Mago de 5º nível: 2º círculo e 9 magias (4 + 1 por nível + 1 por círculo novo)', async () => {
      const m5 = await makeActor('Mago nível 5', { attrs: { int: 4 }, items: [classData('Arcanista', 5), itemData('Caminho do Arcanista: Mago')] });
      const { profiles } = ctxOf(m5);
      assert.equal(profiles[0].maxCircle, 2);
      assert.equal(profiles[0].known, 9);
    });

    it('a janela abre para o Arcanista sem erro', async () => {
      const api = game.t20Toolkit.buscador;
      const app = await openApp(() => api.open({ actor: mago }));
      await waitFor(() => /Arcanista/.test(app.element.textContent), { what: 'o cartão da classe' });
      await app.close();
    });
  });
}
