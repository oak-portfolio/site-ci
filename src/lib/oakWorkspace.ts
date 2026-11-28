import { resetOakBridgeOnce } from "./oakBridgeOnce";
import { useSyncExternalStore } from "react";
import { renderOakAnswer } from "../../packages/oak-agent-contracts/src/output";
import type { OakAnswer, PublicCitation } from "../../packages/oak-agent-contracts/src/types";
import { briefInputLimits, emptyOakContactBrief, briefReferenceKey, validBriefReference, formatOakContactBrief, oakContactBriefError, type OakContactBriefDraft } from "./oakContactBrief";
import type {
  OakCard,
  OakChatRequest,
  OakContextReading,
  OakUsage,
} from "../../packages/oak-agent-contracts/src/transport";
import { cancelOakTurn, streamOakTurn, type OakVisibleActivity } from "./oakWorkspaceTransport";
import { getOakFundingSelection, oakFundingContentGuardHeaders } from "./oakFundingSession";
import { oakInjectionBlockedText, isValidRoleDescription, questionMaxCharacters, roleDescriptionMaxBytes, roleIntentMaxCharacters } from "../../packages/oak-agent-contracts/src/transport";
import type { OakAnswerUi } from "../../packages/oak-agent-contracts/src/openui/verdict";
import type { OakAnswerPlan } from "../../packages/oak-agent-contracts/src/openui/plan";
import { publicResearchNeed, type PublicResearchEvent } from "../../packages/oak-agent-contracts/src/public-research";
import { checkingVoiceConfiguration, disabledVoiceConfiguration, voiceTranscriptCharacters, type VoiceHttpConfiguration } from "./oakVoiceCapture";
import { cancelOakVoice, configureOakVoice, readOakVoiceConfiguration } from "./oakVoiceWorkspace";
import type { OakAuthContinuation, OakAuthStatus, OakSignInConfiguration } from "../../packages/oak-agent-contracts/src/auth";
import { readOakSignInConfiguration } from "./oakSignInConfiguration";
import { readOakAuthStatus, recoverOakGuestSession, canRecoverOakGuestSession, continueOakAccount, resumeOakAccount, getOakAccountContext, subscribeOakAccountContext, signOutOakAccount } from "./oakAccountClient";
import { saveOakAuthHandoff, readOakAuthHandoff, clearOakAuthHandoff, oakAuthHandoffKey } from "./oakAuthHandoff";
import type { SavedConversationRecord, SavedConversationSummary } from "../../packages/oak-agent-contracts/src/saved-conversations";
import { oakOrdinaryModelHistory } from "./oakSavedHistoryClient";
import { createOakSavedHistoryWorkspace } from "./oakSavedHistoryWorkspace";
import { createOakSavedLifecycle, idleOakHistoryLifecycle, type OakHistoryLifecycle } from "./oakSavedLifecycleActions";
import { submittedOakHistoryIds } from "./oakSavedLifecycleCopies";
import { getOakDocumentTurnContext, getOakDocumentsController, getOakDocumentsWorkspace, oakAsksFit, oakDocumentFailure, oakReadsAsRole, oakSelectedText, OAK_COMPARE_SECTION_LIMIT } from "./oakDocumentsWorkspace";
import { oakLooksLikeJobPost } from "./oakComposerInput";
import { documentRequirementSourceSchema, type DocumentRequirementSource } from "../../packages/oak-agent-contracts/src/document-answer";
import { installOakViewportSupport, isOakViewportSupported } from "./oakViewportSupport";
import { advanceOakToolSteps, restartOakToolSteps, settleOakToolSteps, type OakToolStep } from "./oakToolSteps";
import { showOakToast } from "./oakToasts";
import { foldOakQuotes, OAK_QUOTE_MAX, oakQuoteRoom, shortenOakQuote } from "./oakQuote";
import { privateDocumentRequestIds } from "./oakPrivateDocumentHistory";
export { getOakVoiceController } from "./oakVoiceWorkspace";

export type OakPresentation = "human-browse" | "human-agent";
export type OakRoleDraft = Readonly<{ roleDescription: string; intent: string; requirementSource?: DocumentRequirementSource }>;
export type OakConversationMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  text: string;
  answer: OakAnswer | null;
  cards: OakCard[];
  usage: OakUsage | null;
  /** R10: how full this answer's prompt was against the Worker's bound. Memory only; saved history never carries it. */
  context?: OakContextReading | null;
  state: "complete" | "pending" | "interrupted" | "failed";
  /** Why a failed turn stopped, when a retry cannot help or the cause is known. Kept in memory only. */
  failure?: "allowance" | "offline" | "unavailable" | "unreachable" | "busy" | "paused" | "budget" | "budget-today" | "network" | "injection";
  page: string;
  taskKind?: "question" | "role-fit" | "advice";
  research?: PublicResearchEvent | null;
  /** Q17: the arranged layout of a sourced answer, as it streams and once settled. Saved only once done. */
  ui?: OakAnswerUi | null;
  /** Ticket 17: the Worker's block plan for this turn, for its ghosts and trace line. Memory only; saved history never carries it. */
  plan?: OakAnswerPlan;
  privateDocumentTurn?: true;
  /** Tool rows for this turn only. Kept in memory; saved history and model context never read them. */
  steps?: readonly OakToolStep[];
  /** Q09: after an automatic re-ask, the request that actually produced this answer (its trace), for feedback. Memory only. */
  answeredBy?: string;
  /** D123: the quote chips this question was sent with and the visitor's own words, for the bubble. `text` keeps the folded question. */
  quoted?: Readonly<{ quotes: readonly string[]; text: string }>;
  /** D142: the answer each sent quote came from, in `quoted.quotes` order, so Retry keeps private provenance. Memory only. */
  quoteSources?: readonly (string | null)[];
}>;
/** A phrase from one of Oak's answers, staged beside the draft as a quote chip by Ask about this. */
/** A staged quote, and the answer it was taken from (its message id), so the chip can take the visitor back there (D135). */
export type OakQuote = Readonly<{ id: string; text: string; source?: string }>;
export type OakWorkspaceState = Readonly<{
  presentation: OakPresentation;
  agentEligible: boolean;
  mascotEligible: boolean;
  overlayActive: boolean;
  viewportSupported: boolean;
  viewportNotice: boolean;
  route: string;
  sourceIds: string[];
  /** PR 1d: the visitor took the page chip off, so this page's source ids stay out of what is sent. Re-arms on the next page. */
  pageContextOff?: boolean;
  conversationId: string | null;
  draft: string;
  quotes: readonly OakQuote[];
  draftKind: "question" | "advice";
  contactPreference: "open" | "declined";
  contactNotice: string;
  questionDraft: Readonly<{ topic: string; goal: string }> | null;
  roleDraft: OakRoleDraft | null;
  briefDraft: OakContactBriefDraft | null;
  briefOpen: boolean;
  briefError: string | null;
  panel: "conversation" | "funding" | null;
  voiceOpen: boolean;
  voiceConfiguration: VoiceHttpConfiguration;
  messages: OakConversationMessage[];
  pending: boolean;
  progress: string;
  activity: OakVisibleActivity;
  error: string | null;
  authStatus: OakAuthStatus | null;
  /**
   * Q15: the first status read is in flight (for at most OAK_STATUS_HOLD_MS), so the empty state can hold its starters
   * instead of showing the mixed set and swapping to the visitor's own under the pointer.
   */
  authStatusLoading: boolean;
  /** R4 review: the hold ran out before status arrived, so the mixed starters stay put until the next conversation. */
  startersFrozen: boolean;
  authSignInConfiguration: OakSignInConfiguration | null;
  authOpen: boolean;
  authPending: boolean;
  authError: string | null;
  authReauthenticate: boolean;
  savedRecord: SavedConversationRecord | null;
  savedSubmittedMessageIds: readonly string[];
  savedTranscriptAccountVersion: number | null;
  historyRestored: boolean;
  savePending: boolean;
  saveError: string | null;
  historyOpen: boolean;
  historyPending: boolean;
  historyError: string | null;
  savedConversations: SavedConversationSummary[];
  historyCursor: string | null;
  historyLoaded: boolean;
  historyPageCount: number;
  historyRevision: number;
  historyLifecycle: OakHistoryLifecycle;
}>;
const initial: OakWorkspaceState = {
  presentation: "human-browse",
  agentEligible: false,
  mascotEligible: false,
  overlayActive: false,
  viewportSupported: true,
  viewportNotice: false,
  route: "/",
  sourceIds: [],
  conversationId: null,
  draft: "",
  quotes: [],
  draftKind: "question",
  contactPreference: "open",
  contactNotice: "",
  questionDraft: null,
  roleDraft: null,
  briefDraft: null,
  briefOpen: false,
  briefError: null,
  panel: null,
  voiceOpen: false,
  voiceConfiguration: disabledVoiceConfiguration,
  messages: [],
  pending: false,
  progress: "",
  activity: null,
  error: null,
  authStatus: null,
  authStatusLoading: false,
  startersFrozen: false,
  authSignInConfiguration: null,
  authOpen: false,
  authPending: false,
  authError: null,
  authReauthenticate: false,
  savedRecord: null,
  savedSubmittedMessageIds: [],
  savedTranscriptAccountVersion: null,
  historyRestored: false,
  savePending: false,
  saveError: null,
  historyOpen: false,
  historyPending: false,
  historyError: null,
  savedConversations: [],
  historyCursor: null,
  historyLoaded: false,
  historyPageCount: 0,
  historyRevision: 0,
  historyLifecycle: idleOakHistoryLifecycle,
};
let state = initial;
const listeners = new Set<() => void>();
let opener: HTMLElement | null = null;
let cancellationVersion = 0;
// The pasted role behind each role-fit answer, so its requirement titles snap to whole words. It never enters the
// transcript, model history or saved conversations, and a new conversation forgets it.
const roleDescriptions = new Map<string, string>();
export function getOakRoleDescription(messageId: string): string | undefined { return roleDescriptions.get(messageId); }
let presentationVersion = 0;
// Ticket 67 (Q21 B): the chat-first home hosts the conversation inline, so a turn sends while the page is browsed and stays readable.
let inlineHost = false;
let retainedMessages: OakWorkspaceState["messages"] | null = null;
let authStatusVersion = 0;
let authContinuationVersion = 0;
let authHandoffResumed = false;
let guestRecovery: AbortController | null = null;
function clearPrivateHistory() {
  savedLifecycle.reset();
  savedCommands.invalidate();
  return { savedRecord: null, savedSubmittedMessageIds: [], savePending: false, saveError: null, historyOpen: false, historyPending: false,
    historyError: null, savedConversations: [], historyCursor: null, historyLoaded: false, historyPageCount: 0, historyLifecycle: idleOakHistoryLifecycle };
}
let active: {
  controller: AbortController;
  /** The request in flight. A stalled call's automatic re-ask replaces it. */
  turn: OakChatRequest;
  /** The visible turn's id: the first request's id, kept across a re-ask. */
  messageId: string;
  /** What the visitor typed, without the folded quotes, and the quote chips sent with it: both return to the box on a stop. */
  text: string;
  quotes: readonly OakQuote[];
  roleDraft: OakRoleDraft | null;
  draftKind: "question" | "advice";
  safetyAccepted: boolean;
} | null = null;
export const OAK_WORKSPACE_OPEN_EVENT = "oak:workspace-open";
/** Generic turn failure. The stopped card on the failed turn already says this, so the status line skips it. */
export const oakTurnFailedNotice = "The answer could not finish. Your draft is here to retry explicitly. You can still contact Steve.";
export const oakAllowanceNotice = "You have used the answers available for now. One comes back every 4 hours, and you can contact Steve.";
/** Q13: under the rolling 30-day cap the 4-hour refill pauses, so this notice says when answers really return. */
export const oakAllowanceCappedNotice = "You have used the answers available for now. Each answer comes back 30 days after you used it, and you can contact Steve.";
export const oakOfflineNotice = "The connection dropped before the answer finished. Your draft is here to retry when you are back online.";
export const oakUnavailableNotice = "I can’t answer on this site yet, so nothing was sent. Your question is still here, and you can contact Steve or open it in another assistant.";
export const oakUnreachableNotice = "I couldn't reach my server just now. Your question is still here to retry in a moment.";
export const oakBusyNotice = "The model is busy right now and didn't answer in time. Your question is still here to retry in a moment.";
export const oakPausedNotice = "A few answers didn't finish just now, so new questions are paused for a few minutes. Your question is still here.";
export const oakBudgetNotice = "I've used this month's free answers, so new questions are paused until next month. You can contact Steve.";
export const oakBudgetTodayNotice = "I've used today's free answers, so new questions are paused until tomorrow (UTC). You can contact Steve.";
export const oakNetworkNotice = "This network has used its free answers for today, so new questions are paused until tomorrow (UTC). You can contact Steve.";
/** The spent-allowance notice that is true for this visitor; the rule mirrors `oakAllowanceComesBack` in oakAllowance.ts. */
export function oakAllowanceSpentNotice(allowance: { answers: { remaining: number }; window: { remaining: number } } | null | undefined) {
  return allowance && (allowance.window.remaining < allowance.answers.remaining || allowance.window.remaining === 0) ? oakAllowanceCappedNotice : oakAllowanceNotice;
}
/** Every notice a failed turn's own card already shows; the status line steps aside for them (Q03-G4). */
export const oakTurnNotices: readonly string[] = [oakTurnFailedNotice, oakAllowanceNotice, oakAllowanceCappedNotice, oakOfflineNotice, oakUnavailableNotice, oakUnreachableNotice,
  oakBusyNotice, oakPausedNotice, oakBudgetNotice, oakBudgetTodayNotice, oakNetworkNotice];
