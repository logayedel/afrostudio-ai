// Serveur relais AfroStudio AI — Cloudflare Worker.
// Rôle : garder les clés API secrètes côté serveur, vérifier le code d'accès,
// limiter l'usage quotidien et appeler les moteurs IA.
import Anthropic from '@anthropic-ai/sdk';
import { TASKS } from './tasks.js';

const json = (data, status, cors) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Code',
    'Access-Control-Max-Age': '86400',
  };
}

function capabilities(env) {
  return {
    text: !!env.ANTHROPIC_API_KEY,
    image: false, // à brancher : voir docs/MOTEURS-IA.md
    video: false,
    voice: false,
  };
}

async function countUsage(env) {
  if (!env.USAGE) return { ok: true };
  const key = 'day:' + new Date().toISOString().slice(0, 10);
  const n = Number(await env.USAGE.get(key)) || 0;
  const limit = Number(env.DAILY_LIMIT) || 100;
  if (n >= limit) return { ok: false, limit };
  await env.USAGE.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 });
  return { ok: true };
}

export async function handle(request, env, deps = {}) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);

  if (env.STUDIO_ACCESS_CODE && request.headers.get('X-Studio-Code') !== env.STUDIO_ACCESS_CODE) {
    return json({ error: 'Code d\'accès du studio incorrect (Paramètres → Code d\'accès).' }, 401, cors);
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({
      ok: true,
      capabilities: capabilities(env),
      models: { text: env.ANTHROPIC_API_KEY ? `Claude (${env.TEXT_MODEL || 'claude-opus-5-5'})` : '' },
      limits: { dailyRequests: env.USAGE ? Number(env.DAILY_LIMIT) || 100 : null },
    }, 200, cors);
  }

  if (url.pathname === '/api/generate' && request.method === 'POST') {
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Aucune clé de moteur de texte configurée sur le relais.' }, 503, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Requête invalide.' }, 400, cors); }
    const task = TASKS[body?.task];
    if (!task) return json({ error: 'Tâche inconnue.' }, 400, cors);
    const input = JSON.stringify(body.input ?? {});
    if (input.length > 60000) return json({ error: 'Demande trop volumineuse.' }, 413, cors);

    const usage = await countUsage(env);
    if (!usage.ok) return json({ error: `Limite quotidienne atteinte (${usage.limit} générations). Réessayez demain ou augmentez DAILY_LIMIT.` }, 429, cors);

    const client = deps.client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const msg = await client.beta.messages.create({
        model: env.TEXT_MODEL || 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: env.TEXT_EFFORT || 'medium', format: { type: 'json_schema', schema: task.schema } },
        system: task.system,
        messages: [{ role: 'user', content: task.prompt(body.input || {}) }],
      });
      if (msg.stop_reason === 'refusal') return json({ error: 'Le moteur a refusé cette demande. Reformulez votre idée.' }, 422, cors);
      if (msg.stop_reason === 'max_tokens') return json({ error: 'Réponse trop longue : réduisez la durée de l\'épisode ou découpez-le.' }, 422, cors);
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return json({ result: JSON.parse(text), usage: { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens } }, 200, cors);
    } catch (e) {
      const status = e instanceof Anthropic.RateLimitError ? 429
        : e instanceof Anthropic.AuthenticationError ? 502
          : e instanceof Anthropic.APIError ? 502 : 500;
      const msg = e instanceof Anthropic.AuthenticationError ? 'Clé API du moteur de texte invalide (à vérifier sur le relais).'
        : e instanceof Anthropic.RateLimitError ? 'Moteur saturé, réessayez dans une minute.'
          : e instanceof SyntaxError ? 'Réponse illisible du moteur, réessayez.'
            : 'Erreur du moteur de texte : ' + (e.message || e);
      return json({ error: msg }, status, cors);
    }
  }

  return json({ error: 'Adresse inconnue.' }, 404, cors);
}

export default { fetch: (request, env) => handle(request, env) };
