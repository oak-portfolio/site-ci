import * as React from "react";
import { animate } from "motion/react";
import { MessageScroller, useMessageScroller, useMessageScrollerVisibility } from "@shadcn/react/message-scroller";
import { Button } from "@/components/ui/button";
import { heldFoldSpring } from "@/components/ui/chain-of-thought";
import { Icon } from "@/components/ui/Icon";
import { MessageScrollerButton } from "@/components/ui/message";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { OakTurn, oakEarlierEditable, oakStoppedTitle } from "./OakTurn";
import { oakWhatChangedSpoken } from "./OakWhatChanged";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { renderOakAnswer } from "../../../packages/oak-agent-contracts/src/output";
import { oakNoteLast } from "@/lib/oakGapNoteOrder";
import { requirementClause, resolverQuote } from "@/lib/oakQuote";
import { oakExportedQuestion, oakUsedTools, oakVisitorWords } from "@/lib/oakNextStep";
import { oakToolStartLabel } from "@/lib/oakToolSteps";
import { beginOakSignIn, getOakRoleDescription, oakRetryKind, type OakWorkspaceState } from "@/lib/oakWorkspace";
import { showOakToast } from "@/lib/oakToasts";
import { registerOakTranscriptJump } from "@/lib/oakTranscriptScroll";
import { clearOakBlockAnnouncements, subscribeOakBlockAnnouncements } from "@/lib/openui/a11y/oakBlockAnnounce";
import { OAK_LAZY_LANDED } from "@/lib/openui/figure/oakLazyView";
import { readOakSettle } from "@/lib/openui/settlePhase";

type TranscriptPosition = { messageId: string; offset: number; top: number; atEnd: boolean; lastId: string };
const transcriptPositions = new Map<string, TranscriptPosition>();
// The turns a reopened conversation came back with, so the "Today" marker still finds its place when the transcript remounts.
const savedTurnIds = new Map<string, ReadonlySet<string>>();
export function clearOakTranscriptPosition() { transcriptPositions.clear(); savedTurnIds.clear(); }

/**
 * Q03-G4: the transcript's one polite live region. Each turn is announced once as it starts, once per tool it runs, then
 * as complete (the validated answer), stopped or failed. Thinking and the model's streaming words are never announced.
 */
