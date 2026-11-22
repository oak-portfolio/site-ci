import type { OakVisibleActivity } from "./oakWorkspaceTransport";
import type { OakCard } from "../../packages/oak-agent-contracts/src/transport";
import type { PublicResearchEvent } from "../../packages/oak-agent-contracts/src/public-research";
import type { OakAnswer } from "../../packages/oak-agent-contracts/src/types";
import type { OakRecordPassage } from "../../packages/oak-agent-contracts/src/step-detail";

export type OakToolOperation = "search" | "read" | "navigate" | "draft" | "research";
/**
 * Thinking between tool calls. `understand` opens with the Worker's stream and `weigh` starts with each later model step;
 * `compose` and `verify` close a turn only once a validated answer has landed.
 */
export type OakThoughtOperation = "understand" | "weigh" | "think" | "compose" | "verify";
/** `retry` marks a stalled model call that Oak asked again on its own; it is never a tool and never a thought. */
export type OakStepOperation = OakToolOperation | OakThoughtOperation | "retry";
export type OakToolStepState = "pending" | "running" | "done" | "error";
/**
 * One step in a turn. Only the operation, state and client clock times are stored; visible text is derived from the turn,
 * except a `think` step, which carries the model's own reasoning summary as it streamed in.
 */
export type OakToolStep = Readonly<{ id: string; operation: OakStepOperation; state: OakToolStepState; startedAt?: number; endedAt?: number;
  thought?: Readonly<{ title: string; text: string }>;
  /** genui 11: passages the finished tool step returned, from its `tool-end` count; absent when the Worker sent none. */
  count?: number;
  /** Ticket 26: the passages a search or read step read, at most five, and how many more it read; absent when the Worker sent none. */
  passages?: readonly OakRecordPassage[];
  more?: number;
  /** genui 11: the Worker's model step a tool ran in, so its end closes its own row. */
  modelStep?: number }>;

const thoughtOperations: ReadonlySet<OakStepOperation> = new Set<OakStepOperation>(["understand", "weigh", "think", "compose", "verify"]);
export function isOakThought(operation: OakStepOperation): operation is OakThoughtOperation {
  return thoughtOperations.has(operation);
}

const finish = (step: OakToolStep, state: OakToolStepState, now: number): OakToolStep => ({ ...step, state, endedAt: step.endedAt ?? now });
/** A tool call or a new model step ends whatever thinking was running. */
const endThinking = (steps: readonly OakToolStep[], now: number) =>
  steps.map(step => step.state === "running" && isOakThought(step.operation) ? finish(step, "done", now) : step);

/**
 * Folds one transport activity into a turn's steps. The stream opening starts "reading your question"; a tool start opens a
 * running row and its end closes the oldest open row of that operation; a later model step after a tool starts "weighing".
 */
export function advanceOakToolSteps(steps: readonly OakToolStep[] = [], activity: OakVisibleActivity, now = Date.now()): readonly OakToolStep[] {
  if (!activity) return steps;
  if (activity.kind === "peek") {
    const row = steps.findIndex(step => step.operation === activity.operation && step.modelStep === activity.step && !step.passages);
    return row < 0 ? steps : steps.map((step, index) => index === row ? { ...step, passages: activity.passages, more: activity.more } : step);
  }
  if (activity.kind === "thought") {
    const id = `think-${activity.block}`;
    // An empty block is the Worker taking a thought back: it turned out to be about the answer's own machinery.
    if (!activity.title && !activity.text) return steps.filter(step => step.id !== id);
    const thought = { title: activity.title, text: activity.text };
    if (steps.some(step => step.id === id)) return steps.map(step => step.id === id ? { ...step, thought } : step);
    // A real thought replaces the generic "weighing" placeholder and ends whatever thinking ran before it.
    const rest = endThinking(steps.filter(step => !(step.operation === "weigh" && step.state === "running")), now);
    return [...rest, { id, operation: "think", state: "running", startedAt: now, thought }];
  }
  if (activity.kind === "model") {
    if (activity.phase === "started") return steps.some(step => step.operation === "understand") ? steps
      : [...steps.filter(step => step.operation === "retry"), { id: "understand", operation: "understand", state: "running", startedAt: now },
        ...steps.filter(step => step.operation !== "retry")];
    const thinking = steps.some(step => step.state === "running" && isOakThought(step.operation));
    const toolRan = steps.some(step => !isOakThought(step.operation) && step.operation !== "research" && step.operation !== "retry");
    if (activity.step <= 1 || thinking || !toolRan) return steps;
    return [...steps, { id: `weigh-${steps.length}`, operation: "weigh", state: "running", startedAt: now }];
  }
  if (activity.kind === "research") {
    const next: OakToolStepState = activity.phase === "started" ? "running" : activity.phase === "blocked" || activity.phase === "failed" ? "error" : "done";
    const timed = (step: OakToolStep): OakToolStep => next === "running" ? { ...step, state: next, startedAt: step.startedAt ?? now } : finish({ ...step, startedAt: step.startedAt ?? now }, next, now);
    return steps.some(step => step.operation === "research")
      ? steps.map(step => step.operation === "research" ? timed(step) : step)
      : [...steps, timed({ id: "research", operation: "research", state: next })];
  }
  if (activity.phase === "started") return [...endThinking(steps, now), { id: `${activity.operation}-${steps.length}`, operation: activity.operation, state: "running", startedAt: now,
    ...(activity.step === undefined ? {} : { modelStep: activity.step }) }];
  // A failed tool sends no end, so an end closes the open row from its own model step; a row without one (a stored
  // fixture) falls back to the oldest open row of that operation. Two calls in one model step still pair oldest first.
  const running = (step: OakToolStep) => step.operation === activity.operation && step.state === "running";
  const own = steps.findIndex(step => running(step) && step.modelStep === activity.step);
  const open = own >= 0 ? own : steps.findIndex(step => running(step) && step.modelStep === undefined);
  const count = activity.count;
  return open < 0 ? steps : steps.map((step, index) => index === open ? finish(count === undefined ? step : { ...step, count }, "done", now) : step);
}

