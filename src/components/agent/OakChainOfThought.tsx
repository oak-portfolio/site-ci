import * as React from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, heldFoldSpring } from "@/components/ui/chain-of-thought";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StreamText } from "@/components/ui/stream-text";
import { RollingNumber } from "@/components/ui/rolling-number";
import { OakSprite, useOakSprites, type OakActivitySpritePose } from "./OakActivitySprite";
import { OakCitations } from "./OakCitations";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakAnswerSources } from "@/lib/oakAnswerActions";
import { oakMeaningIcons } from "@/lib/oakMeaningIcons";
import { OAK_ANSWER_SETTLE_MS, oakMotion } from "@/lib/oakMotion";
import { describeOakToolStep, formatOakStepDuration, oakNamedWait, oakThinkingSeconds, type OakStepOperation, type OakToolStep } from "@/lib/oakToolSteps";
import { oakSendNeverArrived, retryOakTurn, stopOakTurn, type OakConversationMessage } from "@/lib/oakWorkspace";
import { oakResearchTally, oakStepRetry } from "@/lib/oakChatFlags";
import { oakPlanFirstOn } from "@/lib/oakFlags/planFirst";
import { oakStepPeeksOn } from "@/lib/oakFlags/stepPeeks";
import { OakStepPeek, oakPeekRows } from "./OakStepPeek";
import { oakPlanLine } from "@/lib/oakOpenUISkeletons";

const stepIcons: Record<OakStepOperation, IconName> = {
  understand: oakMeaningIcons["reasoning.understand"], search: oakMeaningIcons["tool.search"], read: oakMeaningIcons["tool.read"],
  navigate: oakMeaningIcons["tool.navigate"], draft: oakMeaningIcons["tool.draft"], research: oakMeaningIcons["web.research"],
  weigh: oakMeaningIcons["reasoning.weigh"], think: oakMeaningIcons["reasoning.think"], compose: oakMeaningIcons["reasoning.compose"], verify: oakMeaningIcons["reasoning.verify"],
  retry: oakMeaningIcons["reasoning.retry"],
};
/** The art for whatever is happening now; the first pose with an asset wins, so missing art falls back to an older pose. */
const stepPoses: Record<OakStepOperation, readonly OakActivitySpritePose[]> = {
  understand: ["understanding", "thinking"], search: ["searching"], read: ["reading"], navigate: ["navigating"], draft: ["drafting"],
  research: ["researching", "searching"], weigh: ["weighing", "thinking"], compose: ["composing", "drafting"], verify: ["verifying", "tool-done"],
  think: ["pondering", "thinking"], retry: ["rewind", "thinking"],
};
const stateLabels = { pending: "Waiting", running: "In progress", done: "Done", error: "Stopped" } as const;
/** Q03: a step with no progress this long names what it is waiting on and offers Stop, so a wait never looks frozen. */
export const OAK_SLOW_STEP_MS = 2_000;
/** A step still running after this long says so plainly, and Oak's patient pose takes the header. */
export const OAK_LONG_WAIT_MS = 12_000;
/** For this long after Oak asks again, the header shows the restart before the new steps take over. */
export const OAK_RESTART_ART_MS = 10_000;
/** Running steps where the model is between thoughts: a forming line shows the next one is on its way (D115). */
const formingSteps: ReadonlySet<OakStepOperation> = new Set<OakStepOperation>(["understand", "weigh"]);
/** D124: a long live trail (seven steps or more) keeps only its newest three in view; the rest wait behind one "N earlier steps" row. */
const OAK_LIVE_STEPS = 3;
const OAK_LONG_TRAIL = 7;

function citationCount(answer: OakConversationMessage["answer"]) {
  return answer ? oakAnswerSources(answer).length : 0;
}

/**
 * Ticket 137: a thought's words can type in faster than its row grows open (one that starts just before the answer finishes
 * within 400ms of it), and a grow aimed at the height the row had when it began snaps the rest open in one frame when it ends.
 * So while it grows, a thought's row chases its content's height on the held fold's spring, then hands back to `auto`. Every
 * other row grows on `grow`, aimed at its height when it began.
 */