export function collectOakOutputAnnouncements(messages: OakWorkspaceState["messages"], announced: Set<string>) {
  const units: string[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.role !== "assistant") continue;
    if (!announced.has(`${message.id}:started`)) {
      announced.add(`${message.id}:started`);
      if (message.state === "pending") units.push("Oak started on your question.");
    }
    for (const step of message.steps ?? []) {
      const label = oakToolStartLabel(step.operation);
      // A re-asked call numbers its steps again, so a step is known by its id and when it began.
      const key = `${message.id}:step:${step.id}@${step.startedAt ?? 0}`;
      if (!label || step.state === "pending" || announced.has(key)) continue;
      announced.add(key);
      if (message.state === "pending") units.push(`${label}.`);
    }
    if (message.research && message.research.phase !== "started" && !announced.has(`${message.id}:research`)) {
      announced.add(`${message.id}:research`);
      units.push(message.research.phase === "completed" || message.research.phase === "partial" ?
        `Public research returned ${message.research.sources.length} external sources.` :
          message.research.phase === "zero-results" ? "Public research returned no sources." : "Current public research is unavailable.");
    }
    const answerKey = `${message.id}:answer`;
    if (message.answer && !announced.has(answerKey)) {
      announced.add(answerKey);
      // Quotes are read as the visible quote blocks show them, without a third-person "Steve Oak wrote:" lead-in.
      // Line by line: a role-fit paragraph carries its quote on a line of its own between the requirement and the gap.
      // A document answer quotes the visitor's own text, which is read exactly as shown (D107).
      // Q16-D7: role-fit requirements are read as the whole clause the card shows, never the model's cut span.
      const answer = message.answer;
      const role = answer.kind === "role-fit" ? getOakRoleDescription(message.id) : undefined;
      const rendered = oakNoteLast(answer, renderOakAnswer(answer.kind === "role-fit" ? { ...answer, rows: answer.rows.map(row => ({ ...row, requirement: { ...row.requirement,
        text: requirementClause(row.requirement.text, row.requirement.start, row.requirement.end, role) } })) } : answer));
      units.push(`Oak answered. ${message.answer.kind === "document" ? rendered
        : rendered.split("\n").map(line => line.trim() ? resolverQuote(line) ?? line : line).join("\n")}`);
    }
    // Ticket 56: the What changed note above a redone answer is said here once, when its program is done.
    if (message.ui?.status === "done" && !announced.has(`${message.id}:what-changed`)) {
      announced.add(`${message.id}:what-changed`);
      const note = oakWhatChangedSpoken(messages, index);
      if (note) units.push(note);
    }
    message.cards.forEach((card, index) => {
      const key = `${message.id}:card:${index}`;
      if (announced.has(key)) return;
      announced.add(key);
      units.push(card.kind === "navigate" ? `Source link ready: ${card.label}.` :
        card.kind === "draft" ? `Editable draft ready: ${card.title}. ${card.text}` : "Contact Steve is available.");
    });
    if ((message.state === "interrupted" || message.state === "failed") && !announced.has(`${message.id}:stopped`)) {
      announced.add(`${message.id}:stopped`);
      units.push(message.state === "interrupted" && !message.failure ? "Answer stopped. Your question is back in the message box."
        // R23 review: a guardrail stop is not a failure, so it is announced as the stop it is.
        : message.failure === "injection" ? `Stopped before answering. ${oakStoppedTitle(message)}`
        : `Answer failed. ${oakStoppedTitle(message)}${message.failure ? "" : " Your question is back in the message box."}`);
    }
  }
  return units.join(" ");
}

export function oakOutputUnitKeys(messages: OakWorkspaceState["messages"]) {
  return messages.flatMap(message => [
    ...(message.role === "assistant" ? [`${message.id}:started`] : []),
    ...(message.role === "assistant" ? (message.steps ?? []).map(step => `${message.id}:step:${step.id}@${step.startedAt ?? 0}`) : []),
    ...(message.answer ? [`${message.id}:answer`] : []),
    ...(message.ui?.status === "done" ? [`${message.id}:what-changed`] : []),
    ...(message.research && message.research.phase !== "started" ? [`${message.id}:research`] : []),
    ...message.cards.map((_card, index) => `${message.id}:card:${index}`),
    ...(message.state === "interrupted" || message.state === "failed" ? [`${message.id}:stopped`] : []),
  ]);
}

export function OakOutputAnnouncements({ messages }: { messages: OakWorkspaceState["messages"] }) {
  // Existing retained units do not announce again when the workspace reopens.
  const announced = React.useRef(new Set(oakOutputUnitKeys(messages)));
  const [announcement, setAnnouncement] = React.useState({ sequence: 0, text: "" });
  // Lines posted in one batch (a transcript unit and block lines, or two blocks) are said as one, never one over another.
  const lines = React.useRef<string[]>([]);
  const [posted, setPosted] = React.useState(0);
  React.useEffect(() => {
    if (!messages.length) { announced.current.clear(); lines.current = []; clearOakBlockAnnouncements(); setAnnouncement({ sequence: 0, text: "" }); return; }
    const unit = collectOakOutputAnnouncements(messages, announced.current);
    if (unit) { lines.current.unshift(unit); setPosted(count => count + 1); }
  }, [messages]);
  // Ticket 06 (A22): blocks announce through announceOakBlock into this same region.
  React.useEffect(() => subscribeOakBlockAnnouncements(text => { lines.current.push(text); setPosted(count => count + 1); }), []);
  React.useEffect(() => {
    if (!lines.current.length) return;
    const text = lines.current.join(" ");
    lines.current = [];
    setAnnouncement(previous => ({ sequence: previous.sequence + 1, text }));
  }, [posted]);
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
    <span key={announcement.sequence}>{announcement.text}</span>
  </div>;
}

