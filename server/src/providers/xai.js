// Images et vidéos avec l'API xAI (Grok Imagine).
// Formats vérifiés dans le SDK officiel @ai-sdk/xai 5.0.39 (novembre 2026) :
//   POST /v1/images/generations | /v1/images/edits  { model, prompt, n, response_format, aspect_ratio, image | images }
//   POST /v1/videos/generations  { model, prompt, duration, aspect_ratio, resolution, image, reference_images } → { request_id }
//   GET  /v1/videos/{request_id} → 202 (en cours) ou { status: done|failed|expired, video: { url, duration, respect_moderation } }
import { ProviderError } from './openai.js';

const BASE = 'https://api.x.ai/v1';

async function call(apiKey, path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  let r;
  try {
    r = await fetchImpl(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw new ProviderError('Impossible de joindre xAI (Grok) : ' + (e.message || e)); }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* corps non JSON */ }
  if (!r.ok) throw mapXaiError(r.status, data, text);
  return { status: r.status, data };
}

function mapXaiError(status, data, text) {
  const detail = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || text?.slice(0, 200) || '';
  if (status === 401 || status === 403 && /key|auth/i.test(detail)) return new ProviderError('Clé API xAI invalide (à vérifier sur le serveur relais).');
  if (status === 402 || /credit|balance|billing|spending/i.test(detail)) return new ProviderError('Crédit xAI insuffisant : ajoutez du crédit sur console.x.ai.', 402);
  if (status === 403) return new ProviderError('Accès refusé par xAI : ' + detail);
  if (status === 404) return new ProviderError('Ressource xAI introuvable (modèle ou vidéo) : ' + detail, 404);
  if (status === 429) return new ProviderError('Grok est saturé ou la limite de requêtes est atteinte, réessayez dans une minute.', 429);
  if (status >= 500) return new ProviderError('Grok rencontre un problème temporaire, réessayez plus tard.');
  if (/moderation|policy|safety/i.test(detail)) return new ProviderError('Contenu refusé par la modération de Grok. Reformulez la description.', 422);
  return new ProviderError('Demande refusée par Grok : ' + detail, 400);
}

export async function xaiImage({ apiKey, model, prompt, references = [], aspectRatio, fetchImpl }) {
  const body = { model, prompt, n: 1, response_format: 'b64_json' };
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (references.length === 1) body.image = { url: references[0], type: 'image_url' };
  else if (references.length > 1) body.images = references.map((url) => ({ url, type: 'image_url' }));
  const { data } = await call(apiKey, references.length ? '/images/edits' : '/images/generations', { method: 'POST', body, fetchImpl });
  const img = data?.data?.[0];
  if (!img) throw new ProviderError('Grok n\'a renvoyé aucune image.');
  if (img.respect_moderation === false) throw new ProviderError('Image bloquée par la modération de Grok. Reformulez la description.', 422);
  if (img.b64_json) return { image: `data:image/jpeg;base64,${img.b64_json}`, revisedPrompt: img.revised_prompt || null };
  if (img.url) {
    const r = await (fetchImpl || fetch)(img.url);
    if (!r.ok) throw new ProviderError('Téléchargement de l\'image Grok impossible.');
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { image: `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${btoa(bin)}`, revisedPrompt: null };
  }
  throw new ProviderError('Réponse d\'image Grok inattendue.');
}

export async function xaiStartVideo({ apiKey, model, prompt, image, references = [], duration, aspectRatio, resolution, fetchImpl }) {
  const body = { model, prompt, duration, aspect_ratio: aspectRatio, resolution };
  if (image) body.image = { url: image };
  else if (references.length) body.reference_images = references.slice(0, 7).map((url) => ({ url }));
  const { data } = await call(apiKey, '/videos/generations', { method: 'POST', body, fetchImpl });
  if (!data?.request_id) throw new ProviderError('Grok n\'a pas renvoyé d\'identifiant de vidéo.');
  return { jobId: data.request_id };
}

export async function xaiVideoStatus({ apiKey, jobId, fetchImpl }) {
  const { status, data } = await call(apiKey, '/videos/' + encodeURIComponent(jobId), { fetchImpl });
  if (status === 202 || !data || data.status === 'pending' || data.status === 'in_progress' || data.status === 'queued') return { status: 'pending' };
  if (data.status === 'expired') return { status: 'failed', error: 'La génération a expiré. Relancez-la.' };
  if (data.status === 'failed') return { status: 'failed', error: 'Grok n\'a pas pu générer la vidéo' + (data.error?.message ? ' : ' + data.error.message : '.') };
  const v = data.video;
  if (v?.respect_moderation === false) return { status: 'failed', error: 'Vidéo bloquée par la modération de Grok. Reformulez la description.' };
  const url = v?.url || v?.file_output?.public_url;
  if (data.status === 'done' || url) {
    if (!url) return { status: 'failed', error: 'Vidéo terminée mais sans lien de téléchargement.' };
    return { status: 'done', url, duration: v?.duration ?? null };
  }
  return { status: 'pending' };
}