function StepRow({ step, loading, enter, reduced, grow, children }: {
  step: OakToolStep; loading: boolean; enter: boolean; reduced: boolean; children: React.ReactNode;
  grow: Pick<React.ComponentProps<typeof motion.li>, "initial" | "animate" | "transition">;
}) {
  const follow = enter && !reduced && step.operation === "think";
  const row = React.useRef<HTMLLIElement>(null);
  const content = useMotionValue(0);
  const height = useSpring(content, heldFoldSpring);
  const [growing, setGrowing] = React.useState(follow);
  React.useLayoutEffect(() => {
    const box = row.current, body = box?.querySelector(".oak-cot__body");
    if (!growing || !box || !body) return;
    box.style.overflow = "hidden";
    box.style.height = "0px";
    const observer = new ResizeObserver(() => content.set(box.scrollHeight));
    observer.observe(body);
    const draw = height.on("change", value => { box.style.height = `${value}px`; });
    const rest = height.on("animationComplete", () => { if (height.get() >= box.scrollHeight - 1) setGrowing(false); });
    return () => { observer.disconnect(); draw(); rest(); box.style.removeProperty("height"); box.style.removeProperty("overflow"); };
  }, [growing, content, height]);
  // layout="position": when a thought above grows or a step lands, the rows below glide down instead of jumping.
  return <motion.li ref={row} layout={reduced ? false : "position"} className="oak-cot__step" data-state={step.state} data-kind={step.operation} data-step={step.id}
    data-art={loading ? "" : undefined} initial={!enter ? false : follow ? { opacity: 0 } : grow.initial} animate={follow ? { opacity: 1 } : grow.animate}
    transition={grow.transition}>{children}</motion.li>;
}

/** A live clock: whole seconds since thinking began, plus the current time, ticking once a second until the turn settles. */
function useThinkingSeconds(steps: readonly OakToolStep[], live: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  const measured = steps.some(step => step.startedAt !== undefined);
  React.useEffect(() => {
    if (!live || !measured) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live, measured]);
  return { seconds: oakThinkingSeconds(steps, live ? now : undefined), now };
}

/**
 * Under a finished search, the pages the answer cites, through the one citations component (D18): the same numbered pills,
 * previews and numbers as the answer's own sources. Current public research lists its sources once, on its own card.
 */
function FoundSources({ message, citationLabels }: { message: OakConversationMessage; citationLabels?: OakCitationLabels }) {
  const answer = message.answer;
  if (!answer) return null;
  const sources = oakAnswerSources(answer);
  if (!sources.length) return null;
  return <OakCitations citations={sources} knowledgeRevision={answer.knowledgeRevision} citationLabels={citationLabels} label="Sources found"
    order={sources.map(citation => citation.documentId)} landmark={false} />;
}

/**
 * Oak's visible reasoning for one turn, in the AI Elements Chain of Thought shape: a header that thinks out loud while the
 * turn runs, then folds to "Thought for 6s" once the answer lands; inside, each step on a rail with its own art, time and finds.
 * Every step comes from a real Worker phase (stream opened, model step, tool call, public research) or the validated answer.
 */
