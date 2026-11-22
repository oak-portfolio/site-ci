import { z } from "zod";
import { withoutFavicons } from "../../packages/oak-agent-contracts/src/public-research";
import { OAK_READS_CONTACT_REASON, OAK_READS_HEADER } from "../../packages/oak-agent-contracts/src/output";
import {
  SAVED_CONVERSATION_MAX_BYTES,
  saveConversationRequestSchema,
  appendSavedConversationRequestSchema,
  savedConversationRecordSchema,
  savedConversationRecordReadSchema,
  savedConversationPageSchema,
  savedDocumentCommandSchema,
  type SavedDocumentCommand,
  type SavedConversationPage,
  type SavedConversationMessage,
  type SavedConversationRecord,
  type SaveConversationRequest,
  type AppendSavedConversationRequest,
  type InterruptedConversationTurn,
} from "../../packages/oak-agent-contracts/src/saved-conversations";
import { reopenedSavedDocumentsSchema, savedDocumentProofSchema, durableSavedDocuments, type SavedDocumentProof } from '../../packages/oak-agent-contracts/src/saved-documents';
import type { DocumentOperation, DocumentOutput } from '../../packages/oak-agent-contracts/src/documents';
import { withoutPrivateDocumentTurns } from "./oakPrivateDocumentHistory";
import { getOakAccountContext, oakAuthorizationHeaders } from "./oakAccountClient";
import { oakFundingContentGuardHeaders } from "./oakFundingSession";
import type { OakWorkspaceState } from "./oakWorkspace";
import { deleteSavedConversationRequestSchema, savedConversationRemovalSchema,
  type DeleteSavedConversationRequest } from "../../packages/oak-agent-contracts/src/saved-lifecycle";

export type OakHistoryErrorCode = "sign-in-required" | "unavailable" | "invalid-input" | "cancelled" | "conflict" | "missing";
export class OakHistoryError extends Error {
  constructor(readonly code: OakHistoryErrorCode) { super(code); this.name = "OakHistoryError"; }
}
const failure = (code: OakHistoryErrorCode) => new OakHistoryError(code);
const deadlineMs = 5000;
const cursorSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
export type OakSavedHistoryPage = SavedConversationPage;

/** Full application output, never the truncated model context or unsent visitor inputs. */
export function projectOakSavedHistory(value: OakWorkspaceState): SaveConversationRequest | null {
  if (!value.conversationId) return null;
  const messages: SavedConversationMessage[] = [];
  const interruptedTurns: InterruptedConversationTurn[] = [];
  const assistants = new Map(value.messages.filter(message => message.role === "assistant").map(message => [message.id, message]));
  for (const message of value.messages) {
    const assistant = message.role === "user" ? assistants.get(message.id.slice(0, -5)) : message;
    if (!assistant || assistant.state === "pending") continue;
    if (message.role === "assistant" && message.state !== "complete") continue;
    const common = { id: message.id, text: message.text, page: message.page, taskKind: message.taskKind ?? "question" as const,
      ...(message.privateDocumentTurn ? { privateDocumentTurn: true as const } : {}) };
    if (message.role === "user") {
      messages.push({ ...common, role: "user", answer: null, cards: [], ...(message.quoted ? { quoted: { quotes: [...message.quoted.quotes], text: message.quoted.text } } : {}) });
      if (assistant.state === "failed" || assistant.state === "interrupted") interruptedTurns.push({
        requestId: assistant.id, state: "interrupted", retryIntent: "explicit-user-action-required",
      });
    } else messages.push({ ...common, role: "assistant", answer: message.answer!, cards: message.cards,
      ...(message.research ? { research: withoutFavicons(message.research) } : {}), ...(message.ui?.status === "done" ? { ui: message.ui } : {}) });
  }
  const parsed = saveConversationRequestSchema.safeParse({ intent: "explicit-save", conversationId: value.conversationId, messages, interruptedTurns });
  return parsed.success ? parsed.data : null;
}

