import { h, toast, copyText, pickFile, notice, mediaDuration, fmtTime } from '../../ui.js';
import { putBlob, blobURL, getBlobRecord } from '../../db.js';
import { allShots } from '../../store.js';
import { shotPrompt } from '../../prompts.js';

export function animationStep(ctx) {
  const { p, ep, byId, rerender, status } = ctx;
  const videoAI = !!status.capabilities?.video;
  const shots = allShots(ep);
  const ready = shots.filter((x) => x.shot.clip).length;
  const fmtClass = `fmt-${p.format.replace(':', 'x')}`;

  const row = ({ scene, shot }, n) => {
    const media = h('div', { class: `clip-box ${fmtClass}` }, h('span', { class: 'muted small' }, 'Pas de clip'));
    if (shot.clip) blobURL(shot.clip).then((u) => u && media.replaceChildren(h('video', { src: u, controls: true, playsinline: true, preload: 'metadata' })));
    else if (shot.refImage) blobURL(shot.refImage).then((u) => u && media.replaceChildren(h('img', { src: u, alt: '', class: 'faded' })));
    const info = h('span', { class: 'small muted' });
    if (shot.clip) getBlobRecord(shot.clip).then((r) => { info.textContent = `${r?.name || 'clip'} · ${fmtTime(shot.clipDuration)} · ${Math.round((r?.size || 0) / 1e5) / 10} Mo`; });

    return h('div', { class: 'anim-row' },
      media,
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('b', {}, `Plan ${n + 1}`), h('span', { class: 'muted small' }, ` — ${scene.title} · ${shot.shotType} · ${shot.duration} s`)),
        h('p', { class: 'small clamp' }, shot.description || shot.action),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn small ghost', onclick: () => copyText(shotPrompt(p, ep, scene, shot, byId)) }, '📋 Copier le prompt'),
          h('button', { class: 'btn small', onclick: async () => {
            const f = await pickFile('video/mp4,video/webm,video/quicktime,video/*'); if (!f) return;
            toast('Import du clip…');
            shot.clip = await putBlob(f, f.name);
            shot.clipDuration = await mediaDuration(f, 'video');
            await rerender();
          } }, shot.clip ? '🔁 Remplacer le clip' : '⬆ Importer le clip'),
          shot.clip ? h('button', { class: 'btn small ghost danger', onclick: async () => { shot.clip = null; shot.clipDuration = null; await rerender(); } }, 'Retirer') : null,
          h('button', { class: 'btn small ghost', disabled: !videoAI, title: videoAI ? '' : 'Aucun moteur vidéo connecté' }, '✨ Générer (moteur vidéo)')),
        info,
        shot.clip && shot.clipDuration && shot.clipDuration + 0.5 < Number(shot.duration) ? h('p', { class: 'small warn' }, `Le clip (${Math.round(shot.clipDuration)} s) est plus court que la durée prévue (${shot.duration} s).`) : null));
  };

  return h('div', {},
    h('div', { class: 'panel' },
      h('h2', {}, '🎞️ Studio d\'animation'),
      h('div', { class: 'progress-line' }, h('progress', { max: shots.length || 1, value: ready }), h('span', {}, `${ready}/${shots.length} plans animés`)),
      videoAI
        ? notice('info', 'Un moteur vidéo est déclaré sur le serveur relais. La génération directe depuis l\'application sera branchée à l\'étape suivante du développement.')
        : notice('off', 'Aucun moteur de génération vidéo n\'est connecté : l\'application ne génère PAS de vidéo pour l\'instant. Méthode actuelle : copiez le prompt de chaque plan dans le service de votre choix (Grok Imagine, Kling, Runway, Veo, Hailuo…), puis importez ici le clip MP4 obtenu.'),
      h('p', { class: 'muted small' }, 'Les clips importés restent sur votre appareil (stockage du navigateur). Pensez à télécharger une sauvegarde du projet régulièrement.')),
    shots.length ? h('div', { class: 'anim-list' }, shots.map(row)) : h('p', { class: 'empty' }, 'Créez d\'abord le storyboard.'));
}