/** Limits that asking again cannot pass: the stale question is not put back in the message box (Q03-G5). */
const oakLimitFailures: ReadonlySet<OakConversationMessage["failure"]> = new Set(["allowance", "budget", "budget-today", "network"]);
/** Q16-D2: failures where the Worker turned the send away before any model ran (a pause or a limit). A repeat adds nothing to the thread. */
const oakRefusalFailures: ReadonlySet<OakConversationMessage["failure"]> = new Set(["paused", ...oakLimitFailures]);
/** Q16-D2: a role comparison the Worker refused. Leaving its panel parks it here, never in the message box. */
let refusedRoleDraft: OakRoleDraft | null = null;
let parkedRoleDraft: OakRoleDraft | null = null;

/**
 * Why a turn failed when a retry cannot help (allowance) or the network dropped (offline). Known transport errors are
 * Error instances with their own message and stay unclassified; only a fetch-level TypeError can be offline.
 * Client-side only; the transport is unchanged.
 */
export function oakTurnFailure(error: unknown): OakConversationMessage["failure"] {
  if (error instanceof Error && error.message === "allowance-unavailable") return "allowance";
  if (error instanceof Error && error.message === "agent-unavailable") return "unavailable";
  if (error instanceof Error && error.message === "agent-unreachable") return "unreachable";
  // Both attempts stalled at the model: nothing is wrong with the question, the model is queueing.
  if (error instanceof Error && error.message === "model-stall") return "busy";
  if (error instanceof Error && error.message === "attempts-paused") return "paused";
  // The sponsor's monthly budget is spent: nothing the visitor did, and asking again meets the same ceiling.
  if (error instanceof Error && error.message === "sponsor-budget-paused") return "budget";
  // Today's share of the budget is spent; it opens again at the next UTC day.
  if (error instanceof Error && error.message === "sponsor-budget-paused-today") return "budget-today";
  // Everyone behind one network address shares a daily cap; it opens again at the next UTC day.
  if (error instanceof Error && error.message === "network-limit-today") return "network";
  // R19 live: the provider's filter refused text that reads like instructions to an AI. It is the guardrail, not a fault.
  if (error instanceof Error && error.message.startsWith("injection-blocked-")) return "injection";
  if (!(error instanceof TypeError)) return undefined;
  // A code chunk that failed to load (stale build, dev optimizer) is not the visitor's connection.
  if (/dynamically imported module|module script/i.test(error.message)) return undefined;
  return (typeof navigator !== "undefined" && navigator.onLine === false) || /fetch|network|load failed/i.test(error.message) ? "offline" : undefined;
}

// The scrollbar the page would show unlocked: a page taller than the window shows one as wide as an overflow: scroll box.
function holdPageWidth(target: Document = document) {
  const root = target.documentElement, probe = target.createElement("div");
  probe.style.cssText = "position:absolute;top:0;left:0;width:100px;height:100px;overflow:scroll;visibility:hidden";
  target.body.append(probe);
  const scrollbar = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  root.style.setProperty("--oak-scrollbar-width", `${root.scrollHeight > root.clientHeight ? scrollbar : 0}px`);
}
const holdOpenPageWidth = () => { if (state.presentation === "human-agent" && document.documentElement.style) holdPageWidth(); };

function applyPresentation(
  target: Document = document,
  value = state.presentation,
) {
  const root = target.documentElement;
  const style = root.style as CSSStyleDeclaration | undefined;
  // Opening drops the root's scrollbar gutter (oakAgent.css) and the page behind keeps the scrollbar's width. A swapped-in
  // document has no layout yet, so it carries the open page's value until after-swap measures it. Test stubs have no style.
  if (style && value !== "human-agent") style.removeProperty("--oak-scrollbar-width");
  else if (style && root.dataset.oakPresentation !== "human-agent") {
    if (target.defaultView) holdPageWidth(target);
    else style.setProperty("--oak-scrollbar-width", document.documentElement.style?.getPropertyValue("--oak-scrollbar-width") || "0px");
  }
  root.dataset.oakPresentation = value;
  delete target.documentElement.dataset.audienceMode;
  for (const element of target.querySelectorAll<HTMLElement>(
    ".route-surface, .site-header",
  ))
    element.inert = value === "human-agent";
}
let voiceStatusRequest: AbortController | null = null;
// Q16-D5: Record and Transcribe need status under a minute old, so an open Dictate panel re-reads it every 30 s.
let voiceStatusTimer: ReturnType<typeof setInterval> | null = null;
function cancelVoiceWork(clear = false) {
  voiceStatusRequest?.abort(); voiceStatusRequest = null;
  if (voiceStatusTimer) { clearInterval(voiceStatusTimer); voiceStatusTimer = null; }
  cancelOakVoice(clear);
}
function update(next: Partial<OakWorkspaceState>) {
  if (next.conversationId !== undefined && next.conversationId !== state.conversationId) {
    getOakDocumentsController().disposeOwned("conversation-change");
    resetOakBridgeOnce();
    // A removed page chip belongs to its conversation. Naming a new conversation at the first message keeps the chip off;
    // a handoff restoring a conversation passes its own value.
    next = { ...clearPrivateHistory(), savedTranscriptAccountVersion: null, historyRestored: false, ...(state.conversationId !== null || next.messages !== undefined ? { pageContextOff: false } : {}), ...next };
  }
  // A staged quote's provenance is its source message. When the transcript drops that message (an account switch, a
  // reopened chat), the quote goes too, so a private quote can never be sent as an ordinary one (D151).
  if (next.messages !== undefined) {
    const quotes = next.quotes ?? state.quotes, kept = oakQuotesWithSources(next.messages, quotes);
    if (kept.length !== quotes.length) next = { ...next, quotes: kept };
  }
  if ((next.presentation !== undefined && next.presentation !== state.presentation) ||
      (next.route !== undefined && next.route !== state.route)) {
    savedLifecycle.reset();
    next = { ...next, historyLifecycle: idleOakHistoryLifecycle };
    presentationVersion++;
    cancelVoiceWork();
    // The removed page chip comes back on a new page, but a sign-in handoff restoring it for the same conversation says so itself.
    next = { ...next, activity: null, voiceOpen: false, voiceConfiguration: disabledVoiceConfiguration, ...(state.pageContextOff && next.pageContextOff === undefined ? { pageContextOff: false } : {}) };
    if (next.presentation !== undefined && next.presentation !== "human-agent") {
      getOakDocumentsController().close();
      authContinuationVersion++;
      authStatusVersion++;
      clearOakAuthHandoff();
      guestRecovery?.abort(); guestRecovery = null;
      next = { ...next, authOpen: false, authPending: false, panel: null };
    }
  }
  state = { ...state, ...next };
  if (state.authOpen && !state.pending && !saveOakAuthHandoff(state)) {
    clearOakAuthHandoff();
    state = { ...state, authOpen: false, authError: "This browser could not retain your latest edits for sign-in. Your draft is still here." };
  }
  retainOakHomeThread();
  if (typeof document !== "undefined") applyPresentation();
  for (const listener of listeners) listener();
}

