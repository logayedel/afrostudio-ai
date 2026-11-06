import { h, field, toast, confirmBox, modal, download } from '../../ui.js';
import { newScene, newDialogue } from '../../store.js';
import { generate } from '../../engines/index.js';
import { localScript } from '../../engines/local.js';
import { scriptToText } from '../../prompts.js';
import { aiContext, sceneFromAI, sourceBadge, aiNotice } from './common.js';
import { slug } from '../dashboard.js';

export function scriptStep(ctx) {
  const { p, ep, cast, save, rerender, status } = ctx;
  const textAI = !!status.capabilities?.text;

  function mergeKeepingLocked(newScenes) {
    const out = [];
    const queue = newScenes.slice();
    const max = Math.max(ep.scenes.length, newScenes.length);
    for (let i = 0; i < max; i++) {
      if (ep.scenes[i]?.locked) out.push(ep.scenes[i]);
      else if (queue.length) out.push(queue.shift());
    }
    out.push(...queue);
    ep.scenes = out;
  }

  async function confirmReplace() {
    if (!ep.scenes.some((s) => !s.locked)) return true;
    return confirmBox('Les scènes non verrouillées (🔒) seront remplacées. Continuer ?', 'Remplacer', 'primary');
  }

  async function generateAll(btn) {
    if (!ep.idea.pitch.trim()) return toast('Décrivez d\'abord votre idée à l\'étape « Idée ».', 'error');
    if (!await confirmReplace()) return;
    btn.disabled = true; btn.textContent = 'Écriture en cours… (30 s à 2 min)';
    try {
      const r = await generate('script', { ...aiContext(ctx), lockedScenes: ep.scenes.filter((s) => s.locked).map((s) => ({ title: s.title, summary: s.summary })) });
      if (r.title && !ep.title.match(/\S/)) ep.title = r.title;
      mergeKeepingLocked((r.scenes || []).map((s) => sceneFromAI(s, ctx)));
      await rerender();
      toast('Scénario généré ✓', 'ok');
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '✨ Écrire le scénario avec l\'IA'; }
  }

  async function draft() {
    if (!await confirmReplace()) return;
    mergeKeepingLocked(localScript({ project: p, episode: ep, cast }).map((s) => newScene({ ...s, source: 'auto', dialogues: s.dialogues.map((d) => newDialogue(d)) })));
    await rerender();
    toast('Brouillon créé : modifiez-le librement.', 'ok');
  }

  async function regenerateScene(scene, i) {
    const instr = { text: '' };
    const ok = await modal(`Régénérer « ${scene.title} »`, h('div', { class: 'form' },
      h('p', { class: 'muted' }, 'Seule cette scène sera réécrite. Le reste du projet est conservé.'),
      field('Instruction (facultatif)', instr, 'text', { type: 'textarea', rows: 3, placeholder: 'Ex. : plus drôle, ajoute une course-poursuite, fais parler Tata Boy davantage…' })), [{ label: '✨ Régénérer' }]);
    if (!ok) return;
    toast('Réécriture de la scène…');
    try {
      const r = await generate('scene', {
        ...aiContext(ctx), sceneIndex: i, instruction: instr.text,
        current: { title: scene.title, summary: scene.summary, dialogues: scene.dialogues.map((d) => ({ character: ctx.byId[d.characterId]?.name || 'Narrateur', text: d.text })) },
        before: ep.scenes.slice(0, i).map((s) => ({ title: s.title, summary: s.summary })),
        after: ep.scenes.slice(i + 1).map((s) => ({ title: s.title, summary: s.summary })),
      });
      sceneFromAI(r, ctx, scene);
      await rerender();
      toast('Scène régénérée ✓', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  }

  const castOptions = [['', 'Narrateur / voix off'], ...cast.map((c) => [c.id, c.name])];
  const decorOptions = [['', 'Autre lieu (texte libre)'], ...p.decors.map((d) => [d.id, d.name])];

  const sceneCard = (s, i) => {
    const dl = h('div', { class: 'dialogues' }, s.dialogues.map((d, j) => h('div', { class: 'dialogue' },
      h('div', { class: 'dl-meta' },
        field('', d, 'characterId', { options: castOptions, onChange: save }),
        field('', d, 'emotion', { onChange: save, placeholder: 'émotion' })),
      h('textarea', { rows: 2, value: d.text, placeholder: 'Réplique…', oninput: (e) => { d.text = e.target.value; save(); } }),
      h('div', { class: 'dl-actions' },
        j > 0 ? h('button', { class: 'icon-btn', title: 'Monter', onclick: async () => { [s.dialogues[j - 1], s.dialogues[j]] = [s.dialogues[j], s.dialogues[j - 1]]; await rerender(); } }, '↑') : null,
        h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { s.dialogues.splice(j, 1); await rerender(); } }, '✕')))),
    h('button', { class: 'btn small ghost', onclick: async () => { s.dialogues.push(newDialogue({ characterId: cast[0]?.id || '' })); await rerender(); } }, '+ Réplique'));

    return h('article', { class: `scene-card ${s.locked ? 'locked' : ''}` },
      h('div', { class: 'scene-head' },
        h('span', { class: 'scene-num' }, i + 1),
        h('input', { class: 'inline-title', value: s.title, oninput: (e) => { s.title = e.target.value; save(); } }),
        sourceBadge(s.source),
        h('div', { class: 'row' },
          h('button', { class: 'icon-btn', title: s.locked ? 'Déverrouiller' : 'Verrouiller (protégée lors des régénérations)', onclick: async () => { s.locked = !s.locked; await rerender(); } }, s.locked ? '🔒' : '🔓'),
          textAI ? h('button', { class: 'icon-btn', title: 'Régénérer cette scène avec l\'IA', disabled: s.locked, onclick: () => regenerateScene(s, i) }, '✨') : null,
          i > 0 ? h('button', { class: 'icon-btn', title: 'Monter', onclick: async () => { [ep.scenes[i - 1], ep.scenes[i]] = [ep.scenes[i], ep.scenes[i - 1]]; await rerender(); } }, '↑') : null,
          i < ep.scenes.length - 1 ? h('button', { class: 'icon-btn', title: 'Descendre', onclick: async () => { [ep.scenes[i + 1], ep.scenes[i]] = [ep.scenes[i], ep.scenes[i + 1]]; await rerender(); } }, '↓') : null,
          h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { if (await confirmBox(`Supprimer la scène « ${s.title} » (et ses plans) ?`, 'Supprimer')) { ep.scenes.splice(i, 1); await rerender(); } } }, '🗑'))),
      h('div', { class: 'three' },
        field('Décor', s, 'decorId', { options: decorOptions, onChange: save }),
        field('Lieu (si autre)', s, 'location', { onChange: save }),
        field('Moment', s, 'timeOfDay', { options: ['Jour', 'Matin', 'Après-midi', 'Coucher du soleil', 'Nuit', 'Intérieur'], onChange: save })),
      field('Ce qui se passe', s, 'summary', { type: 'textarea', rows: 3, onChange: save }),
      h('div', { class: 'field' }, h('span', {}, 'Personnages présents'),
        h('div', { class: 'row wrap' }, cast.length ? cast.map((c) => h('label', { class: 'chip' },
          h('input', { type: 'checkbox', checked: s.characters.includes(c.id), onchange: (e) => { s.characters = e.target.checked ? [...s.characters, c.id] : s.characters.filter((x) => x !== c.id); save(); } }), c.name))
          : h('span', { class: 'muted small' }, 'Ajoutez des personnages au projet.'))),
      h('h4', {}, 'Dialogues'), dl);
  };

  const btnAI = h('button', { class: 'btn primary', disabled: !textAI, title: textAI ? '' : 'Connectez un moteur de texte dans Paramètres', onclick: (e) => generateAll(e.currentTarget) }, '✨ Écrire le scénario avec l\'IA');
  const total = ep.scenes.reduce((n, s) => n + s.shots.reduce((m, x) => m + Number(x.duration || 0), 0), 0);

  return h('div', {},
    h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, '✍️ Scénariste'),
        h('div', { class: 'row wrap' }, btnAI,
          h('button', { class: 'btn ghost', onclick: draft }, '🧪 Brouillon automatique (sans IA)'),
          h('button', { class: 'btn ghost', disabled: !ep.scenes.length, onclick: () => download(new Blob([scriptToText(p, ep, ctx.byId)], { type: 'text/plain;charset=utf-8' }), `${slug(p.title)}-${slug(ep.title)}-scenario.txt`) }, '⬇ Exporter (.txt)'))),
      aiNotice(textAI),
      h('p', { class: 'muted small' }, `${ep.scenes.length} scène(s) · durée cible ${ep.idea.duration} s${total ? ` · durée storyboard ${Math.round(total)} s` : ''}. Astuce : verrouillez 🔒 une scène réussie pour la protéger lors des régénérations.`)),
    ep.scenes.length ? ep.scenes.map(sceneCard) : h('p', { class: 'empty' }, 'Aucune scène. Générez un scénario ou ajoutez une scène.'),
    h('button', { class: 'btn ghost wide', onclick: async () => { ep.scenes.push(newScene({ characters: cast.slice(0, 2).map((c) => c.id) })); await rerender(); } }, '+ Ajouter une scène'));
}