export function OakChainOfThought({ message, question, progress, citationLabels, enter = true, opening = false, onTyping, onSettled, onFoldEnd, retry = null }: {
  message: OakConversationMessage; question: string; progress: string; citationLabels?: OakCitationLabels;
  /** False when the turn was already on screen at mount (a reopen): everything renders at rest. */
  enter?: boolean;
  /** The conversation's first answer before the stream opens: Oak is just getting ready, so the still pose stands in. */
  opening?: boolean;
  /** Whether a thought is still typing, so the turn can hold its answer until the trail has finished speaking (D87). */
  onTyping?: (typing: boolean) => void;
  /** Whether the trail is at rest (folded, or kept open by the visitor), so the turn can bring its answer in below a still trail (D115),
   * and whether its fold is held (a planned turn's, in flow), so the view waits for that fold to end (ticket 152). */
  onSettled?: (settled: boolean, held: boolean) => void;
  /** The trail's fold has finished playing. */
  onFoldEnd?: () => void;
  /** The turn's whole-turn retry kind from `oakRetryKind`, the same one the footer reads; a stopped step offers the same Retry or Continue when set. */
  retry?: "resend" | "ask-again" | null;
}) {
  const sprites = useOakSprites();
  const reduced = useReducedMotion();
  const steps = message.steps ?? [];
  const live = message.state === "pending";
  const stopped = message.state === "interrupted" || message.state === "failed";
  const failedSteps = steps.filter(step => step.state === "error").length;
  // Q03: a stopped turn folds its trail; the one notice under it says what happened, so red rows never repeat it.
  const expanded = live;
  const [open, setOpen] = React.useState(expanded);
  const touched = React.useRef(false);
  const [showEarlier, setShowEarlier] = React.useState(false);
  // Folding on its own after the answer lands, the trail adds nothing: the closing rows and found-source chips would grow it
  // just before it shuts (a bulge, then a collapse). They wait for the visitor to open it (ChatGPT's quiet "Thought for").
  const autoFolding = !live && !stopped && !touched.current;
  const planned = oakPlanFirstOn() && Boolean(message.plan);
  // A planned turn's answer already sits under the trail, so at the settle commit the trail keeps every row, each at the height
  // it had while live (the closing rows, a finished step's loader and wait line), and only then folds in flow.
  const holding = autoFolding && planned && !reduced;
  const rowHeights = React.useRef(new Map<string, number>());
  const rail = React.useRef<HTMLOListElement>(null);
  React.useLayoutEffect(() => {
    for (const row of rail.current?.querySelectorAll<HTMLElement>(":scope > [data-step]") ?? []) {
      if (live) rowHeights.current.set(row.dataset.step!, row.offsetHeight);
      const kept = holding ? rowHeights.current.get(row.dataset.step!) : undefined;
      if (kept) row.style.minHeight = `${kept}px`; else row.style.removeProperty("min-height");
    }
  });
  const shown = autoFolding && !holding ? steps.filter(step => step.operation !== "compose" && step.operation !== "verify") : steps;
  // D124: while Oak works (and as the trail folds) only the newest steps show, so the answer starts close to its question.
  // The older steps fold into one row; a visitor who opens it, or reopens a folded trail, sees every step.
  const earlier = (live || autoFolding) && !showEarlier && shown.length >= OAK_LONG_TRAIL ? shown.length - OAK_LIVE_STEPS : 0;
  const visible = earlier ? shown.slice(earlier) : shown;
  // D87: one reading clock. A thought types in only if it arrived while Oak was working (running, or ended a moment ago in
  // the same batch); one that finished long before this view mounted renders whole. Thoughts take turns: a later one waits
  // until the one before it has typed out, and the earlier one catches up at a steadier pace instead of jumping.
  const typesIn = React.useRef(new Map<string, boolean>());
  // How much of each thought has typed out: a later snapshot of the same block is longer, so it counts as typing again.
  const [typed, setTyped] = React.useState<ReadonlyMap<string, number>>(() => new Map());
  const thoughts = steps.filter(step => step.operation === "think" && step.thought?.text);
  // A re-asked call numbers its thoughts from zero again, so a thought is known by its id and when it began.
  const thoughtKey = (step: { id: string; startedAt?: number }) => `${step.id}@${step.startedAt ?? 0}`;
  for (const step of thoughts) {
    if (!typesIn.current.has(thoughtKey(step))) typesIn.current.set(thoughtKey(step), enter && !reduced && live
      && (step.state === "running" || (step.endedAt !== undefined && Date.now() - step.endedAt < 400)));
  }
  // A thought tucked behind the earlier row stops typing and reads whole if opened, so it never holds the answer back.
  for (const step of shown.slice(0, earlier)) if (step.operation === "think") typesIn.current.set(thoughtKey(step), false);
  const typing = thoughts.filter(step => typesIn.current.get(thoughtKey(step)) && (typed.get(thoughtKey(step)) ?? -1) < step.thought!.text.length).map(thoughtKey);
  const markTyped = React.useCallback((id: string, length: number) =>
    setTyped(done => done.get(id) === length ? done : new Map(done).set(id, length)), []);
  const busyTyping = typing.length > 0;
  React.useEffect(() => { onTyping?.(busyTyping); }, [busyTyping, onTyping]);
  // Open while thinking, fold shortly after the answer lands and the last thought has typed out (long enough to see the
  // last check settle), as the answer's words start to resolve. A visitor's own toggle wins.
  React.useEffect(() => {
    if (touched.current || open === expanded) return;
    if (expanded || reduced) { setOpen(expanded); return; }
    if (busyTyping) return;
    const timer = setTimeout(() => setOpen(false), OAK_ANSWER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [expanded, reduced, open, busyTyping]);
  const { seconds, now } = useThinkingSeconds(steps, live);
  // Q03-G2: the answer starts to arrive as the trail starts to fold, so the folded header never sits over an empty body.
  const settled = !live && (!steps.length || !open || touched.current || Boolean(reduced) || stopped);
  const held = holding && steps.length > 0;
  // Before paint, so the answer mounts in the same frame the steps leave the flow (no frame with neither).
  React.useLayoutEffect(() => { onSettled?.(settled, held); }, [settled, held, onSettled]);
  if (!live && !steps.length) return null;

  // The found sources are the whole answer's, so they sit once, under the last search, not under every search.
  const lastSearch = [...shown].reverse().find(step => step.operation === "search" && step.state === "done")?.id;
  // A stopped turn offers its one whole-turn retry on the first step that stopped; tools run inside the Worker's model loop, so no step reruns alone.
  // The footer's own words for the same action: a turn the visitor stopped continues, one that failed retries.
  const retryLabel = message.state === "interrupted" ? "Continue" : "Retry";
  const retryStep = oakStepRetry && stopped && retry && !oakSendNeverArrived(message) ? steps.find(step => step.state === "error")?.id : undefined;
  const turn = { question, citations: citationCount(message.answer), cards: message.cards, research: message.research, answer: message.answer };
  const current = [...steps].reverse().find(step => step.state === "running");
  // Q10: folded, the header shows the still done pose, so a finished turn never looks like the checking or writing moment
  // (both loops). A stopped turn's card below carries its art, so its header shows the plain trace icon: one picture per turn.
  const settledPoses: readonly OakActivitySpritePose[] = stopped ? [] : ["tool-done"];
  // Between phases (a tool just returned, the next model step not yet started) the last outcome shows: done, or a snag.
  const livePoses: readonly OakActivitySpritePose[] = current ? stepPoses[current.operation] : failedSteps ? ["tool-snag"]
    : steps.at(-1)?.state === "done" ? ["tool-done"] : opening ? ["thinking-still"] : ["thinking"];
  // A fresh restart, then a step running long, each get their own art ahead of the step's own.
  const restarted = steps.some(step => step.operation === "retry" && step.endedAt !== undefined && now - step.endedAt < OAK_RESTART_ART_MS);
  const slow = current?.startedAt !== undefined && now - current.startedAt >= OAK_LONG_WAIT_MS;
  const moment: readonly OakActivitySpritePose[] = restarted ? ["rewind"] : slow ? ["snail-patience"] : [];
  const pose = (live ? [...moment, ...livePoses] : settledPoses).find(candidate => sprites[candidate]);
  // A sourced answer closes with its own source stack, so the header names the count only for other kinds.
  const sources = message.answer?.kind === "sourced" || message.answer?.kind === "gap" ? 0 : turn.citations;
  const doneTitle = stopped && message.failure === "injection" ? "Stopped before answering"
    : stopped && failedSteps ? `${failedSteps} of ${steps.length} ${steps.length === 1 ? "step" : "steps"} stopped`
    : seconds === null ? `Finished ${steps.length} ${steps.length === 1 ? "step" : "steps"}`
    : seconds < 1 ? "Thought for a moment" : `Thought for ${seconds}s`;
  // Settled only: while Oak works, the failed step already says it on the rail.
  const researchFailed = !live && !stopped && steps.some(step => step.operation === "research" && step.state === "error");
  const pop = oakMotion("pop", reduced);
  const reveal = oakMotion("reveal", reduced);
  // A step that arrives while Oak works grows open from nothing, so the transcript following the live edge glides with it
  // instead of jumping a whole row at once. It clips only while it grows, so the running node's ring is never cut.
  const grow = reduced ? reveal : {
    initial: { opacity: 0, height: 0, overflow: "hidden" },
    animate: { opacity: 1, height: "auto", transitionEnd: { overflow: "visible" } },
    transition: { height: { type: "spring" as const, visualDuration: 0.42, bounce: 0 }, opacity: { duration: 0.32, delay: 0.06 } },
  };
  // The leaving step name lifts away as the new one rises in.
  const liftAway = oakMotion("lift", reduced).exit;

  // Before the first step there is nothing to open: the header only thinks out loud.
  // data-enter: only a turn that arrived on screen plays its small entrances (durations, found chips); a reopen is still.
  return <ChainOfThought data-state={live ? "live" : stopped ? "stopped" : "done"} data-enter={enter && !reduced ? "" : undefined} open={open && steps.length > 0} disabled={!steps.length}
    data-fold={holding ? "held" : autoFolding && (reduced || !planned) ? "auto" : undefined} onFoldEnd={onFoldEnd}
    onOpenChange={next => { touched.current = true; setOpen(next); }}>
    {/* Q13: the live label is visual only, so while Oak works the header carries the progress as its name (before the first step it has no other text). */}
    <ChainOfThoughtHeader aria-label={live ? `${progress || "Thinking"}${steps.length ? `. ${open ? "Hide reasoning" : "Show reasoning"}` : ""}` : undefined}>
      <span className="oak-cot__glyph" aria-hidden="true">
        {/* Keyed by pose: each new activity settles in instead of swapping abruptly. */}
        <motion.span key={pose ?? "icon"} className="oak-cot__pose" initial={enter ? pop.initial : false} animate={pop.animate} transition={pop.transition}>
          {pose ? <OakSprite pose={pose} size="small" /> : <Icon name={oakMeaningIcons["reasoning.trace"]} />}
        </motion.span>
      </span>
      <span className="oak-cot__title">
        {/* The transcript's one live region announces this turn (Q03-G4); the animated labels here are visual only. */}
        {/* Each new step name rises in over the last one instead of swapping in place (D69). */}
        <AnimatePresence initial={false} mode="popLayout">
          {live ? <motion.span key={progress || "Thinking"} aria-hidden="true" className="oak-turn__shimmer oak-cot__label"
            initial={enter ? reveal.initial : false} animate={reveal.animate} exit={liftAway} transition={reveal.transition}>{progress || "Thinking"}</motion.span>
            : <motion.span key="done" className="oak-cot__label" initial={enter ? reveal.initial : false} animate={reveal.animate} transition={reveal.transition}>{doneTitle}</motion.span>}
        </AnimatePresence>
      </span>
      <span className="oak-cot__meta">
        {live && seconds !== null ? <span className="oak-cot__clock"><Icon name="clock" size={12} /><span><RollingNumber value={seconds} />s</span></span> : null}
        {!live && sources ? <span className="oak-cot__count"><Icon name={oakMeaningIcons["action.copy-with-sources"]} size={12} />{sources} {sources === 1 ? "source" : "sources"}</span> : null}
        {/* A downgrade the answer survived is a neutral note, never red (brief O5). */}
        {researchFailed ? <span className="oak-cot__count oak-cot__count--note"><Icon name="info" size={12} />Current research unavailable</span> : null}
      </span>
      {steps.length ? <span className="oak-cot__chevron" aria-hidden="true"><Icon name="arrowDown" /></span> : null}
      {steps.length ? <span className="sr-only">{open ? "Hide reasoning" : "Show reasoning"}</span> : null}
    </ChainOfThoughtHeader>
    {steps.length ? <ChainOfThoughtContent>
        <ol ref={rail} className="oak-cot__steps" aria-label="Reasoning steps">
          {earlier ? <li className="oak-cot__step oak-cot__step--earlier">
            <span className="oak-cot__node" aria-hidden="true"><Icon name={oakMeaningIcons["reasoning.trace"]} size={14} /></span>
            <button type="button" className="oak-cot__earlier" onClick={() => setShowEarlier(true)}>
              {earlier} earlier steps<Icon name="arrowDown" size={14} />
            </button>
          </li> : null}
          {visible.map(step => {
            const text = describeOakToolStep(step, turn);
            const duration = formatOakStepDuration(step);
            const running = live && step.state === "running" && step.startedAt !== undefined;
            // Q03-G1: two quiet seconds name the wait and offer Stop; a streaming thought shows its own words instead.
            const wait = running && step.operation !== "think" && now - step.startedAt! >= OAK_SLOW_STEP_MS ? oakNamedWait(step.operation) : null;
            const long = running && now - step.startedAt! >= OAK_LONG_WAIT_MS;
            // A running step keeps its own clock, so the gap before the next thought visibly moves (D115).
            const elapsed = running ? Math.floor((now - step.startedAt!) / 1000) : 0;
            // D125: the one running step is a roomy rounded-rect loader with its meaning icon; the header carries the art, so a
            // turn shows one picture at a time. Done steps shrink back to small glyph nodes.
            const loading = live && step.state === "running";
            // The web research step names how many results came back (not how many were readable; the step's note says that); none, no tally, from the turn's existing data-research part.
            // genui 11: Steve's own search reads the same way, from its tool-end count; no count sent, no tally. One switch covers both (M5).
            // M4 L2: the search tally counts passages ("5 passages"), so it never reads as a second, larger "Sources found" list below it.
            const count = !oakResearchTally || step.state !== "done" ? null
              : step.operation === "research" && message.research ? message.research.returnedSources
              : step.operation === "search" ? step.count ?? null : null;
            const tally = !count ? null : step.operation === "search" ? `${count} ${count === 1 ? "passage" : "passages"}` : `${count} found`;
            const peek = oakStepPeeksOn() && step.state === "done" ? oakPeekRows(step, message.research) : [];
            return <StepRow key={step.id} step={step} loading={loading} enter={enter} reduced={Boolean(reduced)} grow={grow}>
              <span className="oak-cot__node" aria-hidden="true">
                <motion.span key={step.state} className="oak-cot__node-glyph" initial={enter ? pop.initial : false} animate={pop.animate} transition={pop.transition}>
                  <Icon name={step.state !== "error" ? stepIcons[step.operation] : step.operation === "research" ? "info" : "alert"} size={loading ? 20 : 14} />
                </motion.span>
              </span>
              <div className="oak-cot__body">
                <p className="oak-cot__step-title">
                  <span className={step.state === "running" ? "oak-turn__shimmer" : undefined}>{text.title}</span>
                  <span className="sr-only">, {stateLabels[step.state]}</span>
                  {duration ? <span className="oak-cot__duration">{duration}</span>
                    : elapsed >= 1 ? <span className="oak-cot__duration" data-live="" aria-hidden="true"><RollingNumber value={elapsed} />s</span> : null}
                  {/* The comma keeps a screen reader from running the time into the tally ("1.5s, 5 passages"). */}
                  {tally ? <><span className="sr-only">, </span><span className="oak-cot__tally">{tally}</span></> : null}
                </p>
                {text.error ? <p className={`oak-cot__detail ${step.operation === "research" ? "oak-cot__detail--note" : "oak-cot__detail--error"}`}>{text.error}</p>
                  : step.operation === "think" && text.detail ? <p className="oak-cot__detail oak-cot__thought">
                      {/* The model's own words type themselves in as they arrive, from the edge they reached (Beautiful UI StreamText). */}
                      {/* Ten words a second while it is the newest thought; once a newer step or the answer takes over, it catches up */}
                      {/* at up to three times that. A later thought waits its turn. */}
                      {/* Q16-D11: once the turn ends, what is left finishes within 400 ms, so the answer follows at once, not 2 to 3 s later. */}
                      <StreamText text={text.detail} live={typesIn.current.get(thoughtKey(step)) ?? false} caret={step.state === "running"} finishMs={live ? undefined : 400}
                        settle={!live || step.state !== "running"} paused={typing.indexOf(thoughtKey(step)) > 0} delay={enter && !reduced ? 380 : 0}
                        onDone={typesIn.current.get(thoughtKey(step)) ? () => markTyped(thoughtKey(step), text.detail!.length) : undefined} />
                    </p>
                  : text.detail ? <p className="oak-cot__detail">{text.detail}</p> : null}
                {peek.length ? <OakStepPeek rows={peek} more={step.more ?? 0} /> : null}
                {running && formingSteps.has(step.operation) ? <span className="oak-cot__forming" aria-hidden="true" /> : null}
                {step.id === retryStep ? <button type="button" className="oak-cot__again" aria-label={`${retryLabel}, runs the whole question again`} onClick={() => retryOakTurn(message.id)}>
                  <Icon name={retryLabel === "Continue" ? "continue" : "retry"} size={14} />{retryLabel}</button> : null}
                {wait || long ? <motion.p key={long ? "long" : "wait"} className="oak-cot__detail oak-cot__detail--slow" initial={enter ? reveal.initial : false} animate={reveal.animate}
                  transition={reveal.transition}><Icon name="clock" size={12} /><span>{long ? "Taking longer than usual. I'm still on it." : `${wait}.`}</span>
                  <button type="button" className="oak-cot__wait-stop" onClick={() => stopOakTurn()}>Stop</button></motion.p> : null}
                {/* Ticket 122: a planned turn's ghosts are drawn below before its answer lands, so its found sources wait for a visitor to open the folded trail. */}
                {step.id === lastSearch && !autoFolding && !(planned && live) ? <FoundSources message={message} citationLabels={citationLabels} /> : null}
              </div>
            </StepRow>;
          })}
          {/* Ticket 17: the plan the answer is being laid out to, named in the app's own words. */}
          {planned && message.plan ? <motion.li layout={reduced ? false : "position"} className="oak-cot__step" data-state="done" data-kind="plan">
            <span className="oak-cot__node" aria-hidden="true"><span className="oak-cot__node-glyph"><Icon name={oakMeaningIcons["reasoning.trace"]} size={14} /></span></span>
            <div className="oak-cot__body"><p className="oak-cot__step-title">{oakPlanLine(message.plan.blocks)}</p></div>
          </motion.li> : null}
        </ol>
    </ChainOfThoughtContent> : null}
  </ChainOfThought>;
}
