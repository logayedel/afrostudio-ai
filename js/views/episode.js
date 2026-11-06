import { h } from '../ui.js';
import { getProject, findEpisode, autosave, saveProject, listCharacters } from '../store.js';
import { checkStatus } from '../engines/index.js';
import { ideaStep } from './steps/idea.js';
import { scriptStep } from './steps/script.js';
import { castStep } from './steps/cast.js';
import { storyboardStep } from './steps/storyboard.js';
import { animationStep } from './steps/animation.js';
import { audioStep } from './steps/audio.js';
import { montageStep } from './steps/montage.js';

export const STEPS = [
  ['idee', 'Idée', ideaStep],
  ['scenario', 'Scénario', scriptStep],
  ['personnages', 'Personnages', castStep],
  ['storyboard', 'Storyboard', storyboardStep],
  ['animation', 'Animation', animationStep],
  ['audio', 'Audio', audioStep],
  ['montage', 'Montage & Export', montageStep],
];

export async function episodeView({ projectId, episodeId, step }) {
  const p = await getProject(projectId);
  if (!p) throw new Error('Projet introuvable');
  const found = findEpisode(p, episodeId);
  if (!found) throw new Error('Épisode introuvable');
  const { season, episode: ep } = found;
  const library = await listCharacters();
  const byId = Object.fromEntries(library.map((c) => [c.id, c]));
  const status = await checkStatus();
  const ctx = {
    p, ep, season, library, byId, status,
    cast: p.cast.map((id) => byId[id]).filter(Boolean),
    save: () => autosave('project', p),
    rerender: async () => { await saveProject(p); dispatchEvent(new HashChangeEvent('hashchange')); },
    go: (s) => { location.hash = `#/projet/${p.id}/${ep.id}/${s}`; },
  };
  const idx = Math.max(0, STEPS.findIndex(([k]) => k === step));
  const [key, , render] = STEPS[idx];

  const done = {
    idee: !!ep.idea.pitch,
    scenario: ep.scenes.length > 0,
    personnages: ctx.cast.length > 0,
    storyboard: ep.scenes.some((s) => s.shots.length),
    animation: ep.scenes.some((s) => s.shots.some((x) => x.clip)),
    audio: ep.scenes.some((s) => s.dialogues.some((d) => d.audio)) || !!ep.music,
    montage: false,
  };

  const episodesSel = h('select', { class: 'ep-select', onchange: (e) => { location.hash = `#/projet/${p.id}/${e.target.value}/${key}`; } },
    p.seasons.map((s) => h('optgroup', { label: s.title }, s.episodes.map((e) => h('option', { value: e.id, selected: e.id === ep.id }, p.kind === 'film' ? e.title : `${e.number}. ${e.title}`)))));

  return h('section', { class: 'page studio' },
    h('div', { class: 'studio-head' },
      h('a', { class: 'back', href: `#/projet/${p.id}` }, '← ', p.title),
      p.kind === 'serie' || p.seasons[0].episodes.length > 1 ? episodesSel : null),
    h('nav', { class: 'stepper', 'aria-label': 'Étapes de production' },
      STEPS.map(([k, label], i) => h('a', { href: `#/projet/${p.id}/${ep.id}/${k}`, class: `step ${k === key ? 'current' : ''} ${done[k] ? 'done' : ''}` },
        h('span', { class: 'n' }, done[k] && k !== key ? '✓' : i + 1), h('span', { class: 'l' }, label)))),
    await render(ctx),
    h('div', { class: 'step-nav' },
      idx > 0 ? h('a', { class: 'btn ghost', href: `#/projet/${p.id}/${ep.id}/${STEPS[idx - 1][0]}` }, '← ', STEPS[idx - 1][1]) : h('span'),
      idx < STEPS.length - 1 ? h('a', { class: 'btn primary', href: `#/projet/${p.id}/${ep.id}/${STEPS[idx + 1][0]}` }, STEPS[idx + 1][1], ' →') : null));
}
