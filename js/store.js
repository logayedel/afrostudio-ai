// Modèle de données d'AfroStudio AI et sauvegarde automatique.
import { db, putBlob, getBlobRecord } from './db.js';

export const uid = (p = 'id') => `${p}_${crypto.randomUUID().slice(0, 8)}`;
export const SCHEMA_VERSION = 1;

export const FORMATS = {
  '9:16': { label: 'Vertical 9:16 (TikTok, Reels, Shorts)', w: 720, h: 1280 },
  '16:9': { label: 'Horizontal 16:9 (YouTube, TV)', w: 1280, h: 720 },
};

export const STYLES = [
  'Animation 3D colorée, style long-métrage familial',
  'Dessin animé 2D, traits nets, couleurs vives',
  'Style papier découpé inspiré des wax africains',
  'Animation 2D semi-réaliste, lumière chaude',
  'Pâte à modeler (stop motion)',
];

export const SHOT_TYPES = ['Plan d\'ensemble', 'Plan large', 'Plan moyen', 'Plan américain', 'Gros plan', 'Très gros plan', 'Plan subjectif', 'Plongée', 'Contre-plongée'];
export const CAMERA_MOVES = ['Fixe', 'Panoramique gauche', 'Panoramique droite', 'Travelling avant', 'Travelling arrière', 'Travelling latéral', 'Zoom avant', 'Zoom arrière', 'Caméra portée', 'Drone / vue aérienne', 'Suivi du personnage'];

export function newCharacter(data = {}) {
  return {
    id: uid('chr'), name: '', role: 'Personnage principal', kind: 'Humain', age: '',
    description: '', appearance: '', outfit: '', colors: '', personality: '', catchphrase: '',
    voice: { lang: 'fr-FR', accent: 'Français d\'Afrique de l\'Ouest', gender: 'neutre', tone: 'Chaleureuse', pitch: 1, rate: 1, browserVoice: '' },
    refImages: [], createdAt: Date.now(), updatedAt: Date.now(), ...data,
  };
}

export function newEpisode(number = 1, title = '') {
  return {
    id: uid('ep'), number, title: title || `Épisode ${number}`,
    idea: { pitch: '', tone: 'Comédie familiale', audience: 'Tous publics (6+)', duration: 60, notes: '', lesson: '' },
    scenes: [], music: null, exportSettings: { fit: 'crop', keepClipAudio: 'oui', quality: 'fast', includeMissing: 'oui' },
    createdAt: Date.now(),
  };
}

export function newScene(data = {}) {
  return { id: uid('sc'), title: 'Nouvelle scène', decorId: '', location: '', timeOfDay: 'Jour', summary: '', characters: [], dialogues: [], shots: [], locked: false, source: 'manuel', ...data };
}

export function newShot(data = {}) {
  return { id: uid('sh'), shotType: 'Plan moyen', camera: 'Fixe', action: '', description: '', duration: 5, characters: [], refImage: null, clip: null, promptOverride: '', ...data };
}

export function newDialogue(data = {}) {
  return { id: uid('dl'), characterId: '', text: '', emotion: '', audio: null, shotId: '', offset: 0.3, ...data };
}

