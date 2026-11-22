import { observeOakChatReceipt } from "./oakTelemetryClient";
import { z } from "zod";
import { OAK_READS_CONTACT_REASON, OAK_READS_HEADER, parseOakAnswer } from "../../packages/oak-agent-contracts/src/output";
import { oakAudienceOf, oakCardSchema, oakInjectionBlockedText, oakModelStallText, oakPublicUrlSchema, oakStreamStatusSchema } from "../../packages/oak-agent-contracts/src/transport";
import type { OakAnswer } from "../../packages/oak-agent-contracts/src/types";
import type { DocumentOperation, DocumentOutput } from "../../packages/oak-agent-contracts/src/documents";
import type { z as Zod } from "zod";
import type { documentSelectionSchema } from "../../packages/oak-agent-contracts/src/documents";
import { openWebResearchTopicId, publicResearchEventSchema, type PublicResearchEvent, type PublicResearchTopicId } from "../../packages/oak-agent-contracts/src/public-research";
import { getOakAccountPurpose, oakAuthorizationHeaders } from "./oakAccountClient";
import { FUNDING_SAFETY_ACK_HEADER, type VisitorFundingSession, type ModelReadingAcknowledgement } from "../../packages/oak-agent-contracts/src/funding";
import { oakFundingContentGuardHeaders } from "./oakFundingSession";
import { markOakTurnstilePassed, oakTurnstileHeaders, resetOakTurnstile } from "./oakTurnstile";
import { privateDocumentSource } from "../../packages/oak-agent-contracts/src/document-answer";
import { oakAnswerUiSchema, type OakAnswerUi } from "../../packages/oak-agent-contracts/src/openui/verdict";
import { oakAnswerPlanSchema, type OakAnswerPlan } from "../../packages/oak-agent-contracts/src/openui/plan";
import { oakStepDetailId, oakStepDetailSchema, type OakRecordPassage } from "../../packages/oak-agent-contracts/src/step-detail";
import type {
  OakCard,
  OakChatRequest,
  OakContextReading,
  OakUsage,
} from "../../packages/oak-agent-contracts/src/transport";

const firstGhosts = new Set<string>();
/** Ticket 122: the client time a turn's first plan ghost drew, once per turn, as `oak:first-ghost:<id>` (ticket 20 reads it). */
export function markOakFirstGhost(id: string) {
  if (firstGhosts.has(id) || typeof performance === "undefined") return;
  firstGhosts.add(id);
  performance.mark(`oak:first-ghost:${id}`);
}

/** R19: the Worker may add an open web search the browser did not predict, but never in place of a fixed topic it did. */
const expectedResearchTopic = (topicId: PublicResearchEvent["topicId"], predicted?: PublicResearchTopicId) =>
  topicId === predicted || (topicId === openWebResearchTopicId && !predicted);
/**
 * R19 redteam M2: the browser's own check of an open web event against the answer it sits under. Never on a document or
 * role-fit turn or under anything but a public work answer; a summary citing a claim the answer does not have is dropped,
 * keeping the sources.
 */
function openWebResearchFor(research: PublicResearchEvent | null, answer: OakAnswer | null, privateOrRoleFit: boolean): PublicResearchEvent | null {
  if (!research || research.topicId !== openWebResearchTopicId) return research;
  if (privateOrRoleFit || !answer || (answer.kind !== "sourced" && answer.kind !== "gap")) return null;
  const claims = answer.claims.length;
  const claimOk = (id: string) => !id.startsWith("claim-") || Number(id.slice(6)) <= claims;
  if (!research.synthesis || research.synthesis.sentences.every(row => row.cites.every(claimOk))) return research;
  const { synthesis: _dropped, ...sourcesOnly } = research;
  return sourcesOnly;
}