/** How many earlier messages go back to the model with each question (the transport allows 12). */
export const OAK_CONTEXT_MESSAGES = 12;
/**
 * R19 live (traces after 02:03Z): a question whose answer failed stays out of what Oak remembers. A blocked injection had gone
 * back as history with every later question, so the provider's filter refused each of them and the attempt limit then paused
 * the visitor. A question is remembered only when the answer right after it completed.
 */
const oakRemembered = (value: Pick<OakWorkspaceState, 'messages'>) => {
  const messages = withoutPrivateDocumentTurns(value.messages);
  return messages.filter((message, index) => message.state === 'complete' && message.text && message.taskKind !== 'role-fit' &&
    message.answer?.kind !== 'role-fit' && (message.role !== 'user' || (messages[index + 1]?.role === 'assistant' && messages[index + 1]!.state === 'complete')));
};

/**
 * v3 review: how much of this conversation Oak still remembers. `used` of `limit` messages go back with the next question;
 * `firstKeptId` is the oldest message still remembered once older ones have dropped out (null while everything fits).
 */
export function oakContextWindow(value: Pick<OakWorkspaceState, 'messages'>) {
  const eligible = oakRemembered(value);
  const kept = eligible.slice(-OAK_CONTEXT_MESSAGES);
  return { used: kept.length, limit: OAK_CONTEXT_MESSAGES, firstKeptId: eligible.length > kept.length ? kept[0]?.id ?? null : null };
}

