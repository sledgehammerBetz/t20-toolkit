/**
 * Grimório do Mago (JdA p. 37): memoriza metade das magias do Mago, uma vez por dia.
 * Só entram magias aprendidas como Arcanista ou copiadas (JdA p. 171); raça, poderes e outra classe ficam fora.
 */
import { tk, makeActor, classData, itemData, spellData, cleanup, openApp } from '../helpers.js';

export function grimorioBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe('Grimório do Mago', function () {
    this.timeout(30000);
    let rules, actorSpells, mago;

    before(async () => {
      rules = await tk('grimorio/grimorio-rules.js');
      ({ actorSpells } = await tk('core/t20.js'));
      mago = await makeActor('Mago com Grimório', {
        attrs: { int: 4 },
        items: [
          classData('Arcanista', 3), itemData('Caminho do Arcanista: Mago'), itemData('Teurgista Místico'),
          spellData('Seta Infalível', 'arcanista'), spellData('Armadura Arcana', 'arcanista'), spellData('Sono', 'arcanista'),
          spellData('Curar Ferimentos', 'arcanista'), // divina pelo Teurgista: é magia do Mago
          spellData('Luz'),                           // sem registro (ficha antiga): conta
          spellData('Escudo da Fé', 'poder'),         // ganho extra de poder: fora
          spellData('Bola de Fogo', 'escriba')        // copiada: conta
        ]
      });
    });
    after(cleanup);

    const magoNames = () => rules.magoSpells(actorSpells(mago)).map(s => s.name).sort();

    it('conta arcanas, a divina do Teurgista, a sem registro e a copiada', () => {
      assert.deepEqual(magoNames(), ['Armadura Arcana', 'Bola de Fogo', 'Curar Ferimentos', 'Luz', 'Seta Infalível', 'Sono'].sort());
    });

    it('magia de ganho extra de poder não é magia do Mago', () => {
      assert.notInclude(magoNames(), 'Escudo da Fé');
    });

    it('magia de raça e de outra classe não entram', () => {
      assert.isFalse(rules.isMagoSpell('arc', 'raca'));
      assert.isFalse(rules.isMagoSpell('div', 'clerigo'));
      assert.isFalse(rules.isMagoSpell('arc', 'poder:arcanista'));
    });

    it('limite de memorização é metade, para baixo', () => {
      assert.equal(rules.memorizationLimit(6), 3);
      assert.equal(rules.memorizationLimit(7), 3);
      assert.equal(rules.memorizationLimit(1), 0);
    });

    it('não estuda duas vezes no mesmo dia (o mestre pode)', () => {
      const known = rules.magoSpells(actorSpells(mago));
      const ids = known.slice(0, 2).map(s => s.id);
      assert.isTrue(rules.validateStudy({ selectedIds: ids, known, lastStudyDay: '1-1', today: '1-2' }).ok);
      assert.isFalse(rules.validateStudy({ selectedIds: ids, known, lastStudyDay: '1-2', today: '1-2' }).ok);
      assert.isTrue(rules.validateStudy({ selectedIds: ids, known, lastStudyDay: '1-2', today: '1-2', isGM: true }).ok);
    });

    it('não memoriza mais que o limite', () => {
      const known = rules.magoSpells(actorSpells(mago));
      const r = rules.validateStudy({ selectedIds: known.slice(0, 4).map(s => s.id), known, lastStudyDay: null, today: '1-1' });
      assert.isFalse(r.ok);
      assert.equal(r.limit, 3);
    });

    it('a janela abre para o Mago sem erro', async () => {
      const app = await openApp(() => game.t20Toolkit.grimorio.open({ actor: mago }));
      assert.match(app.element.textContent, /memoriz/i);
      await app.close();
    });
  });
}
