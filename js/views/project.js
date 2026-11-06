import { h, field, toast, confirmBox, modal, badge, download } from '../ui.js';
import { getProject, autosave, saveProject, newEpisode, uid, FORMATS, STYLES, listCharacters, newCharacter, saveCharacter, exportProjectFile } from '../store.js';
import { characterCard } from './characters.js';
import { slug } from './dashboard.js';

export async function projectView({ projectId }) {
  const p = await getProject(projectId);
  if (!p) throw new Error('Projet introuvable');
  const save = () => autosave('project', p);
  const rerender = async () => { await saveProject(p); dispatchEvent(new HashChangeEvent('hashchange')); };
  const library = await listCharacters();
  const byId = Object.fromEntries(library.map((c) => [c.id, c]));

  // ---- Saisons / épisodes ----
  const seasons = h('div', { class: 'seasons' }, p.seasons.map((s, si) => h('div', { class: 'season' },
    h('div', { class: 'season-head' },
      h('input', { class: 'inline-title', value: s.title, oninput: (e) => { s.title = e.target.value; save(); } }),
      p.kind === 'serie' ? h('button', { class: 'btn small ghost', onclick: async () => { s.episodes.push(newEpisode(s.episodes.length + 1)); await rerender(); } }, '+ Épisode') : null,
      p.kind === 'serie' && p.seasons.length > 1 ? h('button', { class: 'icon-btn', title: 'Supprimer la saison', onclick: async () => { if (await confirmBox(`Supprimer « ${s.title} » et tous ses épisodes ?`, 'Supprimer')) { p.seasons.splice(si, 1); await rerender(); } } }, '🗑') : null),
    h('div', { class: 'episodes' }, s.episodes.map((e, ei) => {
      const shots = e.scenes.reduce((n, sc) => n + sc.shots.length, 0);
      const clips = e.scenes.reduce((n, sc) => n + sc.shots.filter((x) => x.clip).length, 0);
      return h('div', { class: 'episode' },
        h('a', { href: `#/projet/${p.id}/${e.id}/idee`, class: 'ep-link' },
          h('span', { class: 'ep-num' }, p.kind === 'film' ? '🎬' : e.number),
          h('div', {}, h('b', {}, e.title), h('div', { class: 'row wrap small' },
            badge(`${e.scenes.length} scène(s)`), badge(`${shots} plan(s)`), badge(`${clips}/${shots || 0} clip(s)`, clips && clips === shots ? 'ok' : 'soft')))),
        p.kind === 'serie' ? h('div', { class: 'row' },
          ei > 0 ? h('button', { class: 'icon-btn', title: 'Monter', onclick: async () => { [s.episodes[ei - 1], s.episodes[ei]] = [s.episodes[ei], s.episodes[ei - 1]]; s.episodes.forEach((x, i) => { x.number = i + 1; }); await rerender(); } }, '↑') : null,
          h('button', { class: 'icon-btn', title: 'Dupliquer', onclick: async () => { const c = structuredClone(e); c.id = uid('ep'); c.title += ' (copie)'; s.episodes.splice(ei + 1, 0, c); s.episodes.forEach((x, i) => { x.number = i + 1; }); await rerender(); } }, '⧉'),
          s.episodes.length > 1 ? h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { if (await confirmBox(`Supprimer « ${e.title} » ?`, 'Supprimer')) { s.episodes.splice(ei, 1); s.episodes.forEach((x, i) => { x.number = i + 1; }); await rerender(); } } }, '🗑') : null) : null);
    })))));

  // ---- Distribution ----
  const castBox = h('div', { class: 'grid cards small' },
    p.cast.map((id) => byId[id]).filter(Boolean).map((c) => characterCard(c, h('button', { class: 'link danger', onclick: async () => { p.cast = p.cast.filter((x) => x !== c.id); await rerender(); } }, 'Retirer du projet'))),
    h('button', { class: 'card new small', onclick: addFromLibrary }, h('span', { class: 'plus' }, '+'), 'Ajouter un personnage'));

  async function addFromLibrary() {
    const available = library.filter((c) => !p.cast.includes(c.id));
    const chosen = new Set();
    const res = await modal('Ajouter des personnages', h('div', { class: 'form' },
      available.length ? h('div', { class: 'checklist' }, available.map((c) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? chosen.add(c.id) : chosen.delete(c.id)) }), h('b', {}, c.name), h('span', { class: 'muted small' }, ` — ${c.role}`))))
        : h('p', { class: 'muted' }, 'Votre bibliothèque ne contient pas d\'autre personnage.')),
    [{ label: 'Créer un nouveau personnage', kind: 'ghost', value: 'new' }, { label: 'Ajouter la sélection', value: 'add' }]);
    if (res === 'new') {
      const c = newCharacter({ name: 'Nouveau personnage' });
      await saveCharacter(c); p.cast.push(c.id); await saveProject(p);
      location.hash = `#/personnages/${c.id}`;
    } else if (res === 'add') { p.cast.push(...chosen); await rerender(); }
  }

  // ---- Décors ----
  const decorsBox = h('div', { class: 'decors' },
    p.decors.map((d, i) => h('div', { class: 'decor' },
      field('Nom du décor', d, 'name', { onChange: save }),
      field('Description visuelle (réutilisée dans chaque plan)', d, 'description', { type: 'textarea', rows: 2, onChange: save }),
      h('button', { class: 'link danger', onclick: async () => { p.decors.splice(i, 1); await rerender(); } }, 'Supprimer ce décor'))),
    h('button', { class: 'btn ghost', onclick: async () => { p.decors.push({ id: uid('dc'), name: 'Nouveau décor', description: '' }); await rerender(); } }, '+ Ajouter un décor'));

  const first = p.seasons[0]?.episodes[0];
  return h('section', { class: 'page' },
    h('a', { class: 'back', href: '#/' }, '← Projets'),
    h('div', { class: 'hero' },
      h('div', { class: 'grow' }, h('input', { class: 'inline-title big', value: p.title, oninput: (e) => { p.title = e.target.value; save(); } }),
        h('p', { class: 'muted' }, p.kind === 'film' ? 'Court-métrage' : 'Série animée', ' · ', FORMATS[p.format]?.label)),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: async () => { download(await exportProjectFile(p), `${slug(p.title)}.afrostudio.json`); toast('Sauvegarde téléchargée', 'ok'); } }, '💾 Sauvegarder (fichier)'),
        first ? h('a', { class: 'btn primary', href: `#/projet/${p.id}/${first.id}/idee` }, 'Ouvrir le studio →') : null)),
    h('div', { class: 'cols' },
      h('div', { class: 'col' },
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', {}, p.kind === 'film' ? 'Film' : 'Saisons et épisodes'),
            p.kind === 'serie' ? h('button', { class: 'btn small ghost', onclick: async () => { const n = p.seasons.length + 1; p.seasons.push({ id: uid('ss'), number: n, title: `Saison ${n}`, episodes: [newEpisode(1)] }); await rerender(); } }, '+ Saison') : null),
          seasons),
        h('div', { class: 'panel' }, h('h2', {}, 'Distribution (personnages du projet)'), castBox)),
      h('div', { class: 'col' },
        h('div', { class: 'panel' }, h('h2', {}, 'Réglages du projet'),
          field('Résumé (logline)', p, 'logline', { type: 'textarea', rows: 2, onChange: save }),
          field('Format vidéo', p, 'format', { options: Object.entries(FORMATS).map(([k, v]) => [k, v.label]), onChange: save }),
          field('Style visuel (texte libre, inséré dans tous les prompts)', p, 'style', { type: 'textarea', rows: 2, onChange: save, hint: 'Exemples : ' + STYLES.slice(0, 2).join(' / ') }),
          field('Langue principale des dialogues', p, 'language', { options: [['fr-FR', 'Français'], ['en-US', 'Anglais'], ['wo-SN', 'Wolof'], ['sw-KE', 'Swahili'], ['pt-PT', 'Portugais']], onChange: save })),
        h('div', { class: 'panel' }, h('h2', {}, 'Décors récurrents'),
          h('p', { class: 'muted small' }, 'Décrire un décor une fois garantit qu\'il sera décrit de la même manière dans tous les plans.'),
          decorsBox))));
}
