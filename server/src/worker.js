// Serveur relais AfroStudio AI — Cloudflare Worker.
// Rôle : garder les clés API secrètes côté serveur (jamais dans GitHub Pages), vérifier le code
// d'accès, contrôler les coûts (confirmation + plafond quotidien) et appeler les moteurs IA :
//   - texte : OpenAI (par défaut) ou Anthropic Claude
//   - images et vidéos : xAI Grok Imagine
import Anthropic from '@anthropic-ai/sdk';
import { TASKS } from './tasks.js';
import { openaiText, ProviderError } from './providers/openai.js';
import { xaiImage, xaiStartVideo, xaiVideoStatus } from './providers/xai.js';
import { getPrices, estimateText, actualText, estimateImage, estimateVideo } from './pricing.js';

const json = (data, status, cors) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    ...(allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Code',
    'Access-Control-Max-Age': '86400',
  };
}

export function config(env) {
  const textProvider = env.TEXT_PROVIDER || (env.OPENAI_API_KEY ? 'openai' : env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai');
  return {
    textProvider,
    textModel: textProvider === 'openai' ? (env.OPENAI_TEXT_MODEL || 'gpt-5.5') : (env.TEXT_MODEL || 'claude-opus-5-5'),
    textEffort: env.TEXT_EFFORT || (textProvider === 'openai' ? 'low' : 'medium'),
    textKey: textProvider === 'openai' ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY,
    imageModel: env.XAI_IMAGE_MODEL || 'grok-imagine-image',
    videoModel: env.XAI_VIDEO_MODEL || 'grok-imagine-video',
    maxVideoSeconds: Number(env.MAX_VIDEO_SECONDS) || 15,
    dailyBudget: Number(env.DAILY_BUDGET_USD) || 0,
  };
}

function capabilities(env) {
  const c = config(env);
  return { text: !!c.textKey, image: !!env.XAI_API_KEY, video: !!env.XAI_API_KEY, voice: false };
}

// ----- Contrôle des coûts -----
// Le navigateur affiche l'estimation et demande confirmation ; il renvoie le montant accepté.
// Le serveur refuse si sa propre estimation dépasse ce montant (protection contre les surprises).
function checkAccepted(estimate, accepted) {
  if (estimate == null) return null; // tarif inconnu : on laisse passer, l'interface le signale
  if (!(Number(accepted) >= 0)) return 'Confirmation du coût manquante.';
  if (estimate > Number(accepted) * 1.05 + 0.0001) return `Le coût estimé (${estimate.toFixed(3)} $) dépasse le montant confirmé (${Number(accepted).toFixed(3)} $). Relancez pour reconfirmer.`;
  return null;
}

async function spend(env, amount) {
  const c = config(env);
  if (!env.USAGE) return { ok: true };
  const key = 'spend:' + new Date().toISOString().slice(0, 10);
  const spent = Number(await env.USAGE.get(key)) || 0;
  if (c.dailyBudget && spent + (amount || 0) > c.dailyBudget) return { ok: false, spent, budget: c.dailyBudget };
  await env.USAGE.put(key, String(spent + (amount || 0)), { expirationTtl: 60 * 60 * 48 });
  return { ok: true, spent: spent + (amount || 0) };
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

const isDataImage = (s) => typeof s === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(s);

// ----- Texte -----
async function anthropicText({ apiKey, model, effort, task, input, client }) {
  const c = client || new Anthropic({ apiKey });
  try {
    const msg = await c.beta.messages.create({
      model, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema: task.schema } },
      system: task.system, messages: [{ role: 'user', content: task.prompt(input) }],
    });
    if (msg.stop_reason === 'refusal') throw new ProviderError('Le moteur a refusé cette demande. Reformulez votre idée.', 422);
    if (msg.stop_reason === 'max_tokens') throw new ProviderError('Réponse trop longue : réduisez la durée de l\'épisode ou découpez-le.', 422);
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { result: JSON.parse(text), usage: { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens }, model };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof SyntaxError) throw new ProviderError('Réponse illisible du moteur, réessayez.');
    if (e instanceof Anthropic.AuthenticationError) throw new ProviderError('Clé API Anthropic invalide (à vérifier sur le relais).');
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError('Moteur saturé, réessayez dans une minute.', 429);
    throw new ProviderError('Erreur du moteur de texte : ' + (e.message || e));
  }
}

