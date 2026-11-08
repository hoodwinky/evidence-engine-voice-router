import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VoiceRouter, planCapture, calendarFile, webhookDestinations } from '../src/router.mjs';

function setup(t, options) { const router = new VoiceRouter(options); t.after(() => router.close()); return router; }

test('preserves exact original transcript and SHA-256 separately from the plan', t => {
  const router = setup(t), text = '  Note: José said “ready”\nKeep these words.  ';
  const c = router.capture({ text, source: 'siri' });
  assert.equal(c.original.text, text); assert.equal(c.originalSha256, createHash('sha256').update(text).digest('hex'));
  assert.equal(c.status, 'saved'); assert.equal(c.plan.title, 'José said “ready”\nKeep these words.');
});

test('prefixes are deliberate; ordinary sentences remain notes', t => {
  const router = setup(t);
  assert.equal(router.capture({ text: 'We discussed a calendar reminder tomorrow' }).plan.kind, 'note');
  assert.equal(planCapture({ text: 'remind me to call the venue' }).kind, 'reminder');
  assert.equal(planCapture({ text: 'calendar: Venue visit' }).kind, 'calendar');
});

test('ambiguous, invalid and impossible dates preserve the note and require details', t => {
  const router = setup(t);
  for (const dueAt of ['tomorrow morning', '2026-02-30T09:00:00+11:00', '2026-12-01T09:00:00', '2026-12-01T25:00:00Z', '2026-12-01T09:00:00+15:00']) {
    const c = router.capture({ text: 'remind: call venue', dueAt });
    assert.equal(c.status, 'needs_details'); assert.ok(c.plan.missing.includes('dueAt'));
  }
  assert.equal(router.capture({ text: 'remind: call venue', dueAt: '2026-12-01T09:00:00+11:00' }).status, 'pending_review');
});

test('calendar end must follow start; there is no assumed duration', t => {
  const router = setup(t);
  const c = router.capture({ text: 'calendar: Venue visit', startAt: '2026-12-01T09:00:00+11:00', endAt: '2026-12-01T08:00:00+11:00' });
  assert.deepEqual(c.plan.missing, ['endAt']);
});

test('idempotency survives restart and rejects changed payloads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'voice-router-'));
  let router;
  try {
    router = new VoiceRouter({ filename: join(dir, 'notes.sqlite') });
    const c = router.capture({ text: 'note: synthetic item' }, { idempotencyKey: 'stable-123' }); router.close();
    router = new VoiceRouter({ filename: join(dir, 'notes.sqlite') });
    const replay = router.capture({ text: 'note: synthetic item' }, { idempotencyKey: 'stable-123' });
    assert.equal(replay.id, c.id); assert.equal(replay.replayed, true); assert.equal(router.list().length, 1);
    assert.throws(() => router.capture({ text: 'changed' }, { idempotencyKey: 'stable-123' }), { code: 'key_conflict' });
    assert.equal(router.list().length, 1);
  } finally { router?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('review edits cannot change original words and invalidate previous confirmations', async t => {
  const router = setup(t);
  const c = router.capture({ text: 'remind: contact venue' });
  assert.throws(() => router.revise(c.id, { text: 'replace original' }, 1), { code: 'immutable_original' });
  const changed = router.revise(c.id, { dueAt: '2026-12-01T09:00:00+11:00' }, 1);
  assert.equal(changed.revision, 2); assert.equal(changed.original.text, c.original.text);
  assert.equal(changed.status, 'pending_review');
  await assert.rejects(router.execute(c.id, { revision: 1, confirmed: true }), { code: 'stale_revision' });
  await assert.rejects(router.execute(c.id, { revision: 2 }), { code: 'confirmation_required' });
});

test('native handoff stays incomplete until the device reports creating the item', async t => {
  const router = setup(t);
  const c = router.capture({ text: 'remind: call venue', dueAt: '2026-12-01T09:00:00+11:00' });
  const sent = await router.execute(c.id, { revision: 1, confirmed: true });
  assert.equal(sent.status, 'awaiting_device'); assert.equal(sent.result.operation, 'add-reminder');
  assert.equal((await router.execute(c.id, { revision: 1, confirmed: true })).status, 'awaiting_device');
  assert.equal(router.acknowledgeDevice(c.id, { revision: 1, externalId: 'synthetic-reminder-id' }).status, 'completed');
});

test('a named automation needs a registered destination and never dispatches on capture', async t => {
  let calls = 0;
  const router = setup(t, { destinations: { pilot: async () => { calls++; return { externalId: 'demo' }; } } });
  assert.equal(router.capture({ text: 'automate unknown: checklist' }).status, 'needs_details');
  const c = router.capture({ text: 'automate pilot: checklist' }); assert.equal(calls, 0);
  await router.execute(c.id, { revision: 1, confirmed: true }); await router.execute(c.id, { revision: 1, confirmed: true });
  assert.equal(calls, 1);
});

test('concurrent executions claim the action only once', async t => {
  let release, calls = 0;
  const router = setup(t, { destinations: { pilot: async () => { calls++; await new Promise(resolve => { release = resolve; }); } } });
  const c = router.capture({ text: 'automate pilot: checklist' });
  const first = router.execute(c.id, { revision: 1, confirmed: true });
  await assert.rejects(router.execute(c.id, { revision: 1, confirmed: true }), { code: 'not_ready' });
  release(); await first; assert.equal(calls, 1);
});

test('uncertain delivery is redacted and never silently retried', async t => {
  let calls = 0;
  const router = setup(t, { destinations: { pilot: async () => { calls++; throw new Error('sensitive provider URL or secret'); } } });
  const c = router.capture({ text: 'automate pilot: checklist' });
  const result = await router.execute(c.id, { revision: 1, confirmed: true });
  assert.equal(result.status, 'delivery_unknown'); assert.ok(!JSON.stringify(result).includes('sensitive provider'));
  await assert.rejects(router.execute(c.id, { revision: 1, confirmed: true }), { code: 'not_ready' }); assert.equal(calls, 1);
});

test('calendar export escapes injected content and folds Unicode by byte length', t => {
  const router = setup(t);
  const title = 'José 🌸'.repeat(30) + '\nATTENDEE:fake@example.invalid,extra;field';
  const c = router.capture({ text: 'calendar: visit', title, startAt: '2026-12-01T09:00:00+11:00', endAt: '2026-12-01T10:00:00+11:00' });
  const ics = calendarFile(c);
  assert.match(ics, /DTSTART:20261130T220000Z/); assert.ok(!ics.includes('\r\nATTENDEE:'));
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.ok(!ics.includes('METHOD:REQUEST')); assert.equal(router.get(c.id).status, 'pending_review');
});

test('webhooks use only configured HTTPS destinations and a stable downstream key', async t => {
  assert.throws(() => webhookDestinations({ bad: { url: 'http://localhost/' } }));
  let observed;
  const destinations = webhookDestinations({ pilot: { url: 'https://example.invalid/hook', token: 'synthetic-token' } }, { fetchImpl: async (url, options) => { observed = { url, options }; return new Response('ok'); } });
  const router = setup(t, { destinations });
  const c = router.capture({ text: 'automate pilot: checklist' }); await router.execute(c.id, { revision: 1, confirmed: true });
  assert.equal(observed.options.redirect, 'error'); assert.equal(observed.options.headers['Idempotency-Key'], `voice-router:${c.id}`);
  assert.ok(!JSON.stringify(router.get(c.id)).includes('synthetic-token'));
  assert.ok(!Object.hasOwn(JSON.parse(observed.options.body), 'original'));
});
