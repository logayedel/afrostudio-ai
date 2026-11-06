import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { TASKS } from '../src/tasks.js';

const base = { STUDIO_ACCESS_CODE: 'secret', ALLOWED_ORIGINS: 'https://logayedel.github.io' };
const envOpenAI = { ...base, OPENAI_API_KEY: 'sk-test', XAI_API_KEY: 'xai-test' };
const req = (path, opts = {}) => new Request('https://relais.test' + path, { ...opts, headers: { Origin: 'https://logayedel.github.io', 'X-Studio-Code': 'secret', 'Content-Type': 'application/json', ...(opts.headers || {}) } });
const post = (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

// Faux fetch xAI : enregistre les appels et renvoie des réponses prévues
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    for (const [re, resp] of routes) if (re.test(url)) return typeof resp === 'function' ? resp(url, init) : resp.clone();
    return new Response('not found', { status: 404 });
  };
  f.calls = calls;
  return f;
}
const jres = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

test('refuse un mauvais code d\'accès', async () => {
  const r = await handle(req('/api/health', { headers: { 'X-Studio-Code': 'non' } }), envOpenAI);
  assert.equal(r.status, 401);
});

test('health : capacités, modèles et tarifs', async () => {
  const r = await handle(req('/api/health'), envOpenAI);
  const j = await r.json();
  assert.deepEqual(j.capabilities, { text: true, image: true, video: true, voice: false });
  assert.match(j.models.text, /OpenAI \(gpt-5\.5\)/);
  assert.equal(j.config.videoModel, 'grok-imagine-video');
  assert.ok(j.prices.video['grok-imagine-video'].perSecond['480p'] > 0);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://logayedel.github.io');
});

test('health sans clé : rien de disponible', async () => {
  const j = await (await handle(req('/api/health'), base)).json();
  assert.deepEqual(j.capabilities, { text: false, image: false, video: false, voice: false });
});

test('texte OpenAI : structured outputs et coût réel', async () => {
  let sent;
  const textClient = { responses: { create: async (p) => { sent = p; return { status: 'completed', model: 'gpt-5.5', output: [], output_text: '{"title":"T","scenes":[]}', usage: { input_tokens: 1000, output_tokens: 2000 } }; } } };
  const r = await handle(post('/api/generate', { task: 'script', input: { episode: { duration: 30 } }, acceptedCost: 1 }), envOpenAI, { textClient });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.deepEqual(j.result, { title: 'T', scenes: [] });
  assert.equal(sent.model, 'gpt-5.5');
  assert.equal(sent.text.format.type, 'json_schema');
  assert.equal(sent.text.format.strict, true);
  assert.match(sent.input, /30 secondes/);
  assert.equal(j.cost, (1000 * 5 + 2000 * 30) / 1e6);
});

test('texte : refus si le coût n\'a pas été confirmé', async () => {
  const r = await handle(post('/api/generate', { task: 'script', input: {} }), envOpenAI, { textClient: {} });
  assert.equal(r.status, 409);
  const r2 = await handle(post('/api/generate', { task: 'script', input: {}, acceptedCost: 0.001 }), envOpenAI, { textClient: {} });
  assert.equal(r2.status, 409);
  assert.match((await r2.json()).error, /dépasse le montant confirmé/);
});

test('texte : réponse incomplète et refus traduits en français', async () => {
  const mk = (o) => ({ responses: { create: async () => o } });
  let r = await handle(post('/api/generate', { task: 'scene', input: {}, acceptedCost: 1 }), envOpenAI, { textClient: mk({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }) });
  assert.equal(r.status, 422); assert.match((await r.json()).error, /trop longue/);
  r = await handle(post('/api/generate', { task: 'scene', input: {}, acceptedCost: 1 }), envOpenAI, { textClient: mk({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'non' }] }], output_text: '' }) });
  assert.equal(r.status, 422); assert.match((await r.json()).error, /refusé/);
  r = await handle(post('/api/generate', { task: 'scene', input: {}, acceptedCost: 1 }), envOpenAI, { textClient: { responses: { create: async () => { const e = new Error('Incorrect API key'); e.status = 401; throw e; } } } });
  assert.equal(r.status, 502); assert.match((await r.json()).error, /Clé API OpenAI invalide/);
});

test('image Grok : génération simple puis édition avec références', async () => {
  const f = fakeFetch([[/images\/(generations|edits)$/, jres({ data: [{ b64_json: 'QUJD' }] })]]);
  let r = await handle(post('/api/image', { prompt: 'Gaïndé', aspectRatio: '9:16', acceptedCost: 0.02 }), envOpenAI, { fetch: f });
  let j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.image, 'data:image/jpeg;base64,QUJD');
  assert.equal(f.calls[0].url, 'https://api.x.ai/v1/images/generations');
  assert.deepEqual(f.calls[0].body, { model: 'grok-imagine-image', prompt: 'Gaïndé', n: 1, response_format: 'b64_json', aspect_ratio: '9:16' });
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer xai-test');
  r = await handle(post('/api/image', { prompt: 'plan', references: [PNG, PNG], acceptedCost: 0.03 }), envOpenAI, { fetch: f });
  assert.equal(r.status, 200);
  assert.equal(f.calls[1].url, 'https://api.x.ai/v1/images/edits');
  assert.equal(f.calls[1].body.images.length, 2);
  assert.deepEqual(f.calls[1].body.images[0], { url: PNG, type: 'image_url' });
});

