import type { OakConversationMessage, OakWorkspaceState } from "./oakWorkspace";
import type { SavedConversationRecord } from "../../packages/oak-agent-contracts/src/saved-conversations";
import { getOakAccountContext } from "./oakAccountClient";
import { disabledVoiceConfiguration } from "./oakVoiceCapture";
import { projectOakSavedHistory, oakSavedDelta, oakSaveAcknowledged, sameOakSavedValue, listOakSavedConversations,
  readOakSavedConversation, saveOakConversation, appendOakSavedConversation, saveOakConversationWithDocuments, replaceOakSavedDocuments, reopenOakSavedDocuments, type OakSavedDocumentProof } from "./oakSavedHistoryClient";
import { durableSavedDocuments, type SavedDocumentSet, type ReopenedSavedDocuments } from '../../packages/oak-agent-contracts/src/saved-documents';
import { submittedOakHistoryIds } from "./oakSavedLifecycleCopies";
import { createOakSavedLifecycle } from "./oakSavedLifecycleActions";
import { showOakToast } from "./oakToasts";

type SavedCommandsOwner = {
  read: () => OakWorkspaceState; update: (next: Partial<OakWorkspaceState>) => void;
  active: () => boolean; busy: () => boolean; ready: () => boolean;
  /** After a reload the server can still know the account while this page has not loaded the account SDK; connect it first. */
  resume?: () => Promise<void>;
  lifecycle: ReturnType<typeof createOakSavedLifecycle>;
  beforeRestore: () => void; refreshAuth: () => Promise<void>;
  documents?: { serialize: () => SavedDocumentSet; proof: () => OakSavedDocumentProof | null;
    restore: (record: SavedConversationRecord, fresh: ReopenedSavedDocuments | null) => void };
};
/** Cohesive saved commands retain their own epochs and aborts without importing the singleton. */
export function createOakSavedHistoryWorkspace(owner: SavedCommandsOwner) {
  let saveVersion = 0, historyVersion = 0;
  let saveRequest: AbortController | null = null, historyRequest: AbortController | null = null;
  const invalidate = () => {
    saveVersion++; historyVersion++;
    saveRequest?.abort(); saveRequest = null; historyRequest?.abort(); historyRequest = null;
  };
function historyFailure(error: unknown, action: "save" | "open" | "list") {
  const code = error instanceof Error ? error.message : "unavailable";
  if (code === "sign-in-required") {
    owner.update({ authReauthenticate: true, authError: "Sign in again to use saved conversations. Your conversation and draft are still here." });
    return "Sign in again, then choose Save or Saved conversations when ready.";
  }
  if (code === "conflict") return "Saved history changed elsewhere. Your text is still here. Reopen that conversation before continuing to save.";
  if (code === "missing") return "That saved conversation is unavailable or expired. Your current conversation and draft are still here.";
  return action === "save" ? "Saving could not be confirmed. Your completed answers and draft are still here. Choose Save to try again." :
    action === "open" ? "This conversation could not open. Your current conversation and draft are still here." : "Saved conversations could not load. Try again when ready.";
}

/** Only a successful explicit Save acknowledgement starts automatic terminal appends. */
async function saveOakCurrentConversation(includeDocuments = false) {
  owner.lifecycle.checkExpiry();
  if (!owner.ready()) await owner.resume?.();
  if (owner.read().savePending || owner.active() || owner.busy() || !owner.ready()) return;
  if (owner.read().savedRecord && !includeDocuments) { await appendOakCompletedHistory(); return; }
  const snapshot = projectOakSavedHistory(owner.read());
  if (!snapshot) { owner.update({ saveError: "This history cannot be saved yet. Your text is still here." }); return; }
  let documents: SavedDocumentSet | null = null, proof: OakSavedDocumentProof | null = null;
  const prior = owner.read().savedRecord;
  if (includeDocuments) {
    try {
      documents = owner.documents?.serialize() ?? null; proof = owner.documents?.proof() ?? null;
      if (!documents || (documents.documents.length && !proof) || (!prior && !proof)) throw new Error('invalid-input');
    } catch { owner.update({ saveError: 'Prepare the documents or reopen their saved conversation before saving them. Your text is still here.' }); return; }
  }
  const version = ++saveVersion, epoch = getOakAccountContext().epoch;
  const conversationId = owner.read().conversationId;
  const request = new AbortController(); saveRequest = request;
  const current = () => version === saveVersion && epoch === getOakAccountContext().epoch && conversationId === owner.read().conversationId;
  owner.update({ savePending: true, saveError: null, savedSubmittedMessageIds: submittedOakHistoryIds(owner.read(), snapshot),
    savedTranscriptAccountVersion: getOakAccountContext().accountVersion });
  try {
    const record = includeDocuments
      ? prior ? await replaceOakSavedDocuments(prior.conversationId, prior.version, proof, request.signal)
        : await saveOakConversationWithDocuments(snapshot, proof!, request.signal)
      : await saveOakConversation(snapshot, request.signal);
    if (!current()) return;
    if (prior ? !sameOakSavedValue(record.messages, prior.messages) : !oakSaveAcknowledged(record, snapshot)) throw new Error('conflict');
    if (includeDocuments && !sameOakSavedValue(record.documents ?? { documents: [], selections: [] }, documents)) throw new Error('conflict');
    owner.update({ savedRecord: record, savedTranscriptAccountVersion: getOakAccountContext().accountVersion, savePending: false, saveError: null });
    showOakToast("saved");
    // A subsequent turn may have finished while this explicit Save was in flight.
    await appendOakCompletedHistory();
  } catch (error) {
    if (current() && error instanceof Error && error.message === "missing") owner.lifecycle.invalidate(conversationId!, "That saved conversation is unavailable or expired.");
    if (current()) owner.update({ savePending: false, saveError: historyFailure(error, "save") });
  } finally { if (saveRequest === request) saveRequest = null; }
}

async function appendOakCompletedHistory() {
  owner.lifecycle.checkExpiry();
  if (!owner.read().savedRecord || owner.read().savePending || owner.busy() || !owner.ready() || owner.read().saveError) return;
  const version = ++saveVersion, epoch = getOakAccountContext().epoch;
  const conversationId = owner.read().conversationId;
  const request = new AbortController(); saveRequest = request;
  const current = () => version === saveVersion && epoch === getOakAccountContext().epoch && conversationId === owner.read().conversationId;
  let record = owner.read().savedRecord!;
  owner.update({ savePending: true });
  try {
    while (current()) {
      const snapshot = projectOakSavedHistory(owner.read());
      if (!snapshot) throw new Error("invalid-input");
      let delta = oakSavedDelta(record, snapshot);
      if (!delta) break;
      let acknowledged: SavedConversationRecord;
      owner.update({ savedSubmittedMessageIds: submittedOakHistoryIds(owner.read(), delta) });
      try { acknowledged = await appendOakSavedConversation(delta, request.signal); }
      catch (error) {
        if (!(error instanceof Error && error.message === "conflict") || !current()) throw error;
        const latest = await readOakSavedConversation(conversationId!, request.signal);
        if (!current()) return;
        if (!sameOakSavedValue(latest.documents ?? null, record.documents ?? null)) throw new Error('conflict');
        // Lost acknowledgements and same-client races can reconcile. Foreign content cannot replace the screen.
        delta = oakSavedDelta(latest, snapshot);
        if (!delta) { record = latest; owner.update({ savedRecord: record }); continue; }
        owner.update({ savedSubmittedMessageIds: submittedOakHistoryIds(owner.read(), delta) });
        acknowledged = await appendOakSavedConversation(delta, request.signal);
      }
      if (!current()) return;
      if (!oakSaveAcknowledged(acknowledged, snapshot) || acknowledged.version < record.version ||
        !sameOakSavedValue(acknowledged.documents ?? null, record.documents ?? null) ||
        !sameOakSavedValue(acknowledged.messages.slice(0, record.messages.length), record.messages)) throw new Error("conflict");
      record = acknowledged; owner.update({ savedRecord: record });
    }
    if (current()) owner.update({ savePending: false, saveError: null });
  } catch (error) {
    if (current() && error instanceof Error && error.message === "missing") owner.lifecycle.invalidate(conversationId!, "That saved conversation is unavailable or expired.");
    if (current()) owner.update({ savePending: false, saveError: historyFailure(error, "save") });
  } finally { if (saveRequest === request) saveRequest = null; }
}

function retryOakHistorySave() {
  if (owner.read().savePending || owner.busy()) return;
  owner.update({ saveError: null });
  void saveOakCurrentConversation();
}
function closeOakSavedConversations() {
  owner.lifecycle.dismiss();
  historyVersion++; historyRequest?.abort(); historyRequest = null;
  owner.update({ historyOpen: false, historyPending: false });
}
async function loadOakSavedConversations(more = false) {
  owner.lifecycle.checkExpiry();
  if (!owner.ready()) await owner.resume?.();
  if (owner.active() || owner.read().historyPending || owner.read().savePending || owner.busy() || !owner.ready()) return;
  if (more && (!owner.read().historyCursor || owner.read().historyPageCount >= 50)) return;
  const version = ++historyVersion, epoch = getOakAccountContext().epoch, conversationId = owner.read().conversationId;
  const request = new AbortController(); historyRequest = request;
  const cursor = more ? owner.read().historyCursor : null;
  const current = () => version === historyVersion && epoch === getOakAccountContext().epoch && conversationId === owner.read().conversationId;
  owner.update({ historyOpen: true, historyPending: true, historyError: null });
  try {
    const page = await listOakSavedConversations(cursor, request.signal);
    if (!current()) return;
    if (cursor && page.nextCursor === cursor) throw new Error("unavailable");
    const summaries = more ? [...owner.read().savedConversations, ...page.conversations] : page.conversations;
    if (new Set(summaries.map(item => item.conversationId)).size !== summaries.length) throw new Error("unavailable");
    owner.update({ savedConversations: summaries, historyCursor: page.nextCursor, historyPageCount: more ? owner.read().historyPageCount + 1 : 1,
      historyLoaded: true, historyPending: false });
  } catch (error) {
    if (current()) owner.update({ historyPending: false, historyError: historyFailure(error, "list") });
  } finally { if (historyRequest === request) historyRequest = null; }
}
async function openOakSavedConversation(conversationId: string) {
  owner.lifecycle.checkExpiry();
  if (!owner.ready()) await owner.resume?.();
  if (owner.active() || owner.read().historyPending || owner.read().savePending || owner.busy() || !owner.ready()) return;
  const version = ++historyVersion, epoch = getOakAccountContext().epoch, previousId = owner.read().conversationId;
  const request = new AbortController(); historyRequest = request;
  const current = () => version === historyVersion && epoch === getOakAccountContext().epoch && previousId === owner.read().conversationId;
  owner.update({ historyPending: true, historyError: null });
  try {
    const record = await readOakSavedConversation(conversationId, request.signal);
    if (!current()) return;
    const fresh = record.documents?.documents.length ? await reopenOakSavedDocuments(conversationId, request.signal) : null;
    if (!current()) return;
    if (fresh && !sameOakSavedValue(durableSavedDocuments(fresh.outputs, fresh.selections), record.documents)) throw new Error('conflict');
    const interrupted = new Set((record.interruptedTurns ?? []).map(turn => turn.requestId));
    const messages: OakConversationMessage[] = record.messages.flatMap(message => {
      const complete: OakConversationMessage = { ...message, state: "complete", usage: null };
      if (message.role !== "user" || !interrupted.has(message.id.slice(0, -5))) return [complete];
      return [complete, { id: message.id.slice(0, -5), role: "assistant", text: "", answer: null, cards: [], usage: null,
        state: "interrupted", page: message.page, taskKind: message.taskKind }];
    });
    owner.beforeRestore();
    owner.update({ conversationId, messages, savedRecord: record, savedSubmittedMessageIds: [], savedTranscriptAccountVersion: getOakAccountContext().accountVersion,
      historyRestored: true, historyOpen: false, historyPending: false, historyError: null,
      historyRevision: owner.read().historyRevision + 1, error: null, progress: "", activity: null, authOpen: false, authPending: false,
      briefDraft: null, briefOpen: false, briefError: null, voiceOpen: false, voiceConfiguration: disabledVoiceConfiguration });
    owner.documents?.restore(record, fresh);
    showOakToast("reopened");
    // Account/conversation metadata only. Opening never claims allowance or resumes a turn.
    void owner.refreshAuth();
  } catch (error) {
    if (current() && error instanceof Error && error.message === "missing") owner.lifecycle.invalidate(conversationId, "That saved conversation is unavailable or expired.");
    if (current()) owner.update({ historyPending: false, historyError: historyFailure(error, "open") });
  } finally { if (historyRequest === request) historyRequest = null; }
}

  return { invalidate, saveOakCurrentConversation: () => saveOakCurrentConversation(false),
    saveOakCurrentConversationWithDocuments: () => saveOakCurrentConversation(true), appendOakCompletedHistory, retryOakHistorySave,
    closeOakSavedConversations, loadOakSavedConversations, openOakSavedConversation };
}
