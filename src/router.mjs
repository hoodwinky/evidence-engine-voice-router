import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export class RouterError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new RouterError(status, code, message); };
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const kinds = new Set(['note', 'reminder', 'calendar', 'automation']);
const sources = new Set(['siri', 'android', 'web', 'api']);
const datePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/;

function validDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(datePattern);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, y, m, d, h, min, s, , oh = '0', om = '0'] = match;
  const maxDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= maxDay &&
    Number(h) < 24 && Number(min) < 60 && Number(s) < 60 && Number(oh) <= 14 &&
    Number(om) < 60 && (Number(oh) !== 14 || Number(om) === 0);
}

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(422, 'invalid_input', 'Send a JSON object.');
  const allowed = ['text', 'source', 'kind', 'title', 'dueAt', 'startAt', 'endAt', 'destination', 'automation'];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) fail(422, 'unknown_field', `Unknown field: ${key}`);
    if (typeof input[key] !== 'string') fail(422, 'invalid_field', `${key} must be a string.`);
  }
  if (!input.text?.trim() || input.text.length > 20000) fail(422, 'invalid_text', 'Text must contain 1–20000 characters.');
  if (input.source && !sources.has(input.source)) fail(422, 'invalid_source', 'Unknown capture source.');
  if (input.kind && !kinds.has(input.kind)) fail(422, 'invalid_kind', 'Unknown action kind.');
  for (const key of ['title', 'destination', 'automation']) {
    if (input[key] !== undefined && (!input[key].trim() || input[key].length > 500)) fail(422, 'invalid_field', `${key} must contain 1–500 characters.`);
  }
  return { ...input, source: input.source ?? 'api' };
}

export function planCapture(input) {
  input = validate(input);
  const text = input.text.trim();
  let kind = 'note', title = text, automation;
  const match = text.match(/^(note:|remind(?:er)?:|remind me to\s+|calendar:|automate\s+([a-zA-Z0-9_-]+):)\s*([\s\S]*)$/i);
  if (match) {
    const prefix = match[1].toLowerCase();
    kind = prefix.startsWith('remind') ? 'reminder' : prefix.startsWith('calendar') ? 'calendar' : prefix.startsWith('automate') ? 'automation' : 'note';
    title = match[3].trim(); automation = match[2];
  }
  kind = input.kind ?? kind;
  title = input.title ?? title;
  automation = input.automation ?? automation;
  const missing = [];
  if (!title.trim()) missing.push('title');
  const schedule = {};
  for (const key of (kind === 'reminder' ? ['dueAt'] : kind === 'calendar' ? ['startAt', 'endAt'] : [])) {
    if (!validDate(input[key])) missing.push(key);
    else schedule[key] = input[key];
  }
  if (kind === 'calendar' && !missing.includes('startAt') && !missing.includes('endAt') && Date.parse(schedule.endAt) <= Date.parse(schedule.startAt)) missing.push('endAt');
  if (kind === 'automation' && !automation) missing.push('automation');
  const destination = input.destination ?? (kind === 'automation' ? automation : kind === 'note' ? 'inbox' : 'device');
  return { kind, title, ...schedule, ...(automation ? { automation } : {}), destination, missing };
}

