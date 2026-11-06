// Construction des "fiches d'identité" et des prompts de plans.
// Objectif : décrire toujours les personnages et décors avec EXACTEMENT les mêmes mots,
// pour maximiser la cohérence visuelle entre scènes et épisodes, quel que soit le moteur.

import { FORMATS } from './store.js';

export function identitySheet(c) {
  if (!c) return '';
  const parts = [
    `${c.name || 'Personnage'}${c.kind ? ` (${c.kind}` + (c.age ? `, ${c.age}` : '') + ')' : ''}`,
    c.appearance && `apparence : ${c.appearance}`,
    c.outfit && `tenue : ${c.outfit}`,
    c.colors && `couleurs dominantes : ${c.colors}`,
  ].filter(Boolean);
  return parts.join(' ; ');
}

export function characterReferencePrompt(c, project) {
  return [
    `Planche de référence de personnage (character sheet) pour un dessin animé.`,
    project?.style ? `Style : ${project.style}.` : '',
    `Personnage : ${identitySheet(c)}.`,
    c.personality ? `Personnalité visible dans la posture et l'expression : ${c.personality}.` : '',
    `Vues : face, trois-quarts, profil et dos, pose neutre, plus 3 expressions (joie, colère, surprise).`,
    `Fond uni clair, éclairage neutre, proportions constantes, aucun texte.`,
  ].filter(Boolean).join(' ');
}

export function decorSheet(project, scene) {
  const d = project.decors.find((x) => x.id === scene.decorId);
  if (d) return `${d.name} — ${d.description}`.trim();
  return scene.location || '';
}

export function shotPrompt(project, episode, scene, shot, charactersById) {
  if (shot.promptOverride && shot.promptOverride.trim()) return shot.promptOverride.trim();
  const fmt = FORMATS[project.format] || FORMATS['9:16'];
  const ids = shot.characters?.length ? shot.characters : scene.characters;
  const chars = ids.map((id) => charactersById[id]).filter(Boolean);
  const lines = scene.dialogues.filter((d) => d.shotId === shot.id && d.text);
  return [
    `${project.style}. Format ${project.format === '16:9' ? 'horizontal 16:9' : 'vertical 9:16'} (${fmt.w}x${fmt.h}).`,
    `Série « ${project.title} »${episode ? `, ${episode.title}` : ''}, scène « ${scene.title} ».`,
    decorSheet(project, scene) ? `Décor : ${decorSheet(project, scene)}, ${scene.timeOfDay?.toLowerCase() || 'jour'}.` : '',
    chars.length ? `Personnages (apparence identique dans tous les plans) : ${chars.map(identitySheet).join(' | ')}.` : '',
    `Cadrage : ${shot.shotType}. Mouvement de caméra : ${shot.camera}.`,
    shot.description ? `Image : ${shot.description}.` : '',
    shot.action ? `Action : ${shot.action}.` : '',
    lines.length ? `Les personnages parlent (mouvements de bouche) : ${lines.map((l) => `${charactersById[l.characterId]?.name || '?'} : « ${l.text} »`).join(' ')}` : '',
    `Durée : ${shot.duration} secondes. Expressions marquées, animation fluide. Aucun texte ni sous-titre incrusté.`,
  ].filter(Boolean).join(' ');
}

export function scriptToText(project, episode, charactersById) {
  const out = [`${project.title.toUpperCase()} — ${episode.title}`, '', episode.idea.pitch ? `Pitch : ${episode.idea.pitch}` : '', ''];
  episode.scenes.forEach((s, i) => {
    out.push(`SCÈNE ${i + 1} — ${s.title.toUpperCase()}`);
    out.push(`${decorSheet(project, s) || 'Lieu à définir'} — ${s.timeOfDay}`);
    if (s.summary) out.push('', s.summary);
    out.push('');
    for (const d of s.dialogues) {
      out.push(`    ${(charactersById[d.characterId]?.name || 'NARRATEUR').toUpperCase()}${d.emotion ? ` (${d.emotion})` : ''}`);
      out.push(`    ${d.text}`, '');
    }
    out.push('');
  });
  return out.join('\n');
}
