import { h, notice } from '../../ui.js';
import { characterCard } from '../characters.js';
import { identitySheet } from '../../prompts.js';
import { newCharacter, saveCharacter, saveProject } from '../../store.js';
import { charIdByName } from './common.js';

export function castStep(ctx) {
  const { p, ep, cast, library } = ctx;
  // Personnages cités dans le scénario mais absents de la distribution
  const unknownLines = ep.scenes.flatMap((s) => s.dialogues).filter((d) => !d.characterId).length;
  const appearances = (c) => ep.scenes.filter((s) => s.characters.includes(c.id)).length;

  return h('div', {},
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, '🎭 Personnages de l\'épisode'),
        h('div', { class: 'row' },
          h('a', { class: 'btn ghost', href: `#/projet/${p.id}` }, 'Gérer la distribution du projet'),
          h('button', { class: 'btn primary', onclick: async () => {
            const c = newCharacter({ name: 'Nouveau personnage' });
            await saveCharacter(c); p.cast.push(c.id); await saveProject(p);
            location.hash = `#/personnages/${c.id}`;
          } }, '+ Nouveau personnage'))),
      h('p', { class: 'muted' }, 'Chaque personnage possède une fiche d\'identité visuelle. Elle est recopiée mot pour mot dans tous les plans du storyboard pour conserver la même apparence d\'une scène et d\'un épisode à l\'autre.'),
      unknownLines ? notice('info', `${unknownLines} réplique(s) sont attribuées au narrateur ou à un personnage non défini.`) : null,
      library.length > cast.length ? h('p', { class: 'small muted' }, `${library.length - cast.length} autre(s) personnage(s) disponibles dans votre bibliothèque.`) : null),
    cast.length
      ? h('div', { class: 'cast-list' }, cast.map((c) => h('div', { class: 'panel cast-row' },
        characterCard(c),
        h('div', { class: 'grow' },
          h('h3', {}, c.name, ' ', h('span', { class: 'muted small' }, `— présent dans ${appearances(c)} scène(s)`)),
          h('pre', { class: 'sheet' }, identitySheet(c) || 'Fiche vide : complétez l\'apparence et la tenue.'),
          !c.appearance || !c.outfit ? notice('info', 'Fiche incomplète : précisez l\'apparence et la tenue pour une meilleure cohérence visuelle.') : null,
          !c.refImages?.length ? h('p', { class: 'small muted' }, 'Pas encore d\'image de référence.') : null,
          h('a', { href: `#/personnages/${c.id}` }, 'Modifier la fiche →')))))
      : h('p', { class: 'empty' }, 'Aucun personnage dans ce projet.'));
}

export { charIdByName };
