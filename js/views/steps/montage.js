import { h, field, notice, fmtTime, download, toast } from '../../ui.js';
import { buildTimeline, usedDuration, SIZES } from '../../montage.js';
import { exportMP4 } from '../../export.js';
import { Preview } from '../../player.js';
import { autoAssignDialogues } from './common.js';
import { slug } from '../dashboard.js';

let activePreview = null;
addEventListener('hashchange', () => { activePreview?.destroy(); activePreview = null; });

export async function montageStep(ctx) {
  const { p, ep, save, rerender } = ctx;
  ep.exportSettings = { fit: 'crop', keepClipAudio: true, quality: 'fast', includeMissing: 'oui', ...ep.exportSettings };
  const st = ep.exportSettings;
  if (typeof st.keepClipAudio === 'boolean') st.keepClipAudio = st.keepClipAudio ? 'oui' : 'non';
  ep.scenes.forEach(autoAssignDialogues);
  const tl = buildTimeline(ep, { includeMissing: st.includeMissing !== 'non' });
  const counts = { clip: 0, image: 0, blank: 0 };
  tl.items.forEach((i) => counts[i.type]++);
  const fmtClass = `fmt-${p.format.replace(':', 'x')}`;

  // ---------- Prévisualisation ----------
  const stage = h('div', { class: `stage ${fmtClass}` });
  const range = h('input', { type: 'range', min: 0, max: tl.total || 1, step: 0.05, value: 0, 'aria-label': 'Position dans l\'épisode' });
  const clock = h('span', { class: 'clock' }, `00:00 / ${fmtTime(tl.total)}`);
  const playBtn = h('button', { class: 'btn primary', disabled: !tl.items.length }, '▶ Lecture');
  const cursor = h('div', { class: 'tl-cursor' });
  activePreview?.destroy();
  const pv = new Preview(stage, tl, {
    onTime: (t) => { range.value = t; clock.textContent = `${fmtTime(t)} / ${fmtTime(tl.total)}`; cursor.style.left = `${(t / (tl.total || 1)) * 100}%`; },
    onState: (on) => { playBtn.textContent = on ? '⏸ Pause' : '▶ Lecture'; },
  });
  activePreview = pv;
  if (tl.items.length) pv.init();
  playBtn.onclick = () => (pv.playing ? pv.pause() : pv.play());
  range.oninput = () => { pv.pause(); pv.seek(Number(range.value)); };

  // ---------- Timeline ----------
  const pct = (d) => `${(d / (tl.total || 1)) * 100}%`;
  const track = h('div', { class: 'tl-track video' }, tl.items.map((it, i) => h('button', {
    class: `tl-item ${it.type}`, style: { width: pct(it.duration) }, title: `${i + 1}. ${it.label} (${it.duration} s)`,
    onclick: () => { pv.pause(); pv.seek(it.start + 0.01); },
  }, h('span', {}, i + 1))));
  const voiceTrack = h('div', { class: 'tl-track voices' }, tl.voices.map((v) => h('span', { class: 'tl-voice', style: { left: pct(v.start) } })));
  const musicTrack = tl.music ? h('div', { class: 'tl-track music' }, h('span', { style: { width: '100%' } }, '♪ ', ep.music.name)) : null;

  // ---------- Liste des plans (durées) ----------
  const rows = ep.scenes.flatMap((sc) => sc.shots.map((sh) => ({ sc, sh })));
  const list = h('table', { class: 'tl-table' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Plan'), h('th', {}, 'Source'), h('th', {}, 'Durée source'), h('th', {}, 'Couper à (s)'), h('th', {}, 'Durée finale'))),
    h('tbody', {}, rows.map(({ sc, sh }, i) => h('tr', {},
      h('td', {}, i + 1), h('td', {}, `${sc.title} · ${sh.shotType}`),
      h('td', {}, sh.clip ? '🎞️ Clip' : sh.refImage ? '🖼️ Image fixe' : '⬛ Carton'),
      h('td', {}, `${Math.round((sh.clip ? sh.clipDuration || sh.duration : sh.duration) * 10) / 10} s`),
      h('td', {}, h('input', { type: 'number', min: 0.5, step: 0.5, value: sh.cut || '', placeholder: 'entier', class: 'mini', onchange: async (e) => { sh.cut = Number(e.target.value) || null; await rerender(); } })),
      h('td', {}, `${usedDuration(sh)} s`)))));

  // ---------- Export ----------
  const progress = h('progress', { max: 1, value: 0 });
  const status = h('pre', { class: 'status' }, '');
  const result = h('div', {});
  const exportBtn = h('button', { class: 'btn primary big', disabled: !tl.items.length, onclick: async () => {
    pv.pause();
    exportBtn.disabled = true; result.replaceChildren(); progress.value = 0;
    const t0 = Date.now();
    try {
      const blob = await exportMP4(tl, { format: p.format, quality: st.quality, fit: st.fit, keepClipAudio: st.keepClipAudio !== 'non' },
        { onStatus: (s) => { status.textContent = s; }, onProgress: (x) => { progress.value = x; } });
      const name = `${slug(p.title)}-${slug(ep.title)}.mp4`;
      const url = URL.createObjectURL(blob);
      status.textContent = `MP4 terminé en ${Math.round((Date.now() - t0) / 1000)} s · ${Math.round(blob.size / 1e5) / 10} Mo. Téléchargez-le puis vérifiez le son et la barre de lecture.`;
      result.replaceChildren(
        h('video', { src: url, controls: true, playsinline: true, class: `final ${fmtClass}` }),
        h('button', { class: 'btn primary', onclick: () => download(blob, name) }, '⬇ Télécharger le MP4'));
      toast('Export terminé ✓', 'ok');
    } catch (e) {
      console.error(e);
      status.textContent = 'Export impossible : ' + (e.message || e) + '\n\nConseils : utilisez Chrome, Edge ou Firefox récents sur ordinateur, gardez l\'épisode court (moins de 3 min) et vérifiez votre connexion Internet pour le premier chargement du moteur.';
    } finally { exportBtn.disabled = false; }
  } }, '🎞️ Exporter le MP4');

  const [W, H] = SIZES[p.format][st.quality === 'hd' ? 'hd' : 'fast'];

  return h('div', {},
    h('div', { class: 'cols' },
      h('div', { class: 'col' },
        h('div', { class: 'panel center' }, h('h2', {}, '▶ Prévisualisation'), stage,
          h('div', { class: 'player-bar' }, playBtn, range, clock),
          h('p', { class: 'muted small' }, 'La prévisualisation enchaîne les clips, images fixes, voix et musique. Cliquez un bloc de la timeline pour y aller.'))),
      h('div', { class: 'col wide' },
        h('div', { class: 'panel' }, h('h2', {}, '✂️ Timeline'),
          h('p', { class: 'small' }, `${tl.items.length} plan(s) · ${fmtTime(tl.total)} · ${counts.clip} clip(s), ${counts.image} image(s) fixe(s), ${counts.blank} carton(s) · ${tl.voices.length} voix${tl.music ? ' · musique' : ''}`),
          h('div', { class: 'timeline' }, track, voiceTrack, musicTrack, cursor),
          h('div', { class: 'legend small' }, h('span', { class: 'lg clip' }, 'Clip'), h('span', { class: 'lg image' }, 'Image fixe'), h('span', { class: 'lg blank' }, 'Carton'), h('span', { class: 'lg voice' }, 'Voix')),
          counts.clip < tl.items.length ? notice('info', 'Les plans sans clip apparaissent en image fixe (si une image de référence existe) ou en carton noir : idéal pour un animatique. Désactivez cette option pour n\'exporter que les clips.') : null,
          h('details', {}, h('summary', {}, 'Durées des plans'), list)),
        h('div', { class: 'panel' }, h('h2', {}, '📦 Export MP4'),
          notice('real', 'Fonctionnalité réelle : l\'assemblage et l\'encodage MP4 (H.264 + AAC, compatible avec tous les lecteurs, navigation temporelle fonctionnelle) se font dans votre navigateur. Vos fichiers ne sont envoyés nulle part.'),
          h('div', { class: 'two' },
            field('Qualité', st, 'quality', { options: [['fast', 'Rapide (540p)'], ['hd', 'HD 720p (plus lent)']], onChange: () => rerender() }),
            field('Cadrage des clips', st, 'fit', { options: [['crop', 'Remplir l\'image (recadrer)'], ['pad', 'Image entière (bandes noires)']], onChange: save }),
            field('Son d\'origine des clips', st, 'keepClipAudio', { options: [['oui', 'Conserver'], ['non', 'Couper']], onChange: save }),
            field('Plans sans clip', st, 'includeMissing', { options: [['oui', 'Inclure (image fixe / carton)'], ['non', 'Ignorer']], onChange: () => rerender() })),
          h('p', { class: 'muted small' }, `Sortie : ${W}×${H}, 24 images/s, ${fmtTime(tl.total)}. Premier export : téléchargement du moteur (~30 Mo).`),
          h('div', { class: 'row' }, exportBtn), progress, status, result))));
}