export async function handle(request, env, deps = {}) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  const path = url.pathname;
  const c = config(env);
  const prices = getPrices(env);

  if (env.STUDIO_ACCESS_CODE && request.headers.get('X-Studio-Code') !== env.STUDIO_ACCESS_CODE) {
    return json({ error: 'Code d\'accès du studio incorrect (Paramètres → Code d\'accès).' }, 401, cors);
  }

  try {
    if (path === '/api/health' && request.method === 'GET') {
      const caps = capabilities(env);
      return json({
        ok: true,
        capabilities: caps,
        models: {
          text: caps.text ? `${c.textProvider === 'openai' ? 'OpenAI' : 'Claude'} (${c.textModel})` : '',
          image: caps.image ? `Grok Imagine (${c.imageModel})` : '',
          video: caps.video ? `Grok Imagine (${c.videoModel})` : '',
        },
        config: { textModel: c.textModel, imageModel: c.imageModel, videoModel: c.videoModel, maxVideoSeconds: c.maxVideoSeconds },
        prices,
        limits: { dailyBudgetUsd: env.USAGE && c.dailyBudget ? c.dailyBudget : null },
      }, 200, cors);
    }

    // ---- Texte (scénario, scène, fiche personnage, storyboard) ----
    if (path === '/api/generate' && request.method === 'POST') {
      if (!c.textKey) return json({ error: 'Aucune clé de moteur de texte configurée sur le serveur relais.' }, 503, cors);
      const body = await readJson(request);
      const task = TASKS[body?.task];
      if (!task) return json({ error: 'Tâche inconnue.' }, 400, cors);
      const input = body.input || {};
      if (JSON.stringify(input).length > 60000) return json({ error: 'Demande trop volumineuse.' }, 413, cors);
      const estimate = estimateText(prices, c.textModel, body.task);
      const bad = checkAccepted(estimate, body.acceptedCost);
      if (bad) return json({ error: bad, estimate }, 409, cors);
      const budget = await spend(env, estimate || 0);
      if (!budget.ok) return json({ error: `Budget quotidien atteint (${budget.budget} $). Réessayez demain ou augmentez DAILY_BUDGET_USD.` }, 429, cors);
      const fn = c.textProvider === 'openai' ? openaiText : anthropicText;
      const out = await fn({ apiKey: c.textKey, model: c.textModel, effort: c.textEffort, task, taskName: body.task, input, client: deps.textClient });
      return json({ result: out.result, usage: out.usage, cost: actualText(prices, c.textModel, out.usage) ?? estimate, model: out.model }, 200, cors);
    }

    // ---- Image (Grok Imagine) ----
    if (path === '/api/image' && request.method === 'POST') {
      if (!env.XAI_API_KEY) return json({ error: 'Aucune clé xAI (Grok) configurée sur le serveur relais.' }, 503, cors);
      const body = await readJson(request);
      if (!body?.prompt || typeof body.prompt !== 'string') return json({ error: 'Description de l\'image manquante.' }, 400, cors);
      const references = (body.references || []).filter(isDataImage).slice(0, 5);
      const estimate = estimateImage(prices, c.imageModel, references.length);
      const bad = checkAccepted(estimate, body.acceptedCost);
      if (bad) return json({ error: bad, estimate }, 409, cors);
      const budget = await spend(env, estimate || 0);
      if (!budget.ok) return json({ error: `Budget quotidien atteint (${budget.budget} $).` }, 429, cors);
      const out = await xaiImage({ apiKey: env.XAI_API_KEY, model: c.imageModel, prompt: body.prompt.slice(0, 8000), references, aspectRatio: body.aspectRatio, fetchImpl: deps.fetch });
      return json({ ...out, cost: estimate, model: c.imageModel }, 200, cors);
    }

    // ---- Vidéo (Grok Imagine) : lancement ----
    if (path === '/api/video' && request.method === 'POST') {
      if (!env.XAI_API_KEY) return json({ error: 'Aucune clé xAI (Grok) configurée sur le serveur relais.' }, 503, cors);
      const body = await readJson(request);
      if (!body?.prompt) return json({ error: 'Description du plan manquante.' }, 400, cors);
      const duration = Math.max(1, Math.min(c.maxVideoSeconds, Math.round(Number(body.duration) || 6)));
      const resolution = ['480p', '720p'].includes(body.resolution) ? body.resolution : '480p';
      const image = isDataImage(body.image) ? body.image : null;
      const references = image ? [] : (body.references || []).filter(isDataImage).slice(0, 7);
      const estimate = estimateVideo(prices, c.videoModel, duration, resolution, (image ? 1 : 0) + references.length);
      const bad = checkAccepted(estimate, body.acceptedCost);
      if (bad) return json({ error: bad, estimate }, 409, cors);
      const budget = await spend(env, estimate || 0);
      if (!budget.ok) return json({ error: `Budget quotidien atteint (${budget.budget} $).` }, 429, cors);
      const out = await xaiStartVideo({ apiKey: env.XAI_API_KEY, model: c.videoModel, prompt: String(body.prompt).slice(0, 8000), image, references, duration, aspectRatio: body.aspectRatio || '9:16', resolution, fetchImpl: deps.fetch });
      return json({ ...out, cost: estimate, duration, resolution, model: c.videoModel }, 200, cors);
    }

    // ---- Vidéo : suivi et téléchargement ----
    const m = path.match(/^\/api\/video\/([\w.-]+)(\/file)?$/);
    if (m && request.method === 'GET') {
      if (!env.XAI_API_KEY) return json({ error: 'Aucune clé xAI configurée.' }, 503, cors);
      const st = await xaiVideoStatus({ apiKey: env.XAI_API_KEY, jobId: m[1], fetchImpl: deps.fetch });
      if (!m[2]) return json(st.status === 'done' ? { status: 'done', duration: st.duration } : st, 200, cors);
      if (st.status !== 'done') return json({ error: 'La vidéo n\'est pas encore prête.' }, 409, cors);
      const r = await (deps.fetch || fetch)(st.url);
      if (!r.ok) return json({ error: 'Téléchargement de la vidéo Grok impossible (lien expiré ?).' }, 502, cors);
      return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'video/mp4', ...cors } });
    }

    return json({ error: 'Adresse inconnue.' }, 404, cors);
  } catch (e) {
    if (e instanceof ProviderError) return json({ error: e.message }, e.status, cors);
    console.error(e);
    return json({ error: 'Erreur interne du serveur relais : ' + (e.message || e) }, 500, cors);
  }
}

export default { fetch: (request, env) => handle(request, env) };