const usageSchema = z.strictObject({
  requestId: z.uuid(),
  state: z.enum(["settled", "held"]),
  actualMicroUsd: z.number().int().nonnegative(),
  heldMicroUsd: z.number().int().nonnegative(),
});
/** R10: the context-window reading a completed turn sends beside its receipt. */
const contextSchema = z.strictObject({
  requestId: z.uuid(),
  conversationBytes: z.number().int().nonnegative(),
  limitBytes: z.number().int().positive(),
  inputTokens: z.number().int().nonnegative(),
});
export type OakReceived = Readonly<{
  answer: OakAnswer | null;
  cards: OakCard[];
  usage: OakUsage | null;
  research: PublicResearchEvent | null;
  /** Q17: the arranged layout, reconciled in place as it streams; absent when the switch is off or the answer has none. */
  ui?: OakAnswerUi | null;
  /** Ticket 17: the blocks the Worker planned for this answer, in order; absent from an old Worker or when its part fails its checks. */
  plan?: OakAnswerPlan;
  /** R10: how full this turn's prompt was; absent until the Worker sends one. Advisory, so a bad reading never fails the turn. */
  context?: OakContextReading | null;
}>;
export type OakVisibleActivity = Readonly<
  // `step` is the Worker's model step (1-based), so a tool's end pairs with its own start.
  | { kind: "tool"; operation: "read" | "search" | "navigate" | "draft"; phase: "started"; step: number }
  // A finished tool step; `count` is how many passages it returned, present only when the Worker sends one.
  | { kind: "tool"; operation: "read" | "search" | "navigate" | "draft"; phase: "completed"; step: number; count?: number }
  | { kind: "research"; phase: PublicResearchEvent["phase"] }
  // The Worker's own turn phases: the stream opened, then each model step began (1-based).
  | { kind: "model"; phase: "started" }
  | { kind: "model"; phase: "step"; step: number }
  // The model's own reasoning summary so far, one block per titled summary.
  | { kind: "thought"; step: number; block: number; title: string; text: string }
  // Ticket 26: the passages a finished search or read step read; only `more` past the five shown.
  | { kind: "peek"; operation: "search" | "read"; step: number; passages: readonly OakRecordPassage[]; more: number }
> | null;
export type OakTransportCallbacks = {
  safetyChecked?: () => void;
  output: (value: OakReceived) => void;
  progress: (label: string, activity: OakVisibleActivity) => void;
};
export type OakDocumentTurnSelection = Readonly<{
  operation: DocumentOperation; outputs: DocumentOutput[];
  selections: Zod.infer<typeof documentSelectionSchema>[];
}>;

/** Rendering validates private citations against the exact selected document set. */
function validPrivateAnswer(answer: OakAnswer, documents?: OakDocumentTurnSelection, requiredSourceIds?: readonly string[]) {
  const citations = answer.kind === "document" ? answer.claims.map(claim => ({ citation: claim.citation, text: claim.quote })) :
    answer.kind === "role-fit" && answer.coverage ? answer.rows.map(row => ({ citation: row.requirement.source, text: row.requirement.text })) : [];
  if (!citations.length) return true;
  if (!documents) return false;
  const coverage = answer.kind === "document" || answer.kind === "role-fit" ? answer.coverage : undefined;
  const included = documents.selections.reduce((sum, span) => sum + span.end - span.start, 0);
  const available = documents.outputs.reduce((sum, output) => sum + output.text.length, 0);
  const complete = documents.selections.every(span => documents.outputs.find(output => output.documentId === span.documentId)?.extractionCompleteness === "complete");
  if (!coverage || coverage.includedUtf16 !== included || coverage.availableUtf16 !== available ||
      coverage.omittedUtf16 !== available - included || coverage.extractionCompleteness !== (complete ? "complete" : "unknown")) return false;
  return citations.every(({ citation, text }) => {
    if (!citation) return false;
    const source = privateDocumentSource(citation.sourceId);
    const output = documents.outputs.find(item => item.documentId === source?.documentId);
    const selected = documents.selections.some(span => span.documentId === source?.documentId && span.sectionId === source.sectionId &&
      span.start === source.start && span.end === source.end);
    const boundary = (index: number) => !output || !(index > 0 && index < output.text.length &&
      /[\uD800-\uDBFF]/.test(output.text[index - 1]!) && /[\uDC00-\uDFFF]/.test(output.text[index]!));
    return !!source && !!output && selected && citation.label === `Document ${Math.min(...output.slots) + 1}` &&
      (!requiredSourceIds || requiredSourceIds.includes(citation.sourceId)) && boundary(citation.start) && boundary(citation.end) &&
      output.text.slice(citation.start, citation.end) === text;
  });
}

