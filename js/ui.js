// Petits utilitaires d'interface (sans framework, pour un déploiement simple).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden' || k === 'multiple') el[k] = !!v;
    else if (k === 'html') el.innerHTML = v; // réservé à du contenu statique interne
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(msg, kind = 'info') {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h2', {}, title),
        body,
        h('div', { class: 'row end' },
          h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Annuler'),
          actions.map((a) => h('button', { class: `btn ${a.kind || 'primary'}`, onclick: () => close(a.value ?? true) }, a.label)))));
    document.body.append(overlay);
    const first = overlay.querySelector('input,textarea,select');
    if (first) first.focus();
  });
}

export async function confirmBox(message, label = 'Confirmer', kind = 'danger') {
  return !!(await modal('Confirmation', h('p', {}, message), [{ label, kind }]));
}

// Champ de formulaire lié à un objet : met à jour obj[key] et appelle onChange.
export function field(label, obj, key, { type = 'text', rows = 3, placeholder = '', options = null, onChange = () => {}, hint = '', min, max, step } = {}) {
  let input;
  const update = () => {
    let v = input.value;
    if (type === 'number') v = v === '' ? null : Number(v);
    obj[key] = v;
    onChange(v);
  };
  if (options) {
    input = h('select', { onchange: update },
      options.map((o) => {
        const [val, txt] = Array.isArray(o) ? o : [o, o];
        return h('option', { value: val, selected: String(obj[key] ?? '') === String(val) }, txt);
      }));
  } else if (type === 'textarea') {
    input = h('textarea', { rows, placeholder, oninput: update });
    input.value = obj[key] ?? '';
  } else {
    input = h('input', { type, placeholder, oninput: update, min, max, step });
    input.value = obj[key] ?? '';
  }
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
}

export function badge(text, kind = '') { return h('span', { class: `badge ${kind}` }, text); }

export const fmtTime = (t) => {
  const x = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0));
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
};

export const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers ✓', 'ok'); }
  catch { await modal('Copier le texte', h('textarea', { rows: 10, value: text })); }
}

export function download(blob, filename) {
  const u = URL.createObjectURL(blob);
  const a = h('a', { href: u, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    i.onchange = () => { resolve(i.files[0] || null); i.remove(); };
    document.body.append(i);
    i.click();
  });
}

export function pickFiles(accept) {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
    i.onchange = () => { resolve([...i.files]); i.remove(); };
    document.body.append(i);
    i.click();
  });
}

export function mediaDuration(blob, kind = 'video') {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    const u = URL.createObjectURL(blob);
    const done = (d) => { URL.revokeObjectURL(u); resolve(Number.isFinite(d) && d > 0 ? d : null); };
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(null);
    el.src = u;
  });
}

// Bandeau "démonstration / fonctionnalité réelle" pour rester transparent.
export function notice(kind, text) {
  const icons = { real: '✅', demo: '🧪', off: '⛔', info: 'ℹ️' };
  return h('div', { class: `notice ${kind}` }, h('span', { class: 'ico' }, icons[kind] || 'ℹ️'), h('div', {}, text));
}
