// Registre des moteurs IA.
// Le navigateur ne contient AUCUNE clé API : il appelle un « serveur relais » (dossier /server)
// que vous déployez vous-même et qui détient les clés secrètes.

const KEY = 'afrostudio.engines';

export const CAPABILITIES = {
  text: { label: 'Texte (scénario, dialogues, storyboard)', icon: '✍️' },
  image: { label: 'Images (références, storyboard)', icon: '🖼️' },
  video: { label: 'Vidéo (clips animés)', icon: '🎞️' },
  voice: { label: 'Voix (synthèse vocale)', icon: '🎙️' },
};

export function getSettings() {
  try { return { proxyUrl: '', accessCode: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { proxyUrl: '', accessCode: '' }; }
}
export function setSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
  status = null;
}

let status = null; // { connected, capabilities, models, error }

export async function checkStatus(force = false) {
  if (status && !force) return status;
  const { proxyUrl } = getSettings();
  if (!proxyUrl) {
    status = { connected: false, capabilities: {}, error: 'Aucun serveur relais configuré' };
    return status;
  }
  try {
    const r = await fetch(proxyUrl.replace(/\/$/, '') + '/api/health', { headers: headers() });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    status = { connected: true, capabilities: j.capabilities || {}, models: j.models || {}, limits: j.limits || {} };
  } catch (e) {
    status = { connected: false, capabilities: {}, error: 'Serveur relais injoignable : ' + (e.message || e) };
  }
  return status;
}

export function cachedStatus() { return status; }

export async function can(capability) {
  const s = await checkStatus();
  return !!s.capabilities?.[capability];
}

function headers() {
  const { accessCode } = getSettings();
  return { 'Content-Type': 'application/json', ...(accessCode ? { 'X-Studio-Code': accessCode } : {}) };
}

// Appel générique de génération de texte structuré (tâches : script, scene, character, storyboard)
export async function generate(task, input) {
  const { proxyUrl } = getSettings();
  if (!proxyUrl) throw new Error('Aucun moteur IA connecté. Configurez le serveur relais dans Paramètres.');
  const r = await fetch(proxyUrl.replace(/\/$/, '') + '/api/generate', {
    method: 'POST', headers: headers(), body: JSON.stringify({ task, input }),
  });
  let j = {};
  try { j = await r.json(); } catch { /* réponse non JSON */ }
  if (!r.ok) throw new Error(j.error || `Le serveur a répondu ${r.status}`);
  return j.result;
}