const homeThreadKey = "oak.home.thread.v1";
const tabStore = () => { try { return typeof window === "undefined" ? null : window.sessionStorage ?? null; } catch { return null; } };
export const oakInlineHostOn = () => inlineHost;
// The home borrows the sign-in handoff codec (validated, public turns only, 20 minutes) and never while a real handoff holds its key.
function retainOakHomeThread() {
  if (!inlineHost || state.pending || state.authOpen || state.messages === retainedMessages) return;
  const store = tabStore();
  try {
    if (!store || store.getItem(oakAuthHandoffKey) !== null) return;
    retainedMessages = state.messages;
    const text = state.messages.length && saveOakAuthHandoff({ ...state, draft: "", quotes: [], questionDraft: null, roleDraft: null, briefDraft: null })
      ? store.getItem(oakAuthHandoffKey) : null;
    clearOakAuthHandoff();
    if (text) store.setItem(homeThreadKey, text); else store.removeItem(homeThreadKey);
  } catch { /* Storage denial keeps the thread for this page only. */ }
}
export function setOakInlineHost(on: boolean) {
  inlineHost = on;
  if (!on || state.messages.length) return;
  const store = tabStore();
  try {
    const text = store?.getItem(homeThreadKey);
    if (!store || !text || store.getItem(oakAuthHandoffKey) !== null) return;
    store.setItem(oakAuthHandoffKey, text);
    const retained = readOakAuthHandoff();
    clearOakAuthHandoff();
    if (retained?.messages?.length) {
      retainedMessages = retained.messages;
      update({ conversationId: retained.conversationId ?? null, messages: retained.messages });
    } else store.removeItem(homeThreadKey);
  } catch { /* An unreadable store starts the home fresh. */ }
}
export function getOakPresentationVersion() {
  return presentationVersion;
}
export function getOakWorkspace() {
  return state;
}
/** Dev state gallery only: show a fixture snapshot without running workspace side effects. */
export function setOakWorkspaceFixture(next: Partial<OakWorkspaceState>) {
  state = { ...state, ...next };
  if (typeof document !== "undefined") applyPresentation();
  for (const listener of listeners) listener();
}