test('image Grok : erreurs compréhensibles', async () => {
  const f = fakeFetch([[/images/, jres({ code: 'x', error: 'Your team has run out of credits' }, 403)]]);
  const r = await handle(post('/api/image', { prompt: 'x', acceptedCost: 1 }), envOpenAI, { fetch: f });
  assert.match((await r.json()).error, /Crédit xAI insuffisant/);
  const f2 = fakeFetch([[/images/, jres({ data: [{ b64_json: 'x', respect_moderation: false }] })]]);
  const r2 = await handle(post('/api/image', { prompt: 'x', acceptedCost: 1 }), envOpenAI, { fetch: f2 });
  assert.equal(r2.status, 422);
});

test('vidéo Grok : lancement, suivi, téléchargement', async () => {
  let polls = 0;
  const f = fakeFetch([
    [/videos\/generations$/, jres({ request_id: 'req_123' })],
    [/videos\/req_123$/, () => (++polls === 1 ? new Response('', { status: 202 }) : jres({ status: 'done', video: { url: 'https://vidgen.x.ai/v.mp4', duration: 6 } }))],
    [/vidgen\.x\.ai/, new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } })],
  ]);
  let r = await handle(post('/api/video', { prompt: 'plan', image: PNG, duration: 6, resolution: '480p', aspectRatio: '9:16', acceptedCost: 0.302 }), envOpenAI, { fetch: f });
  let j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.jobId, 'req_123');
  assert.equal(j.cost, 0.302);
  assert.deepEqual(f.calls[0].body, { model: 'grok-imagine-video', prompt: 'plan', duration: 6, aspect_ratio: '9:16', resolution: '480p', image: { url: PNG } });
  r = await handle(req('/api/video/req_123'), envOpenAI, { fetch: f });
  assert.deepEqual(await r.json(), { status: 'pending' });
  r = await handle(req('/api/video/req_123'), envOpenAI, { fetch: f });
  assert.deepEqual(await r.json(), { status: 'done', duration: 6 });
  r = await handle(req('/api/video/req_123/file'), envOpenAI, { fetch: f });
  assert.equal(r.headers.get('Content-Type'), 'video/mp4');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3]);
});

test('vidéo Grok : références de personnages si pas d\'image de départ, durée bornée', async () => {
  const f = fakeFetch([[/videos\/generations$/, jres({ request_id: 'r2' })]]);
  const r = await handle(post('/api/video', { prompt: 'p', references: [PNG, PNG], duration: 99, acceptedCost: 10 }), envOpenAI, { fetch: f });
  assert.equal(r.status, 200);
  assert.equal(f.calls[0].body.duration, 15);
  assert.equal(f.calls[0].body.reference_images.length, 2);
  assert.equal(f.calls[0].body.image, undefined);
});

test('vidéo Grok : échec et expiration', async () => {
  const f = fakeFetch([[/videos\/a$/, jres({ status: 'failed', error: { message: 'boom' } })], [/videos\/b$/, jres({ status: 'expired' })]]);
  assert.match((await (await handle(req('/api/video/a'), envOpenAI, { fetch: f })).json()).error, /boom/);
  assert.match((await (await handle(req('/api/video/b'), envOpenAI, { fetch: f })).json()).error, /expiré/);
});

test('budget quotidien (KV) bloque au-delà du plafond', async () => {
  const store = new Map();
  const USAGE = { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
  const env = { ...envOpenAI, USAGE, DAILY_BUDGET_USD: '0.5' };
  const f = fakeFetch([[/videos\/generations$/, jres({ request_id: 'x' })]]);
  const ok = await handle(post('/api/video', { prompt: 'p', duration: 6, acceptedCost: 1 }), env, { fetch: f });
  assert.equal(ok.status, 200);
  const ko = await handle(post('/api/video', { prompt: 'p', duration: 6, acceptedCost: 1 }), env, { fetch: f });
  assert.equal(ko.status, 429);
  assert.match((await ko.json()).error, /Budget quotidien/);
});

test('tous les schémas sont stricts (exigence OpenAI)', () => {
  const walk = (s) => {
    if (s.type === 'object') { assert.equal(s.additionalProperties, false); assert.deepEqual(s.required, Object.keys(s.properties)); Object.values(s.properties).forEach(walk); }
    if (s.type === 'array') walk(s.items);
  };
  Object.values(TASKS).forEach((t) => walk(t.schema));
});
