import { h, notice } from '../../ui.js';
import { newScene, newDialogue, newShot } from '../../store.js';

// Contexte compact envoyé au moteur de texte (jamais de clé API ici).
export function aiContext({ p, ep, season, cast }) {
  const idx = season.episodes.indexOf(ep);
  return {
    project: { title: p.title, logline: p.logline, style: p.style, format: p.format, language: p.language, kind: p.kind },
    episode: { title: ep.title, number: ep.number, ...ep.idea },
    previousEpisodes: season.episodes.slice(Math.max(0, idx - 3), idx).map((e) => ({ title: e.title, pitch: e.idea.pitch })),
    cast: cast.map((c) => ({ name: c.name, role: c.role, kind: c.kind, personality: c.personality, catchphrase: c.catchphrase })),
    decors: p.decors.map((d) => ({ name: d.name, description: d.description })),
  };
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function charIdByName(cast, name) {
  const n = norm(name);
  if (!n) return '';
  return (cast.find((c) => norm(c.name) === n) || cast.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n)))?.id || '';
}

export function sceneFromAI(r, ctx, base = null) {
  const decor = ctx.p.decors.find((d) => norm(d.name) === norm(r.location));
  const data = {
    title: r.title || 'Scène',
    decorId: decor?.id || '',
    location: decor ? '' : (r.location || ''),
    timeOfDay: r.timeOfDay || 'Jour',
    summary: r.summary || '',
    characters: (r.characters || []).map((n) => charIdByName(ctx.cast, n)).filter(Boolean),
    dialogues: (r.dialogues || []).map((d) => newDialogue({ characterId: charIdByName(ctx.cast, d.character), text: d.text || '', emotion: d.emotion || '' })),
    source: 'ia',
  };
  return base ? Object.assign(base, data) : newScene(data);
}

export function shotsFromAI(r, scene, ctx) {
  const shots = (r.shots || []).map((s) => newShot({
    shotType: s.shotType || 'Plan moyen', camera: s.camera || 'Fixe', description: s.description || '', action: s.action || '',
    duration: Math.max(1, Math.min(30, Number(s.duration) || 5)),
    characters: (s.characters || []).map((n) => charIdByName(ctx.cast, n)).filter(Boolean),
    _dl: s.dialogueIndexes || [],
  }));
  shots.forEach((s) => {
    for (const i of s._dl) if (scene.dialogues[i]) scene.dialogues[i].shotId = s.id;
    delete s._dl;
  });
  return shots;
}

export function sourceBadge(source) {
  if (source === 'ia') return h('span', { class: 'badge ai' }, '✨ IA');
  if (source === 'auto') return h('span', { class: 'badge demo' }, '🧪 Brouillon auto');
  return h('span', { class: 'badge soft' }, '✍️ Manuel');
}

export function aiNotice(textAI) {
  return textAI
    ? notice('real', 'Moteur de texte IA connecté : la génération est réelle et consomme des crédits sur votre compte.')
    : notice('demo', 'Aucun moteur IA connecté. Le bouton « Brouillon automatique » assemble une structure à partir de modèles (ce n\'est pas de l\'IA). Vous pouvez tout écrire et modifier à la main.');
}

// Assigne chaque réplique à un plan si elle n'en a pas encore
export function autoAssignDialogues(scene) {
  if (!scene.shots.length) return;
  const ids = new Set(scene.shots.map((s) => s.id));
  scene.dialogues.forEach((d, i) => {
    if (!ids.has(d.shotId)) d.shotId = scene.shots[Math.min(scene.shots.length - 1, scene.shots.length > 1 ? i + 1 : 0)].id;
  });
}
