import { ownerServicesActionSchema, ownerServicesViewSchema, type OwnerServicesAction, type OwnerServicesView } from '../../packages/oak-agent-contracts/src/owner-services';
import { OakAccountError, getOakAccountContext, oakAuthorizationHeaders } from './oakAccountClient';

export class OakOwnerAccessError extends Error {
  constructor(readonly code: 'sign-in-required' | 'owner-required' | 'unavailable' | 'cancelled') { super(code); }
}
/** Private aggregates never enter storage, URLs, history, or the visitor workspace. */
export async function requestOakOwnerServices(action?: OwnerServicesAction, signal?: AbortSignal): Promise<OwnerServicesView> {
  const epoch = getOakAccountContext().epoch;
  if (action && !ownerServicesActionSchema.safeParse(action).success) throw new OakOwnerAccessError('unavailable');
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) throw new OakOwnerAccessError('cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const headers = await oakAuthorizationHeaders();
    if (controller.signal.aborted) throw new OakOwnerAccessError('cancelled');
    const response = await fetch('/api/oak/owner/services', { method: action ? 'POST' : 'GET',
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { ...headers, ...(action ? { 'Content-Type': 'application/json' } : {}) },
      ...(action ? { body: JSON.stringify(action) } : {}) });
    if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('application/json')) {
      void response.body?.cancel().catch(() => {});
      const json = response.headers.get('content-type')?.startsWith('application/json'); // an HTML 403 is the edge spend breaker, not a missing owner
      throw new OakOwnerAccessError(response.status === 401 ? 'sign-in-required' : response.status === 403 && json ? 'owner-required' : 'unavailable');
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0, text = '';
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 96_000) throw new OakOwnerAccessError('unavailable');
      text += decoder.decode(chunk.value, { stream: true });
    }
    const value = ownerServicesViewSchema.safeParse(JSON.parse(text + decoder.decode()));
    if (!value.success || epoch !== getOakAccountContext().epoch || controller.signal.aborted) throw new OakOwnerAccessError('cancelled');
    return value.data;
  } catch (error) {
    if (controller.signal.aborted) throw new OakOwnerAccessError('cancelled');
    if (error instanceof OakAccountError && error.code === 'sign-in-required') throw new OakOwnerAccessError('sign-in-required');
    throw error instanceof OakOwnerAccessError ? error : new OakOwnerAccessError('unavailable');
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
