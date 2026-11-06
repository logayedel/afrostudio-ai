import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { TASKS } from '../src/tasks.js';

const env = { ANTHROPIC_API_KEY: 'test', STUDIO_ACCESS_CODE: 'secret', ALLOWED_ORIGINS: 'https://logayedel.github.io' };
const req = (path, opts = {}) => new Request('https://relais.test' + path, { ...opts, headers: { Origin: 'https://logayedel.github.io', 'X-Studio-Code': 'secret', 'Content-Type': 'application/json', ...(opts.headers || {}) } });

test('refuse un mauvais code d\'accès', async () => {
  const r = await handle(req('/api/health', { headers: { 'X-Studio-Code': 'non' } }), env);
  assert.equal(r.status, 401);
});

test('health déclare les capacités et le CORS', async () => {
  const r = await handle(req('/api/health'), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(j.capabilities, { text: true, image: false, video: false, voice: false });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://logayedel.github.io');
});

test('generate appelle le moteur avec le schéma de la tâche', async () => {
  let sent;
  const client = { beta: { messages: { create: async (p) => { sent = p; return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"title":"T","scenes":[]}' }], usage: {} }; } } } };
  const r = await handle(req('/api/generate', { method: 'POST', body: JSON.stringify({ task: 'script', input: { episode: { duration: 30 } } }) }), env, { client });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).result, { title: 'T', scenes: [] });
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.match(sent.messages[0].content, /30 secondes/);
});

test('tous les schémas sont stricts', () => {
  const walk = (s) => {
    if (s.type === 'object') { assert.equal(s.additionalProperties, false); assert.deepEqual(s.required, Object.keys(s.properties)); Object.values(s.properties).forEach(walk); }
    if (s.type === 'array') walk(s.items);
  };
  Object.values(TASKS).forEach((t) => walk(t.schema));
});

test('tâche inconnue', async () => {
  const r = await handle(req('/api/generate', { method: 'POST', body: '{"task":"x"}' }), env);
  assert.equal(r.status, 400);
});