/** Previous private turns need new explicit document permission before any model/search reuse. */
export function oakOrdinaryModelHistory(value: Pick<OakWorkspaceState, 'messages'>) {
  // An earlier question goes back as the visitor's own words: its quote lines came from Oak's answer just before it, and
  // the Worker's follow-up check must not read a quoted passage as what they asked (D157).
  return oakRemembered(value)
    .slice(-OAK_CONTEXT_MESSAGES).map(message => ({ role: message.role, content: ((message.role === 'user' && message.quoted?.text) || message.text).slice(0, 4000) }));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sameOakSavedValue(a: unknown, b: unknown) { return stable(a) === stable(b); }

/** Existing saved IDs/content must remain an immutable prefix. Foreign concurrent suffixes require reopen. */
export function oakSavedDelta(record: SavedConversationRecord, snapshot: SaveConversationRequest): AppendSavedConversationRequest | null {
  if (record.conversationId !== snapshot.conversationId || record.messages.some((message, index) => !sameOakSavedValue(message, snapshot.messages[index])))
    throw failure("conflict");
  const markers = new Map((snapshot.interruptedTurns ?? []).map(turn => [turn.requestId, turn]));
  if ((record.interruptedTurns ?? []).some(turn => !sameOakSavedValue(turn, markers.get(turn.requestId)))) throw failure("conflict");
  const known = new Set((record.interruptedTurns ?? []).map(turn => turn.requestId));
  const messages = snapshot.messages.slice(record.messages.length);
  const interruptedTurns = (snapshot.interruptedTurns ?? []).filter(turn => !known.has(turn.requestId));
  if (!messages.length && !interruptedTurns.length) return null;
  const parsed = appendSavedConversationRequestSchema.safeParse({ conversationId: record.conversationId, expectedVersion: record.version, messages, interruptedTurns });
  if (!parsed.success) throw failure("invalid-input");
  return parsed.data;
}
export function oakSaveAcknowledged(record: SavedConversationRecord, request: SaveConversationRequest) {
  return record.conversationId === request.conversationId && sameOakSavedValue(record.messages, request.messages) &&
    sameOakSavedValue(record.interruptedTurns ?? [], request.interruptedTurns ?? []);
}

async function request<T>(url: string, method: "GET" | "POST" | "PATCH" | "DELETE", schema: z.ZodType<T>, input?: unknown, signal?: AbortSignal, byteLimit = SAVED_CONVERSATION_MAX_BYTES, extraHeaders: Record<string, string> = {}): Promise<T> {
  const fundingGuard = input ? oakFundingContentGuardHeaders() : {};
  if (signal?.aborted) throw failure("cancelled");
  const epoch = getOakAccountContext().epoch;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bounded = async <R>(work: Promise<R>): Promise<R> => {
    if (controller.signal.aborted) { void work.catch(() => {}); throw failure("cancelled"); }
    let rejectAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(failure("cancelled"));
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    try { return await Promise.race([work, cancelled]); }
    finally { controller.signal.removeEventListener("abort", rejectAbort); }
  };
  timer = setTimeout(abort, deadlineMs);
  try {
    const headers = await bounded(oakAuthorizationHeaders());
    if (!headers.Authorization || epoch !== getOakAccountContext().epoch) throw failure("sign-in-required");
    const pending = fetch(url, { method, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { ...headers, [OAK_READS_HEADER]: OAK_READS_CONTACT_REASON, ...extraHeaders, ...(input ? { "Content-Type": "application/json", ...fundingGuard } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
    void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
    const response = await bounded(pending);
    if (!response.ok || !response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      void response.body?.cancel().catch(() => {});
      // Only the Worker's JSON 401/403 is a lost session; the edge spend breaker answers HTML 403 (P03-G7).
      const json = response.headers.get("content-type")?.toLowerCase().startsWith("application/json");
      throw failure(response.status === 401 || (json && response.status === 403) ? "sign-in-required" : response.status === 409 ? "conflict" :
        response.status === 404 || response.status === 410 ? "missing" : "unavailable");
    }
    const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    let bytes = 0, text = "";
    try {
      while (true) {
        const part = await bounded(reader.read());
        if (controller.signal.aborted) throw failure("cancelled");
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > byteLimit) throw failure("unavailable");
        text += decoder.decode(part.value, { stream: true });
      }
      const parsed = schema.safeParse(JSON.parse(text + decoder.decode()));
      if (!parsed.success) throw failure("unavailable");
      if (epoch !== getOakAccountContext().epoch) throw failure("sign-in-required");
      return parsed.data;
    } catch (error) { cancel(); throw error; }
    finally { controller.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  } catch (error) {
    if (signal?.aborted) throw failure("cancelled");
    if (controller.signal.aborted) throw failure("unavailable");
    if (error instanceof Error && error.message === "sign-in-required") throw failure("sign-in-required");
    throw error instanceof OakHistoryError ? error : failure("unavailable");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); controller.abort(); }
}
export function listOakSavedConversations(cursor: string | null, signal?: AbortSignal) {
  if (cursor !== null && !cursorSchema.safeParse(cursor).success) return Promise.reject(failure("invalid-input"));
  return request(`/api/oak/conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, "GET", savedConversationPageSchema, undefined, signal, 64 * 1024);
}
export function readOakSavedConversation(conversationId: string, signal?: AbortSignal) {
  if (!z.uuid().safeParse(conversationId).success) return Promise.reject(failure("invalid-input"));
  return request(`/api/oak/conversations/${encodeURIComponent(conversationId)}`, "GET", savedConversationRecordReadSchema, undefined, signal)
    .then(record => { if (record.conversationId !== conversationId) throw failure("unavailable"); return record; });
}
export function saveOakConversation(input: SaveConversationRequest, signal?: AbortSignal) {
  const parsed = saveConversationRequestSchema.safeParse(input);
  if (!parsed.success || parsed.data.documents !== undefined) return Promise.reject(failure("invalid-input"));
  return request("/api/oak/conversations", "POST", savedConversationRecordSchema, parsed.data, signal);
}
export type OakSavedDocumentProof = { operation: DocumentOperation | SavedDocumentProof['operation']; outputs: DocumentOutput[];
  selections: SavedDocumentProof['selections'] };
function documentProof(value: OakSavedDocumentProof): SavedDocumentProof {
  const { conversationId, submissionId, generation } = value.operation;
  const parsed = savedDocumentProofSchema.safeParse({ operation: { conversationId, submissionId, generation }, outputs: value.outputs, selections: value.selections });
  if (!parsed.success) throw failure('invalid-input');
  return parsed.data;
}
export function saveOakConversationWithDocuments(input: SaveConversationRequest, proof: OakSavedDocumentProof, signal?: AbortSignal) {
  try {
    const { documents: _documents, ...history } = input;
    const value = savedDocumentCommandSchema.parse({ history, proof: documentProof(proof) });
    // Check the eventual whole durable record budget before sending; server remains authoritative.
    if (!saveConversationRequestSchema.safeParse({ ...history, documents: durableSavedDocuments(value.proof!.outputs, value.proof!.selections) }).success)
      throw failure('invalid-input');
    return request('/api/oak/conversations', 'POST', savedConversationRecordSchema, value, signal, SAVED_CONVERSATION_MAX_BYTES,
      { 'x-oak-save-documents': history.conversationId });
  } catch { return Promise.reject(failure('invalid-input')); }
}
export function replaceOakSavedDocuments(conversationId: string, expectedVersion: number, proof: OakSavedDocumentProof | null, signal?: AbortSignal) {
  let value: SavedDocumentCommand;
  try { value = savedDocumentCommandSchema.parse({ history: { intent: 'explicit-document-replace', conversationId, expectedVersion },
    proof: proof ? documentProof(proof) : null }); }
  catch { return Promise.reject(failure('invalid-input')); }
  return request(`/api/oak/conversations/${encodeURIComponent(conversationId)}`, 'PATCH', savedConversationRecordSchema, value, signal,
    SAVED_CONVERSATION_MAX_BYTES, { 'x-oak-save-documents': conversationId });
}
export function reopenOakSavedDocuments(conversationId: string, signal?: AbortSignal) {
  if (!z.uuid().safeParse(conversationId).success) return Promise.reject(failure('invalid-input'));
  return request(`/api/oak/conversations/${encodeURIComponent(conversationId)}/documents/reopen`, 'POST', reopenedSavedDocumentsSchema, {}, signal,
    SAVED_CONVERSATION_MAX_BYTES + 8 * 1024).then(value => {
      const provenance = value.outputs[0]!.receipt.payload.provenance;
      if (value.operation.conversationId !== conversationId || value.outputs.some(output => output.receipt.payload.conversationId !== conversationId ||
        output.receipt.payload.principalHash !== value.operation.principalHash || output.receipt.payload.submissionId !== value.operation.submissionId ||
        output.receipt.payload.generation !== value.operation.generation || output.receipt.payload.expiresAt <= Date.now() ||
        provenance.kind !== 'saved-content' || output.receipt.payload.provenance.kind !== 'saved-content' ||
        output.receipt.payload.provenance.documentsDigest !== provenance.documentsDigest)) throw failure('unavailable');
      return value;
    });
}
export function appendOakSavedConversation(input: AppendSavedConversationRequest, signal?: AbortSignal) {
  const parsed = appendSavedConversationRequestSchema.safeParse(input);
  if (!parsed.success) return Promise.reject(failure("invalid-input"));
  return request(`/api/oak/conversations/${encodeURIComponent(parsed.data.conversationId)}`, "PATCH", savedConversationRecordSchema, parsed.data, signal);
}
export function exportOakSavedConversation(conversationId: string, signal?: AbortSignal) {
  if (!z.uuid().safeParse(conversationId).success) return Promise.reject(failure("invalid-input"));
  return request(`/api/oak/conversations/${encodeURIComponent(conversationId)}/export`, "GET", savedConversationRecordReadSchema, undefined, signal)
    .then(record => { if (record.conversationId !== conversationId) throw failure("unavailable"); return record; });
}
export function deleteOakSavedConversation(input: DeleteSavedConversationRequest, signal?: AbortSignal) {
  const parsed = deleteSavedConversationRequestSchema.safeParse(input);
  if (!parsed.success) return Promise.reject(failure("invalid-input"));
  return request(`/api/oak/conversations/${encodeURIComponent(input.conversationId)}`, "DELETE", savedConversationRemovalSchema, parsed.data, signal, 2048)
    .then(result => { if (result.conversationId !== input.conversationId || result.operationId !== input.operationId) throw failure("unavailable"); return result; });
}
