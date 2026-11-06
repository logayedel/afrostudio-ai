import { h, $ } from './ui.js';
import { requestPersistence } from './db.js';
import { checkStatus } from './engines/index.js';
import { flushSaves } from './store.js';
import { dashboardView } from './views/dashboard.js';
import { charactersView, characterEditorView } from './views/characters.js';
import { settingsView } from './views/settings.js';
import { projectView } from './views/project.js';
import { episodeView } from './views/episode.js';

const routes = [
  [/^$/, dashboardView],
  [/^personnages$/, charactersView],
  [/^personnages\/([\w-]+)$/, (m) => characterEditorView({ characterId: m[1] })],
  [/^parametres$/, settingsView],
  [/^projet\/([\w-]+)$/, (m) => projectView({ projectId: m[1] })],
  [/^projet\/([\w-]+)\/([\w-]+)\/?(\w*)$/, (m) => episodeView({ projectId: m[1], episodeId: m[2], step: m[3] || 'idee' })],
];

let renderTicket = 0;
let lastPath = null;

async function render() {
  const ticket = ++renderTicket;
  await flushSaves();
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');
  const main = $('#main');
  const keepScroll = path === lastPath ? window.scrollY : 0;
  let view = null;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { view = fn; try { view = await fn(m); } catch (e) { console.error(e); view = errorView(e); } break; }
  }
  if (ticket !== renderTicket) return;
  if (!view) view = errorView(new Error('Page introuvable'));
  main.replaceChildren(view);
  if (keepScroll) window.scrollTo(0, keepScroll);
  document.querySelectorAll('.topnav a').forEach((a) => {
    const target = a.getAttribute('href').replace(/^#\/?/, '');
    a.classList.toggle('active', target === '' ? path === '' || path.startsWith('projet') : path.startsWith(target));
  });
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
}

function errorView(e) {
  return h('section', { class: 'page' }, h('h1', {}, 'Oups'), h('p', {}, e.message || String(e)), h('a', { class: 'btn primary', href: '#/' }, 'Retour au tableau de bord'));
}

async function updateEnginePill() {
  const s = await checkStatus();
  const pill = $('#enginePill');
  const n = Object.values(s.capabilities || {}).filter(Boolean).length;
  pill.textContent = s.connected ? `IA connectée (${n}/4)` : 'Aucune IA connectée';
  pill.className = 'engine-pill ' + (s.connected && n ? 'on' : 'off');
  pill.title = s.error || 'Moteurs disponibles via le serveur relais';
}

function shell() {
  document.body.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'logo', href: '#/' }, h('span', { class: 'logo-mark' }, 'A'), h('span', {}, 'AfroStudio ', h('b', {}, 'AI'))),
      h('nav', { class: 'topnav' },
        h('a', { href: '#/' }, 'Projets'),
        h('a', { href: '#/personnages' }, 'Personnages'),
        h('a', { href: '#/parametres' }, 'Paramètres')),
      h('div', { class: 'top-right' },
        h('span', { id: 'saveState', class: 'save-state' }),
        h('a', { id: 'enginePill', class: 'engine-pill off', href: '#/parametres' }, '…'))),
    h('main', { id: 'main' }),
    h('footer', { class: 'foot' }, 'AfroStudio AI — V1 · Données stockées dans ce navigateur · ', h('a', { href: 'legacy/v05/' }, 'Ancienne version V0.5')),
  );
}

shell();
window.addEventListener('hashchange', render);
window.addEventListener('engines-changed', updateEnginePill);
render();
updateEnginePill();
requestPersistence();
