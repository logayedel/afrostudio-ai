import { h, toast, pickFile, notice, field, mediaDuration, fmtTime } from '../../ui.js';
import { putBlob, blobURL } from '../../db.js';
import { speak, startRecording } from '../../audio.js';
import { autoAssignDialogues } from './common.js';

export function audioStep(ctx) {
  const { ep, byId, save, rerender, status } = ctx;
  const voiceAI = !!status.capabilities?.voice;
  const lines = ep.scenes.flatMap((s) => s.dialogues);
  const withAudio = lines.filter((d) => d.audio).length;
  let recording = null;

  const player = (id) => {
    const a = h('audio', { controls: true, preload: 'metadata' });
    blobURL(id).then((u) => { if (u) a.src = u; });
    return a;
  };

  const lineRow = (scene, d) => {
    const c = byId[d.characterId];
    const recBtn = h('button', { class: 'btn small ghost', onclick: async () => {
      try {
        if (!recording) {
          recording = await startRecording();
          recBtn.textContent = '⏹ Arrêter l\'enregistrement'; recBtn.classList.add('rec');
        } else {
          const blob = await recording.stop(); recording = null;
          d.audio = await putBlob(blob, `voix-${c?.name || 'narrateur'}.webm`);
          d.audioDuration = await mediaDuration(blob, 'audio');
          await rerender();
        }
      } catch (e) { recording = null; toast('Micro indisponible : ' + e.message, 'error'); }
    } }, '🎤 Enregistrer ma voix');

    return h('div', { class: 'line-row' },
      h('div', { class: 'grow' },
        h('div', {}, h('b', {}, c?.name || 'Narrateur'), d.emotion ? h('span', { class: 'muted small' }, ` (${d.emotion})`) : null),
        h('p', { class: 'line-text' }, d.text || h('i', { class: 'muted' }, 'Réplique vide')),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn small ghost', onclick: () => speak(d.text, c?.voice || { lang: ctx.p.language }) }, '🔊 Aperçu (voix du navigateur)'),
          recBtn,
          h('button', { class: 'btn small ghost', onclick: async () => {
            const f = await pickFile('audio/*'); if (!f) return;
            d.audio = await putBlob(f, f.name); d.audioDuration = await mediaDuration(f, 'audio'); await rerender();
          } }, '⬆ Importer un fichier audio'),
          h('button', { class: 'btn small ghost', disabled: !voiceAI, title: voiceAI ? '' : 'Aucun moteur de voix connecté' }, '✨ Voix IA')),
        d.audio ? h('div', { class: 'row wrap' }, player(d.audio),
          h('button', { class: 'link danger', onclick: async () => { d.audio = null; await rerender(); } }, 'Retirer')) : null),
      scene.shots.length ? h('div', { class: 'line-place' },
        field('Placée sur le plan', d, 'shotId', { options: scene.shots.map((s, i) => [s.id, `Plan ${i + 1} (${s.shotType})`]), onChange: save }),
        field('Décalage (s)', d, 'offset', { type: 'number', min: 0, max: 60, step: 0.1, onChange: save })) : h('small', { class: 'muted' }, 'Pas de plan : la réplique ne sera pas placée au montage.'));
  };

  ep.scenes.forEach(autoAssignDialogues);

  return h('div', {},
    h('div', { class: 'panel' },
      h('h2', {}, '🎙️ Studio audio'),
      h('div', { class: 'progress-line' }, h('progress', { max: lines.length || 1, value: withAudio }), h('span', {}, `${withAudio}/${lines.length} répliques avec une piste audio`)),
      notice('real', 'Fonctionne dès maintenant : aperçu des répliques avec les voix du navigateur, enregistrement au micro, import de fichiers audio (voix, bruitages). Les pistes importées ou enregistrées sont mixées automatiquement dans l\'export MP4.'),
      voiceAI ? null : notice('off', 'Aucun moteur de voix IA connecté : les voix de personnages réalistes et les accents ne sont pas encore générés automatiquement. L\'aperçu navigateur n\'est pas inclus dans l\'export.')),
    h('div', { class: 'panel' },
      h('h3', {}, '🎵 Musique et ambiance de l\'épisode'),
      ep.music
        ? h('div', {},
          h('div', { class: 'row wrap' }, h('b', {}, ep.music.name), h('span', { class: 'muted small' }, fmtTime(ep.music.duration)), player(ep.music.blob)),
          h('div', { class: 'two' },
            field('Volume de la musique (0 à 1)', ep.music, 'volume', { type: 'number', min: 0, max: 1, step: 0.05, onChange: save }),
            field('Répéter en boucle si trop courte', ep.music, 'loop', { options: [['oui', 'Oui'], ['non', 'Non']], onChange: save })),
          h('button', { class: 'link danger', onclick: async () => { ep.music = null; await rerender(); } }, 'Retirer la musique'))
        : h('button', { class: 'btn ghost', onclick: async () => {
          const f = await pickFile('audio/*'); if (!f) return;
          ep.music = { blob: await putBlob(f, f.name), name: f.name, volume: 0.25, loop: 'oui', duration: await mediaDuration(f, 'audio') };
          await rerender();
        } }, '⬆ Importer une musique (MP3, WAV…)'),
      h('p', { class: 'muted small' }, 'Utilisez uniquement des musiques dont vous avez les droits (créations, banques libres de droits).')),
    ep.scenes.length ? ep.scenes.map((s, i) => h('div', { class: 'panel' },
      h('h3', {}, `Scène ${i + 1} — ${s.title}`),
      s.dialogues.length ? s.dialogues.map((d) => lineRow(s, d)) : h('p', { class: 'muted small' }, 'Aucune réplique dans cette scène.')))
      : h('p', { class: 'empty' }, 'Écrivez d\'abord le scénario.'));
}