export function newProject({ title, kind = 'serie', format = '9:16', style = STYLES[0], logline = '', language = 'fr-FR' }) {
  const p = {
    id: uid('prj'), schema: SCHEMA_VERSION, title: title || 'Projet sans titre', kind, format, style, logline, language,
    cast: [], decors: [], seasons: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  p.seasons.push({ id: uid('ss'), number: 1, title: kind === 'film' ? 'Film' : 'Saison 1', episodes: [newEpisode(1, kind === 'film' ? title : '')] });
  return p;
}

// ---------- Accès aux données ----------
export async function listProjects() {
  const all = await db.all('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getProject = (id) => db.get('projects', id);
export async function saveProject(p) { p.updatedAt = Date.now(); await db.put('projects', p); }
export const deleteProject = (id) => db.del('projects', id);

export async function listCharacters() {
  const all = await db.all('characters');
  return all.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
}
export const getCharacter = (id) => db.get('characters', id);
export async function saveCharacter(c) { c.updatedAt = Date.now(); await db.put('characters', c); }
export const deleteCharacter = (id) => db.del('characters', id);

// Sauvegarde différée (évite d'écrire à chaque frappe)
const timers = new Map();
export function autosave(kind, obj, delay = 500) {
  const key = kind + obj.id;
  clearTimeout(timers.get(key));
  setSaveState('pending');
  timers.set(key, setTimeout(async () => {
    timers.delete(key);
    try {
      if (kind === 'project') await saveProject(obj); else await saveCharacter(obj);
      setSaveState('saved');
    } catch (e) {
      console.error(e);
      setSaveState('error');
    }
  }, delay));
}
export async function flushSaves() {
  // Les timers restants seront exécutés ; on attend juste un peu.
  if (timers.size) await new Promise((r) => setTimeout(r, 600));
}
function setSaveState(s) {
  const el = document.getElementById('saveState');
  if (!el) return;
  el.dataset.state = s;
  el.textContent = s === 'pending' ? 'Enregistrement…' : s === 'saved' ? 'Enregistré ✓' : 'Erreur d\'enregistrement';
}

// ---------- Navigation dans un projet ----------
export function findEpisode(project, epId) {
  for (const s of project.seasons) for (const e of s.episodes) if (e.id === epId) return { season: s, episode: e };
  return null;
}
export function allShots(episode) {
  const out = [];
  for (const sc of episode.scenes) for (const sh of sc.shots) out.push({ scene: sc, shot: sh });
  return out;
}

// ---------- Sauvegarde / restauration d'un projet complet (fichier) ----------
async function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}
function collectBlobIds(obj, set = new Set()) {
  if (!obj || typeof obj !== 'object') return set;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.startsWith('b_') && ['refImage', 'clip', 'audio', 'blob', 'file', 'image'].includes(k)) set.add(v);
    else if (typeof v === 'object') collectBlobIds(v, set);
  }
  if (Array.isArray(obj.refImages)) obj.refImages.forEach((x) => set.add(x));
  return set;
}

export async function exportProjectFile(project, withMedia = true) {
  const characters = (await Promise.all(project.cast.map(getCharacter))).filter(Boolean);
  const blobs = {};
  if (withMedia) {
    const ids = collectBlobIds(project);
    characters.forEach((c) => collectBlobIds(c, ids));
    for (const id of ids) {
      const rec = await getBlobRecord(id);
      if (rec) blobs[id] = { name: rec.name, data: await blobToDataURL(rec.blob) };
    }
  }
  return new Blob([JSON.stringify({ app: 'AfroStudio AI', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), project, characters, blobs })], { type: 'application/json' });
}

export async function importProjectFile(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'AfroStudio AI' || !data.project) throw new Error('Ce fichier n\'est pas une sauvegarde AfroStudio AI.');
  const idMap = {};
  for (const [oldId, b] of Object.entries(data.blobs || {})) {
    const blob = await (await fetch(b.data)).blob();
    idMap[oldId] = await putBlob(blob, b.name);
  }
  const remap = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && idMap[v] ? idMap[v] : v));
  for (const c of data.characters || []) {
    const existing = await getCharacter(c.id);
    if (!existing) await db.put('characters', remap(c));
  }
  const p = remap(data.project);
  if (await getProject(p.id)) { p.id = uid('prj'); p.title += ' (copie importée)'; }
  await saveProject(p);
  return p;
}

// Modifie un projet en relisant la version enregistrée (sûr même si la page a été réaffichée entre-temps)
export async function mutateProject(projectId, fn) {
  await flushSaves();
  const p = await getProject(projectId);
  if (!p) throw new Error('Projet introuvable');
  await fn(p);
  await saveProject(p);
  dispatchEvent(new HashChangeEvent('hashchange'));
}
export async function mutateCharacter(characterId, fn) {
  await flushSaves();
  const c = await getCharacter(characterId);
  if (!c) throw new Error('Personnage introuvable');
  await fn(c);
  await saveCharacter(c);
  dispatchEvent(new HashChangeEvent('hashchange'));
}
export function findShot(project, shotId) {
  for (const s of project.seasons) for (const e of s.episodes) for (const sc of e.scenes) for (const sh of sc.shots) if (sh.id === shotId) return { episode: e, scene: sc, shot: sh };
  return null;
}