function captureTranscript(viewport: HTMLDivElement, key: string) {
  const items = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]"));
  const frame = viewport.getBoundingClientRect();
  const first = items.find(item => item.getBoundingClientRect().bottom > frame.top);
  const content = viewport.querySelector(".oak-conversation__content");
  if (!first || !content || key === "empty") return;
  const last = items.at(-1);
  const padding = Number.parseFloat(getComputedStyle(content).paddingBottom) || 0;
  transcriptPositions.set(key, {
    messageId: first.dataset.messageId!, offset: first.getBoundingClientRect().top - frame.top,
    top: viewport.scrollTop,
    atEnd: !last || last.getBoundingClientRect().bottom + padding <= frame.bottom + 8,
    lastId: last?.dataset.messageId ?? "",
  });
  if (transcriptPositions.size > 2) transcriptPositions.delete(transcriptPositions.keys().next().value!);
}

// How long after a lazy view lands its growth still keeps a reader at the end: the scroller can measure it a few frames late.
const LANDING_MS = 400;

function RestoreTranscript({ viewport, conversationKey, geometryKey, latestId }: {
  viewport: React.RefObject<HTMLDivElement | null>; conversationKey: string; geometryKey: string; latestId: string;
}) {
  const { scrollToMessage, scrollToEnd } = useMessageScroller();
  // Read at restore time only; a new turn arriving later is the scroller's live-edge job, not a restore.
  const latest = React.useRef(latestId);
  latest.current = latestId;
  React.useLayoutEffect(() => {
    const remembered = transcriptPositions.get(conversationKey);
    const frame = requestAnimationFrame(() => {
      if (!viewport.current || !remembered) return;
      const content = viewport.current.querySelector(".oak-conversation__content");
      const padding = content ? Number.parseFloat(getComputedStyle(content).paddingBlockStart || getComputedStyle(content).paddingTop) || 0 : 0;
      // A turn sent from a panel (Compare, advice, a draft) arrived while the transcript was away: follow it, not the old spot.
      if (remembered.atEnd || remembered.lastId !== latest.current) scrollToEnd({ behavior: "instant" });
      else if (!scrollToMessage(remembered.messageId, { align: "start", scrollMargin: remembered.offset - padding, behavior: "instant" })) viewport.current.scrollTop = remembered.top;
    });
    return () => cancelAnimationFrame(frame);
  }, [conversationKey, geometryKey, viewport, scrollToMessage, scrollToEnd]);
  React.useLayoutEffect(() => () => {
    if (viewport.current) captureTranscript(viewport.current, conversationKey);
  }, [conversationKey, viewport]);
  // Quote chips live in the composer, outside this provider; they jump through the scroller registered here.
  React.useEffect(() => registerOakTranscriptJump((messageId, behavior) =>
    scrollToMessage(messageId, { align: "start", scrollMargin: 16, behavior })), [scrollToMessage]);
  // The scroller marks `data-scrollable` itself (the bottom fade reads it). It follows growing content, not a shrinking view.
  React.useEffect(() => {
    const element = viewport.current;
    const content = element?.firstElementChild;
    if (!element || !content) return;
    // The scroller follows growing content, not a shrinking view: when a card mounts under the transcript (sign-in,
    // a status line) a reader who was at the newest message stays there instead of losing it below the fold.
    // A lazy view that replaces its ghost after the scroller placed the view keeps a reader at the end there too, as its eager
    // version would have been placed, once the transcript overflowed (content that still fits has placed no one). Only that
    // landing counts: an answer settling, folding its trail or landing into its ghosts also grows the content, and it rises
    // in place under its question. A shown spacer means a question is anchored at the top, where it holds as well.
    let height = element.clientHeight, contentHeight = content.getBoundingClientRect().height, atEnd = false, overflowed = false, landedAt = -Infinity;
    const keepEnd = () => {
      // Content can change in the same frame (the sign-in card mounts as the content grows 86px), so a shrink alone decides.
      const grown = content.getBoundingClientRect().height > contentHeight + 0.5;
      const anchored = content.querySelector<HTMLElement>("[data-message-scroller-spacer]")?.hidden === false;
      const landed = performance.now() - landedAt < LANDING_MS;
      if (atEnd && (element.clientHeight < height || (grown && landed && overflowed && !anchored))) element.scrollTop = element.scrollHeight;
      height = element.clientHeight;
      contentHeight = content.getBoundingClientRect().height;
      const below = element.scrollHeight - element.scrollTop - element.clientHeight;
      atEnd = below <= 24;
      overflowed = element.scrollHeight - element.clientHeight > 24;
      // The scroller reports no "end" while it follows the live edge, which hides the bottom fade after an answer lands
      // with content under the fold. The fade reads this mark as well as data-scrollable.
      element.toggleAttribute("data-more-below", below > 8);
    };
    const onLanded = () => { landedAt = performance.now(); };
    window.addEventListener(OAK_LAZY_LANDED, onLanded);
    // Rows that rise or fade in are measured mid-motion, and the scroller hears nothing when the motion ends: after a landing
    // it can keep a stale "end" (a Latest pill at the live edge). Once the opening motion has stopped, one scroll event makes
    // it measure again. Bounded to about a second and a half, and it runs once, so it can never feed a loop.
    let remeasure = 0, frames = 0;
    const afterMotion = () => {
      remeasure = requestAnimationFrame(() => {
        if (++frames < 90 && element.getAnimations({ subtree: true }).some(animation => animation.playState === "running")) afterMotion();
        else element.dispatchEvent(new Event("scroll"));
      });
    };
    afterMotion();
    const observer = new ResizeObserver(keepEnd);
    observer.observe(element);
    observer.observe(content);
    element.addEventListener("scroll", keepEnd, { passive: true });
    keepEnd();
    return () => {
      cancelAnimationFrame(remeasure);
      window.removeEventListener(OAK_LAZY_LANDED, onLanded);
      observer.disconnect();
      element.removeEventListener("scroll", keepEnd);
    };
  }, [viewport]);
  return null;
}

