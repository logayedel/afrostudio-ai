import { h, toast, copyText, pickFile, pickFiles, notice, mediaDuration, fmtTime, field } from '../../ui.js';
import { putBlob, blobURL, getBlobRecord } from '../../db.js';
import { allShots, mutateProject, findShot } from '../../store.js';
import { shotPrompt } from '../../prompts.js';
import { startAssist, dropTarget, naturalSort } from '../../assist.js';

const isVideo = (f) => f.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(f.name);

export function animationStep(ctx) {
  const { p, ep, byId, save, status } = ctx;
  const videoAI = !!status.capabilities?.video;
  const shots = allShots(ep);
  const ready = shots.filter((x) => x.shot.clip).length;
  const fmtClass = `fmt-${p.format.replace(':', 'x')}`;
  p.clipVoices = p.clipVoices || 'oui';

  // Enregistre un clip sur un plan (relit le projet enregistré : sûr même si la page a changé)
  const setClip = (shotId) => async (f) => {
    const d = await mediaDuration(f, 'video');
    const blob = await putBlob(f, f.name || 'clip.mp4');
    await mutateProject(p.id, (x) => { const s = findShot(x, shotId).shot; s.clip = blob; s.clipDuration = d; });
  };

  // Image de départ à donner à Grok : image du plan, sinon image du 1er personnage du plan
  const startImageOf = (scene, shot) => {
    if (shot.refImage) return shot.refImage;
    const ids = shot.characters?.length ? shot.characters : scene.characters;
    return ids.map((id) => byId[id]?.refImages?.[0]).find(Boolean) || null;
  };

  const grokTask = (scene, shot) => {
    const n = shots.findIndex((x) => x.shot.id === shot.id);
    return {
      tool: 'grok', kind: 'video', label: `plan ${n + 1} — ${scene.title}`,
      prompt: shotPrompt(p, ep, scene, shot, byId), startImage: startImageOf(scene, shot), apply: setClip(shot.id),
      next: () => {
        const nx = shots.slice(n + 1).find((x) => !x.shot.clip);
        return nx ? grokTask(nx.scene, nx.shot) : null;
      },
    };
  };

  async function importMany() {
    const files = naturalSort((await pickFiles('video/*')).filter(isVideo));
    if (!files.length) return;
    const empty = shots.filter((x) => !x.shot.clip);
    if (!empty.length) return toast('Tous les plans ont déjà un clip.', 'error');
    const pairs = files.slice(0, empty.length).map((f, i) => [empty[i].shot.id, f]);
    toast(`Import de ${pairs.length} clip(s)…`);
    const prepared = [];
    for (const [id, f] of pairs) prepared.push([id, await putBlob(f, f.name), await mediaDuration(f, 'video')]);
    await mutateProject(p.id, (x) => { for (const [id, blob, d] of prepared) { const s = findShot(x, id).shot; s.clip = blob; s.clipDuration = d; } });
    toast(`${pairs.length} clip(s) rangé(s) dans l'ordre des plans ✓${files.length > empty.length ? ` (${files.length - empty.length} en trop ignoré(s))` : ''}`, 'ok');
  }

  const row = ({ scene, shot }, n) => {
    const media = h('div', { class: `clip-box ${fmtClass}` }, h('span', { class: 'muted small' }, 'Glissez un clip ici'));
    if (shot.clip) blobURL(shot.clip).then((u) => u && media.replaceChildren(h('video', { src: u, controls: true, playsinline: true, preload: 'metadata' })));
    else if (shot.refImage) blobURL(shot.refImage).then((u) => u && media.replaceChildren(h('img', { src: u, alt: '', class: 'faded' })));
    const info = h('span', { class: 'small muted' });
    if (shot.clip) getBlobRecord(shot.clip).then((r) => { info.textContent = `${r?.name || 'clip'} · ${fmtTime(shot.clipDuration)} · ${Math.round((r?.size || 0) / 1e5) / 10} Mo`; });

    const el = h('div', { class: 'anim-row' },
      media,
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('b', {}, `Plan ${n + 1}`), h('span', { class: 'muted small' }, ` — ${scene.title} · ${shot.shotType} · ${shot.duration} s`)),
        h('p', { class: 'small clamp' }, shot.description || shot.action),
        h('div', { class: 'row wrap' },
          h('button', { class: `btn small ${shot.clip ? 'ghost' : 'primary'}`, onclick: () => startAssist(grokTask(scene, shot)) }, '🎬 Créer avec Grok'),
          h('button', { class: 'btn small ghost', onclick: () => copyText(shotPrompt(p, ep, scene, shot, byId)) }, '📋 Copier le prompt'),
          h('button', { class: 'btn small ghost', onclick: async () => {
            const f = await pickFile('video/mp4,video/webm,video/quicktime,video/*'); if (!f) return;
            toast('Import du clip…'); await setClip(shot.id)(f);
          } }, shot.clip ? '🔁 Remplacer' : '⬆ Importer'),
          shot.clip ? h('button', { class: 'btn small ghost danger', onclick: () => mutateProject(p.id, (x) => { const s = findShot(x, shot.id).shot; s.clip = null; s.clipDuration = null; }) }, 'Retirer') : null,
          videoAI ? h('button', { class: 'btn small ghost', disabled: true, title: 'Génération par API pas encore activée' }, '✨ Générer (API)') : null),
        info,
        !startImageOf(scene, shot) ? h('p', { class: 'small muted' }, 'Astuce : ajoutez une image au plan (Storyboard) ou au personnage pour que Grok garde la même apparence.') : null,
        shot.clip && shot.clipDuration && shot.clipDuration + 0.5 < Number(shot.duration) ? h('p', { class: 'small warn' }, `Le clip (${Math.round(shot.clipDuration)} s) est plus court que la durée prévue (${shot.duration} s).`) : null));
    dropTarget(el, 'video', setClip(shot.id));
    return el;
  };

  const firstMissing = shots.find((x) => !x.shot.clip);

  return h('div', {},
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, '🎞️ Studio d\'animation'),
        h('div', { class: 'row wrap' },
          firstMissing ? h('button', { class: 'btn primary', onclick: () => startAssist(grokTask(firstMissing.scene, firstMissing.shot)) }, `🎬 Animer avec Grok (plan ${shots.indexOf(firstMissing) + 1} et suivants)`) : null,
          h('button', { class: 'btn ghost', disabled: !shots.length, onclick: importMany }, '⬆ Importer plusieurs clips'))),
      h('div', { class: 'progress-line' }, h('progress', { max: shots.length || 1, value: ready }), h('span', {}, `${ready}/${shots.length} plans animés`)),
      notice('real', 'Mode éco (gratuit, avec votre abonnement Grok) : « Créer avec Grok » copie le prompt et ouvre Grok. Donnez-lui l\'image de départ proposée, générez, téléchargez la vidéo et glissez-la sur le cadre qui apparaît : elle se range dans le bon plan et le prompt du plan suivant est copié aussitôt.'),
      h('div', { class: 'two' },
        field('Voix dans les clips Grok', p, 'clipVoices', { onChange: save, options: [['oui', 'Oui : Grok fait parler les personnages'], ['non', 'Non : bruitages seulement (voix ajoutées dans Audio)']], hint: 'Choisissez « Non » si les voix de Grok changent d\'un clip à l\'autre.' }),
        h('p', { class: 'small muted' }, 'Vous pouvez aussi glisser une vidéo directement sur un plan, ou importer plusieurs clips d\'un coup : ils sont rangés dans l\'ordre de leur nom (1, 2, 3…) sur les plans encore vides.')),
      videoAI ? notice('info', 'Un moteur vidéo est déclaré sur le serveur relais, mais la génération par API n\'est pas encore activée dans cette version.') : null),
    shots.length ? h('div', { class: 'anim-list' }, shots.map(row)) : h('p', { class: 'empty' }, 'Créez d\'abord le storyboard.'));
}
