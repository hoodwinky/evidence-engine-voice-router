import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { VoiceRouter } from '../src/router.mjs';
import { createVoiceServer } from '../src/server.mjs';
const captureToken = 'synthetic-capture-token-'.repeat(3), reviewToken = 'synthetic-review-token-'.repeat(3);
async function start(t) {
  const router = new VoiceRouter(), server = createVoiceServer({ captureToken, reviewToken, router });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); router.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, { token = reviewToken, body, ...options } = {}) => fetch(base + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

test('server refuses missing, short or identical secrets', () => {
  assert.throws(() => createVoiceServer({ captureToken: '', reviewToken }));
  assert.throws(() => createVoiceServer({ captureToken, reviewToken: captureToken }));
});

test('capture credentials cannot read the inbox or confirm actions', async t => {
  const request = await start(t);
  assert.equal((await request('/v1/captures', { token: 'wrong' })).status, 401);
  assert.equal((await request('/v1/captures', { token: captureToken })).status, 403);
  const response = await request('/v1/captures', { token: captureToken, method: 'POST', body: { text: 'remind: venue', dueAt: '2026-12-01T09:00:00+11:00' } });
  assert.equal(response.status, 201); const c = await response.json(); assert.equal(c.status, 'pending_review');
  assert.equal((await request(`/v1/captures/${c.id}/execute`, { token: captureToken, method: 'POST', body: { revision: 1, confirmed: true } })).status, 403);
});

test('HTTP capture, clarification, handoff and receipt work together', async t => {
  const request = await start(t);
  const c = await (await request('/v1/captures', { method: 'POST', body: { text: 'remind: venue', source: 'siri' } })).json();
  assert.equal(c.status, 'needs_details');
  const revised = await (await request(`/v1/captures/${c.id}/prepare`, { method: 'POST', body: { revision: 1, details: { dueAt: '2026-12-01T09:00:00+11:00' } } })).json();
  assert.equal(revised.revision, 2);
  const dispatch = await (await request(`/v1/captures/${c.id}/execute`, { method: 'POST', body: { revision: 2, confirmed: true } })).json();
  assert.equal(dispatch.status, 'awaiting_device');
  const receipt = await (await request(`/v1/captures/${c.id}/receipt`, { method: 'POST', body: { revision: 2, externalId: 'synthetic-item-id' } })).json();
  assert.equal(receipt.status, 'completed');
});

test('request validation rejects malformed JSON, unknown fields and oversized bodies', async t => {
  const request = await start(t);
  assert.equal((await request('/v1/captures', { method: 'POST', body: { text: 'hi', autoConfirm: true } })).status, 422);
  assert.equal((await request('/v1/captures', { method: 'POST', body: { text: 'x'.repeat(70000) } })).status, 413);
  assert.equal((await request('/v1/captures', { method: 'POST', body: { text: 'hi' }, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('/v1/captures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: undefined, })).status, 400);
});

test('API denies cross-origin writes and does not cache note responses', async t => {
  const request = await start(t);
  const denied = await request('/v1/captures', { method: 'POST', body: { text: 'hi' }, headers: { Origin: 'https://untrusted.invalid' } }); assert.equal(denied.status, 403);
  const response = await request('/v1/captures'); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('idempotency works over HTTP and calendar downloads never send invitations', async t => {
  const request = await start(t), body = { text: 'calendar: Visit', startAt: '2026-12-01T09:00:00+11:00', endAt: '2026-12-01T10:00:00+11:00' };
  const first = await request('/v1/captures', { method: 'POST', body, headers: { 'Idempotency-Key': 'http-demo' } }); const c = await first.json();
  const second = await request('/v1/captures', { method: 'POST', body, headers: { 'Idempotency-Key': 'http-demo' } }); assert.equal(second.status, 200); assert.equal((await second.json()).id, c.id);
  const download = await request(`/v1/captures/${c.id}/calendar.ics`); assert.equal(download.status, 200); assert.match(await download.text(), /BEGIN:VEVENT/);
  assert.equal((await (await request(`/v1/captures/${c.id}`)).json()).status, 'pending_review');
});

test('an incomplete calendar download returns a JSON conflict before writing headers', async t => {
  const request = await start(t);
  const c = await (await request('/v1/captures', { method: 'POST', body: { text: 'calendar: needs dates' } })).json();
  const response = await request(`/v1/captures/${c.id}/calendar.ics`);
  assert.equal(response.status, 409); assert.equal((await response.json()).error, 'not_a_calendar');
});
