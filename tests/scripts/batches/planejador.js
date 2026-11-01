/**
 * Planejador: ordem da criação, escolhas da raça (Moreau da Raposa), Ofícios citados em poderes e Familiar.
 * As etapas são conferidas pela própria janela, clicando como o jogador faria.
 */
import { tk, makeActor, cleanup, openApp, clickAndRender, waitFor, compendiumItem } from '../helpers.js';

const RAPOSA = 'Moreau - Herança da Raposa';

export function planejadorBatch(context) {
  const { describe, it, assert, before, after } = context;

  describe('Planejador: criação do Moreau da Raposa', function () {
    this.timeout(60000);
    let app, actor, skillAbl;
    const steps = () => [...app.element.querySelectorAll('[data-action=wzStep]')].map(b => b.dataset.step);
    const chips = slot => [...app.element.querySelectorAll(`[data-action=wzChoice][data-ability="esperteza vulpina"][data-slot="${slot}"]`)];

    before(async () => {
      ({ skillAbl } = await tk('planner/creation-view.js'));
      actor = await makeActor('Moreau da Raposa');
      app = await openApp(() => game.t20Toolkit.planner.open({ actor }));
      const race = await compendiumItem(RAPOSA, { type: 'race' });
      await clickAndRender(app, `[data-action=wzSelect][data-value="${race.uuid}"]`);
      await clickAndRender(app, '[data-action=wzStep][data-step=raceChoices]');
      await waitFor(() => chips(0).length, { what: 'as perícias da Esperteza Vulpina' });
    });
    after(async () => { await app?.close(); await cleanup(); });

    it('ordem: Raça → Escolhas da raça → Idade → Classe → Origem → Atributos → Perícias → … → Resumo', () => {
      const s = steps().filter((v, i, a) => a.indexOf(v) === i);
      const order = ['race', 'raceChoices', 'age', 'class', 'origin', 'attributes', 'skills', 'god', 'summary'].filter(x => s.includes(x));
      assert.deepEqual(s.filter(x => order.includes(x)), order);
      assert.includeMembers(s, ['race', 'raceChoices', 'class', 'origin', 'attributes', 'skills', 'summary']);
    });

    it('Esperteza Vulpina só lista perícias de Inteligência ou Carisma', () => {
      const keys = chips(0).map(c => c.dataset.value);
      assert.isAbove(keys.length, 5);
      const wrong = keys.filter(k => !['int', 'car'].includes(skillAbl(k)));
      assert.deepEqual(wrong, [], 'perícias de outro atributo apareceram');
      assert.notInclude(keys, 'luta');
      assert.include(keys, 'dipl');
      assert.include(keys, 'conh');
    });

    it('Ofícios citados em poderes aparecem (Ofício: Escriba)', () => {
      assert.include(chips(0).map(c => c.dataset.value), 'ofx_escriba');
    });

    it('a mesma perícia não pode ser escolhida nas duas vagas', async () => {
      await clickAndRender(app, '[data-action=wzChoice][data-ability="esperteza vulpina"][data-slot="0"][data-value=conh]');
      const twin = chips(1).find(c => c.dataset.value === 'conh');
      assert.isTrue(twin.disabled, 'Conhecimento ficou liberado na segunda vaga');
      // O rascunho é gravado na ficha um pouco depois do clique.
      const picks = await waitFor(() => actor.getFlag('t20-toolkit', 'plan.creation.raceChoices')?.['esperteza vulpina'], { what: 'a escolha ser gravada' });
      assert.equal(picks?.[0]?.value, 'conh');
    });

    it('repetição gravada por fora aparece como problema', async () => {
      const { raceAbilityChoices, raceChoiceProblems } = await tk('planner/race-choices.js');
      const choices = raceAbilityChoices(['Esperteza Vulpina']);
      const same = { 'esperteza vulpina': { 0: { value: 'conh' }, 1: { value: 'conh' } } };
      const diff = { 'esperteza vulpina': { 0: { value: 'conh' }, 1: { value: 'dipl' } } };
      assert.include(raceChoiceProblems(choices, same), 'Esperteza Vulpina: escolhas repetidas');
      assert.deepEqual(raceChoiceProblems(choices, diff), []);
    });
  });

  describe('Planejador: Familiar do Arcanista', function () {
    this.timeout(30000);
    let PC, idx;

    before(async () => {
      PC = await tk('planner/power-choices.js');
      const { fold } = await tk('core/t20.js');
      const powers = [];
      for (const p of game.packs.filter(p => p.documentName === 'Item')) {
        for (const e of p.index) if (e.type === 'poder') powers.push({ uuid: e.uuid, name: e.name, key: fold(e.name), packLabel: p.title });
      }
      idx = { powers, powerByUuid: new Map(powers.map(p => [p.uuid, p])) };
    });

    it('o poder Familiar pede qual animal', () => {
      const spec = PC.powerChoice({ name: 'Familiar' });
      assert.equal(spec?.kind, 'variant');
    });

    it('a escolha lista os dez familiares básicos', () => {
      const labels = PC.powerChoiceOptions(PC.powerChoice({ name: 'Familiar' }), idx).map(o => o.label);
      assert.includeMembers(labels, ['Borboleta', 'Cobra', 'Coruja', 'Corvo', 'Falcão', 'Gato', 'Lagarto', 'Morcego', 'Rato', 'Sapo']);
    });

    it('os itens de cada familiar saem da lista de poderes quando o Familiar está nela', () => {
      const gato = idx.powers.find(p => p.key === 'familiar gato');
      const familiar = idx.powers.find(p => p.key === 'familiar');
      assert.isTrue(PC.isChoiceVariant(gato, [familiar, gato]));
      assert.isFalse(PC.isChoiceVariant(familiar, [familiar, gato]));
    });
  });
}
