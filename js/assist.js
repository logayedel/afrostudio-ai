// Mode éco : AfroStudio prépare le prompt, l'utilisateur génère lui-même dans ChatGPT ou Grok
// (avec son abonnement), puis ramène le résultat par Ctrl+V ou glisser-déposer.
// Aucun pilotage automatique des sites : l'utilisateur garde toujours la main.
import { h, toast } from './ui.js';
import { getBlob } from './db.js';

export const TOOLS = {
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/', icon: '🎨' },
  grok: { label: 'Grok', url: 'https://grok.com/imagine', icon: '🎬' },
};

let pending = null; // { kind: 'image'|'video', label, apply(file), next?(), startImage? }
let dock = null;

// Ouvre l'outil (nouvel onglet) avec le prompt copié, et attend le résultat.
export async function startAssist({ tool, prompt, kind, label, apply, next = null, startImage = null, openTab = true }) {
  let copied = false;
  try { await navigator.clipboard.writeText(prompt); copied = true; } catch { /* affichage du prompt ci-dessous */ }
  if (openTab) window.open(TOOLS[tool].url, 'afrostudio-' + tool);
  pending = { tool, prompt, kind, label, apply, next, startImage };
  renderDock(copied);
}

export function stopAssist() { pending = null; dock?.remove(); dock = null; }

function accepts(file) {
  if (!pending || !file) return false;
  return pending.kind === 'image' ? file.type.startsWith('image/') : (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name));
}

async function deliver(file) {
  if (!accepts(file)) {
    toast(pending?.kind === 'video' ? 'Il faut un fichier vidéo (MP4).' : 'Il faut une image.', 'error');
    return;
  }
  const p = pending;
  try {
    await p.apply(file);
    toast(`${p.kind === 'video' ? 'Clip' : 'Image'} ajouté : ${p.label} ✓`, 'ok');
    if (p.next) { const n = p.next(); if (n) return startAssist({ ...n, openTab: false }); }
    stopAssist();
  } catch (e) { toast(e.message, 'error'); }
}

async function copyStartImage(blobId) {
  try {
    const blob = await getBlob(blobId);
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const png = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('Image de départ copiée : collez-la dans Grok (Ctrl+V) ✓', 'ok');
  } catch {
    toast('Copie de l\'image impossible dans ce navigateur. Utilisez « Télécharger ».', 'error');
  }
}

async function downloadStartImage(blobId) {
  const blob = await getBlob(blobId);
  if (!blob) return;
  const u = URL.createObjectURL(blob);
  const a = h('a', { href: u, download: 'image-de-depart.png' }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

function renderDock(copied) {
  dock?.remove();
  if (!pending) return;
  const p = pending;
  const tool = TOOLS[p.tool];
  const fileInput = h('input', { type: 'file', accept: p.kind === 'image' ? 'image/*' : 'video/*', style: { display: 'none' }, onchange: (e) => e.target.files[0] && deliver(e.target.files[0]) });
  dock = h('div', { class: 'assist-dock', role: 'dialog', 'aria-label': 'Mode éco' },
    h('div', { class: 'assist-head' },
      h('b', {}, `${tool.icon} Mode éco · ${tool.label}`),
      h('button', { class: 'icon-btn', title: 'Fermer', onclick: stopAssist }, '✕')),
    h('p', { class: 'small' }, 'Pour : ', h('b', {}, p.label)),
    h('ol', { class: 'small assist-steps' },
      p.startImage ? h('li', {}, 'Donnez l\'image de départ à Grok : ',
        h('button', { class: 'link', onclick: () => copyStartImage(p.startImage) }, 'copier'), ' ou ',
        h('button', { class: 'link', onclick: () => downloadStartImage(p.startImage) }, 'télécharger')) : null,
      h('li', {}, copied ? 'Le prompt est copié : dans ' : 'Copiez le prompt ci-dessous, puis dans ', h('a', { href: tool.url, target: 'afrostudio-' + p.tool }, tool.label), ', faites Ctrl+V puis Entrée.',
        ' ', h('button', { class: 'link', onclick: async () => { try { await navigator.clipboard.writeText(p.prompt); toast('Prompt recopié ✓', 'ok'); } catch { /* ignoré */ } } }, 'Recopier le prompt')),
      h('li', {}, p.kind === 'image'
        ? 'Sur l\'image obtenue : clic droit → « Copier l\'image », revenez ici et faites Ctrl+V.'
        : 'Téléchargez la vidéo, puis glissez-la dans le cadre ci-dessous.')),
    h('div', {
      class: 'assist-drop', tabindex: 0,
      onclick: () => fileInput.click(),
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
      ondragleave: (e) => e.currentTarget.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); deliver(e.dataTransfer.files[0]); },
    }, p.kind === 'image' ? 'Ctrl+V ici, ou glissez / cliquez pour choisir l\'image' : 'Glissez la vidéo ici, ou cliquez pour la choisir'),
    fileInput,
    copied ? null : h('textarea', { rows: 4, readonly: true, value: p.prompt }));
  document.body.append(dock);
}

// Ctrl+V n'importe où dans l'application quand une image est attendue
addEventListener('paste', (e) => {
  if (!pending) return;
  const file = [...(e.clipboardData?.files || [])][0];
  if (file) { e.preventDefault(); deliver(file); }
});

// Rend un élément capable de recevoir un fichier glissé-déposé
export function dropTarget(el, kind, onFile) {
  const ok = (f) => f && (kind === 'image' ? f.type.startsWith('image/') : (f.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(f.name)) || (kind === 'audio' && f.type.startsWith('audio/')));
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('drop-over');
    const f = e.dataTransfer.files[0];
    if (ok(f)) onFile(f); else toast('Type de fichier non accepté ici.', 'error');
  });
  return el;
}

// Tri naturel des noms de fichiers : 2.mp4 avant 10.mp4
export const naturalSort = (files) => [...files].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
