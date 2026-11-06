// Audio local : aperçu des voix (synthèse du navigateur) et enregistrement au micro.
// Ces fonctions sont RÉELLES et gratuites, mais l'aperçu par synthèse du navigateur
// ne peut pas être inclus dans l'export MP4 (limite technique des navigateurs).

export function voicesFor(lang) {
  if (!('speechSynthesis' in window)) return [];
  const all = speechSynthesis.getVoices();
  const base = (lang || 'fr').slice(0, 2);
  return all.filter((v) => v.lang.toLowerCase().startsWith(base));
}

export function speak(text, voice = {}) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice.lang || 'fr-FR';
  u.pitch = Number(voice.pitch) || 1;
  u.rate = Number(voice.rate) || 1;
  const v = voicesFor(u.lang).find((x) => x.name === voice.browserVoice) || voicesFor(u.lang)[0];
  if (v) u.voice = v;
  speechSynthesis.speak(u);
  return new Promise((r) => { u.onend = r; u.onerror = r; });
}

export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }

// Enregistrement micro → Blob audio
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
      rec.stop();
    }),
  };
}
