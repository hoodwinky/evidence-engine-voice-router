import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { VoiceRouter, RouterError, calendarFile, webhookDestinations } from './router.mjs';

const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const staticFiles = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']]]);
async function jsonBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new RouterError(415, 'json_required', 'Use Content-Type: application/json.');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 65536) throw new RouterError(413, 'too_large', 'Request exceeds 64 KiB.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RouterError(400, 'invalid_json', 'Invalid JSON.'); }
}

export function createVoiceServer({ captureToken, reviewToken, router = new VoiceRouter(), publicOrigin = 'http://127.0.0.1:4181' }) {
  if (typeof captureToken !== 'string' || typeof reviewToken !== 'string' || captureToken.length < 32 || reviewToken.length < 32 || captureToken === reviewToken || /\s/.test(captureToken + reviewToken)) throw new Error('Configure two different CAPTURE_TOKEN and REVIEW_TOKEN values of at least 32 characters without whitespace.');
  const originUrl = new URL(publicOrigin);
  if (originUrl.origin !== publicOrigin || !['http:', 'https:'].includes(originUrl.protocol)) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a trailing slash or path.');
  const rate = new Map();
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
    try {
      const url = new URL(request.url, publicOrigin);
      if (request.method === 'GET' && staticFiles.has(url.pathname)) {
        const [name, mime] = staticFiles.get(url.pathname);
        response.writeHead(200, { 'Content-Type': mime }); response.end(await readFile(new URL(`../web/${name}`, import.meta.url))); return;
      }
      if (request.method === 'GET' && url.pathname === '/health') { send(200, { status: 'ok', version: '0.1.0' }); return; }
      if (request.headers.origin && request.headers.origin !== publicOrigin) throw new RouterError(403, 'wrong_origin', 'Cross-origin browser requests are disabled.');
      const bearer = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      const reviewer = equal(bearer, reviewToken), capturer = reviewer || equal(bearer, captureToken);
      if (!capturer) throw new RouterError(401, 'unauthorised', 'A bearer token is required.');
      if (!reviewer && !(request.method === 'POST' && url.pathname === '/v1/captures')) throw new RouterError(403, 'review_required', 'Use the review token for this operation.');
      if (request.method !== 'GET') {
        const minute = Math.floor(Date.now() / 60000), key = reviewer ? 'review' : 'capture';
        const bucket = rate.get(key)?.minute === minute ? rate.get(key) : { minute, count: 0 };
        bucket.count++; rate.set(key, bucket);
        if (bucket.count > 120) throw new RouterError(429, 'rate_limited', 'Too many writes. Try again next minute.');
      }
      if (request.method === 'POST' && url.pathname === '/v1/captures') {
        const capture = router.capture(await jsonBody(request), { idempotencyKey: request.headers['idempotency-key'] });
        send(capture.replayed ? 200 : 201, { ...capture, reviewUrl: publicOrigin, message: capture.status === 'saved' ? 'Note saved.' : capture.status === 'needs_details' ? 'Note saved; complete the missing action details.' : 'Note saved; review the proposed action.' }); return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/captures') { send(200, { captures: router.list({ limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50 }) }); return; }
      const match = url.pathname.match(/^\/v1\/captures\/([a-f0-9-]{36})(?:\/(prepare|execute|receipt|calendar\.ics))?$/);
      if (match) {
        const [, id, action] = match;
        if (request.method === 'GET' && !action) { send(200, router.get(id)); return; }
        if (request.method === 'GET' && action === 'calendar.ics') {
          const content = calendarFile(router.get(id));
          response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="event.ics"' }); response.end(content); return;
        }
        if (request.method === 'POST' && action) {
          const body = await jsonBody(request);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RouterError(422, 'invalid_body', 'Send a JSON object.');
          if (action === 'prepare') { send(200, router.revise(id, body.details, body.revision)); return; }
          if (action === 'execute') { send(200, await router.execute(id, body)); return; }
          if (action === 'receipt') { send(200, router.acknowledgeDevice(id, body)); return; }
        }
      }
      throw new RouterError(404, 'not_found', 'Endpoint not found.');
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const known = error instanceof RouterError;
      send(known ? error.status : 500, { error: known ? error.code : 'internal_error', message: known ? error.message : 'The request could not be completed. Check the server privately.' });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { CAPTURE_TOKEN, REVIEW_TOKEN, DATABASE_PATH = './data/voice-router.sqlite', PUBLIC_ORIGIN = 'http://127.0.0.1:4181', HOST = '127.0.0.1', PORT = '4181', ROUTES_JSON = '{}' } = process.env;
  const router = new VoiceRouter({ filename: DATABASE_PATH, destinations: webhookDestinations(JSON.parse(ROUTES_JSON)) });
  const server = createVoiceServer({ captureToken: CAPTURE_TOKEN, reviewToken: REVIEW_TOKEN, router, publicOrigin: PUBLIC_ORIGIN });
  server.listen(Number(PORT), HOST, () => console.log(`Voice Router is listening on ${HOST}:${PORT}; review at ${PUBLIC_ORIGIN}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { router.close(); process.exit(0); }));
}
