import { observeOakFundingResponse } from './oakTelemetryClient';
import { fundingCallbackSchema, fundingOAuthBindSchema, fundingOAuthReadySchema, fundingRequestSchema, fundingResponseSchema, ordinaryInferenceKeySchema,
  type FundingRequest, type FundingResponse, type VisitorFundingSession } from '../../packages/oak-agent-contracts/src/funding';
import { oakFundingMemory } from './oakFundingSession';

let tabId: string | null = null;
let requestController: AbortController | null = null;
let popup: Window | null = null;
let cleanupPopup: (() => void) | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lifecycleInstalled = false;
let operationId: string | null = null;
let sequence = 0;
const browserTab = () => tabId ??= crypto.randomUUID();
const randomOperation = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const unavailable = 'Connection unavailable. Reconnect or enter an ordinary inference key. Sponsorship has not been selected.';

async function fundingRequest(request: FundingRequest, signal?: AbortSignal, keepalive = false): Promise<FundingResponse> {
  const validated = fundingRequestSchema.safeParse(request);
  if (!validated.success) throw new Error('funding-invalid-request');
  const response = await fetch(`/api/oak/funding/${request.action}`, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(validated.data), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000), keepalive });
  if (!response.ok || !response.body) { observeOakFundingResponse(response); void response.body?.cancel().catch(() => {}); throw new Error('funding-unavailable'); }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength; if (size > 8192) throw new Error('funding-unavailable');
      text += decoder.decode(chunk.value, { stream: true });
    }
    const parsed = fundingResponseSchema.safeParse(JSON.parse(text + decoder.decode()));
    if (!parsed.success) throw new Error('funding-unavailable');
    observeOakFundingResponse(response);
    return parsed.data;
  } catch { throw new Error('funding-unavailable'); }
  finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const closeProviderPopup = () => { cleanupPopup?.(); cleanupPopup = null; popup?.close(); popup = null; };
