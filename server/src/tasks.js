// Tâches de génération : consigne système, prompt et schéma JSON de sortie.

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const dialogue = obj({ character: str, text: str, emotion: str });
const scene = obj({ title: str, location: str, timeOfDay: str, summary: str, characters: strs, dialogues: { type: 'array', items: dialogue } });

const SYSTEM = `Tu es le scénariste principal d'AfroStudio AI, un studio de dessins animés.
Tu écris des histoires originales, chaleureuses et visuelles, souvent inspirées des cultures africaines, sans clichés ni stéréotypes.
Règles :
- Écris dans la langue demandée (par défaut le français), avec des dialogues courts, naturels et faciles à doubler.
- Utilise UNIQUEMENT les noms des personnages fournis (exactement orthographiés). « Narrateur » est permis pour la voix off.
- Pour les lieux, réutilise de préférence le nom exact d'un décor fourni.
- Respecte la durée cible : environ une scène pour 10 à 20 secondes, et 2 à 4 répliques par scène de 15 secondes.
- Adapte le vocabulaire au public indiqué. Pas de violence explicite pour les enfants.`;

const ctx = (i) => JSON.stringify({ projet: i.project, episode: i.episode, episodesPrecedents: i.previousEpisodes, personnages: i.cast, decors: i.decors }, null, 1);

export const TASKS = {
  script: {
    system: SYSTEM,
    schema: obj({ title: str, scenes: { type: 'array', items: scene } }),
    prompt: (i) => `Écris le scénario complet de cet épisode, découpé en scènes.
Contexte :
${ctx(i)}
${i.lockedScenes?.length ? `Scènes déjà validées à conserver (ne les réécris pas, mais garde la cohérence) : ${JSON.stringify(i.lockedScenes)}` : ''}
Durée cible : ${i.episode?.duration || 60} secondes. Le champ "characters" liste les personnages présents. "timeOfDay" parmi : Jour, Matin, Après-midi, Coucher du soleil, Nuit, Intérieur.`,
  },
  scene: {
    system: SYSTEM,
    schema: scene,
    prompt: (i) => `Réécris UNIQUEMENT la scène n°${(i.sceneIndex ?? 0) + 1} de cet épisode, en gardant la continuité avec les scènes voisines.
Contexte :
${ctx(i)}
Scènes précédentes : ${JSON.stringify(i.before || [])}
Scènes suivantes : ${JSON.stringify(i.after || [])}
Version actuelle de la scène : ${JSON.stringify(i.current || {})}
Instruction de l'auteur : ${i.instruction || 'propose une meilleure version'}`,
  },
  character: {
    system: `Tu es directeur artistique de personnages pour un studio de dessins animés. Tu crées des fiches précises et visuelles, réutilisables mot pour mot dans des prompts d'images et de vidéos. Écris en français. Décris des traits concrets (formes, couleurs, matières), jamais vagues.`,
    schema: obj({ name: str, role: str, kind: str, age: str, appearance: str, outfit: str, colors: str, personality: str, catchphrase: str, voiceTone: str }),
    prompt: (i) => `Complète la fiche de ce personnage à partir de la description de l'auteur.
Nom proposé : ${i.name || '(à inventer)'} · Rôle : ${i.role || ''}
Description : ${i.description}
- appearance : visage, corps, cheveux, signes distinctifs (2 à 3 phrases).
- outfit : tenue et accessoires constants.
- colors : 2 à 4 couleurs dominantes.
- voiceTone : description courte de la voix.`,
  },
  storyboard: {
    system: `Tu es storyboarder pour un studio de dessins animés. Tu découpes une scène en plans courts, filmables par un moteur de génération vidéo (5 à 10 secondes par plan). Écris en français. Chaque description doit être visuelle et autonome.`,
    schema: obj({ shots: { type: 'array', items: obj({ shotType: str, camera: str, description: str, action: str, duration: { type: 'number' }, characters: strs, dialogueIndexes: { type: 'array', items: { type: 'integer' } } }) } }),
    prompt: (i) => `Découpe cette scène en plans. Durée totale visée : environ ${i.targetDuration || 15} secondes.
Contexte du projet : ${JSON.stringify({ titre: i.project?.title, style: i.project?.style, format: i.project?.format })}
Scène : ${JSON.stringify(i.scene)}
- shotType parmi : Plan d'ensemble, Plan large, Plan moyen, Plan américain, Gros plan, Très gros plan, Plan subjectif, Plongée, Contre-plongée.
- camera parmi : Fixe, Panoramique gauche, Panoramique droite, Travelling avant, Travelling arrière, Travelling latéral, Zoom avant, Zoom arrière, Caméra portée, Drone / vue aérienne, Suivi du personnage.
- dialogueIndexes : index des répliques prononcées pendant ce plan (chaque réplique dans un seul plan).
- characters : noms exacts des personnages visibles.`,
  },
};