/**
 * The scroller follows the live edge only while Oak is working on a turn. An answer arrives whole, so in the very render
 * that lands it the follow stops (the library reads `autoScroll` on every render): the answer then rises in place under
 * its question instead of the view jumping to its end and back.
 */
function TranscriptScroller({ children, viewport, conversationKey, geometryKey, following, latestId, reopened }: {
  children: React.ReactNode; viewport: React.RefObject<HTMLDivElement | null>; conversationKey: string; geometryKey: string; following: boolean; latestId: string;
  /** A saved conversation just reopened: open on its last question, not at its end. */
  reopened: boolean;
}) {
  const initialPosition = React.useRef<"start" | "end" | "last-anchor">(
    transcriptPositions.has(conversationKey) ? "start" : reopened ? "last-anchor" : "end").current;
  return (
    // A sent question anchors near the top with a 48px peek of the answer before it (WAVE9 section 3).
    <MessageScroller.Provider autoScroll={following} defaultScrollPosition={initialPosition} scrollPreviousItemPeek={48}>
      {children}
      <RestoreTranscript viewport={viewport} conversationKey={conversationKey} geometryKey={geometryKey} latestId={latestId} />
    </MessageScroller.Provider>
  );
}

/**
 * Answers arrive whole, not streamed. Following stops the moment one lands (TranscriptScroller), so it rises in place.
 * D124: once the trail has folded and the answer is on screen, a reader who was following sees its start: if question and
 * answer fit together the view opens on the question, otherwise on the answer with its folded "Thought for" row above.
 * A reader who scrolled away on purpose stays put and gets an "Answer ready" jump instead.
 */
