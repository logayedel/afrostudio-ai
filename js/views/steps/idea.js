import { h, field, notice } from '../../ui.js';

export function ideaStep({ p, ep, save, go, cast }) {
  return h('div', { class: 'cols' },
    h('div', { class: 'col wide' },
      h('div', { class: 'panel' },
        h('h2', {}, '💡 L\'idée de l\'épisode'),
        h('p', { class: 'muted' }, 'Décrivez votre histoire avec vos mots. Pas besoin d\'être scénariste : quelques phrases suffisent.'),
        field('Titre de l\'épisode', ep, 'title', { onChange: save }),
        field('Votre idée', ep.idea, 'pitch', { type: 'textarea', rows: 6, onChange: save, placeholder: 'Ex. : Awa trouve une vieille radio dans le grenier de sa grand-mère. Chaque nuit, la radio capte des messages venus des étoiles…' }),
        h('div', { class: 'two' },
          field('Ton', ep.idea, 'tone', { onChange: save, options: ['Comédie familiale', 'Aventure', 'Conte traditionnel', 'Éducatif', 'Émotion / drame', 'Mystère', 'Action'] }),
          field('Public', ep.idea, 'audience', { onChange: save, options: ['Jeunes enfants (3-6 ans)', 'Tous publics (6+)', 'Ados (12+)', 'Adultes'] }),
          field('Durée cible', ep.idea, 'duration', { onChange: () => { ep.idea.duration = Number(ep.idea.duration); save(); }, options: [[15, '15 secondes'], [30, '30 secondes'], [60, '1 minute'], [90, '1 min 30'], [120, '2 minutes'], [180, '3 minutes'], [300, '5 minutes'], [600, '10 minutes']] }),
          field('Morale ou message (facultatif)', ep.idea, 'lesson', { onChange: save })),
        field('Notes libres (contraintes, références, éléments à inclure)', ep.idea, 'notes', { type: 'textarea', rows: 3, onChange: save }),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => go('scenario') }, 'Passer au scénario →')))),
    h('div', { class: 'col' },
      h('div', { class: 'panel soft' }, h('h3', {}, 'Le projet'),
        h('p', {}, h('b', {}, p.title)), h('p', { class: 'muted small' }, p.logline || '—'),
        h('p', { class: 'small' }, 'Format : ', p.format, ' · Style : ', p.style),
        h('p', { class: 'small' }, 'Personnages : ', cast.length ? cast.map((c) => c.name).join(', ') : 'aucun pour l\'instant'),
        h('a', { href: `#/projet/${p.id}` }, 'Modifier les réglages du projet')),
      notice('info', 'Conseil : ajoutez vos personnages et décors avant de générer le scénario, ils seront utilisés automatiquement.')));
}
