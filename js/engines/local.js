// Générateur LOCAL « Brouillon automatique » — ce n'est PAS de l'intelligence artificielle.
// Il assemble une structure narrative classique à partir de modèles, pour donner un point
// de départ modifiable quand aucun moteur IA n'est connecté.

const ARC = [
  { t: 'Présentation', s: 'On découvre {lieu} et {p1}, dans son quotidien.' },
  { t: 'L\'élément déclencheur', s: 'Un événement bouscule tout : {pitch}' },
  { t: 'Le défi', s: '{p1} décide d\'agir, mais {p2} n\'est pas d\'accord.' },
  { t: 'Complication', s: 'Rien ne se passe comme prévu : un obstacle inattendu met {p1} en difficulté.' },
  { t: 'Le retournement', s: '{p2} révèle une solution surprenante qui change la situation.' },
  { t: 'L\'effort commun', s: '{p1} et {p2} unissent leurs forces pour réussir.' },
  { t: 'Le moment d\'émotion', s: 'Une pause : {p1} comprend ce qui compte vraiment.' },
  { t: 'Conclusion', s: 'Tout se termine avec humour. {lecon}' },
];

const LINES = [
  ['Encore une belle journée qui commence !', 'Toi, tu es toujours de bonne humeur…'],
  ['Attends… tu as vu ça ?', 'Oh non. Ça ne présage rien de bon.'],
  ['Je m\'en occupe, fais-moi confiance.', 'La dernière fois que tu as dit ça…'],
  ['Pourquoi rien ne marche aujourd\'hui ?!', 'Respire. On va trouver.'],
  ['Et si on faisait autrement ?', 'Tu es un génie !'],
  ['Ensemble, on va y arriver.', 'Allez, on y va !'],
  ['Merci d\'être resté avec moi.', 'C\'est à ça que servent les amis.'],
  ['On recommence demain ?', 'Certainement pas ! … Bon, d\'accord.'],
];

function pickArc(n) {
  if (n >= ARC.length) return ARC.slice();
  const idx = [0];
  for (let i = 1; i < n - 1; i++) idx.push(Math.round((i * (ARC.length - 2)) / (n - 1)));
  idx.push(ARC.length - 1);
  return idx.map((i) => ARC[i]);
}

export function localScript({ project, episode, cast }) {
  const dur = Number(episode.idea.duration) || 60;
  const n = Math.max(2, Math.min(10, Math.round(dur / 15)));
  const p1 = cast[0]?.name || 'le héros';
  const p2 = cast[1]?.name || 'son ami';
  const lieu = project.decors[0]?.name || 'le quartier';
  const pitch = (episode.idea.pitch || 'une aventure commence.').trim();
  const lecon = episode.idea.lesson ? `Leçon : ${episode.idea.lesson}` : '';
  return pickArc(n).map((a, i) => ({
    title: a.t,
    location: project.decors.length ? '' : 'Lieu à définir',
    decorId: project.decors[i % Math.max(1, project.decors.length)]?.id || '',
    timeOfDay: 'Jour',
    summary: a.s.replaceAll('{p1}', p1).replaceAll('{p2}', p2).replaceAll('{lieu}', lieu).replaceAll('{pitch}', pitch).replaceAll('{lecon}', lecon).trim(),
    characters: cast.slice(0, 3).map((c) => c.id),
    dialogues: (cast.length ? LINES[ARC.indexOf(a) % LINES.length] : []).map((text, j) => ({
      characterId: cast[j % Math.min(2, cast.length)]?.id || '',
      text, emotion: '',
    })),
  }));
}

const SHOT_PATTERN = [
  ['Plan d\'ensemble', 'Drone / vue aérienne', 'Vue générale du décor qui situe l\'action'],
  ['Plan moyen', 'Travelling latéral', 'Les personnages en situation'],
  ['Gros plan', 'Fixe', 'Réaction expressive du personnage principal'],
  ['Plan américain', 'Suivi du personnage', 'L\'action principale de la scène'],
  ['Contre-plongée', 'Zoom avant', 'Moment fort ou chute comique'],
];

export function localStoryboard({ episode, scene }) {
  const total = Number(episode.idea.duration) || 60;
  const sceneDur = Math.max(5, total / Math.max(1, episode.scenes.length));
  const count = Math.max(1, Math.min(5, Math.round(sceneDur / 5)));
  const per = Math.round((sceneDur / count) * 10) / 10;
  const shots = [];
  for (let i = 0; i < count; i++) {
    const [shotType, camera, base] = SHOT_PATTERN[i % SHOT_PATTERN.length];
    shots.push({
      shotType, camera,
      description: `${base}. ${scene.summary || ''}`.trim(),
      action: i === 0 ? 'Mise en place de la scène' : (scene.dialogues[i - 1]?.text ? `Réplique : « ${scene.dialogues[i - 1].text} »` : 'Réaction et mouvement'),
      duration: per,
      characters: i === 0 ? scene.characters.slice() : scene.characters.slice(0, 2),
    });
  }
  return shots;
}