/** Exported for the P03-G7 breaker test. */
export async function chatRejection(response: Response, funding: OakChatRequest["funding"]): Promise<string> {
  if (response.status === 401) { void response.body?.cancel().catch(() => {}); return "sign-in-required"; }
  // 429 is the visitor's own answers being used, a short pause on new questions after recent turns failed, or this
  // month's sponsored budget being spent (never the visitor's doing). A pricing breach on the visitor's own account is
  // not Oak's budget, so it reads as a plain failure there.
  if (response.status === 429) {
    const code = await response.text().then(text => z.strictObject({ error: z.string().max(64), resetsAt: z.iso.datetime().optional() }).safeParse(JSON.parse(text)), () => null).catch(() => null);
    const reason = code?.success ? code.data.error : null;
    return reason === "attempt-rate-limited" ? "attempts-paused"
      : reason === "pricing-envelope-breached" && funding === "visitor" ? "answer-unavailable"
      // Today's sponsored pool is spent: answers return at the next UTC day, not next month.
      : reason === "budget-paused" ? "sponsor-budget-paused-today"
      // P03-G2: this network address has used its own daily share; other visitors elsewhere are unaffected.
      : reason === "network-allowance" ? "network-limit-today"
      : reason === "budget-exhausted" || reason === "pricing-envelope-breached" ? "sponsor-budget-paused" : "allowance-unavailable";
  }
  // The agent never answers these itself; they mean no agent route exists behind this site (static host). A 502 or 504 can
  // come from a proxy in front of a live agent, so those keep the ordinary failure and its Retry.
  if ([404, 405, 501].includes(response.status)) { void response.body?.cancel().catch(() => {}); return "agent-unavailable"; }
  // A gateway that could not reach the agent: nothing ran, and asking again in a moment usually works.
  if ([500, 502, 504].includes(response.status)) { void response.body?.cancel().catch(() => {}); return "agent-unreachable"; }
  // P03-G7: the edge spend breaker blocks /api/oak/* with Cloudflare's HTML 403 before the Worker runs (custom responses
  // need a paid WAF plan). The Worker's own 403s are always JSON, so an HTML 403 means the sponsored agent is paused.
  if (response.status === 403 && !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    void response.body?.cancel().catch(() => {}); return "sponsor-budget-paused";
  }
  if (![400, 403, 409, 503].includes(response.status) || !response.body) { void response.body?.cancel().catch(() => {}); return "answer-unavailable"; }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 3000);
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024) break;
      text += decoder.decode(part.value, { stream: true });
    }
    if (bytes > 1024) return "answer-unavailable";
    const codes = response.status === 400 ? ["credential-in-content", "visitor-session-required", "document-context-unavailable"] :
      response.status === 403 ? ["invalid-identity", "sign-in-required", "conversation-owner", "purpose-required", "continuation-required", "turnstile-required"] :
      response.status === 409 ? ["model-reading-policy-changed", "funding-expired", "funding-reconnect-required"] : ["model-reading-policy-unavailable"];
    const parsed = z.strictObject({ error: z.enum(codes) }).safeParse(JSON.parse(text + decoder.decode()));
    if (parsed.success && parsed.data.error === "turnstile-required") resetOakTurnstile();
    // A linked guest cookie or a conversation owned by an account both ask the visitor to sign in again.
    return parsed.success ? ["invalid-identity", "sign-in-required", "conversation-owner"].includes(parsed.data.error) ? "sign-in-required" : parsed.data.error : "answer-unavailable";
  } catch { return "answer-unavailable"; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function parseOakOutput(
  parts: readonly { type: string; id?: string; data?: unknown }[],
  requestId: string,
  roleDescription?: string,
  researchTopic?: PublicResearchTopicId,
  documents?: OakDocumentTurnSelection,
  requiredSourceIds?: readonly string[],
): OakReceived {
  let answer: OakAnswer | null = null,
    usage: OakUsage | null = null;
  const cards: OakCard[] = [];
  let research: PublicResearchEvent | null = null;
  let ui: OakAnswerUi | null = null;
  let plan: OakAnswerPlan | null = null;
  let context: OakContextReading | null = null;
  for (const part of parts) {
    if (part.type === "data-answer") {
      const parsed = parseOakAnswer(part.data);
      if (
        !parsed ||
        !validPrivateAnswer(parsed, documents, requiredSourceIds) ||
        (parsed.kind === "role-fit" && !parsed.coverage && (!roleDescription || parsed.rows.some(row =>
          roleDescription.slice(row.requirement.start, row.requirement.end) !== row.requirement.text))) ||
        ((parsed.kind === "sourced" || parsed.kind === "gap") &&
          parsed.claims.some((claim) =>
            claim.citations.some(
              (citation) => !oakPublicUrlSchema.safeParse(citation.url).success,
            ),
          ))
      )
        throw new Error("invalid-output");
      answer = parsed;
    } else if (part.type === "data-card") {
      const parsed = oakCardSchema.safeParse(part.data);
      if (!parsed.success || cards.length >= 4)
        throw new Error("invalid-output");
      cards.push(parsed.data);
    } else if (part.type === "data-research") {
      const parsed = publicResearchEventSchema.safeParse(part.data);
      if (!parsed.success || parsed.data.requestId !== requestId.toLowerCase() || !expectedResearchTopic(parsed.data.topicId, researchTopic) ||
          (research && research.phase !== "started")) throw new Error("invalid-output");
      research = parsed.data;
    } else if (part.type === "data-ui") {
      // A layout only ever describes the answer already received; one without it is dropped, never trusted.
      const parsed = oakAnswerUiSchema.safeParse(part.data);
      if (!parsed.success || parsed.data.requestId !== requestId) throw new Error("invalid-output");
      ui = answer ? parsed.data : null;
    } else if (part.type === "data-usage") {
      const parsed = usageSchema.safeParse(part.data);
      if (!parsed.success || parsed.data.requestId !== requestId)
        throw new Error("invalid-output");
      usage = parsed.data;
    } else if (part.type === "data-context") {
      const parsed = contextSchema.safeParse(part.data);
      if (parsed.success && parsed.data.requestId === requestId) context = parsed.data;
    } else if (part.type === "data-plan") {
      // Only ghosts hang on a plan, so one for another turn or out of contract is dropped and the answer still arrives.
      const parsed = oakAnswerPlanSchema.safeParse(part.data);
      if (parsed.success && part.id === `${requestId}:plan`) plan = parsed.data;
    }
  }
  research = openWebResearchFor(research, answer, !!documents || !!roleDescription);
  return { answer, cards, usage, research, ...(ui ? { ui } : {}), ...(plan ? { plan } : {}), ...(context ? { context } : {}) };
}

/** The SDK validates SSE framing; application contracts validate the renderable parts. */
export async function streamOakTurn(
  turn: OakChatRequest,
  signal: AbortSignal,
  callbacks: OakTransportCallbacks,
  visitorSession?: VisitorFundingSession,
  fundingGuard?: Readonly<Record<string, string>>,
  documents?: OakDocumentTurnSelection,
  modelReadingAcknowledgement?: ModelReadingAcknowledgement,
) {
  const contentGuard = Object.freeze({ ...(fundingGuard ?? oakFundingContentGuardHeaders()) });
  const { parseJsonEventStream, uiMessageChunkSchema, readUIMessageStream } =
    await import("ai");
  // Q08: the visitor's own account purpose shapes the answer's emphasis; a guest sends none.
  const audience = turn.audience ?? oakAudienceOf(getOakAccountPurpose());
  const envelope = { turn: audience ? { ...turn, audience } : turn, ...(visitorSession ? { visitorSession } : {}),
    ...(modelReadingAcknowledgement ? { modelReadingAcknowledgement } : {}) };
  const documentQuery = documents ? new URLSearchParams({
    conversationId: turn.conversationId, submissionId: documents.operation.submissionId,
    generation: String(documents.operation.generation),
  }) : null;
  const send = async (fresh: boolean) => {
    const authorization = await oakAuthorizationHeaders(fresh);
    return { authorization, response: await fetch(documentQuery ? `/api/oak/chat/documents?${documentQuery}` : "/api/oak/chat", {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: {
        ...authorization,
        ...contentGuard,
        ...oakTurnstileHeaders(),
        [OAK_READS_HEADER]: OAK_READS_CONTACT_REASON,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(documents ? { envelope, outputs: documents.outputs, selections: documents.selections } : envelope),
    }) };
  };
  // 195: a session token can expire while the tab idles. The Worker's 401 comes before anything runs, so an account send whose
  // token was rejected (invalid-session) gets one fresh token and goes again; only a failed refresh reaches the sign-in notice.
  // 202: a token wait that failed on a live session ("unavailable") gets the same one retry.
  let sent = await send(false).catch((error: unknown) => {
    if (error instanceof Error && (error.message === "sign-in-required" || error.message === "unavailable")) return null;
    throw error;
  });
  if (!sent || (sent.authorization.Authorization && sent.response.status === 401 &&
    await sent.response.json().then((body: { error?: unknown } | null) => body?.error === "invalid-session", () => false))) {
    signal.throwIfAborted();
    sent = await send(true);
  }
  const { authorization, response } = sent;
  if (response.headers.get(FUNDING_SAFETY_ACK_HEADER) === "checked") callbacks.safetyChecked?.();
  if (response.ok) markOakTurnstilePassed();
  if (!response.ok || !response.body) throw new Error(await chatRejection(response, turn.funding));
  if (
    response.headers.get("X-Oak-Request-Id") !== turn.requestId ||
    response.headers.get("x-vercel-ai-ui-message-stream") !== "v1"
  )
    throw new Error("invalid-output");
  let finished = false,
    output: OakReceived = { answer: null, cards: [], usage: null, research: null };
  // A stall is reported once the stream ends: the Worker settles the stalled call's reservation after sending the stall,
  // so a re-ask sent before then would be counted against the slot it still holds (one answer left reads as none).
  let researchTerminalReceived = false, telemetryReceiptReceived = false, stalled = false;
  const chunks = parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) throw new Error("invalid-output");
        const value = chunk.value;
        if (value.type === "data-telemetry-receipt") {
          if (!documents && !signal.aborted && value.transient === true && !telemetryReceiptReceived) {
            telemetryReceiptReceived = true;
            observeOakChatReceipt(value.data, authorization);
          }
          return; // Receipt data never reaches SDK message parts, render output or saved history.
        }
        if (value.type === "error" && value.errorText === "Select less document text before sending again. Your full preview is retained.")
          throw new Error("document-selection-too-large");
        if (value.type === "error" && value.errorText === oakModelStallText) { stalled = true; return; }
        if (value.type === "error" && value.errorText === oakInjectionBlockedText.document) throw new Error("injection-blocked-document");
        if (value.type === "error" && value.errorText === oakInjectionBlockedText.question) throw new Error("injection-blocked-question");
        if (value.type === "data-status") {
          const status = oakStreamStatusSchema.safeParse(value.data);
          if (!status.success || status.data.requestId !== turn.requestId)
            throw new Error("invalid-output");
          const activity = status.data;
          if (activity.phase === "thought") {
            callbacks.progress(activity.title || "Thinking it through",
              { kind: "thought", step: activity.step, block: activity.block, title: activity.title, text: activity.text });
            return; // Transient: never part of the message, saved history or model context.
          }
          const starts = { search: "Searching public sources", read: "Reading a public passage", navigate: "Preparing a source link", draft: "Preparing an editable draft" };
          const ends = { search: "Public search complete", read: "Public passage read", navigate: "Source link ready", draft: "Editable draft ready" };
          callbacks.progress(activity.phase === "tool-start" ? starts[activity.operation] :
            activity.phase === "tool-end" ? ends[activity.operation] :
              activity.phase === "model-start" && activity.step > 1 ? "Weighing what I found" : "Reading your question",
          activity.phase === "tool-start" ? { kind: "tool", operation: activity.operation, phase: "started", step: activity.step } :
            activity.phase === "tool-end" ? { kind: "tool", operation: activity.operation, phase: "completed", step: activity.step, ...(activity.count === undefined ? {} : { count: activity.count }) } :
              activity.phase === "model-start" ? { kind: "model", phase: "step", step: activity.step } : { kind: "model", phase: "started" });
        }
        if (value.type === "start" && value.messageId !== turn.requestId)
          throw new Error("invalid-output");
        if (value.type === "data-step-detail") {
          // Ticket 26: only a peek hangs on this part, so one out of contract or for another turn or step is dropped, never fatal.
          const detail = oakStepDetailSchema.safeParse(value.data);
          if (detail.success && detail.data.requestId === turn.requestId && value.id === oakStepDetailId(turn.requestId, detail.data.step))
            callbacks.progress(detail.data.operation === "search" ? "Public search complete" : "Public passage read",
              { kind: "peek", operation: detail.data.operation, step: detail.data.step, passages: detail.data.passages, more: detail.data.more });
          return;
        }
        if (value.type === "data-research") {
          const research = publicResearchEventSchema.safeParse(value.data);
          if (!research.success || research.data.requestId !== turn.requestId.toLowerCase() || !expectedResearchTopic(research.data.topicId, turn.publicResearch?.topicId) ||
              value.id !== `${turn.requestId}:research` || researchTerminalReceived)
            throw new Error("invalid-output");
          researchTerminalReceived = research.data.phase !== "started";
          callbacks.progress(research.data.phase === "started" ? "Checking current public sources" :
            research.data.phase === "completed" ? "Current public sources checked" :
              research.data.phase === "partial" ? "Some current public sources could not be read" :
                research.data.phase === "zero-results" ? "No current public sources found" : "Current public research unavailable",
          { kind: "research", phase: research.data.phase });
        }
        if (value.type === "data-ui" && value.id !== `${turn.requestId}:ui`) throw new Error("invalid-output");
        if (value.type === "finish") finished = value.finishReason === "stop";
        controller.enqueue(value);
      },
    }),
  );
  for await (const message of readUIMessageStream({
    stream: chunks,
    terminateOnError: true,
  })) {
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    output = parseOakOutput(message.parts, turn.requestId,
      turn.task.kind === "role-fit" && "roleDescription" in turn.task ? turn.task.roleDescription : undefined,
      turn.publicResearch?.topicId, documents,
      turn.task.kind === "role-fit" && "requirementSource" in turn.task ? turn.task.requirementSource.sourceIds : undefined);
    callbacks.output(output);
  }
  if (stalled) throw new Error("model-stall");
  if (!finished || !output.answer || output.research?.phase === "started") throw new Error("answer-unavailable");
  return output;
}

export async function cancelOakTurn(requestId: string, conversationId: string) {
  const response = await fetch("/api/oak/cancel", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...await oakAuthorizationHeaders() },
    body: JSON.stringify({ requestId, conversationId }),
  });
  if (response.status !== 202) throw new Error("cancel-unconfirmed");
}