/**
 * A stalled model call that Oak asks again: the stalled attempt's rows fold into one finished "asked again" row that keeps the
 * attempt's clock, so the header time stays honest. Rows that never started, such as consented research, wait for the new attempt.
 */
export function restartOakToolSteps(steps: readonly OakToolStep[] = [], now = Date.now()): readonly OakToolStep[] {
  const started = steps.flatMap(step => step.startedAt === undefined ? [] : [step.startedAt]);
  return [{ id: "retry", operation: "retry", state: "done", startedAt: started.length ? Math.min(...started) : now, endedAt: now },
    ...steps.filter(step => step.state === "pending")];
}

/**
 * A finished turn closes its open rows and drops rows that never started. When the Worker's thinking was visible, the
 * validated answer adds its last two steps: the answer was written, and every point was checked against its source.
 * A stopped or failed turn marks open rows as errors and claims neither.
 */
export function settleOakToolSteps(steps: readonly OakToolStep[] = [], outcome: "complete" | "interrupted" | "failed" | "blocked", now = Date.now()): readonly OakToolStep[] {
  // R22 live: a guardrail stop (a message that reads like instructions to an AI) is not a fault, so the step it cut short
  // leaves no red "stopped" row; only the steps that finished stay.
  if (outcome === "blocked") return steps.filter(step => step.state === "done");
  if (outcome !== "complete") return steps.map(step => step.state === "pending" || step.state === "running" ? finish(step, "error", now) : step);
  const settled = steps.filter(step => step.state !== "pending").map(step => step.state === "running" ? finish(step, "done", now) : step);
  if (!settled.some(step => isOakThought(step.operation)) || settled.some(step => step.operation === "verify")) return settled;
  return [...settled, { id: "compose", operation: "compose", state: "done", startedAt: now, endedAt: now },
    { id: "verify", operation: "verify", state: "done", startedAt: now, endedAt: now }];
}

/** Present tense while a step runs, past tense once it is done. Oak speaks to the visitor in the first person. */
const live: Record<OakStepOperation, string> = {
  understand: "Reading your question", search: "Searching Steve's public work", read: "Reading a passage",
  navigate: "Finding the right page", draft: "Drafting your message", research: "Checking current public sources",
  weigh: "Weighing what I found", think: "Thinking it through", compose: "Writing your answer", verify: "Checking every point has a source",
  retry: "Asking again",
};
const done: Record<OakStepOperation, string> = {
  understand: "Read your question", search: "Searched Steve's public work", read: "Read a passage",
  navigate: "Found the right page", draft: "Drafted your message", research: "Checked current public sources",
  weigh: "Weighed what I found", think: "Thought it through", compose: "Wrote your answer", verify: "Checked every point against its source",
  retry: "Started over after a slow reply",
};
const stoppedTitles: Record<OakStepOperation, string> = {
  understand: "Stopped while reading your question", search: "The search stopped", read: "Reading stopped",
  navigate: "Couldn't find the page", draft: "The draft stopped", research: "Couldn't check current public sources",
  weigh: "Stopped while weighing what I found", think: "Stopped while thinking", compose: "Writing stopped", verify: "Checking stopped",
  retry: "Asking again stopped",
};
/**
 * Q03: what a running step is waiting on once it has gone quiet for a moment, named so the wait never looks frozen.
 * A streaming thought shows its own words instead, and a restart is never a running step.
 */
