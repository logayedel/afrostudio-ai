// Stockage local (IndexedDB) : projets, personnages et fichiers (images, clips, sons).
// Tout reste dans le navigateur de l'utilisateur. Rien n'est envoyé sur Internet.

const DB_NAME = 'afrostudio';
const DB_VERSION = 1;
const STORES = ['projects', 'characters', 'blobs'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction annulée'));
  });
}

export const db = {
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
};

// Fichiers binaires
export async function putBlob(blob, name = '') {
  const id = 'b_' + crypto.randomUUID();
  await db.put('blobs', { id, blob, name, type: blob.type, size: blob.size, createdAt: Date.now() });
  return id;
}
export async function getBlob(id) {
  if (!id) return null;
  const rec = await db.get('blobs', id);
  return rec ? rec.blob : null;
}
export async function getBlobRecord(id) {
  return id ? db.get('blobs', id) : null;
}
export const delBlob = (id) => (id ? db.del('blobs', id) : Promise.resolve());

// Cache d'URL d'objets pour afficher images/vidéos sans les recharger
const urlCache = new Map();
export async function blobURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getBlob(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignoré */ }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch { /* ignoré */ }
  return null;
}
