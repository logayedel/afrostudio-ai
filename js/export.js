// Export MP4 dans le navigateur avec FFmpeg WebAssembly (repris et généralisé de la V0.5).
// Le moteur (~30 Mo) est téléchargé au premier export ; les fichiers ne quittent pas l'appareil.
import { getBlobRecord } from './db.js';
import { buildFFmpegArgs, hasAudioStream } from './montage.js';

// Les petits fichiers JS de @ffmpeg/ffmpeg 0.12.10 et @ffmpeg/util 0.12.1 (MIT) sont hébergés dans /vendor :
// le « worker » doit être servi par le même site pour pouvoir charger ses modules.
const FF = new URL('../vendor/ffmpeg/index.js', import.meta.url).href;
const UTIL = new URL('../vendor/ffmpeg-util/index.js', import.meta.url).href;
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

const ext = (rec, fallback) => {
  const m = (rec?.name || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  const t = rec?.type || '';
  return t.includes('webm') ? 'webm' : t.includes('png') ? 'png' : t.includes('jpeg') ? 'jpg' : t.includes('mpeg') ? 'mp3' : t.includes('wav') ? 'wav' : t.includes('ogg') ? 'ogg' : fallback;
};

export async function exportMP4(timeline, settings, { onStatus = () => {}, onProgress = () => {} } = {}) {
  let ffmpeg = null;
  try {
    onStatus('Chargement du moteur de montage (≈30 Mo, une seule fois par session)…');
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import(FF), import(UTIL)]);
    ffmpeg = new FFmpeg();
    let log = '';
    ffmpeg.on('log', ({ message }) => { log += message + '\n'; if (message.includes('time=')) onStatus('Encodage en cours… ' + (message.match(/time=\S+/)?.[0] || '')); });
    ffmpeg.on('progress', ({ progress }) => { if (Number.isFinite(progress)) onProgress(Math.min(0.98, Math.max(0, progress))); });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    const write = async (blobId, name) => {
      const rec = await getBlobRecord(blobId);
      if (!rec) throw new Error('Fichier introuvable dans le stockage local (il a peut-être été supprimé).');
      const fname = `${name}.${ext(rec, 'bin')}`;
      await ffmpeg.writeFile(fname, new Uint8Array(await rec.blob.arrayBuffer()));
      return fname;
    };

    const files = { items: [], hasAudio: [], voices: [], music: null, overlays: [] };
    for (const [i, it] of timeline.items.entries()) {
      onStatus(`Préparation des plans : ${i + 1}/${timeline.items.length}`);
      files.overlays.push(it.overlay ? await write(it.overlay.blob, `overlay${i}`) : null);
      if (it.type === 'blank') { files.items.push(null); files.hasAudio.push(false); continue; }
      const f = await write(it.blob, `item${i}`);
      files.items.push(f);
      if (it.type === 'clip') {
        log = '';
        await ffmpeg.exec(['-hide_banner', '-i', f]); // lecture des infos du fichier (code d'erreur normal)
        files.hasAudio.push(hasAudioStream(log));
      } else files.hasAudio.push(false);
    }
    for (const [k, v] of timeline.voices.entries()) files.voices.push(await write(v.blob, `voice${k}`));
    if (timeline.music) files.music = await write(timeline.music.blob, 'music');

    const args = buildFFmpegArgs(timeline, files, settings);
    onStatus('Assemblage et encodage MP4… cela peut prendre plusieurs minutes.');
    log = '';
    const code = await ffmpeg.exec(args);
    if (code !== 0) throw new Error('Le moteur de montage a échoué (code ' + code + ').\n' + log.split('\n').slice(-6).join('\n'));
    const data = await ffmpeg.readFile('episode.mp4');
    if (!data || data.length < 1000) throw new Error('Le fichier MP4 produit est vide.');
    onProgress(1);
    return new Blob([data], { type: 'video/mp4' });
  } finally {
    if (ffmpeg) try { ffmpeg.terminate(); } catch { /* ignoré */ }
  }
}