const stopHeartbeat = () => { if (heartbeat !== null) clearInterval(heartbeat); heartbeat = null; };
async function disconnectSession(session: VisitorFundingSession, keepalive = false) {
  return fundingRequest({ action: 'disconnect', ...session }, undefined, keepalive);
}
function installLifecycle() {
  if (lifecycleInstalled || typeof window === 'undefined') return;
  lifecycleInstalled = true;
  window.addEventListener('pagehide', () => { void disconnectOakFunding(true); });
}
function startHeartbeat() {
  stopHeartbeat(); installLifecycle();
  heartbeat = setInterval(() => {
    const session = oakFundingMemory.connection(); if (!session) { stopHeartbeat(); return; }
    void fundingRequest({ action: 'status', ...session }).then(response => {
      const current = oakFundingMemory.connection();
      if (current?.handle !== session.handle) return;
      if (response.kind !== 'status' || response.status.state !== 'connected') throw new Error('funding-unavailable');
      oakFundingMemory.observe(response.status);
    }).catch(() => {
      if (oakFundingMemory.connection()?.handle !== session.handle) return;
      oakFundingMemory.clear('Connection expired or became unavailable. Reconnect before sending with your funds.', true); stopHeartbeat();
      void disconnectSession(session).catch(() => {});
    });
  }, 30_000);
}
async function acceptConnection(token: number, response: FundingResponse) {
  if (response.kind !== 'connection') throw new Error('funding-unavailable');
  if (!oakFundingMemory.accept(token, response)) { await disconnectSession(response.session).catch(() => {}); return; }
  requestController = null; closeProviderPopup(); startHeartbeat();
}
export function selectOakFunding(selected: 'sponsored' | 'visitor') { oakFundingMemory.select(selected); }
export async function cancelOakFunding() {
  requestController?.abort(); requestController = null; closeProviderPopup(); stopHeartbeat();
  const previous = oakFundingMemory.clear('Connection cancelled. Your conversation and draft are unchanged.');
  const previousOperation = operationId; operationId = null;
  if (previous) await disconnectSession(previous).catch(() => {});
  if (tabId && previousOperation) await fundingRequest({ action: 'cancel', tabId, operationId: previousOperation }).catch(() => {});
}
export async function disconnectOakFunding(keepalive = false) {
  requestController?.abort(); requestController = null; closeProviderPopup(); stopHeartbeat();
  const previous = oakFundingMemory.clear();
  const previousOperation = operationId; operationId = null;
  const token = oakFundingMemory.revision();
  try {
    if (previous) await disconnectSession(previous, keepalive);
    else if (tabId && previousOperation) await fundingRequest({ action: 'cancel', tabId, operationId: previousOperation }, undefined, keepalive);
  } catch {
    if (oakFundingMemory.current(token)) oakFundingMemory.notice('Disconnected in this tab. Server cleanup was not confirmed; access expires within two minutes.');
  }
}
async function prepare() {
  const cancellation = cancelOakFunding(), revision = oakFundingMemory.revision();
  await cancellation;
  if (!oakFundingMemory.current(revision)) throw new Error('funding-cancelled');
  const token = oakFundingMemory.begin(); requestController = new AbortController(); installLifecycle();
  operationId = randomOperation();
  const issuedAt = Date.now();
  return { token, signal: requestController.signal, operationId, sequence: ++sequence, issuedAt, deadline: issuedAt + 12_000 };
}
export async function connectOakFundingKey(key: string) {
  const parsed = ordinaryInferenceKeySchema.safeParse(key);
  if (!parsed.success) { oakFundingMemory.notice('Enter an ordinary inference key with 8 to 512 characters and no spaces.'); return; }
  let preparation: Awaited<ReturnType<typeof prepare>>;
  try { preparation = await prepare(); } catch { return; }
  const { token, signal, operationId: currentOperation, sequence: currentSequence, issuedAt, deadline } = preparation;
  try { await acceptConnection(token, await fundingRequest({ action: 'manual', tabId: browserTab(), key: parsed.data,
    operationId: currentOperation, sequence: currentSequence, issuedAt, deadline }, signal)); }
  catch {
    if (oakFundingMemory.current(token)) { oakFundingMemory.clear(unavailable); requestController = null; void fundingRequest({ action: 'cancel', tabId: browserTab(), operationId: currentOperation }).catch(() => {}); }
  }
}
export async function connectOakFundingOAuth() {
  // Open synchronously under the user's click, before any awaited network work.
  const opened = window.open('about:blank', '_blank', 'popup');
  if (!opened) { oakFundingMemory.notice('Allow the connection window, or enter an ordinary inference key.'); return; }
  let preparation: Awaited<ReturnType<typeof prepare>>;
  try { preparation = await prepare(); } catch { opened.close(); return; }
  const { token, signal, operationId: currentOperation, sequence: currentSequence, issuedAt, deadline } = preparation; popup = opened;
  try {
    const response = await fundingRequest({ action: 'oauth-start', tabId: browserTab(), operationId: currentOperation, sequence: currentSequence, issuedAt, deadline }, signal);
    if (!oakFundingMemory.current(token)) { opened.close(); await fundingRequest({ action: 'cancel', tabId: browserTab(), operationId: currentOperation, nonce: response.kind === 'oauth' ? response.nonce : undefined }).catch(() => {}); return; }
    if (response.kind !== 'oauth') throw new Error('funding-unavailable');
    const url = new URL(response.authorizationUrl);
    const expectedCallback = new URL('/oak/funding/callback', window.location.origin).href;
    const callbackValues = url.searchParams.getAll('callback_url');
    const challengeValues = url.searchParams.getAll('code_challenge');
    const methodValues = url.searchParams.getAll('code_challenge_method');
    if (url.origin !== 'https://openrouter.ai' || url.pathname !== '/auth' || url.username || url.password || url.hash ||
      Array.from(url.searchParams.keys()).length !== 3 || callbackValues.length !== 1 || callbackValues[0] !== expectedCallback ||
      challengeValues.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(challengeValues[0] ?? '') ||
      methodValues.length !== 1 || methodValues[0] !== 'S256') throw new Error('funding-unavailable');
    oakFundingMemory.pending(token);
    let consumed = false, boundChallenge: string | null = null;
    const popupAtCallback = () => {
      try {
        const location = opened.location;
        return location.origin === window.location.origin && location.pathname === '/oak/funding/callback' &&
          location.search === '' && location.hash === '';
      } catch { return false; }
    };
    const validStage = (event: MessageEvent) => !consumed && event.origin === window.location.origin && event.source === opened &&
      popupAtCallback() && oakFundingMemory.current(token) && !signal.aborted && !opened.closed && Date.now() < response.expiresAt;
    const listener = (event: MessageEvent) => {
      if (!validStage(event)) return;
      if (boundChallenge === null) {
        const ready = fundingOAuthReadySchema.safeParse(event.data);
        if (!ready.success) return;
        boundChallenge = ready.data.challenge;
        try {
          const bind = fundingOAuthBindSchema.parse({ type: 'oak-funding-bind', challenge: boundChallenge, nonce: response.nonce });
          opened.postMessage(bind, window.location.origin);
        }
        catch { void cancelOakFunding(); }
        return;
      }
      const message = fundingCallbackSchema.safeParse(event.data);
      if (!message.success || message.data.nonce !== response.nonce) return;
      consumed = true; cleanupPopup?.(); cleanupPopup = null;
      if ('error' in message.data) { void cancelOakFunding(); return; }
      void fundingRequest({ action: 'oauth-complete', tabId: browserTab(), nonce: response.nonce, code: message.data.code }, signal)
        .then(result => acceptConnection(token, result)).catch(() => {
          if (oakFundingMemory.current(token)) {
            oakFundingMemory.clear(unavailable); requestController = null; closeProviderPopup();
            void fundingRequest({ action: 'cancel', tabId: browserTab(), operationId: currentOperation }).catch(() => {});
          }
        });
    };
    window.addEventListener('message', listener);
    const monitor = setInterval(() => {
      if (opened.closed || Date.now() >= response.expiresAt) void cancelOakFunding();
    }, 500);
    cleanupPopup = () => { window.removeEventListener('message', listener); clearInterval(monitor); };
    opened.location.replace(response.authorizationUrl);
  } catch {
    opened.close(); if (oakFundingMemory.current(token)) {
      oakFundingMemory.clear(unavailable); requestController = null; closeProviderPopup();
      void fundingRequest({ action: 'cancel', tabId: browserTab(), operationId: currentOperation }).catch(() => {});
    }
  }
}