export class VoiceRouter {
  constructor({ filename = ':memory:', destinations = {}, clock = () => new Date() } = {}) {
    if (filename !== ':memory:') { mkdirSync(dirname(filename), { recursive: true, mode: 0o700 }); }
    this.db = new DatabaseSync(filename);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY, input TEXT NOT NULL, original_sha256 TEXT NOT NULL,
        received_at TEXT NOT NULL, plan TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL, idempotency_key TEXT UNIQUE, fingerprint TEXT NOT NULL,
        result TEXT, error TEXT
      );`);
    this.destinations = new Map(Object.entries(destinations)); this.clock = clock;
  }
  close() { this.db.close(); }
  capture(raw, { idempotencyKey } = {}) {
    const input = validate(raw);
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(idempotencyKey))) fail(422, 'invalid_key', 'Use an idempotency key of 1–160 letters, numbers, dots, colons, hyphens or underscores.');
    const fingerprint = hash(JSON.stringify(Object.keys(input).sort().map(key => [key, input[key]])));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (idempotencyKey) {
        const old = this.db.prepare('SELECT id, fingerprint FROM captures WHERE idempotency_key = ?').get(idempotencyKey);
        if (old) {
          if (old.fingerprint !== fingerprint) fail(409, 'key_conflict', 'This idempotency key belongs to a different capture.');
          this.db.exec('COMMIT'); return { ...this.get(old.id), replayed: true };
        }
      }
      const plan = this.#plan(input), id = randomUUID();
      const status = plan.missing.length ? 'needs_details' : plan.kind === 'note' ? 'saved' : 'pending_review';
      this.db.prepare('INSERT INTO captures (id,input,original_sha256,received_at,plan,status,idempotency_key,fingerprint) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, JSON.stringify(input), hash(input.text), this.clock().toISOString(), JSON.stringify(plan), status, idempotencyKey ?? null, fingerprint);
      this.db.exec('COMMIT'); return this.get(id);
    } catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw error; }
  }
  #plan(input) {
    const plan = planCapture(input);
    if (plan.kind !== 'note' && plan.destination !== 'device' && !this.destinations.has(plan.destination)) plan.missing.push('registeredDestination');
    if (plan.kind === 'automation' && plan.destination === 'device') plan.missing.push('registeredDestination');
    return plan;
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM captures WHERE id = ?').get(id);
    if (!row) fail(404, 'not_found', 'Capture not found.');
    return { id: row.id, original: JSON.parse(row.input), originalSha256: row.original_sha256,
      receivedAt: row.received_at, plan: JSON.parse(row.plan), revision: row.revision,
      status: row.status, result: row.result ? JSON.parse(row.result) : null, error: row.error };
  }
  list({ limit = 50 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(422, 'invalid_limit', 'Limit must be an integer from 1 to 100.');
    return this.db.prepare('SELECT id FROM captures ORDER BY received_at DESC, rowid DESC LIMIT ?').all(limit).map(row => this.get(row.id));
  }
  revise(id, changes, revision) {
    const old = this.get(id);
    if (old.revision !== revision) fail(409, 'stale_revision', 'Reload the capture before changing it.');
    if (!['saved', 'pending_review', 'needs_details'].includes(old.status)) fail(409, 'already_dispatched', 'This capture has already been dispatched.');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(key => ['text', 'source'].includes(key))) fail(422, 'immutable_original', 'Only derived action details may change.');
    const merged = { ...old.original, ...old.plan, ...changes };
    delete merged.missing;
    const input = validate(merged), plan = this.#plan(input);
    const status = plan.missing.length ? 'needs_details' : plan.kind === 'note' ? 'saved' : 'pending_review';
    const updated = this.db.prepare('UPDATE captures SET plan = ?, status = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND status IN (?,?,?)')
      .run(JSON.stringify(plan), status, id, revision, 'saved', 'pending_review', 'needs_details');
    if (!updated.changes) fail(409, 'stale_revision', 'Reload the capture.');
    return this.get(id);
  }
  async execute(id, { revision, confirmed } = {}) {
    const capture = this.get(id);
    if (confirmed !== true) fail(422, 'confirmation_required', 'Review the action and explicitly confirm it.');
    if (capture.revision !== revision) fail(409, 'stale_revision', 'The action has changed. Review the current revision.');
    if (['completed', 'awaiting_device'].includes(capture.status)) return capture;
    if (capture.status !== 'pending_review') fail(409, 'not_ready', 'This capture is not ready for dispatch.');
    const claimed = this.db.prepare('UPDATE captures SET status = ? WHERE id = ? AND revision = ? AND status = ?').run('dispatching', id, revision, 'pending_review');
    if (!claimed.changes) fail(409, 'already_dispatching', 'This capture is already being dispatched.');
    const { plan } = capture;
    if (plan.destination === 'device') {
      const result = { operation: plan.kind === 'reminder' ? 'add-reminder' : 'add-calendar-event', title: plan.title, dueAt: plan.dueAt, startAt: plan.startAt, endAt: plan.endAt };
      this.db.prepare('UPDATE captures SET status = ?, result = ? WHERE id = ?').run('awaiting_device', JSON.stringify(result), id);
      return this.get(id);
    }
    try {
      const adapter = this.destinations.get(plan.destination);
      if (!adapter) throw new Error('Destination is no longer configured.');
      const result = await adapter({ capture, idempotencyKey: `voice-router:${id}` });
      // Adapter receipts must contain only non-secret metadata; never store provider responses.
      const receipt = { deliveredAt: this.clock().toISOString(), ...(typeof result?.externalId === 'string' ? { externalId: result.externalId.slice(0, 200) } : {}) };
      this.db.prepare('UPDATE captures SET status = ?, result = ?, error = NULL WHERE id = ?').run('completed', JSON.stringify(receipt), id);
    } catch {
      // A timeout can follow a successful external write. Do not blindly retry.
      this.db.prepare('UPDATE captures SET status = ?, error = ? WHERE id = ?').run('delivery_unknown', 'Check the destination before retrying outside this router.', id);
    }
    return this.get(id);
  }
  acknowledgeDevice(id, { revision, externalId } = {}) {
    const capture = this.get(id);
    if (capture.revision !== revision) fail(409, 'stale_revision', 'Reload the capture.');
    if (capture.status === 'completed') return capture;
    if (capture.status !== 'awaiting_device') fail(409, 'not_awaiting_device', 'No device action is awaiting a receipt.');
    if (typeof externalId !== 'string' || !externalId.trim() || externalId.length > 200) fail(422, 'invalid_receipt', 'Provide the native item identifier or a short user confirmation.');
    this.db.prepare('UPDATE captures SET status = ?, result = ? WHERE id = ? AND status = ?')
      .run('completed', JSON.stringify({ ...capture.result, externalId, reportedBy: 'device', reportedAt: this.clock().toISOString() }), id, 'awaiting_device');
    return this.get(id);
  }
}

export function calendarFile(capture) {
  const p = capture.plan;
  if (p.kind !== 'calendar' || p.missing.length) fail(409, 'not_a_calendar', 'Complete the calendar details first.');
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escape = value => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FreeX//Voice Router 0.1//EN', 'BEGIN:VEVENT', `UID:${capture.id}@voice-router.freex`, `DTSTAMP:${stamp(capture.receivedAt)}`, `DTSTART:${stamp(p.startAt)}`, `DTEND:${stamp(p.endAt)}`, `SUMMARY:${escape(p.title)}`, 'END:VEVENT', 'END:VCALENDAR'];
  // RFC 5545 line folding: count UTF-8 octets and preserve Unicode code points.
  return lines.map(line => {
    let out = '', length = 0;
    for (const char of line) { const size = Buffer.byteLength(char); if (length + size > 75) { out += '\r\n '; length = 1; } out += char; length += size; }
    return out;
  }).join('\r\n') + '\r\n';
}

export function webhookDestinations(routes, { fetchImpl = fetch } = {}) {
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) throw new Error('ROUTES_JSON must be an object.');
  return Object.fromEntries(Object.entries(routes).map(([name, config]) => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name) || !config || typeof config.url !== 'string') throw new Error('Invalid route configuration.');
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Webhook destinations require HTTPS without URL credentials or fragments.');
    if (config.token !== undefined && (typeof config.token !== 'string' || /[\r\n]/.test(config.token))) throw new Error('Invalid webhook token.');
    return [name, async ({ capture, idempotencyKey }) => {
      const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
        body: JSON.stringify({ version: '1', captureId: capture.id, originalSha256: capture.originalSha256, receivedAt: capture.receivedAt, action: capture.plan }) });
      try { if (!response.ok) throw new Error('Delivery did not return success.'); return {}; }
      finally { await response.body?.cancel(); }
    }];
  }));
}
