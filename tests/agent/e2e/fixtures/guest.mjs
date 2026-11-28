import { ownServer } from '../../support/own-server.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

export const base = ownServer(process.env.OAK_GALLERY_URL ?? 'http://127.0.0.1:4321');
export const evidence = process.env.OAK_E2E_EVIDENCE ?? path.join(tmpdir(), 'oak-e2e-evidence');
const fixtures = JSON.parse(readFileSync(new URL('../../work-answers.v1.json', import.meta.url)));
export const guest = { configured: true, kind: 'guest', phase: 'guest', role: 'visitor', publishableKey: null, purpose: null,
  allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } };

export async function openGallery(page, state = 'empty') {
  await page.goto(`${base}/__dev/oak-states?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === 'ready', null, { timeout: 30000 });
}

export async function workspace(page, operation, value) {
  return page.evaluate(async ([source, value]) => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(n));
    const api = await import(url);
    return new Function('api', 'value', `return (${source})(api, value);`)(api, value);
  }, [operation.toString(), value]);
}

export const streamHeaders = (page, id) => ({ 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1', 'x-oak-request-id': id,
  'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true',
  'access-control-expose-headers': 'x-vercel-ai-ui-message-stream,x-oak-request-id' });

export async function listenOnFreePort(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, endpoint: `http://127.0.0.1:${server.address().port}/api/oak/chat`,
    close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

export function preflight(page, req, res) {
  res.writeHead(204, { 'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': req.headers['access-control-request-headers'] ?? 'content-type' });
  res.end();
}

export async function interceptGuest(page, { incremental = false } = {}) {
  let requests = [], release, finish, listener;
  const eventsOf = body => {
    const id = body.turn.requestId, answer = fixtures.fixtures.find(f => f.id === 'K02').expected;
    return [{ type: 'start', messageId: id }, { type: 'data-status', transient: true, data: { requestId: id, phase: 'started' } },
      { type: 'data-status', transient: true, data: { requestId: id, phase: 'tool-start', step: 1, operation: 'search' } },
      { type: 'data-status', transient: true, data: { requestId: id, phase: 'tool-end', step: 1, operation: 'search', count: 2 } },
      { type: 'data-answer', id: `${id}:answer`, data: answer }, { type: 'finish', finishReason: 'stop' }];
  };
  if (incremental) {
    listener = await listenOnFreePort(async (req, res) => {
      if (req.method === 'OPTIONS') return preflight(page, req, res);
      let raw = ''; for await (const part of req) raw += part;
      const body = JSON.parse(raw);
      res.writeHead(200, streamHeaders(page, body.turn.requestId));
      const events = eventsOf(body);
      for (const event of events.slice(0, 4)) { res.write(`data: ${JSON.stringify(event)}\n\n`); await delay(150); }
      await new Promise(resolve => { finish = resolve; });
      for (const event of events.slice(4)) { res.write(`data: ${JSON.stringify(event)}\n\n`); await delay(150); }
      res.end('data: [DONE]\n\n');
    });
  }
  await page.route('**/api/oak/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/oak/auth/status') return route.fulfill({ json: guest });
    if (pathname === '/api/oak/chat') {
      const body = route.request().postDataJSON(); requests.push(body);
      await new Promise(resolve => { release = resolve; });
      if (incremental) return route.continue({ url: listener.endpoint });
      const id = body.turn.requestId;
      return route.fulfill({ headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1', 'x-oak-request-id': id },
        body: eventsOf(body).map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n' });
    }
    return route.fulfill({ json: {} });
  });
  return { requests, release: () => { assert.ok(release, 'a request is waiting'); release(); },
    finish: async () => { for (let i = 0; i < 100 && !finish; i++) await delay(50); assert.ok(finish, 'the incremental stream is waiting'); finish(); },
    close: async () => { finish?.(); await listener?.close(); } };
}
