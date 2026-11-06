import { h, modal, field, toast, fmtDate, pickFile, badge, confirmBox, download } from '../ui.js';
import { listProjects, newProject, saveProject, deleteProject, FORMATS, STYLES, importProjectFile, exportProjectFile, newCharacter, saveCharacter, uid, listCharacters } from '../store.js';
import { storageEstimate } from '../db.js';

export async function dashboardView() {
  const projects = await listProjects();
  const chars = await listCharacters();
  const est = await storageEstimate();

  const grid = h('div', { class: 'grid cards' },
    h('button', { class: 'card new', onclick: createProject }, h('span', { class: 'plus' }, '+'), h('b', {}, 'Nouveau projet'), h('small', {}, 'Série ou court-métrage')),
    projects.map(projectCard));

  return h('section', { class: 'page' },
    h('div', { class: 'hero' },
      h('div', {},
        h('h1', {}, 'Vos projets'),
        h('p', { class: 'muted' }, 'De l\'idée à la vidéo : Idée → Scénario → Personnages → Storyboard → Animation → Audio → Montage → Export.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: importBackup }, '📂 Importer une sauvegarde'),
        h('button', { class: 'btn ghost', onclick: createSample }, '🧪 Projet exemple'),
        h('button', { class: 'btn primary', onclick: createProject }, '+ Nouveau projet'))),
    h('div', { class: 'stats' },
      stat(projects.length, 'projets'),
      stat(projects.reduce((n, p) => n + p.seasons.reduce((m, s) => m + s.episodes.length, 0), 0), 'épisodes'),
      stat(chars.length, 'personnages'),
      est ? stat(`${Math.round((est.usage || 0) / 1e6)} Mo`, 'utilisés sur cet appareil') : null),
    grid);
}

const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l));

function projectCard(p) {
  const eps = p.seasons.reduce((m, s) => m + s.episodes.length, 0);
  return h('div', { class: 'card project' },
    h('a', { class: 'card-link', href: `#/projet/${p.id}` },
      h('div', { class: `thumb fmt-${p.format.replace(':', 'x')}` }, h('span', {}, p.title.slice(0, 1).toUpperCase())),
      h('h3', {}, p.title),
      h('p', { class: 'muted small' }, p.logline || 'Pas encore de résumé'),
      h('div', { class: 'row wrap' },
        badge(p.kind === 'film' ? 'Court-métrage' : `${p.seasons.length} saison(s) · ${eps} épisode(s)`),
        badge(p.format), badge(`Modifié le ${fmtDate(p.updatedAt)}`, 'soft'))),
    h('div', { class: 'card-actions' },
      h('button', { class: 'icon-btn', title: 'Sauvegarder dans un fichier', onclick: async () => download(await exportProjectFile(p), `${slug(p.title)}.afrostudio.json`) }, '💾'),
      h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { if (await confirmBox(`Supprimer définitivement « ${p.title} » ? Pensez à le sauvegarder avant.`, 'Supprimer')) { await deleteProject(p.id); location.reload(); } } }, '🗑')));
}

export const slug = (s) => (s || 'projet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

async function createProject() {
  const d = { title: '', kind: 'serie', format: '9:16', style: STYLES[0], logline: '' };
  const ok = await modal('Nouveau projet', h('div', { class: 'form' },
    field('Titre du projet', d, 'title', { placeholder: 'Ex. : Les aventures de Kofi' }),
    field('Type', d, 'kind', { options: [['serie', 'Série animée (saisons et épisodes)'], ['film', 'Court-métrage']] }),
    field('Format vidéo', d, 'format', { options: Object.entries(FORMATS).map(([k, v]) => [k, v.label]) }),
    field('Style visuel', d, 'style', { options: STYLES, hint: 'Modifiable plus tard (texte libre dans le projet).' }),
    field('Résumé en une phrase (facultatif)', d, 'logline', { type: 'textarea', rows: 2 })), [{ label: 'Créer le projet' }]);
  if (!ok) return;
  const p = newProject(d);
  await saveProject(p);
  location.hash = `#/projet/${p.id}/${p.seasons[0].episodes[0].id}/idee`;
}

async function importBackup() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    const p = await importProjectFile(f);
    toast('Projet importé ✓', 'ok');
    location.hash = `#/projet/${p.id}`;
  } catch (e) { toast(e.message, 'error'); }
}

async function createSample() {
  const gainde = newCharacter({
    name: 'Gaïndé', role: 'Personnage principal', kind: 'Car rapide (véhicule vivant)', age: '40 ans',
    appearance: 'vieux minibus Car Rapide de Dakar, carrosserie jaune et bleu, grands yeux ronds sur le pare-brise, pare-chocs en forme de sourire',
    outfit: 'peintures traditionnelles colorées, inscription « Alhamdoulilah » sur le front, porte-bagages chargé de valises',
    colors: 'jaune vif, bleu roi, touches de rouge', personality: 'sage, malicieux, fier de connaître chaque ruelle de Dakar',
    catchphrase: 'Dakar, je la connais par cœur !', voice: { lang: 'fr-FR', accent: 'Sénégalais', gender: 'masculin', tone: 'Grave et chaleureuse', pitch: 0.8, rate: 0.95, browserVoice: '' },
  });
  const tata = newCharacter({
    name: 'Tata Boy', role: 'Rival', kind: 'Bus moderne (véhicule vivant)', age: '2 ans',
    appearance: 'bus urbain moderne et brillant, vitres teintées, phares LED en forme de lunettes de soleil',
    outfit: 'carrosserie blanche avec bandes vertes, écran GPS sur le tableau de bord', colors: 'blanc, vert menthe, chrome',
    personality: 'vantard, pressé, au fond peu sûr de lui', catchphrase: 'Mon GPS ne se trompe jamais !',
    voice: { lang: 'fr-FR', accent: 'Français standard', gender: 'masculin', tone: 'Aiguë et rapide', pitch: 1.3, rate: 1.15, browserVoice: '' },
  });
  await saveCharacter(gainde); await saveCharacter(tata);
  const p = newProject({ title: 'Car Rapide Stories', kind: 'serie', format: '9:16', style: STYLES[0], logline: 'Un vieux car rapide de Dakar affronte les véhicules modernes avec sagesse et humour.' });
  p.cast = [gainde.id, tata.id];
  p.decors = [
    { id: uid('dc'), name: 'Rond-point de la Médina', description: 'carrefour animé de Dakar, marchands ambulants, baobab au centre, soleil chaud' },
    { id: uid('dc'), name: 'Corniche de Dakar', description: 'route en bord d\'océan, falaises, vagues, ciel orange au coucher du soleil' },
  ];
  const ep = p.seasons[0].episodes[0];
  ep.title = 'Le défi de Dakar';
  ep.idea.pitch = 'Tata Boy se moque de l\'âge de Gaïndé et le défie dans une course jusqu\'à la Corniche. Mais Gaïndé connaît Dakar mieux que n\'importe quel GPS.';
  ep.idea.lesson = 'L\'expérience vaut tous les gadgets.';
  await saveProject(p);
  toast('Projet exemple créé ✓', 'ok');
  location.hash = `#/projet/${p.id}`;
}