function ReadCompletedAnswerFromStart({ viewport, messages, shown }: {
  viewport: React.RefObject<HTMLDivElement | null>; messages: OakWorkspaceState["messages"]; shown: string | null;
}) {
  const { scrollToMessage } = useMessageScroller();
  const { visibleMessageIds } = useMessageScrollerVisibility();
  const last = messages.at(-1);
  const settled = last?.role === "assistant" && last.state === "complete" ? last.id : null;
  const question = messages.at(-2)?.role === "user" ? messages.at(-2)!.id : null;
  const seen = React.useRef(settled);
  const atEnd = React.useRef(true);
  // The answer that landed and is waiting to show, and whether its reader was following when it landed.
  const landed = React.useRef<{ id: string; following: boolean } | null>(null);
  const [ready, setReady] = React.useState<string | null>(null);
  React.useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const track = () => { atEnd.current = element.scrollTop + element.clientHeight >= element.scrollHeight - 24; };
    element.addEventListener("scroll", track, { passive: true });
    return () => element.removeEventListener("scroll", track);
  }, [viewport]);
  React.useEffect(() => {
    if (!settled || settled === seen.current) { seen.current = settled; return; }
    seen.current = settled;
    landed.current = { id: settled, following: atEnd.current };
  }, [settled]);
  React.useEffect(() => {
    const element = viewport.current;
    if (!shown || landed.current?.id !== shown || !element || !question) return;
    const { following } = landed.current;
    landed.current = null;
    // A planned answer shows before its trail folds in flow above it, so the view moves only once that fold has ended, and only
    // for a reader still at the end: a scroll during the fold (theirs, Find in page, a jump) is never undone.
    const folding = () => { const { phase, held } = readOakSettle(shown); return held && (phase === "committing" || phase === "folding"); };
    const waited = folding();
    let frame = 0;
    let glide: { stop: () => void } | undefined;
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const stop = () => { glide?.stop(); for (const type of inputs) element.removeEventListener(type, stop); };
    const read = () => {
      if (folding()) { frame = requestAnimationFrame(read); return; }
      const frameBox = element.getBoundingClientRect();
      const asked = element.querySelector(`[data-message-id="${CSS.escape(question)}"]`)?.getBoundingClientRect();
      const answerTurn = element.querySelector(`[data-message-id="${CSS.escape(shown)}"]`);
      const line = [...(answerTurn?.querySelector(".oak-turn__answer")?.children ?? [])].find(node => node.getBoundingClientRect().height > 0)?.getBoundingClientRect()
        ?? answerTurn?.getBoundingClientRect();
      if (!asked || !line) return;
      // Already readable: the question is not cut off above and the answer starts in the upper part of the view.
      if (asked.top >= frameBox.top && line.top - frameBox.top <= frameBox.height * 0.6) return;
      if (!following || (waited && !atEnd.current)) {
        if (line.top >= frameBox.bottom || line.bottom <= frameBox.top) setReady(shown);
        return;
      }
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
      const to = line.top - asked.top <= frameBox.height * 0.35 ? question : shown;
      if (!waited || behavior === "instant") { scrollToMessage(to, { align: "start", scrollMargin: 16, behavior }); return; }
      // The browser's smooth scroll covers a long way at up to 70px a frame. After a held fold the scroller places the view (and its
      // spacer) at once, the view goes back before paint and glides there on the fold's spring; the reader's first input stops it.
      const from = element.scrollTop;
      scrollToMessage(to, { align: "start", scrollMargin: 16, behavior: "instant" });
      const end = element.scrollTop;
      element.scrollTop = from;
      glide = animate(from, end, { ...heldFoldSpring, onUpdate: value => { element.scrollTop = value; }, onComplete: stop });
      for (const type of inputs) element.addEventListener(type, stop, { passive: true });
    };
    frame = requestAnimationFrame(read);
    return () => { cancelAnimationFrame(frame); stop(); };
  }, [shown, question, viewport, scrollToMessage]);
  // A newer turn, or the reader reaching the answer, retires the jump.
  React.useEffect(() => { if (ready && (ready !== settled || visibleMessageIds.includes(ready))) setReady(null); }, [ready, settled, visibleMessageIds]);
  if (!ready) return null;
  return <Button type="button" variant="secondary" size="sm" className="oak-conversation__ready" onClick={() => {
    scrollToMessage(ready, { align: "start", scrollMargin: 16, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    setReady(null);
  }}><Icon name="arrowDown" />Answer ready</Button>;
}

/** The conversation itself. Key it by conversation so copy feedback and scroll memory reset per conversation. */
export function OakTranscript({ state, conversationKey, geometryKey, citationLabels, onContact, related = [], forgetLine = null }: {
  /** v3: the oldest message Oak still remembers, once earlier ones have dropped out of its memory. */
  forgetLine?: string | null;
  state: OakWorkspaceState; conversationKey: string; geometryKey: string; citationLabels?: OakCitationLabels; onContact: () => void;
  /** v3: the newest answer's follow-ups, rendered under that answer. */
  related?: readonly string[];
}) {
  const viewport = React.useRef<HTMLDivElement | null>(null);
  // Turns already on screen when the transcript mounts (a reopen or a restore) render at rest; only new turns rise in.
  // A conversation's first question mounts the transcript together with its pending answer, so that live pair still rises.
  const mountedTurns = React.useRef(new Set(state.messages.filter((_message, index, all) =>
    !(all.at(-1)?.role === "assistant" && all.at(-1)?.state === "pending" && index >= all.length - 2)).map(message => message.id))).current;
  const [copied, setCopied] = React.useState<string | null>(null);
  const [shownAnswer, setShownAnswer] = React.useState<string | null>(null);
  const [copyError, setCopyError] = React.useState(false);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setCopyError(false);
      showOakToast(key.endsWith(":sources") ? "copied-sources" : key.endsWith(":answer") ? "copied" : "draft-copied");
    } catch {
      setCopyError(true);
    }
  };
  const following = state.messages.at(-1)?.role === "user" || (state.messages.at(-1)?.state === "pending" && !state.messages.at(-1)?.answer);
  const streaming = state.messages.at(-1)?.state === "pending";
  // Turns the conversation came back with; the first turn that is not one of them starts today.
  const savedTurns = React.useRef<ReadonlySet<string> | null>(null);
  if (!savedTurns.current) {
    savedTurns.current = savedTurnIds.get(conversationKey) ?? (state.historyRestored && state.savedRecord ? mountedTurns : new Set<string>());
    if (savedTurns.current.size && !savedTurnIds.has(conversationKey)) {
      savedTurnIds.set(conversationKey, savedTurns.current);
      if (savedTurnIds.size > 2) savedTurnIds.delete(savedTurnIds.keys().next().value!);
    }
  }
  // Fixed at mount, so the marker's date does not drift while the transcript stays open.
  const today = React.useRef(new Date()).current;
  const savedToday = Boolean(state.savedRecord && new Date(state.savedRecord.createdAt).toDateString() === today.toDateString());
  const todayAt = savedTurns.current.size && !savedToday ? state.messages.find(message => !savedTurns.current!.has(message.id))?.id : undefined;
  // Smooth following starts after the first paint, so the scroller's mount-time placement (and any restore) lands at once.
  const [settledIn, setSettledIn] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setSettledIn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <>
    <TranscriptScroller viewport={viewport} conversationKey={conversationKey} geometryKey={geometryKey} latestId={state.messages.at(-1)?.id ?? ""}
      following={following} reopened={Boolean(state.historyRestored && state.savedRecord)}>
      <MessageScroller.Root className="oak-conversation">
        {/* While following, the scroller's own `behavior: "auto"` scrolls defer to CSS smooth scrolling, so the live edge glides. */}
        <MessageScroller.Viewport ref={viewport} onScroll={event => captureTranscript(event.currentTarget, conversationKey)} data-following={following && settledIn ? "" : undefined}
          className="oak-conversation__viewport" aria-label="Conversation with Oak">
          <MessageScroller.Content className="oak-conversation__content" role="list" aria-live="off" aria-busy={streaming || undefined}>
            {/* A reopened conversation says where it came from before its first turn. */}
            {state.historyRestored && state.savedRecord ? <MessageScroller.Item role="listitem" className="oak-conversation__reopened">
              <Marker variant="separator">
                <MarkerIcon><Icon name="history" size={14} /></MarkerIcon>
                <MarkerContent>Saved conversation from <time dateTime={new Date(state.savedRecord.createdAt).toISOString()}>
                  {new Date(state.savedRecord.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></MarkerContent>
              </Marker>
            </MessageScroller.Item> : null}
            {state.messages.map((message, index) => <React.Fragment key={message.id}>
              {/* A day separator between the saved turns and the ones asked since. */}
              {message.id === todayAt && index > 0 ? <MessageScroller.Item role="listitem" className="oak-conversation__today">
                <Marker variant="separator"><MarkerContent><time dateTime={today.toISOString()}>Today</time></MarkerContent></Marker>
              </MessageScroller.Item> : null}
              {/* v3 review: where Oak's memory of this conversation now begins. */}
              {message.id === forgetLine && index > 0 ? <MessageScroller.Item role="listitem" className="oak-conversation__memory">
                <Marker variant="separator"><MarkerIcon><Icon name="thought" size={14} /></MarkerIcon>
                  <MarkerContent>Oak no longer remembers the messages above</MarkerContent></Marker>
              </MessageScroller.Item> : null}
              <MessageScroller.Item key={message.id} messageId={message.id} scrollAnchor={message.role === "user"} role="listitem">
                <OakTurn message={message} enter={!mountedTurns.has(message.id)} question={state.messages[index - 1]?.role === "user" ? oakVisitorWords(state.messages[index - 1]) : ""}
                  asked={oakExportedQuestion(state.messages[index - 1])} latest={index === state.messages.length - 1}
                  questionInBox={index !== state.messages.length - 1 || !state.draft.trim() ||
                    state.draft.trim() === oakVisitorWords(state.messages[index - 1]).trim()}
                  opening={!state.messages.slice(0, index).some(earlier => earlier.role === "assistant")}
                  usedTools={oakUsedTools(state.messages.slice(0, index), Boolean(state.briefDraft))}
                  editable={message.role === "user" && !state.pending && (index === state.messages.length - 2 || (index < state.messages.length - 2 && oakEarlierEditable(message)))}
                  editsEarlier={index < state.messages.length - 2}
                  guest={state.authStatus?.kind === "guest"} allowance={state.authStatus?.allowance}
                  onSignIn={state.authStatus?.kind === "guest" && state.authStatus.configured ? beginOakSignIn : undefined}
                  progress={state.progress} citationLabels={citationLabels} contactPreference={state.contactPreference}
                  related={index === state.messages.length - 1 ? related : undefined}
                  retry={oakRetryKind(state, message.id)} copied={copied} onCopy={(key, text) => void copy(key, text)} onContact={onContact} onAnswered={setShownAnswer} />
              </MessageScroller.Item>
            </React.Fragment>)}
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScrollerButton />
        <ReadCompletedAnswerFromStart viewport={viewport} messages={state.messages} shown={shownAnswer} />
      </MessageScroller.Root>
    </TranscriptScroller>
    {copyError ? <p className="oak-workspace__status" role="status"><Icon name="alert" />Copy is unavailable. Select the draft text to copy it.</p> : null}
  </>;
}
