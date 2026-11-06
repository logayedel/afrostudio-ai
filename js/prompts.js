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

export const LANGUAGES = { 'fr-FR': 'français', 'en-US': 'anglais', 'wo-SN': 'wolof', 'sw-KE': 'swahili', 'ha-NG': 'haoussa', 'yo-NG': 'yoruba', 'ln-CD': 'lingala', 'ar-SA': 'arabe', 'pt-PT': 'portugais', 'es-ES': 'espagnol' };

// Fiche voix : décrite toujours avec les mêmes mots pour que le moteur vidéo (ex. Grok)
// garde la même voix d'un clip à l'autre.
export function voiceSheet(c) {
  if (!c) return '';
  const v = c.voice || {};
  if (v.description && v.description.trim()) return `${c.name} : ${v.description.trim()}`;
  const pitch = Number(v.pitch) || 1, rate = Number(v.rate) || 1;
  const parts = [
    ({ masculin: 'voix masculine', 'féminin': 'voix féminine', enfant: "voix d'enfant" })[v.gender] || 'voix',
    c.age ? `(${c.age})` : '',
    v.tone ? `, ${v.tone.toLowerCase()}` : '',
    pitch < 0.9 ? ', grave' : pitch > 1.15 ? ', aiguë' : '',
    rate < 0.95 ? ', débit posé' : rate > 1.1 ? ', débit rapide' : '',
    v.accent ? `, accent ${v.accent.replace(/^accent\s+/i, '')}` : '',
  ];
  return `${c.name} : ${parts.join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()}`;
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
    lines.length && project.clipVoices === 'non' ? `Les personnages parlent (mouvements de bouche synchronisés), mais AUCUNE voix ni parole audible : uniquement les bruitages et l'ambiance sonore.` : '',
    lines.length && project.clipVoices !== 'non' ? `Dialogues en ${LANGUAGES[project.language] || 'français'}, synchronisés avec les mouvements de bouche : ${lines.map((l) => `${charactersById[l.characterId]?.name || 'Narrateur (voix off)'} : « ${l.text} »`).join(' ')}` : '',
    project.clipVoices !== 'non' && speakers(lines, charactersById).length ? `Voix des personnages (exactement les mêmes dans tous les clips de la série) : ${speakers(lines, charactersById).map(voiceSheet).join(' | ')}.` : '',
    `Durée : ${shot.duration} secondes. Expressions marquées, animation fluide. Aucun sous-titre ni texte ajouté à l'image ; les inscriptions peintes sur les personnages et les véhicules restent visibles.`,
  ].filter(Boolean).join(' ');
}

// Prompt d'IMAGE fixe pour un plan (première image du clip, à créer dans ChatGPT par ex.)
export function shotImagePrompt(project, episode, scene, shot, charactersById) {
  const fmt = FORMATS[project.format] || FORMATS['9:16'];
  const ids = shot.characters?.length ? shot.characters : scene.characters;
  const chars = ids.map((id) => charactersById[id]).filter(Boolean);
  return [
    `Crée une image fixe ${project.format === '16:9' ? 'horizontale 16:9' : 'verticale 9:16'} (${fmt.w}x${fmt.h}) : la première image d'un plan de dessin animé.`,
    `Style : ${project.style}.`,
    decorSheet(project, scene) ? `Décor : ${decorSheet(project, scene)}, ${scene.timeOfDay?.toLowerCase() || 'jour'}.` : '',
    chars.length ? `Personnages (respecte exactement leur apparence${chars.some((c) => c.refImages?.length) ? ' et les images de référence jointes' : ''}) : ${chars.map(identitySheet).join(' | ')}.` : '',
    `Cadrage : ${shot.shotType}.`,
    shot.description ? `Image : ${shot.description}.` : '',
    shot.action ? `Moment représenté : ${shot.action}.` : '',
    `Expressions marquées. Aucun sous-titre ni texte ajouté ; les inscriptions peintes sur les personnages et les véhicules restent visibles.`,
  ].filter(Boolean).join(' ');
}

function speakers(lines, byId) {
  const seen = new Set();
  return lines.map((l) => byId[l.characterId]).filter((c) => c && !seen.has(c.id) && seen.add(c.id));
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
