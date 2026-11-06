import { h, field, toast, confirmBox, copyText, pickFile, download } from '../../ui.js';
import { newShot, SHOT_TYPES, CAMERA_MOVES, FORMATS, mutateProject, findShot, allShots } from '../../store.js';
import { startAssist, dropTarget } from '../../assist.js';
import { putBlob, blobURL } from '../../db.js';
import { generate } from '../../engines/index.js';
import { localStoryboard } from '../../engines/local.js';
import { shotPrompt, decorSheet, shotImagePrompt } from '../../prompts.js';
import { aiContext, shotsFromAI, aiNotice, autoAssignDialogues } from './common.js';
import { slug } from '../dashboard.js';

export function storyboardStep(ctx) {
  const { p, ep, cast, byId, save, rerender, status } = ctx;
  const textAI = !!status.capabilities?.text;
  const fmtClass = `fmt-${p.format.replace(':', 'x')}`;
  const sceneTarget = () => Math.round((Number(ep.idea.duration) || 60) / Math.max(1, ep.scenes.length));

  async function boardScene(scene, useAI) {
    if (useAI) {
      const r = await generate('storyboard', {
        ...aiContext(ctx), targetDuration: sceneTarget(),
        scene: {
          title: scene.title, summary: scene.summary, timeOfDay: scene.timeOfDay, decor: decorSheet(p, scene),
          characters: scene.characters.map((id) => byId[id]?.name).filter(Boolean),
          dialogues: scene.dialogues.map((d, i) => ({ index: i, character: byId[d.characterId]?.name || 'Narrateur', text: d.text })),
        },
      });
      scene.shots = shotsFromAI(r, scene, ctx);
    } else {
      scene.shots = localStoryboard({ episode: ep, scene }).map((s) => newShot(s));
    }
    autoAssignDialogues(scene);
  }

  async function boardAll(useAI, btn) {
    if (!ep.scenes.length) return toast('Écrivez d\'abord le scénario.', 'error');
    if (ep.scenes.some((s) => s.shots.length) && !await confirmBox('Les plans existants des scènes non verrouillées seront remplacés. Continuer ?', 'Remplacer', 'primary')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Découpage en cours…'; }
    try {
      for (const [i, s] of ep.scenes.entries()) {
        if (s.locked && s.shots.length) continue;
        if (btn) btn.textContent = `Découpage scène ${i + 1}/${ep.scenes.length}…`;
        await boardScene(s, useAI);
        await ctx.save();
      }
      await rerender();
      toast('Storyboard prêt ✓', 'ok');
    } catch (e) { toast(e.message, 'error'); await rerender(); }
  }

  // Mode éco : image du plan avec ChatGPT, puis enchaînement sur le plan suivant sans image
  const setImage = (shotId) => async (f) => mutateProject(p.id, async (x) => { findShot(x, shotId).shot.refImage = await putBlob(f, f.name || 'plan.png'); });
  const imageTask = (scene, shot) => ({
    tool: 'chatgpt', kind: 'image', label: `${scene.title} · plan ${scene.shots.indexOf(shot) + 1}`,
    prompt: shotImagePrompt(p, ep, scene, shot, byId), apply: setImage(shot.id),
    next: () => {
      const list = allShots(ep); const i = list.findIndex((x) => x.shot.id === shot.id);
      const n = list.slice(i + 1).find((x) => !x.shot.refImage);
      return n ? imageTask(n.scene, n.shot) : null;
    },
  });

  const shotCard = (scene, shot, i) => {
    const thumb = h('div', { class: `shot-thumb ${fmtClass}` }, h('span', {}, `${shot.shotType}`));
    if (shot.refImage) blobURL(shot.refImage).then((u) => u && thumb.replaceChildren(h('img', { src: u, alt: '' })));
    dropTarget(thumb, 'image', setImage(shot.id));
    const promptPre = h('pre', { class: 'sheet small' }, shotPrompt(p, ep, scene, shot, byId));
    const refreshPrompt = () => { promptPre.textContent = shotPrompt(p, ep, scene, shot, byId); save(); };
    const lines = scene.dialogues.filter((d) => d.shotId === shot.id);
    return h('div', { class: 'shot' },
      h('div', { class: 'shot-top' },
        thumb,
        h('div', { class: 'shot-tools' },
          h('b', {}, `Plan ${i + 1}`),
          h('button', { class: 'link', onclick: () => startAssist(imageTask(scene, shot)) }, '🎨 Créer avec ChatGPT'),
          h('button', { class: 'link', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; shot.refImage = await putBlob(f, f.name); await rerender(); } }, shot.refImage ? 'Changer l\'image' : 'Importer une image'),
          shot.refImage ? h('button', { class: 'link danger', onclick: async () => { shot.refImage = null; await rerender(); } }, 'Retirer') : null)),
      h('div', { class: 'two' },
        field('Cadrage', shot, 'shotType', { options: SHOT_TYPES, onChange: refreshPrompt }),
        field('Caméra', shot, 'camera', { options: CAMERA_MOVES, onChange: refreshPrompt })),
      field('Ce qu\'on voit', shot, 'description', { type: 'textarea', rows: 2, onChange: refreshPrompt }),
      field('Action / mouvement', shot, 'action', { type: 'textarea', rows: 2, onChange: refreshPrompt }),
      field('Durée (secondes)', shot, 'duration', { type: 'number', min: 1, max: 60, step: 0.5, onChange: refreshPrompt }),
      h('div', { class: 'row wrap' }, scene.characters.map((id) => byId[id]).filter(Boolean).map((c) => h('label', { class: 'chip' },
        h('input', { type: 'checkbox', checked: shot.characters.includes(c.id), onchange: (e) => { shot.characters = e.target.checked ? [...shot.characters, c.id] : shot.characters.filter((x) => x !== c.id); refreshPrompt(); } }), c.name))),
      lines.length ? h('div', { class: 'small lines' }, lines.map((l) => h('div', {}, h('b', {}, byId[l.characterId]?.name || 'Narrateur'), ' : ', l.text))) : null,
      h('details', {}, h('summary', {}, 'Prompt du plan (pour le moteur vidéo)'),
        promptPre,
        h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => copyText(promptPre.textContent) }, 'Copier')),
        field('Remplacer par mon propre prompt (facultatif)', shot, 'promptOverride', { type: 'textarea', rows: 3, onChange: refreshPrompt })),
      h('div', { class: 'row end' },
        i > 0 ? h('button', { class: 'icon-btn', title: 'Avancer', onclick: async () => { [scene.shots[i - 1], scene.shots[i]] = [scene.shots[i], scene.shots[i - 1]]; await rerender(); } }, '←') : null,
        i < scene.shots.length - 1 ? h('button', { class: 'icon-btn', title: 'Reculer', onclick: async () => { [scene.shots[i + 1], scene.shots[i]] = [scene.shots[i], scene.shots[i + 1]]; await rerender(); } }, '→') : null,
        h('button', { class: 'icon-btn', title: 'Dupliquer', onclick: async () => { scene.shots.splice(i + 1, 0, newShot({ ...structuredClone(shot), id: undefined, clip: null })); scene.shots[i + 1].id = newShot().id; await rerender(); } }, '⧉'),
        h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { if (await confirmBox('Supprimer ce plan ?', 'Supprimer')) { scene.shots.splice(i, 1); await rerender(); } } }, '🗑')));
  };

  const exportPrompts = () => {
    const txt = ep.scenes.map((s, i) => `=== SCÈNE ${i + 1} : ${s.title} ===\n\n` + s.shots.map((sh, j) => `--- Plan ${i + 1}.${j + 1} (${sh.duration} s) ---\n${shotPrompt(p, ep, s, sh, byId)}`).join('\n\n')).join('\n\n\n');
    download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `${slug(p.title)}-${slug(ep.title)}-prompts.txt`);
  };

  const total = ep.scenes.reduce((n, s) => n + s.shots.reduce((m, x) => m + Number(x.duration || 0), 0), 0);

  return h('div', {},
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, '🎬 Storyboard'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary', disabled: !textAI, title: textAI ? '' : 'Connectez un moteur de texte', onclick: (e) => boardAll(true, e.currentTarget) }, '✨ Découper avec l\'IA'),
          h('button', { class: 'btn ghost', onclick: () => boardAll(false) }, '🧪 Découpage automatique (sans IA)'),
          h('button', { class: 'btn ghost', disabled: !total, onclick: exportPrompts }, '⬇ Tous les prompts (.txt)'))),
      aiNotice(textAI),
      h('p', { class: 'muted small' }, `Format ${FORMATS[p.format].label} · ${ep.scenes.reduce((n, s) => n + s.shots.length, 0)} plan(s) · durée totale ${Math.round(total)} s / cible ${ep.idea.duration} s. Chaque prompt inclut automatiquement le style, le décor et les fiches d'identité des personnages.`)),
    ep.scenes.length ? ep.scenes.map((scene, si) => h('section', { class: 'board-scene' },
      h('div', { class: 'scene-head' },
        h('span', { class: 'scene-num' }, si + 1), h('h3', { class: 'grow' }, scene.title),
        h('span', { class: 'muted small' }, decorSheet(p, scene) || 'Lieu non défini'),
        textAI ? h('button', { class: 'btn small ghost', onclick: async (e) => { e.currentTarget.disabled = true; try { await boardScene(scene, true); await rerender(); } catch (err) { toast(err.message, 'error'); await rerender(); } } }, '✨ Redécouper') : null,
        h('button', { class: 'btn small ghost', onclick: async () => { scene.shots.push(newShot({ characters: scene.characters.slice(), duration: 5 })); autoAssignDialogues(scene); await rerender(); } }, '+ Plan')),
      scene.shots.length ? h('div', { class: 'shots' }, scene.shots.map((sh, i) => shotCard(scene, sh, i))) : h('p', { class: 'empty small' }, 'Aucun plan dans cette scène.')))
      : h('p', { class: 'empty' }, 'Écrivez d\'abord le scénario.'),
    cast.length ? null : h('p', { class: 'muted small' }, 'Astuce : ajoutez des personnages pour que leurs fiches soient incluses dans les prompts.'));
}