/** The one view in front of the conversation; "chat" means no panel. Derived by fixed priority so two can never show together. */
export type OakSurface = "chat" | "advice" | "voice" | "question" | "role" | "brief" | "conversation" | "funding" | "documents" | "account";
export function oakSurface(value: OakWorkspaceState, documentsOpen: boolean): OakSurface {
  if (value.authOpen) return "account";
  if (documentsOpen) return "documents";
  if (value.panel) return value.panel;
  if (value.historyOpen) return "conversation";
  if (value.briefOpen && value.briefDraft) return "brief";
  if (value.roleDraft) return "role";
  if (value.questionDraft) return "question";
  if (value.voiceOpen) return "voice";
  return value.draftKind === "advice" ? "advice" : "chat";
}
export function getOakSurface() {
  return oakSurface(state, Boolean(getOakDocumentsController().snapshot().open));
}
export function closeOakSurface() {
  const surface = getOakSurface();
  if (surface === "account") closeOakSignIn();
  else if (surface === "documents") getOakDocumentsController().close();
  else if (surface === "conversation" || surface === "funding") { if (state.historyOpen) closeOakSavedConversations(); update({ panel: null }); }
  else if (surface === "brief") closeOakContactBrief();
  else if (surface === "role") leaveOakRoleDraft();
  else if (surface === "question") leaveOakQuestionDraft();
  else if (surface === "voice") closeOakVoiceInput();
  else if (surface === "advice") leaveOakAdviceDraft();
}
/** Opening a surface first closes whatever is open. A running turn that keeps its surface blocks the switch. */
export function openOakSurface(next: Exclude<OakSurface, "chat">) {
  for (let current = getOakSurface(); current !== "chat" && current !== next; current = getOakSurface()) {
    closeOakSurface();
    if (getOakSurface() === current) return;
  }
  if (next === "account") beginOakSignIn();
  else if (next === "documents") openOakDocuments();
  else if (next === "conversation" || next === "funding") update({ panel: next });
  else if (next === "brief") openOakContactBrief();
  else if (next === "role") beginOakRoleDraft();
  else if (next === "question") beginOakQuestionDraft();
  else if (next === "voice") void openOakVoiceInput();
  else beginOakAdviceDraft();
}
export function useOakWorkspace() {
  return useSyncExternalStore(subscribe, getOakWorkspace, () => initial);
}
export function subscribeOakWorkspace(listener: () => void) {
  return subscribe(listener);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function admitOakInteraction() {
  const supported = isOakViewportSupported();
  if (!supported || !state.viewportSupported || state.viewportNotice)
    update({ viewportSupported: supported, viewportNotice: !supported });
  return supported;
}
/** The longest message the box takes: the contract's own limit. */
export const OAK_DRAFT_LIMIT = questionMaxCharacters;

export function setOakDraft(draft: string) {
  // SH15: never cut silently. A draft over the limit stays whole; the counter shows the overflow and Send waits.
  update({ draft });
}
/**
 * Stages a quote chip. The visitor's draft is never cut (D114): the quote shortens to the room left, and is refused
 * when under 24 characters would fit or three are already staged.
 */
export function addOakQuote(text: string, source?: string): "added" | "full" | "no-room" {
  if (state.quotes.length >= OAK_QUOTE_MAX) return "full";
  const room = oakQuoteRoom(state.quotes.map(quote => quote.text), state.draft.trim(), OAK_DRAFT_LIMIT);
  if (room < 24 && text.length > Math.max(0, room)) return "no-room";
  update({ quotes: [...state.quotes, { id: crypto.randomUUID(), text: shortenOakQuote(text, room), ...(source ? { source } : {}) }] });
  return "added";
}
export function removeOakQuote(id: string) {
  update({ quotes: state.quotes.filter(quote => quote.id !== id) });
}
/** PR 1d: the page chip's remove and restore. Off, the next question goes out without this page's source ids. */
export function setOakPageContext(on: boolean) {
  update({ pageContextOff: !on });
}
/** Quotes join only a plain question from the message box; a guided question, advice or role panel leaves them staged. */
const quotesSend = (value: OakWorkspaceState) => value.quotes.length > 0 && !value.roleDraft && !value.questionDraft && value.draftKind === "question";
/** Staged quotes whose source answer is still in the transcript; a quote with no source always stays (D151). */
export function oakQuotesWithSources(messages: readonly { id: string }[], quotes: readonly OakQuote[]) {
  const ids = new Set(messages.map(message => message.id));
  return quotes.filter(quote => quote.source === undefined || ids.has(quote.source));
}
/** A sent question as the box held it: the visitor's words and its quote chips, so a resend folds the same question again. */
/** A private question reopened from a saved chat lost its in-memory quote sources; its own request id keeps it private (D143). */
const resendOf = (question: OakConversationMessage) => question.quoted
  ? { draft: question.quoted.text, quotes: question.quoted.quotes.map((text, index) => {
    const source = question.quoteSources?.[index] ?? (question.privateDocumentTurn ? question.id.slice(0, -5) : null);
    return { id: crypto.randomUUID(), text, ...(source ? { source } : {}) };
  }) }
  : { draft: question.text, quotes: [] as OakQuote[] };
const sameQuotes = (a: readonly OakQuote[], b: readonly OakQuote[]) => a.map(quote => quote.text).join("\n") === b.map(quote => quote.text).join("\n");
export function openOakDocuments() {
  if (!admitOakInteraction()) return;
  if (active || state.presentation !== "human-agent") return;
  closeOakVoiceInput();
  update({ conversationId: state.conversationId ?? crypto.randomUUID(), questionDraft: null, roleDraft: null,
    briefOpen: false, historyOpen: false, draftKind: "question" });
  getOakDocumentsController().open({ conversationId: state.conversationId!, accountEpoch: getOakAccountContext().epoch });
}

function historyAccountReady() {
  return state.authStatus?.configured && state.authStatus.kind === "account" && state.authStatus.phase === "ready" && !state.authReauthenticate && getOakAccountContext().authenticated;
}
/** The server knows a ready account but this page has not loaded the account SDK (a reload): load it, or ask for sign-in again. */
async function resumeReadyAccount() {
  const status = state.authStatus;
  if (!status?.configured || status.kind !== "account" || status.phase !== "ready" || state.authReauthenticate || !status.publishableKey) return;
  if (getOakAccountContext().authenticated) return;
  try { await resumeOakAccount(status.publishableKey); }
  catch { update({ authReauthenticate: true, authError: "Sign in again to continue. Your conversation and draft are still here." }); }
}
const savedLifecycle = createOakSavedLifecycle({ read: () => state, update, ready: () => Boolean(historyAccountReady()), subscribe,
  stopActive: id => { if (active?.turn.conversationId === id) stopOakTurn(false); },
  invalidate: () => { savedCommands.invalidate(); authStatusVersion++; authContinuationVersion++;
    update({ savePending: false, historyPending: false }); } });
export const beginOakSavedDeletion = savedLifecycle.beginDelete;
export const confirmOakSavedDeletion = savedLifecycle.confirmDelete;
export const reviewOakSavedDeletion = savedLifecycle.reviewConflict;
export const dismissOakSavedDeletion = savedLifecycle.dismiss;
export const exportOakSavedHistory = savedLifecycle.exportConversation;
function lifecycleBusy() { return state.historyLifecycle.phase !== "idle"; }
const savedCommands = createOakSavedHistoryWorkspace({ read: () => state, update,
  active: () => Boolean(active), busy: lifecycleBusy, ready: () => Boolean(historyAccountReady()), lifecycle: savedLifecycle,
  resume: resumeReadyAccount,
  beforeRestore: () => { cancelVoiceWork(true); authStatusVersion++; authContinuationVersion++; clearOakAuthHandoff(); },
  refreshAuth: refreshOakAuthStatus,
  documents: { serialize: () => getOakDocumentsController().serializeForExplicitSave(),
    proof: () => getOakDocumentsController().proofForExplicitSave(),
    restore: (record, fresh) => {
      const owner = { conversationId: record.conversationId, accountEpoch: getOakAccountContext().epoch };
      if (fresh) getOakDocumentsController().installFreshOwned(fresh, owner);
      else if (record.documents) getOakDocumentsController().restoreOwned(record.documents, owner);
      else getOakDocumentsController().disposeOwned('history-restore');
    } } });
export const saveOakCurrentConversation = savedCommands.saveOakCurrentConversation;
export const saveOakCurrentConversationWithDocuments = savedCommands.saveOakCurrentConversationWithDocuments;
const appendOakCompletedHistory = savedCommands.appendOakCompletedHistory;
export const retryOakHistorySave = savedCommands.retryOakHistorySave;
export const closeOakSavedConversations = savedCommands.closeOakSavedConversations;
export const loadOakSavedConversations = savedCommands.loadOakSavedConversations;
export const openOakSavedConversation = savedCommands.openOakSavedConversation;

const OAK_STATUS_HOLD_MS = 1500;
// The first status read is held once per page; a failed read never blanks visible starters again on reopen or retry.
let statusHeld = false;
/** Identity status is read-only metadata. It never submits a model request. */
export async function refreshOakAuthStatus(renewed = false) {
  if (guestRecovery) return;
  const version = ++authStatusVersion;
  const conversationId = state.conversationId;
  if (!state.authStatus && !state.authStatusLoading && !statusHeld) {
    statusHeld = true;
    update({ authStatusLoading: true });
    // A slow read stops holding after a beat; the mixed set shows and stays rather than swapping when status lands.
    setTimeout(() => { if (state.authStatusLoading) update({ authStatusLoading: false, startersFrozen: true }); }, OAK_STATUS_HOLD_MS);
  }
  try { await readOakAuthStatusInto(version, conversationId, renewed); }
  finally { if (version === authStatusVersion && state.authStatusLoading) update({ authStatusLoading: false }); }
}
async function readOakAuthStatusInto(version: number, conversationId: string | null, renewed: boolean) {
  try {
    const authStatus = await readOakAuthStatus(conversationId);
    if (version !== authStatusVersion || conversationId !== state.conversationId) return;
    const complete = state.authOpen && authStatus.phase === "ready";
    if (complete) clearOakAuthHandoff();
    update({ authStatus, authSignInConfiguration: null, authError: null, authReauthenticate: false, ...(complete ? { authOpen: false } : {}) });
    if (complete) showOakToast("signed-in");
  } catch (error) {
    if (version !== authStatusVersion || conversationId !== state.conversationId) return;
    // After a reload the short-lived session cookie can be stale while the account session is still live. Load the account
    // SDK once (it renews the cookie and supplies a fresh token), then ask again before calling the session ended.
    if (!renewed && error instanceof Error && error.message === "sign-in-required" && !getOakAccountContext().authenticated) {
      try {
        const configuration = await readOakSignInConfiguration();
        if (version === authStatusVersion && conversationId === state.conversationId && configuration.configured && configuration.publishableKey &&
            await resumeOakAccount(configuration.publishableKey)) return refreshOakAuthStatus(true);
      } catch { /* A session that cannot renew falls through to sign-in again. */ }
      if (version !== authStatusVersion || conversationId !== state.conversationId) return;
    }
    // 202 (r202 M1): a live session whose token wait only timed out stays signed in; the failed send already says "could not finish".
    const liveTimeout = error instanceof Error && error.message === "unavailable" && getOakAccountContext().authenticated;
    if (error instanceof Error && (error.message === "sign-in-required" || (state.authStatus?.kind === "account" && error.message !== "cancelled" && !liveTimeout))) {
      update({ authReauthenticate: true, authError: "Sign in again to continue. Your conversation and draft are still here." });
      try {
        const authSignInConfiguration = await readOakSignInConfiguration();
        if (version === authStatusVersion && conversationId === state.conversationId) update({ authSignInConfiguration });
      } catch {
        if (version === authStatusVersion && conversationId === state.conversationId)
          update({ authSignInConfiguration: null, authError: "Sign-in could not load. Your conversation and draft are still here." });
      }
    } else if (state.authOpen)
      update({ authError: "Sign-in could not be checked. Your conversation and draft are still here." });
  }
}

export function beginOakSignIn() {
  if (!admitOakInteraction()) return;
  const configuration = state.authSignInConfiguration ?? state.authStatus;
  if (active || state.authPending || !configuration?.configured) return;
  closeOakVoiceInput();
  if (!saveOakAuthHandoff(state)) {
    update({ authError: "This browser could not retain your conversation for sign-in. Copy anything you want to keep before trying again." });
    return;
  }
  update({ authOpen: true, authError: null });
  if (!state.authOpen) return;
  if (state.authStatus?.kind === "account" && !state.authReauthenticate && state.authStatus.publishableKey) {
    const version = ++authContinuationVersion;
    update({ authPending: true });
    void resumeOakAccount(state.authStatus.publishableKey).then(() => {
      if (version === authContinuationVersion) update({ authPending: false });
    }).catch((error: unknown) => {
      if (version !== authContinuationVersion) return;
      if (error instanceof Error && error.message === "unavailable")
        update({ authPending: false, authError: "Sign-in could not be checked. Your conversation and draft are still here." });
      else update({ authPending: false, authReauthenticate: true, authError: "Sign in again to continue. Your conversation and draft are still here." });
    });
  }
}

export function closeOakSignIn() {
  if (state.authPending) return;
  authContinuationVersion++;
  clearOakAuthHandoff();
  update({ authOpen: false, authError: null });
}

/**
 * R11: signs the account out of this browser from the account menu. The conversation belonged to the account, so it
 * clears like a new chat (ChatGPT, Claude), and the workspace reads its guest status again.
 */
/** Resolves true once the account is signed out and this tab is a fresh guest. */
export async function signOutOak(): Promise<boolean> {
  if (!admitOakInteraction() || active || state.authPending || state.authStatus?.kind !== "account") return false;
  const publishableKey = state.authStatus.publishableKey;
  const version = ++authContinuationVersion;
  update({ authPending: true, authError: null });
  try { await signOutOakAccount(publishableKey); }
  catch {
    // R11 review: Clerk can finish signing out and still trip the SDK timeout; then the account is gone, so carry on.
    if (getOakAccountContext().authenticated) {
      if (version === authContinuationVersion) update({ authPending: false, authError: "Sign-out could not finish. Try again." });
      return false;
    }
  }
  clearOakConversation();
  update({ authStatus: null, authReauthenticate: false, authSignInConfiguration: null, startersFrozen: false });
  void refreshOakAuthStatus();
  return true;
}

export async function completeOakAccount(input: Omit<OakAuthContinuation, "conversationId">) {
  if (!admitOakInteraction()) return;
  if (active || state.authPending || state.authStatus?.kind !== "account") return;
  const version = ++authContinuationVersion;
  const conversationId = state.conversationId;
  update({ authPending: true, authError: null });
  try {
    const authStatus = await continueOakAccount({ ...input, ...(conversationId ? { conversationId } : {}) });
    if (version !== authContinuationVersion || conversationId !== state.conversationId) return;
    if (authStatus.phase !== "ready") throw new Error("continuation-incomplete");
    if (conversationId) await getOakDocumentsController().resumeAccountContinuation({ conversationId, accountEpoch: getOakAccountContext().epoch });
    if (version !== authContinuationVersion || conversationId !== state.conversationId) return;
    authStatusVersion++;
    clearOakAuthHandoff();
    update({ authStatus, authOpen: false, authPending: false, authError: null, authReauthenticate: false });
    showOakToast("signed-in");
  } catch {
    if (version === authContinuationVersion && conversationId === state.conversationId)
      update({ authPending: false, authError: "Your account could not continue this conversation yet. Keep the draft and try Continue again when ready." });
  }
}

async function resumeOakAuthHandoff() {
  const retained = readOakAuthHandoff();
  if (!retained) return;
  if (!isOakViewportSupported()) {
    update({ ...retained, authOpen: false, viewportSupported: false, viewportNotice: true });
    return;
  }
  const version = ++authContinuationVersion;
  const conversationId = retained.conversationId ?? null;
  const current = () => version === authContinuationVersion && conversationId === state.conversationId && state.presentation === "human-agent";
  update({ ...retained, authOpen: true, presentation: "human-agent", pending: false, progress: "", activity: null, error: null });
  await refreshOakAuthStatus();
  if (!current()) return;
  const status = state.authStatus;
  if (!status?.configured || !status.publishableKey) return;
  // A guest who reloaded mid sign-in never had a session to lose: the sign-in simply carries on, as "Continue with an account".
  // The mounted sign-in reopens (authOpen) and reports a provider redirect's new session itself; probing here would load the
  // account SDK and commit this tab to the account path for a guest who has no session (D69 review).
  if (status.kind === "guest") return;
  try {
    await resumeOakAccount(status.publishableKey);
    if (!current()) return;
    await refreshOakAuthStatus();
  } catch {
    if (current()) update({ authReauthenticate: true, authError: "Sign in again to continue. Your conversation and draft have been retained." });
  }
}

export async function openOakVoiceInput() {
  if (!admitOakInteraction()) return;
  if (active || state.roleDraft || state.questionDraft || state.presentation !== "human-agent") return;
  cancelVoiceWork();
  const request = new AbortController(); voiceStatusRequest = request;
  update({ voiceOpen: true, voiceConfiguration: checkingVoiceConfiguration });
  const timer = setTimeout(() => request.abort(), 5000);
  try {
    const configuration = await readOakVoiceConfiguration(request.signal);
    if (voiceStatusRequest !== request || request.signal.aborted) return;
    configureOakVoice(configuration); update({ voiceConfiguration: configuration });
    if (configuration.enabled && !voiceStatusTimer) voiceStatusTimer = setInterval(() => { void refreshOakVoiceStatus(); }, 30_000);
  } catch {
    // Capacity checks never modify typed input or reveal provider errors.
  } finally {
    clearTimeout(timer);
    if (voiceStatusRequest === request) {
      voiceStatusRequest = null;
      // A failed or timed-out first read settles to "off" instead of checking forever.
      if (state.voiceOpen && state.voiceConfiguration.checking) update({ voiceConfiguration: disabledVoiceConfiguration });
    }
  }
}
async function refreshOakVoiceStatus() {
  if (!state.voiceOpen || voiceStatusRequest) return;
  const request = new AbortController(); voiceStatusRequest = request;
  const timer = setTimeout(() => request.abort(), 5000);
  try {
    const configuration = await readOakVoiceConfiguration(request.signal);
    if (voiceStatusRequest !== request || request.signal.aborted || !state.voiceOpen) return;
    configureOakVoice(configuration); update({ voiceConfiguration: configuration });
  } catch {
    // A missed refresh keeps the last status; Record re-checks its age before any upload.
  } finally { clearTimeout(timer); if (voiceStatusRequest === request) voiceStatusRequest = null; }
}
export function closeOakVoiceInput() {
  cancelVoiceWork();
  update({ voiceOpen: false, voiceConfiguration: disabledVoiceConfiguration });
}
export function useOakVoiceTranscript(text: string) {
  if (active || state.roleDraft || state.questionDraft || !state.voiceOpen || !text.trim() || text.length > voiceTranscriptCharacters) return false;
  closeOakVoiceInput();
  update({ draft: text, error: null });
  return true;
}

export function getOakResearchNeed(value = state) {
  if (value.roleDraft || value.questionDraft || getOakDocumentsController().snapshot().usedSelections.length) return null;
  // A private quote keeps the turn off public research on the Worker, so it is never offered here either (D145).
  const privateIds = quotesSend(value) ? privateDocumentRequestIds(value.messages) : null;
  if (privateIds && value.quotes.some(quote => quote.source !== undefined && privateIds.has(quote.source))) return null;
  // The Worker judges the question it receives, quote lines included, so the topic chosen here matches its answer (D139).
  const text = quotesSend(value) ? foldOakQuotes(value.quotes.map(quote => quote.text), value.draft.trim(), OAK_DRAFT_LIMIT).text : value.draft;
  return publicResearchNeed(value.draftKind, text);
}

export function beginOakQuestionDraft() {
  if (!admitOakInteraction()) return;
  if (active) return;
  closeOakVoiceInput();
  update({ questionDraft: { topic: "", goal: "" }, roleDraft: null, draft: "", draftKind: "question" });
}
export function setOakQuestionDraftInput(field: "topic" | "goal", value: string) {
  if (!state.questionDraft) return;
  const questionDraft = { ...state.questionDraft, [field]: value.slice(0, 1500) };
  const draft = `Help me draft a question for Steve.\nTopic: ${questionDraft.topic.trim()}\nWhat I want to ask: ${questionDraft.goal.trim()}`;
  update({ questionDraft, draft });
}
export function leaveOakQuestionDraft() {
  update({ questionDraft: null });
}
export function isOakDraftReady(value = state) {
  if (value.roleDraft) return oakRoleDraftError(value.roleDraft) === null;
  return Boolean((value.draft.trim() || quotesSend(value)) && value.draft.length <= OAK_DRAFT_LIMIT && (!value.questionDraft ||
    (value.questionDraft.topic.trim() && value.questionDraft.goal.trim())));
}

export function oakRoleDraftError(value: OakRoleDraft): string | null {
  if (value.requirementSource) {
    if (value.roleDescription || !documentRequirementSourceSchema.safeParse(value.requirementSource).success)
      return "Choose up to three document sections for this comparison.";
  } else {
    if (!value.roleDescription.trim()) return "Paste the role description before comparing.";
    // The limit is in bytes, so emoji or accented text reach it before 4,000 visible characters: no number here.
    if (!isValidRoleDescription(value.roleDescription)) return "The role description is too long. Shorten it a little before comparing; your text has been kept.";
  }
  if (!value.intent.trim()) return "Add what you want to compare before continuing.";
  if (value.intent.length > roleIntentMaxCharacters) return `Keep the comparison request within ${roleIntentMaxCharacters} characters. Your text has been kept.`;
  return null;
}
export function beginOakRoleDraft() {
  if (!admitOakInteraction()) return;
  if (active) return;
  closeOakVoiceInput();
  // Q16-D2: a refused comparison reopens with its own role and request, unless the visitor has typed something new.
  if (parkedRoleDraft && !state.draft.trim()) {
    const roleDraft = parkedRoleDraft; parkedRoleDraft = null;
    update({ roleDraft, questionDraft: null, draftKind: "question", error: null });
    return;
  }
  try {
    const documents = getOakDocumentTurnContext();
    if (documents) {
      const source = documentRequirementSourceSchema.safeParse({ kind: "document", sourceIds: documents.selections.map(span =>
        `visitor-document:${span.documentId}:${span.sectionId}:${span.start}-${span.end}`) });
      if (!source.success) { update({ error: "Choose up to three document sections for this comparison. Your preview stays here." }); return; }
      getOakDocumentsController().close();
      update({ roleDraft: { roleDescription: "", intent: "Compare the selected requirements with Steve’s public work.",
        requirementSource: source.data }, questionDraft: null, draft: "", draftKind: "question", error: null });
      return;
    }
  } catch (error) { update({ error: oakDocumentFailure(error) }); return; }
  // A pasted job post carries into the role description; a chat question stays in the message box (M5 hiring minor 4).
  const carried = oakLooksLikeJobPost(state.draft);
  update({ roleDraft: { roleDescription: carried ? state.draft.trim() : "", intent: "Compare this role with Steve's supported experience." }, questionDraft: null,
    ...(carried ? { draft: "", draftKind: "question" as const } : {}), error: null });
}
export function setOakRoleDraftInput(field: "roleDescription" | "intent", value: string) {
  if (!state.roleDraft || active) return;
  // Keep exact visitor input. A byte limit blocks dispatch instead of cutting text.
  update({ roleDraft: { ...state.roleDraft, [field]: value }, error: null });
}
export function leaveOakRoleDraft() {
  // Q16-D2: a refused comparison keeps its role in its own panel; the long post never lands in the message box.
  if (!active && refusedRoleDraft && state.roleDraft) {
    parkedRoleDraft = state.roleDraft; refusedRoleDraft = null;
    update({ roleDraft: null, error: null });
    return;
  }
  // An unsent role description goes back to the message box, so leaving never loses typing.
  if (!active) update({ roleDraft: null, error: null, ...(state.roleDraft?.roleDescription.trim() && !state.draft ? { draft: state.roleDraft.roleDescription } : {}) });
}
export function beginOakAdviceDraft() {
  if (!admitOakInteraction()) return;
  // The typed question becomes the advice question; advice reads the same message box.
  if (!active) { closeOakVoiceInput(); update({ draftKind: "advice", questionDraft: null, roleDraft: null, error: null }); }
}
export function leaveOakAdviceDraft() {
  if (!active) update({ draftKind: "question" });
}
export function declineOakContactOffer() {
  update({ contactPreference: "declined", contactNotice: "Got it. I’ll leave contact suggestions there." });
}

/** References are options from validated public output, never silently selected. */
export function getOakBriefReferences(value = state): readonly PublicCitation[] {
  const references = value.messages.flatMap(message => {
    const answer = message.answer;
    const claims = answer?.kind === "role-fit" ? answer.rows.flatMap(row => row.evidence) :
      answer?.kind === "sourced" || answer?.kind === "gap" ? answer.claims : answer?.kind === "advice" ? answer.evidence : [];
    return claims.flatMap(claim => claim.citations).filter(validBriefReference);
  });
  return [...new Map(references.map(reference => [briefReferenceKey(reference), reference])).values()];
}
export function openOakContactBrief() {
  if (!admitOakInteraction()) return;
  closeOakVoiceInput();
  // Q06: a new brief opens with the visitor's own words from this chat; one already started keeps what they wrote.
  const draft = state.briefDraft ?? emptyOakContactBrief();
  const seed = draft.goals.trim() ? "" : oakBriefSeed(state.messages, roleDescriptions);
  update({ briefDraft: seed ? { ...draft, goals: seed, needsFormat: true } : draft, briefOpen: true, briefError: null });
}
/**
 * Q06: what "What you're after" opens with. The latest compared role wins, as one line naming the role (Q16-D8: its
 * title line, trimmed, never the whole post), otherwise the visitor's latest question; nothing past the field's limit,
 * and never Oak's own words, including the Compare panel's default request.
 */
export function oakBriefSeed(messages: readonly OakConversationMessage[], roles: ReadonlyMap<string, string>): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role === "assistant" && message.answer?.kind === "role-fit") {
      const role = oakRoleTitle(roles.get(message.id) ?? "");
      if (role) return `The role I compared: ${role}`;
    }
    if (message.role === "user" && !message.privateDocumentTurn) {
      const words = (message.quoted?.text ?? message.text).trim();
      if (message.taskKind === "role-fit" && oakRoleDefaultIntents.has(words)) continue;
      if (words) return words.length <= briefInputLimits.goals ? words : "";
    }
  }
  return "";
}
/** The Compare panel's own default requests; they are Oak's words, not the visitor's (Q16-D8). */
const oakRoleDefaultIntents: ReadonlySet<string> = new Set(["Compare this role with Steve's supported experience.", "Compare the selected requirements with Steve’s public work."]);
/** Q16-D8: a pasted role's first line (usually its title), cut on a word to 120 characters. */
export function oakRoleTitle(role: string): string {
  const line = role.split(/\r?\n/).map(part => part.replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  if (line.length <= 120) return line;
  const cut = line.slice(0, 120);
  const space = cut.lastIndexOf(" ");
  return `${(space > 60 ? cut.slice(0, space) : cut).replace(/[\s,;:.\u2013-]+$/, "")}\u2026`;
}
export function closeOakContactBrief() {
  update({ briefOpen: false });
}
export function setOakContactBriefInput(field: "goals" | "constraints" | "startDateQuestion", value: string) {
  if (!state.briefDraft) return;
  update({ briefDraft: { ...state.briefDraft, [field]: value, needsFormat: true }, briefError: null });
}
export function toggleOakBriefReference(key: string) {
  if (!state.briefDraft) return;
  const selected = state.briefDraft.references;
  const existing = selected.find(reference => briefReferenceKey(reference) === key);
  if (existing) {
    update({ briefDraft: { ...state.briefDraft, references: selected.filter(reference => briefReferenceKey(reference) !== key), needsFormat: true }, briefError: null });
    return;
  }
  const reference = getOakBriefReferences().find(reference => briefReferenceKey(reference) === key);
  if (!reference || selected.length >= 4) { update({ briefError: "Choose up to four public references from this list." }); return; }
  update({ briefDraft: { ...state.briefDraft, references: [...selected, Object.freeze({ ...reference })], needsFormat: true }, briefError: null });
}
export function prepareOakContactBrief() {
  if (!admitOakInteraction()) return;
  if (!state.briefDraft) return;
  const error = oakContactBriefError(state.briefDraft);
  if (error) { update({ briefError: error }); return; }
  update({ briefDraft: { ...state.briefDraft, text: formatOakContactBrief(state.briefDraft), needsFormat: false }, briefError: null });
}
/** Undo for Start over: puts back a draft that was cleared, and only while the current one is still empty. */
export function restoreOakContactBrief(draft: OakContactBriefDraft) {
  const now = state.briefDraft;
  if (!now || now.goals || now.constraints || now.startDateQuestion || now.references.length || now.text) return;
  update({ briefDraft: draft, briefError: null });
}
export function setOakContactBriefText(text: string) {
  if (state.briefDraft) update({ briefDraft: { ...state.briefDraft, text }, briefError: null });
}

export function requestOakWorkspace(target?: HTMLElement | null) {
  if (typeof document === "undefined" || document.body.dataset.oakAgentEligible !== "true") return false;
  if (!admitOakInteraction()) return false;
  if (state.presentation === "human-agent") return true;
  opener =
    target ??
    (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
  update({ presentation: "human-agent", viewportNotice: false, viewportSupported: true });
  void refreshOakAuthStatus();
  return true;
}
/** Start fresh local session state. Saved records, traces and funding belong to other owners. */
function clearOakConversation() {
  guestRecovery?.abort(); guestRecovery = null;
  getOakDocumentsController().disposeOwned("new-conversation");
  stopOakTurn(false);
  cancelVoiceWork(true);
  roleDescriptions.clear();
  refusedRoleDraft = null; parkedRoleDraft = null;
  cancellationVersion++;
  authContinuationVersion++;
  authStatusVersion++;
  clearOakAuthHandoff();
  update({ ...clearPrivateHistory(), savedTranscriptAccountVersion: null, historyRestored: false, pageContextOff: false, conversationId: null, draft: "", quotes: [], draftKind: "question", contactPreference: "open", contactNotice: "", questionDraft: null, roleDraft: null, briefDraft: null, briefOpen: false, briefError: null, panel: null, messages: [], pending: false, progress: "", activity: null, error: null, voiceOpen: false, voiceConfiguration: disabledVoiceConfiguration, authOpen: false, authPending: false, authError: null });
}
export function startNewOakConversation() {
  if (!admitOakInteraction()) return;
  clearOakConversation();
  update({ startersFrozen: false });
  void refreshOakAuthStatus();
}
/** Explicitly abandons local guest authority. A response cannot restore the abandoned workspace. */
export async function startFreshOakGuestSession() {
  if (!admitOakInteraction() || state.presentation !== "human-agent" || active || state.authPending || guestRecovery || state.authStatus?.kind === "account" ||
    !state.authReauthenticate || !state.authSignInConfiguration?.guestRecoveryAvailable || !canRecoverOakGuestSession()) return;
  clearOakConversation();
  const controller = new AbortController(); guestRecovery = controller;
  const version = ++authContinuationVersion, statusVersion = ++authStatusVersion;
  const conversationId = state.conversationId, epoch = getOakAccountContext().epoch;
  const current = () => guestRecovery === controller && version === authContinuationVersion && statusVersion === authStatusVersion &&
    conversationId === state.conversationId && epoch === getOakAccountContext().epoch && state.presentation === "human-agent";
  update({ authStatus: null, authPending: true, authOpen: false, authReauthenticate: true, authError: null });
  try {
    const authStatus = await recoverOakGuestSession(controller.signal);
    if (!current()) return;
    update({ authStatus, authPending: false, authReauthenticate: false, authSignInConfiguration: null, authError: null });
  } catch {
    if (current()) update({ authPending: false, authError: "A fresh guest session could not start. The previous conversation and document preview were cleared. Try again explicitly or sign in." });
  } finally {
    if (guestRecovery === controller) guestRecovery = null;
    controller.abort();
  }
}
export function closeOakWorkspace() {
  if (!inlineHost || state.presentation === "human-agent") stopOakTurn();
  cancelVoiceWork();
  if (state.presentation === "human-agent")
    update({ presentation: "human-browse" });
}
function visible(element: HTMLElement | null): element is HTMLElement {
  return (
    !!element?.isConnected &&
    !element.closest("[inert], [hidden], [aria-hidden='true']") &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden"
  );
}
function competingOverlayActive() {
  return document.documentElement.dataset.menuOpen === "true" ||
    document.documentElement.dataset.contactMorphOpen === "true" ||
    document.querySelector("dialog[open]") !== null;
}
export function oakReturnFocus() {
  // An obsolete dialog exit cannot move focus out of the newly opened dialog.
  if (state.presentation === "human-agent" || competingOverlayActive()) return false;
  // The target is resolved at close, so disconnected route/menu launchers never steal focus.
  if (visible(opener)) return opener;
  for (const selector of [
    "[data-oak-workspace-launcher]",
    ".header-actions [data-oak-workspace-entry]",
    ".mobile-menu-button",
    "#main-content",
  ]) {
    const target = document.querySelector<HTMLElement>(selector);
    if (visible(target)) return target;
  }
  return false;
}

export function stopOakTurn(persistInterruption = true) {
  const run = active;
  if (!run) return;
  active = null;
  const version = ++cancellationVersion;
  // Ticket 17: Stop leaves with the turn, so a visitor's Stop returns focus to the message box rather than the page body.
  // Closing the workspace also stops the turn; by the time this runs it has left the agent view, so focus stays put.
  // On a touch screen focus stays put too, as on a touch open: no surprise keyboard over the stopped answer.
  if (persistInterruption && typeof document !== "undefined" && !window.matchMedia?.("(pointer: coarse)").matches)
    queueMicrotask(() => { if (state.presentation === "human-agent") document.getElementById?.("oak-composer-input")?.focus(); });
  // The owned server route is necessary: a local stream disconnect alone does not stop dispatch.
  void cancelOakTurn(run.turn.requestId, run.turn.conversationId).catch(() => {
    if (!active && cancellationVersion === version)
      update({
        error:
          "Stop requested. Contact Steve remains available; retry explicitly when ready.",
      });
  });
  run.controller.abort();
  if (!run.safetyAccepted) {
    update({ pending: false, progress: "", activity: null,
      messages: state.messages.filter(message => message.id !== run.messageId && message.id !== `${run.messageId}:user`),
      error: "Stopped before the spending-credential check finished. That turn was removed and will not be saved. Enter a question without credentials." });
    return;
  }
  update({
    pending: false,
    progress: "",
    activity: null,
    draft: state.draft || run.text,
    ...(run.quotes.length && !state.draft && !state.quotes.length ? { quotes: run.quotes } : {}),
    draftKind: state.draft ? state.draftKind : run.draftKind,
    roleDraft: state.roleDraft ?? run.roleDraft,
    messages: state.messages.map((message) =>
      message.id === run.messageId
        ? { ...message, state: "interrupted", steps: settleOakToolSteps(message.steps, "interrupted") }
        : message,
    ),
  });
  if (persistInterruption) void appendOakCompletedHistory();
}

export function submitOakTurn() { return submitTurn(false); }

/** The same research addressed to another request: every `external:<id>:<n>` source id and summary citation moves with it. */
function readdressedResearch(research: PublicResearchEvent, requestId: string): PublicResearchEvent {
  const moved = (id: string) => id.startsWith("external:") ? `external:${requestId}:${id.split(":").pop()}` : id;
  return { ...research, requestId, sources: research.sources.map(source => ({ ...source, sourceId: moved(source.sourceId) })),
    ...(research.synthesis ? { synthesis: { ...research.synthesis, sentences: research.synthesis.sentences.map(row => ({ ...row, cites: row.cites.map(moved) })) } } : {}) };
}
async function submitTurn(renewed: boolean): Promise<void> {
  if ((state.presentation !== "human-agent" && !(inlineHost && state.agentEligible)) || active || !admitOakInteraction()) return;
  if (getOakDocumentsController().snapshot().pending) { update({ error: "Finish or stop document preparation before sending a question." }); return; }
  if (state.authPending || state.historyPending || lifecycleBusy()) return;
  if (state.authReauthenticate || state.authStatus?.phase === "sign-in-required" || state.authStatus?.phase === "continue-required") {
    update({ authError: state.authReauthenticate || state.authStatus?.kind === "guest" ? "Sign in to continue. Your draft is still here." : "Choose a purpose and continue before sending your next question." });
    return;
  }
  // A reloaded signed-in tab has not loaded the account SDK, and its one-minute session cookie goes stale. Renew it before
  // the turn exists (an account change stops a turn in flight), so the first question after a pause never fails as
  // "Sign in again" (P15-G5 sign-off pass, 2026-10-17).
  if (!renewed && state.authStatus?.kind === "account" && !getOakAccountContext().authenticated) {
    update({ authPending: true });
    await resumeReadyAccount();
    update({ authPending: false });
    return submitTurn(true);
  }
  if (state.roleDraft) {
    const error = oakRoleDraftError(state.roleDraft);
    if (error) { update({ error }); return; }
  } else if (!isOakDraftReady()) return;
  closeOakVoiceInput();
  let documentSelection: ReturnType<typeof getOakDocumentTurnContext>;
  try { documentSelection = getOakDocumentTurnContext(); }
  catch (error) { update({ error: oakDocumentFailure(error) }); return; }
  let fundingSelection: ReturnType<typeof getOakFundingSelection>;
  try { fundingSelection = getOakFundingSelection(); }
  catch { update({ error: "Connect your account in Model funding before sending with your funds. Your draft is still here." }); return; }
  const fundingGuard = oakFundingContentGuardHeaders();
  const roleDraft = state.roleDraft;
  if (roleDraft?.requirementSource) {
    const current = documentSelection?.selections.map(span => `visitor-document:${span.documentId}:${span.sectionId}:${span.start}-${span.end}`);
    if (!current || current.length !== roleDraft.requirementSource.sourceIds.length ||
        roleDraft.requirementSource.sourceIds.some(sourceId => !current.includes(sourceId))) {
      update({ error: "The selected role text changed. Choose the document sections again before comparing. Your preview and request stay here." }); return;
    }
  }
  const draftKind = state.draftKind;
  const typed = roleDraft ? roleDraft.intent.trim() : state.draft.trim();
  // Staged quotes lead the question as quoted lines; the contract still sees one text field within its limit.
  const quotes = quotesSend(state) ? state.quotes : [];
  const folded = quotes.length ? foldOakQuotes(quotes.map(quote => quote.text), typed, OAK_DRAFT_LIMIT) : null;
  // A quote the message has no room for is never dropped or shortened quietly: everything stays staged until the visitor
  // makes room, so what is sent matches the chips they reviewed (D131, D153).
  if (folded && (folded.quotes.length < quotes.length || folded.quotes.some((quote, index) => quote !== quotes[index]!.text))) {
    update({ error: "This message is too long to keep your quotes. Shorten it or remove a quote, then send again." }); return;
  }
  const text = folded?.text ?? typed;
  // Q18 F3: "how well does Steve match this role?" typed beside a job post is a comparison, so it runs the same document
  // role-fit task as Compare this role. As a document question it took the public-only path and quoted unrelated work.
  const fitSelections = !roleDraft && draftKind === "question" && documentSelection && !quotes.length && oakAsksFit(typed) &&
    typed.length <= roleIntentMaxCharacters && oakReadsAsRole(oakSelectedText(getOakDocumentsWorkspace().documents, documentSelection.selections))
    ? documentSelection.selections : null;
  if (fitSelections && fitSelections.length > OAK_COMPARE_SECTION_LIMIT) {
    update({ error: `To compare this role, keep up to ${OAK_COMPARE_SECTION_LIMIT} sections selected in Documents, then send again. Your question is still here.` });
    return;
  }
  const fitSource = fitSelections ? documentRequirementSourceSchema.safeParse({ kind: "document", sourceIds: fitSelections.map(span =>
    `visitor-document:${span.documentId}:${span.sectionId}:${span.start}-${span.end}`) }) : null;
  // A quote taken from a private document answer keeps the new turn private as well, so later prompts never reuse that
  // text without renewed document permission (D141).
  const privateIds = privateDocumentRequestIds(state.messages);
  const privateQuote = quotes.some(quote => quote.source !== undefined && privateIds.has(quote.source));
  const privateTurn = Boolean(documentSelection) || privateQuote;
  const researchNeed = getOakResearchNeed();
  const requestId = crypto.randomUUID();
  const conversationId = state.conversationId ?? crypto.randomUUID();
  // Capture once. Navigation after dispatch cannot rewrite this turn's page/source context.
  const turn: OakChatRequest = {
    requestId,
    conversationId,
    task: roleDraft ? roleDraft.requirementSource ? { kind: "role-fit", text, requirementSource: roleDraft.requirementSource } :
      { kind: "role-fit", text, roleDescription: roleDraft.roleDescription } : fitSource?.success ? { kind: "role-fit", text, requirementSource: fitSource.data } :
      draftKind === "advice" ?
      { kind: "advice", text, contactPreference: state.contactPreference } : { kind: "question", text, contactPreference: state.contactPreference },
    funding: fundingSelection.funding,
    // v3 review: research runs without asking; only the topic id goes out, and the Worker sends that topic's fixed query.
    ...(researchNeed ? { publicResearch: { topicId: researchNeed.topicId } } : {}),
    sourceIds: state.pageContextOff ? [] : [...state.sourceIds],
    messages: oakOrdinaryModelHistory(state),
    ...(privateQuote ? { privateQuote: true as const } : {}),
    ...(folded?.quotes.length ? { quotedLines: folded.quotes.length } : {}),
  };
  // `turn` is the request in flight; a stalled call's re-ask swaps in a fresh request id while the visible turn keeps `messageId`.
  const run = { controller: new AbortController(), turn, messageId: requestId, text: typed, quotes, roleDraft, draftKind, safetyAccepted: Object.keys(fundingGuard).length === 0 };
  if (roleDraft?.roleDescription) roleDescriptions.set(requestId, roleDraft.roleDescription);
  cancellationVersion++;
  active = run;
  refusedRoleDraft = null; parkedRoleDraft = null;
  update({
    conversationId,
    // The visitor's own send names a fresh conversation and adds messages together; it must not read as opening another chat.
    ...(state.pageContextOff ? { pageContextOff: true } : {}),
    draft: "",
    ...(quotes.length ? { quotes: [] } : {}),
    draftKind: "question",
    questionDraft: null,
    roleDraft: null,
    pending: true,
    progress: "Preparing an answer",
    activity: null,
    error: null,
    // The "I'll leave contact suggestions there" note answers the decline; the next question moves past it (D131).
    contactNotice: "",
    messages: [
      ...state.messages,
      {
        id: `${requestId}:user`,
        role: "user",
        text,
        answer: null,
        cards: [],
        usage: null,
        state: "complete",
        page: state.route,
        taskKind: turn.task.kind === "role-fit" ? "role-fit" : draftKind,
        ...(privateTurn ? { privateDocumentTurn: true as const } : {}),
        ...(folded?.quotes.length ? { quoted: { quotes: folded.quotes, text: typed } } : {}),
        // Only a turn without document sections can be rebuilt from its quotes alone.
        ...(folded?.quotes.length && !documentSelection ? { quoteSources: quotes.map(quote => quote.source ?? null) } : {}),
      },
      {
        id: requestId,
        role: "assistant",
        text: "",
        answer: null,
        cards: [],
        usage: null,
        state: "pending",
        page: state.route,
        taskKind: turn.task.kind === "role-fit" ? "role-fit" : draftKind,
        ...(privateTurn ? { privateDocumentTurn: true as const } : {}),
        steps: turn.publicResearch ? [{ id: "research", operation: "research", state: "pending" }] : [],
      },
    ],
  });
  try {
    const callbacks: Parameters<typeof streamOakTurn>[2] = {
      safetyChecked: () => { if (active === run) run.safetyAccepted = true; },
      progress: (progress, activity) => {
        run.safetyAccepted = true;
        if (active === run) update({ progress, activity, messages: state.messages.map(message =>
          message.id === requestId ? { ...message, steps: advanceOakToolSteps(message.steps, activity) } : message) });
      },
      output: (output) => {
        run.safetyAccepted = true;
        if (active === run)
          update({
            ...(output.answer?.kind === "declined" ? { contactPreference: "declined" as const } : {}),
            messages: state.messages.map((message) =>
              message.id === requestId
                ? {
                    ...message,
                    ...output,
                    // After an automatic re-ask the stream answers a replacement request id; the research is re-addressed to the
                    // visible turn, its source ids and its summary's citations included, so the saved record's checks still hold
                    // (D141; ticket 83: a summary left citing the replacement ids made Save refuse the whole chat).
                    ...(output.research ? { research: readdressedResearch(output.research, requestId) } : {}),
                    ...(output.ui ? { ui: { ...output.ui, requestId } } : {}),
                    text: output.answer ? renderOakAnswer(output.answer) : "",
                  }
                : message,
            ),
          });
      },
    };
    for (let attempt = 0; ; attempt++) {
      try {
        await streamOakTurn(run.turn, run.controller.signal, callbacks, fundingSelection.visitorSession, fundingGuard,
          documentSelection ?? undefined, fundingSelection.modelReadingAcknowledgement);
        break;
      } catch (error) {
        // One automatic re-ask after a stalled model call, only on Oak's sponsorship: a visitor's own funds, selected
        // document text and a quote from a private answer never repeat without a click (D152). A stop or a newer turn ends it here.
        if (attempt > 0 || active !== run || run.controller.signal.aborted || privateTurn || fundingSelection.funding !== "sponsored" ||
            !(error instanceof Error && error.message === "model-stall")) throw error;
        run.turn = { ...run.turn, requestId: crypto.randomUUID() };
        update({ progress: "Asking again", activity: null, messages: state.messages.map(message => message.id === requestId
          ? { ...message, text: "", answer: null, cards: [], research: null, ui: null, plan: undefined, steps: restartOakToolSteps(message.steps), answeredBy: run.turn.requestId } : message) });
      }
    }
    if (active !== run) return;
    active = null;
    update({
      pending: false,
      progress: "",
      activity: null,
      messages: state.messages.map((message) =>
        message.id === requestId ? { ...message, state: "complete", steps: settleOakToolSteps(message.steps, "complete") } : message,
      ),
    });
    void appendOakCompletedHistory();
    void refreshOakAuthStatus();
  } catch (error) {
    if (error instanceof Error && error.message === "credential-in-content") {
      if (!state.messages.some(message => message.id === requestId || message.id === `${requestId}:user`)) return;
      if (active === run) { active = null; update({ pending: false, progress: "", activity: null }); }
      update({ messages: state.messages.filter(message => message.id !== requestId && message.id !== `${requestId}:user`),
        error: "Spending credentials cannot be used in questions. The rejected turn was removed and was not saved. Enter a question without the credential." });
      return;
    }
    if (active !== run) return;
    active = null;
    if (!run.safetyAccepted) {
      update({ pending: false, progress: "", activity: null,
        messages: state.messages.filter(message => message.id !== requestId && message.id !== `${requestId}:user`),
        error: "The spending-credential check could not finish. That turn was removed and will not be saved. Reconnect or enter a question without credentials." });
      return;
    }
    const failure = oakTurnFailure(error);
    const refused = oakRefusalFailures.has(failure);
    const earlier = state.messages.filter(message => message.id !== requestId && message.id !== `${requestId}:user`);
    const previous = earlier.at(-1);
    // Q16-D2: a send turned away for the same reason as the turn before it adds no new pair to the thread; the one notice
    // already says it.
    const repeat = refused && previous?.role === "assistant" && previous.state === "failed" && previous.failure === failure;
    // The visitor's words are always on screen somewhere (R4b review). A limit's first refusal keeps the question in the
    // transcript and clears the box, since sending it again meets the same limit (Q03-G5); a repeat drops its pair, so its
    // words go back to the box. Any other failure gives the question back as before.
    // R19: a blocked injection is not given back to the box either; sending it again meets the same filter.
    const restore = repeat || !(oakLimitFailures.has(failure) || failure === "injection");
    if (repeat) roleDescriptions.delete(requestId);
    if (refused && roleDraft) refusedRoleDraft = roleDraft;
    update({
      pending: false,
      progress: "",
      activity: null,
      // A role comparison keeps its own fields; its fixed intent is not the visitor's typing and never fills the message box.
      draft: state.draft || (roleDraft || !restore ? "" : typed),
      ...(restore && quotes.length && !state.draft && !state.quotes.length ? { quotes } : {}),
      draftKind: state.draft ? state.draftKind : draftKind,
      roleDraft: state.roleDraft ?? roleDraft,
      ...(error instanceof Error && error.message === "sign-in-required" ? { authReauthenticate: true } : {}),
      error:
        error instanceof Error && error.message.startsWith("model-reading-policy-") ?
          "Model terms changed or are unavailable. Review your funding connection before sending again. Your extracted preview and draft remain here." :
        error instanceof Error && ["funding-expired", "funding-reconnect-required", "visitor-session-required"].includes(error.message) ?
          "Reconnect your account in Model funding before sending selected text. Your preview and draft remain here." :
        error instanceof Error && error.message === "document-context-unavailable" ?
          "This selection is no longer authorized. Review the document before sending again. The extracted text remains here." :
        // R22 live: a blocked question's own card already says why (OakTurn); the composer does not repeat it. A blocked
        // document keeps its notice, which names the document part to remove.
        error instanceof Error && error.message === "injection-blocked-document" ? oakInjectionBlockedText.document :
        error instanceof Error && error.message === "injection-blocked-question" ? null :
        error instanceof Error && error.message === "document-selection-too-large" ?
          "Select less document text before sending again. Your full preview is retained." :
        error instanceof Error && (error.message === "purpose-required" || error.message === "continuation-required") ?
          "Continue with your account before sending another question. Your draft is still here." :
        error instanceof Error && error.message === "sign-in-required" ?
          "Sign in again to continue. Your draft is still here, and you can contact Steve." :
        error instanceof Error && error.message === "allowance-unavailable" ? oakAllowanceSpentNotice(state.authStatus?.allowance) :
        failure === "offline" ? oakOfflineNotice : failure === "unavailable" ? oakUnavailableNotice :
        failure === "unreachable" ? oakUnreachableNotice : failure === "busy" ? oakBusyNotice : failure === "paused" ? oakPausedNotice
          : failure === "budget" ? oakBudgetNotice : failure === "budget-today" ? oakBudgetTodayNotice : failure === "network" ? oakNetworkNotice : oakTurnFailedNotice,
      messages: repeat ? earlier : state.messages.map((message) =>
        message.id === requestId ? { ...message, state: "failed", steps: settleOakToolSteps(message.steps, failure === "injection" ? "blocked" : "failed"),
          ...(failure ? { failure } : {}) } : message,
      ),
    });
    if (!repeat) void appendOakCompletedHistory();
    void refreshOakAuthStatus();
    // P15 QA: the Worker gives the answer back in its cleanup step, after the error reaches us; read the count again then.
    setTimeout(() => { void refreshOakAuthStatus(); }, 2500);
  }
}

/**
 * SH3: the reply never reached the server (offline or unreachable, nothing came back). Its one Retry sits on the visitor's
 * bubble, so the error card and the trail step both drop theirs.
 */
export function oakSendNeverArrived(reply: OakConversationMessage | undefined) {
  return !!reply && reply.role === "assistant" && reply.state === "failed" && !reply.answer && !reply.text
    && (reply.failure === "offline" || reply.failure === "unreachable") && !reply.steps?.some(step => step.state === "done");
}

/**
 * Retry applies only to the latest turn and is always an explicit click. A stopped or failed turn sends its restored
 * draft; a complete question or advice answer asks the same text again and keeps any unsent draft.
 */
export function oakRetryKind(value: OakWorkspaceState, messageId: string): "resend" | "ask-again" | null {
  if (value.authReauthenticate) return null;
  const last = value.messages.at(-1);
  if (value.pending || !last || last.id !== messageId || last.role !== "assistant") return null;
  // Sending again would meet the same limit.
  if (last.failure === "allowance" || last.failure === "unavailable" || last.failure === "budget" || last.failure === "budget-today" || last.failure === "network" || last.failure === "injection") return null;
  // A role comparison resends its staged request; one reopened from a saved chat has none to rebuild (D144).
  if ((last.state === "interrupted" || last.state === "failed") && last.taskKind === "role-fit" && !value.roleDraft) return null;
  if (last.state === "interrupted" || last.state === "failed") return "resend";
  const question = value.messages.at(-2);
  return last.state === "complete" && last.taskKind !== "role-fit" && !last.privateDocumentTurn && question?.role === "user" && question.text
    ? "ask-again" : null;
}
/**
 * A starter or follow-up chip asks its question straight away. Whatever the visitor was typing comes back once the turn
 * starts. When a turn cannot start here (one is running, sign-in is needed, document sections are staged), the chip only
 * fills the message box, and the caller focuses it. Returns whether the question was sent.
 */
export function askOakSuggestion(text: string): boolean {
  const kept = { draft: state.draft, draftKind: state.draftKind, questionDraft: state.questionDraft, roleDraft: state.roleDraft }, quotes = state.quotes;
  // Staged document sections would silently join the chip's question.
  if (active || state.pending || getOakDocumentsController().snapshot().usedSelections.length) {
    update({ draft: text, draftKind: "question" }); return false;
  }
  // The chip asks its own words; staged quotes wait for the visitor's next message.
  update({ draft: text, draftKind: "question", questionDraft: null, roleDraft: null, quotes: [] });
  void submitOakTurn();
  update({ quotes });
  if (!active) { update({ questionDraft: kept.questionDraft, roleDraft: kept.roleDraft }); return false; }
  if (kept.draft.trim() || kept.questionDraft || kept.roleDraft) update(kept);
  return true;
}

/** Resends a stopped turn or asks the newest question again. Returns whether a turn started. */
export function retryOakTurn(messageId: string): boolean {
  const kind = oakRetryKind(state, messageId);
  if (kind === "resend") {
    // A failed turn put its question back in the box, but a draft typed since (or kept when a chip sent), a staged role
    // comparison or a guided question can sit there instead; Retry resends the question shown above the card and leaves
    // all of those where they were. A role comparison resends its own staged request.
    const failed = state.messages.at(-1), question = state.messages.at(-2);
    // A reopened saved chat marks only the question private, so either side counts (D143).
    const privateTurn = failed?.privateDocumentTurn || question?.privateDocumentTurn;
    const sections = getOakDocumentsController().snapshot().usedSelections.length > 0;
    // Every question resends what is shown above the card; a private document question takes its staged sections along (D144).
    if (question?.role === "user" && question.text && failed?.taskKind !== "role-fit") {
      // Document sections staged since would silently join an ordinary question.
      if (sections && !privateTurn) {
        update({ error: "Clear the selected document sections to retry this question. They stay ready for a new one." }); return false;
      }
      // Without its sections a private document question would go out as an ordinary one; quotes alone keep a turn private.
      if (privateTurn && !sections && !question.quoted) {
        update({ error: "Select the document sections again to retry this question." }); return false;
      }
      const kept = { draft: state.draft, quotes: state.quotes, draftKind: state.draftKind, questionDraft: state.questionDraft, roleDraft: state.roleDraft };
      const resend = resendOf(question);
      const sameDraft = kept.draft.trim() === resend.draft.trim() && sameQuotes(kept.quotes, resend.quotes);
      update({ ...resend, draftKind: failed?.taskKind === "advice" ? "advice" : "question", questionDraft: null, roleDraft: null });
      void submitOakTurn();
      const sent = Boolean(active);
      // A sent question leaves the box; a draft the visitor typed since, or anything that did not send, comes back.
      update(sameDraft && sent ? { questionDraft: kept.questionDraft, roleDraft: kept.roleDraft } : kept);
      return sent;
    }
    void submitOakTurn(); return Boolean(active);
  }
  // Staged document sections would silently join a repeated question.
  if (kind !== "ask-again" || getOakDocumentsController().snapshot().usedSelections.length) return false;
  const kept = { draft: state.draft, quotes: state.quotes, draftKind: state.draftKind };
  update({ ...resendOf(state.messages.at(-2)!), draftKind: state.messages.at(-1)!.taskKind === "advice" ? "advice" : "question", questionDraft: null, roleDraft: null });
  void submitOakTurn();
  const sent = Boolean(active);
  update(kept);
  return sent;
}

/** One installation per persistent workspace island, independent of mascot/audience mounting. */
export function installOakPresentationOwner() {
  const stopViewportSupport = installOakViewportSupport(() => {
    const supported = isOakViewportSupported();
    if (supported !== state.viewportSupported || (supported && state.viewportNotice))
      update({ viewportSupported: supported, viewportNotice: supported ? false : state.presentation === "human-agent" || state.viewportNotice });
  });
  const stopSavedLifecycle = savedLifecycle.install();
  let accountEpoch = getOakAccountContext().epoch;
  let accountAuthenticated = getOakAccountContext().authenticated;
  const stopAccountContext = subscribeOakAccountContext(() => {
    const context = getOakAccountContext();
    if (context.epoch === accountEpoch) return;
    accountEpoch = context.epoch;
    if (!accountAuthenticated && context.authenticated && state.authStatus?.kind === 'guest' && state.conversationId && !state.historyRestored)
      getOakDocumentsController().stageAccountContinuation({ conversationId: state.conversationId, accountEpoch: context.epoch });
    else getOakDocumentsController().disposeOwned("account-change");
    accountAuthenticated = context.authenticated;
    authStatusVersion++; authContinuationVersion++;
    guestRecovery?.abort(); guestRecovery = null;
    const changedAccount = state.savedTranscriptAccountVersion !== null && state.savedTranscriptAccountVersion !== context.accountVersion;
    const clearTranscript = changedAccount || ((state.historyRestored || state.savedSubmittedMessageIds.length > 0) && !context.authenticated);
    const submittedIds = clearTranscript ? [] : state.savedRecord ? submittedOakHistoryIds(state, state.savedRecord) : state.savedSubmittedMessageIds;
    stopOakTurn(false); cancelVoiceWork(true); clearOakAuthHandoff();
    update({ ...clearPrivateHistory(), savedSubmittedMessageIds: submittedIds, ...(clearTranscript ? { messages: [], conversationId: null, savedTranscriptAccountVersion: null, historyRestored: false,
      briefDraft: null, briefOpen: false,
      historyRevision: state.historyRevision + 1 } : {}),
      // cancelVoiceWork drops an in-flight first status read, so a checking panel settles here instead of waiting forever.
      ...(state.voiceConfiguration.checking ? { voiceConfiguration: disabledVoiceConfiguration } : {}), authPending: false,
      authReauthenticate: !context.authenticated && state.authStatus?.kind === "account",
      ...(!context.authenticated ? { authError: "Sign in again to use saved conversations. Your unsent draft is still here." } : {}) });
    void refreshOakAuthStatus();
  });
  let overlayActive = competingOverlayActive();
  const reconcileOverlay = () => {
    const next = competingOverlayActive();
    // Existing menu -> Oak entry is allowed to finish closing. Only a new overlay takes ownership.
    if (next && !overlayActive) closeOakWorkspace();
    overlayActive = next;
    if (state.overlayActive !== next) update({ overlayActive: next });
  };
  const handoffOverlay = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".oak-workspace")) return;
    if (target.closest(".mobile-menu-button, .work-grid-lightbox-trigger, .work-mdx-image-grid__media--interactive, .contact-trigger:not([data-oak-workspace-entry])")) {
      closeOakWorkspace();
    }
  };
  const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(reconcileOverlay);
  observer?.observe(document.documentElement, {
    attributes: true, subtree: true, attributeFilter: ["open", "data-menu-open", "data-contact-morph-open"],
  });
  document.addEventListener("click", handoffOverlay, true);
  const reconcile = () => {
    const agentEligible = document.body.dataset.oakAgentEligible === "true";
    const mascotEligible = document.body.dataset.oakMascotEligible === "true";
    if (!agentEligible) closeOakWorkspace();
    let sourceIds: string[] = [];
    try {
      const value: unknown = JSON.parse(
        document.body.dataset.oakSourceIds ?? "[]",
      );
      if (
        Array.isArray(value) &&
        value.every((id) => typeof id === "string" && id.length <= 240)
      )
        sourceIds = value.slice(0, 8);
    } catch {
      /* No context is safer than malformed context. */
    }
    reconcileOverlay();
    update({
      agentEligible,
      mascotEligible,
      route: window.location.pathname,
      sourceIds,
    });
  };
  const beforeSwap = (event: Event) => {
    const nextDocument = (event as Event & { newDocument?: Document })
      .newDocument;
    if (!nextDocument) return;
    const next = nextDocument.body.dataset.oakAgentEligible !== "true"
      ? "human-browse"
      : state.presentation;
    applyPresentation(nextDocument, next);
  };
  const invoke = () => requestOakWorkspace();
  reconcile();
  if (!authHandoffResumed) {
    authHandoffResumed = true;
    void resumeOakAuthHandoff();
  }
  document.addEventListener("astro:before-swap", beforeSwap);
  document.addEventListener("astro:after-swap", reconcile);
  document.addEventListener("astro:after-swap", holdOpenPageWidth);
  window.addEventListener("resize", holdOpenPageWidth);
  document.addEventListener("astro:page-load", reconcile);
  window.addEventListener(OAK_WORKSPACE_OPEN_EVENT, invoke);
  return () => {
    stopViewportSupport();
    stopSavedLifecycle();
    stopAccountContext();
    cancelVoiceWork();
    getOakDocumentsController().cancel("owner-dispose");
    observer?.disconnect();
    document.removeEventListener("click", handoffOverlay, true);
    document.removeEventListener("astro:before-swap", beforeSwap);
    document.removeEventListener("astro:after-swap", reconcile);
    document.removeEventListener("astro:after-swap", holdOpenPageWidth);
    window.removeEventListener("resize", holdOpenPageWidth);
    document.removeEventListener("astro:page-load", reconcile);
    window.removeEventListener(OAK_WORKSPACE_OPEN_EVENT, invoke);
  };
}

// The persistent island retains the browser-session conversation and draft across Astro navigation.
// Saved-account history belongs to its later account owner, never to presentation transitions.