const namedWaits: Partial<Record<OakStepOperation, string>> = {
  understand: "Still reading your question", search: "Still searching Steve's work", read: "Still reading that passage",
  navigate: "Still finding the page", draft: "Still drafting", research: "Still checking current sources",
  weigh: "Still weighing what I found", compose: "Still writing", verify: "Still checking the sources",
};
export const oakNamedWait = (operation: OakStepOperation) => namedWaits[operation] ?? null;
/** The words a screen reader hears when a tool starts; thinking steps are never announced (Q03-G4). */
export const oakToolStartLabel = (operation: OakStepOperation) => isOakThought(operation) || operation === "retry" ? null : live[operation];

function answerShape(answer: OakAnswer | null | undefined) {
  if (!answer) return null;
  if (answer.kind === "sourced") return `${answer.claims.length} ${answer.claims.length === 1 ? "point" : "points"}, each with its source`;
  if (answer.kind === "gap") return "What the sources show, and what they don't";
  if (answer.kind === "role-fit") return `${answer.rows.length} ${answer.rows.length === 1 ? "requirement" : "requirements"} compared`;
  if (answer.kind === "advice") return "A suggestion grounded in Steve's work";
  if (answer.kind === "document") return "Quoted from the text you selected";
  if (answer.kind === "contact") return "Pointed you to Steve directly";
  if (answer.kind === "clarify") return "A quick question to narrow it down";
  if (answer.kind === "proposal") return "A brief you send yourself";
  return null;
}

/** Visitor-facing text for a step, built only from what the turn already holds. */
export function describeOakToolStep(step: OakToolStep, turn: { question: string; citations: number; cards: readonly OakCard[]; research?: PublicResearchEvent | null; answer?: OakAnswer | null }) {
  const navigate = turn.cards.find(card => card.kind === "navigate");
  const draft = turn.cards.find(card => card.kind === "draft");
  const sources = turn.research?.sources.length ?? 0;
  const finished = step.state === "done";
  const detail = step.state === "pending" ? "Waiting to start"
    : step.operation === "understand" ? turn.question
    : step.operation === "retry" ? "The model went quiet, so I asked again"
    : step.operation === "search" ? finished && turn.citations ? `${turn.citations} public ${turn.citations === 1 ? "source" : "sources"} cited in the answer` : "Case studies, articles and experience"
    : step.operation === "read" ? "One passage from Steve's public work"
    : step.operation === "navigate" ? finished && navigate?.kind === "navigate" ? navigate.label : "A page on steveoak.com"
    : step.operation === "draft" ? finished && draft?.kind === "draft" ? draft.title : "A draft you can edit and send yourself"
    : step.operation === "weigh" ? finished ? "Matched what I read to your question" : "Matching what I read to your question"
    : step.operation === "think" ? step.thought?.text || null
    : step.operation === "compose" ? answerShape(turn.answer) ?? "Your answer"
    : step.operation === "verify" ? turn.answer?.kind === "document" ? "Each quote matches the text you selected"
      : turn.citations ? `${turn.citations} ${turn.citations === 1 ? "source" : "sources"} linked to the points they support` : "Nothing claimed beyond what the sources show"
    : !finished ? "Current public sources"
    : turn.research?.phase === "zero-results" ? "No current public sources found"
    : turn.research?.phase === "partial" ? `${sources} current public ${sources === 1 ? "source" : "sources"}; some could not be read`
    : sources ? `${sources} current public ${sources === 1 ? "source" : "sources"}` : "Checked";
  const error = step.state !== "error" ? null : step.operation === "research"
    ? "Current public research is unavailable. The answer uses Steve's public work only."
    : "This step stopped before it finished.";
  const title = step.state === "error" ? stoppedTitles[step.operation]
    : step.operation === "think" && step.thought?.title ? step.thought.title
    : finished && step.operation === "verify" && turn.answer?.kind === "document" ? "Checked every quote against your document"
    : finished && step.operation === "verify" && !turn.citations ? "Checked the answer against the sources" : finished ? done[step.operation] : live[step.operation];
  return { title, detail: error ? null : detail, error };
}

/** "0.4s", "3.2s", "12s": one step's measured time, or nothing when the clock never saw it run. */
export function formatOakStepDuration(step: Pick<OakToolStep, "startedAt" | "endedAt">): string | null {
  if (step.startedAt === undefined || step.endedAt === undefined) return null;
  const ms = step.endedAt - step.startedAt;
  if (ms < 100) return null;
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

/** Whole seconds from the first step that started to the last one that ended, or null without a measured span. */
export function oakThinkingSeconds(steps: readonly OakToolStep[], now?: number): number | null {
  const starts = steps.flatMap(step => step.startedAt === undefined ? [] : [step.startedAt]);
  if (!starts.length) return null;
  const ends = steps.flatMap(step => step.endedAt === undefined ? [] : [step.endedAt]);
  const end = now ?? (ends.length ? Math.max(...ends) : undefined);
  return end === undefined ? null : Math.max(0, Math.round((end - Math.min(...starts)) / 1000));
}
