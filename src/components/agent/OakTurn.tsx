import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Suggestion, Suggestions } from "@/components/ui/suggestion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { OakSprite, useOakSprites, type OakActivitySpritePose } from "./OakActivitySprite";
import { OakChainOfThought } from "./OakChainOfThought";
import { OakAnswerSources, oakAnswerRevealPlan } from "./OakWorkAnswer";
import { oakAnswerOrnamentOn } from "@/lib/oakFlags/answerOrnament";
import { oakLazyView } from "@/lib/openui/figure/oakLazyView";
import { OakArrangedAnswer, OakContactAfter, oakOpenUIProposes } from "./OakOpenUIAnswer";
import { OakDocumentAnswer } from "./OakDocumentAnswer";
import { OakRoleFitReview, OakRoleFitSkeleton } from "./OakRoleFitReview";
import { OakAdviceAnswer } from "./OakAdviceAnswer";
import { OakPublicResearch } from "./OakPublicResearch";
import { bindOakRedo, markOakRedo, OakWhatChanged, oakWhatChangedPrevious } from "./OakWhatChanged";
import { oakWhatChangedOn } from "@/lib/oakFlags/whatChanged";
import { OakQuoteChip } from "./OakQuoteChip";
import { OakNextStep, OakOtherWays, runOakNextStep } from "./OakNextStep";
import { oakEditEarlierOn } from "@/lib/oakChatFlags";
import { oakPlanFirstOn } from "@/lib/oakFlags/planFirst";
import { oakCardAfterAnswerOn } from "@/lib/oakFlags/cardAfterAnswer";
import { oakShowMeAsOn } from "@/lib/oakFlags/showMeAs";
import { oakNextStep, oakNextSteps } from "@/lib/oakNextStep";
import { useOakRecordFacts } from "@/lib/oakRecordFacts";
import { oakAllowanceComesBack, oakBudgetReset } from "@/lib/oakAllowance";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakPortfolioNavigationHref } from "@/lib/oakPortfolioNavigation";
import { addOakQuote, askOakSuggestion, beginOakQuestionDraft, declineOakContactOffer, getOakRoleDescription, getOakWorkspace, oakRetryKind, oakSendNeverArrived, openOakContactBrief, removeOakQuote, retryOakTurn, setOakDraft, subscribeOakWorkspace, useOakWorkspace, type OakConversationMessage, type OakWorkspaceState } from "@/lib/oakWorkspace";
import type { OakAnswer } from "../../../packages/oak-agent-contracts/src/types";

type OakAllowanceStatus = NonNullable<OakWorkspaceState["authStatus"]>["allowance"];
import { OAK_REVEAL_BASE_MS, oakArrival, oakMotion } from "@/lib/oakMotion";
import { oakAnswerKinds, oakMeaningIcons, oakScopeDeclineKind, type OakTone } from "@/lib/oakMeaningIcons";
import { oakIsScopeDecline } from "@/lib/oakSuggestions";
import { oakAnswerSources, oakAnswerWithSources, oakOpenInPrompt, oakOpenInProviders } from "@/lib/oakAnswerActions";
import { oakNoteLast } from "@/lib/oakGapNoteOrder";
import { advanceOakSettle, settleOakAfterFallback, useOakSettle } from "@/lib/openui/settlePhase";
import { OakRelated, OakRelatedTitle } from "./OakRelated";
import { oakOpenUIPillQuestions } from "../../../packages/oak-agent-contracts/src/openui/verdict";

type ShowMeAsProps = React.ComponentProps<typeof OakArrangedAnswer> & { purpose?: string | null };
type OrnamentProps = { messageId: string; answer: OakAnswer; citationLabels?: OakCitationLabels; copied: boolean; onCopy: () => void; latest?: boolean; settled?: boolean };
const Nothing = () => null;
// Until its chunk lands, the ornament's place under the newest answer (where it opens) is held, so the transcript does not grow
// late. It sets the capsule's own controls and labels (buttons keep their edge), so where they wrap the held box wraps the same.
const OrnamentGhost = ({ latest, answer }: OrnamentProps) => latest ? <div className="oak-ornament" data-ornament-ghost aria-hidden="true" inert>
  <button type="button" className="oak-ornament__action" tabIndex={-1}><Icon name="copy" /><span>Copy</span></button>
  {(answer.kind === "sourced" || answer.kind === "gap") && oakAnswerSources(answer)[0] ? <span className="oak-ornament__action"><span>Open page</span><Icon name="arrowUpRight" /></span> : null}
  <button type="button" className="oak-ornament__action" tabIndex={-1}><Icon name="followUp" /><span>Ask a follow-up</span></button>
</div> : null;
const OakShowMeAs = oakLazyView<ShowMeAsProps>(() => import("./OakShowMeAs").then(module => ({ default: module.OakShowMeAs })), OakArrangedAnswer, OakArrangedAnswer);
const OakAnswerOrnament = oakLazyView<OrnamentProps>(() => import("./OakAnswerOrnament").then(module => ({ default: module.OakAnswerOrnament })), OrnamentGhost, Nothing,
  ({ latest }) => Boolean(latest));

/**
 * A structured answer (advice, role fit, document) builds part by part on the same post-fold clock as a work answer's
 * words: each part rises out of a soft blur 110ms after the last (`--oak-part` in oakAgent.css, capped at eight).
 */
function oakCardPartsMs(parts: number) {
  return parts ? (Math.min(parts, 8) - 1) * 110 + 320 : 0;
}

/** Art beside the answer-kind eyebrow; kinds without art keep their icon. */
const kindPoses: Partial<Record<OakAnswer["kind"], OakActivitySpritePose>> = { gap: "gap", "role-fit": "comparing", advice: "lantern", document: "quoting" };
/** D130: the eyebrow's tile takes the tone of the tool behind that kind of answer (the Tools menu tiles); a gap stays gray. */
// Review v4: a gap is a caution, so it takes the warning gold the research status uses, not a quiet gray.
const kindTones: Partial<Record<OakAnswer["kind"], OakTone>> = { gap: "gold", "role-fit": "violet", advice: "gold", document: "blue" };
const MotionMessage = motion.create(Message);
const MotionBubble = motion.create(Bubble);
const MotionFooter = motion.create(MessageFooter);

/**
 * Questions only Steve can answer (rates, pay, start dates): Oak says so plainly and hands over two ways forward,
 * writing to Steve or drafting the question first. A visitor who only asked how to reach him (`reason` "contact") reads
 * how, with no refusal. Same anatomy as a stopped card, in a friendly violet tone.
 */
function OakHandoff({ offerDraft, reason, contactPreference, onContact }: { offerDraft: boolean; reason?: "contact"; contactPreference: OakWorkspaceState["contactPreference"]; onContact: () => void }) {
  const sprites = useOakSprites();
  const draftable = offerDraft && contactPreference === "open";
  return <div className="oak-turn__stopped oak-turn__handoff" data-tone="handoff">
    <span className="oak-turn__stopped-art oak-art-tile" aria-hidden="true">{sprites.handoff ? <OakSprite pose="handoff" size="medium" /> : <Icon name="mail" />}</span>
    <div className="oak-turn__stopped-body">
      <p className="oak-turn__stopped-title">{reason === "contact" ? "You can write to Steve directly" : "That one's for Steve"}</p>
      <p className="oak-turn__stopped-detail">{reason === "contact" ? `Use Contact Steve to reach him.${draftable ? " I can help you draft it first." : ""}`
        : "I can't quote rates or pay, or promise a start date. Steve answers that himself."}</p>
    </div>
    {/* v3 review: the two ways forward share one row across the whole card, under the art and the words. */}
    {contactPreference === "open" ? <span className="oak-turn__stopped-actions oak-turn__handoff-actions">
      <Button type="button" size="sm" onClick={onContact}><Icon name="mail" />Contact Steve</Button>
      {offerDraft ? <Button type="button" variant="secondary" size="sm" onClick={reason === "contact" ? openOakContactBrief : beginOakQuestionDraft}>
        <Icon name={oakMeaningIcons["tool.draft"]} />{reason === "contact" ? "Draft a contact brief" : "Draft my question"}</Button> : null}
    </span> : null}
  </div>;
}

/** Oak's short acknowledgment when the visitor asks it to stop: a nod, nothing more. */
function OakAcknowledgment({ text }: { text: string }) {
  const sprites = useOakSprites();
  return <p className="oak-turn__ack">
    <span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone="leaf">
      {sprites.nod ? <OakSprite pose="nod" size="badge" /> : <Icon name="checkmark" />}</span></span>
    <span>{text}</span>
  </p>;
}

/**
 * Q04: an ambiguous question gets 2 to 4 pills instead of a guess (Perplexity f721480e). A pill asks it as the visitor's
 * next question; the message box stays open for their own words. Older turns keep their pills, inactive.
 */
function OakNarrowing({ question, options, latest }: { question: string; options: readonly string[]; latest: boolean }) {
  return <div className="oak-narrow">
    <p className="oak-narrow__question">{question}</p>
    <div className="oak-narrow__options"><Suggestions role="group" aria-label={question}>
      {options.map((option, order) => <Suggestion key={option} suggestion={option} order={latest ? order : undefined} disabled={!latest}
        onSelect={text => { if (!askOakSuggestion(text)) document.getElementById("oak-composer-input")?.focus(); }} />)}
    </Suggestions></div>
    {latest ? <p className="oak-narrow__hint">Pick one, or type your own.</p> : null}
  </div>;
}

/**
 * Q04: "Email Steve for me" becomes a proposal, never an error: Oak can't send, so one action opens the brief with the
 * visitor's own words (Rox 3d205a5d, ClickUp 0ca0b550), and a receipt says nothing went out (Manus c64c719b).
 */
function OakProposal({ question, onContact }: { question: string; onContact: () => void }) {
  const [opened, setOpened] = React.useState(false);
  return <div className="oak-proposal">
    {/* A glyph, not the handoff pose: each Oak pose belongs to one state (D64); Q10 draws this card its own. */}
    <span className="oak-art-tile" aria-hidden="true"><Icon name="mailSend" /></span>
    <div className="oak-proposal__body">
      <p className="oak-proposal__title">Write to Steve with a short brief</p>
      <p className="oak-proposal__detail">I can’t send messages for you. I’ll start a brief with your words, and you send it yourself.</p>
      {opened ? <p className="oak-proposal__receipt"><Icon name="checkmark" size={14} />Brief opened. Nothing is sent until you send it.</p>
        : <div className="oak-proposal__actions">
          <Button type="button" size="sm" onClick={() => { runOakNextStep({ action: "brief", ...oakNextSteps.brief }, question); setOpened(true); }}>
            <Icon name="mail" />Start the brief</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onContact}>Contact Steve</Button>
        </div>}
    </div>
  </div>;
}

/** The visitor's own words from a draft card, without the Worker's provenance label. */
export function oakVisitorRequest(text: string) {
  return text.replace(/^Visitor-supplied request:\s*/, "");
}

const OAK_NARROW = "(max-width: 640px)";
const subscribeNarrow = (change: () => void) => {
  const query = window.matchMedia(OAK_NARROW);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
function IconAction({ icon, label, hint, side, answerCopy, underQuestion, onClick }: { icon: IconName; label: string; hint?: string; side?: "top" | "bottom" | "left"; answerCopy?: boolean; underQuestion?: boolean; onClick: () => void }) {
  // A changed glyph (copy to check) pops in, keyed so Motion replays it on each change; the first glyph renders at rest (D69).
  const pop = oakMotion("pop", useReducedMotion());
  // Tickets 209 and 240: a phone has no free side beside a question, so Edit's label alone opens under the whole question.
  const narrow = React.useSyncExternalStore(subscribeNarrow, () => window.matchMedia(OAK_NARROW).matches, () => false) && Boolean(underQuestion);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const clearQuestion = ({ side: placed }: { side: string }) => {
    const button = trigger.current?.getBoundingClientRect();
    const question = trigger.current?.closest(".oak-turn__question")?.getBoundingClientRect();
    if (!button || !question) return 8;
    return 4 + (placed === "top" ? button.top - question.top : question.bottom - button.bottom);
  };
  return <Tooltip>
    <TooltipTrigger ref={trigger} render={<Button type="button" variant="ghost" size="icon" aria-label={hint ? `${label}. ${hint}` : label} data-answer-copy={answerCopy || undefined} onClick={onClick} />}>
      {/* popLayout takes the leaving glyph out of flow, so copy and check never sit side by side. */}
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={icon} className="oak-icon-swap" initial={pop.initial} animate={pop.animate} exit={pop.exit} transition={pop.transition}><Icon name={icon} /></motion.span>
      </AnimatePresence>
    </TooltipTrigger>
    {narrow ? <TooltipContent side="bottom" align="start" sideOffset={clearQuestion}>{label}</TooltipContent>
      : <TooltipContent side={side}>{hint ? <>{label}<span className="oak-turn__hint">{hint}</span></> : label}</TooltipContent>}
  </Tooltip>;
}

/**
 * PR 1e (behind oakEditEarlierQuestions): Edit on a question that has answers after it. Edit only fills the message box, so
 * nothing already on screen moves, changes or goes: sending adds the question at the end, and the note says so. A message
 * the visitor already typed is never replaced; the note asks them to send or clear it first.
 */
const OAK_EDIT_EARLIER_HINT = "Sending asks it again at the end. The answers stay.";
/** An earlier plain question offers Edit; a pasted role, advice request or private document turn has no plain words to bring back. */
export function oakEarlierEditable(message: Pick<OakConversationMessage, "role" | "taskKind" | "privateDocumentTurn">) {
  return oakEditEarlierOn() && message.role === "user" && !message.privateDocumentTurn && (!message.taskKind || message.taskKind === "question");
}
function OakEditEarlierNote({ staged, onDone }: { staged: boolean; onDone: () => void }) {
  const state = useOakWorkspace();
  const turns = React.useRef(state.messages.length);
  const finished = state.messages.length !== turns.current || !state.draft.trim();
  React.useEffect(() => { if (finished) onDone(); }, [finished, onDone]);
  return <p className="oak-turn__edit-note" role="status" aria-live="polite">
    <Icon name={staged ? "pencilEdit" : "alert"} size={14} />
    {staged ? "In the message box. Sending asks it again at the end. The answers here and below stay as they are."
      : "Your message is still in the box. Send or clear it, then edit this question."}
  </p>;
}
const replacedProgram = (answerId: string) => {
  const turns = getOakWorkspace().messages;
  return oakWhatChangedPrevious(turns, turns.findIndex(turn => turn.id === answerId));
};
/** What an earlier Edit last put in the box (the words and the quote chips), so a second Edit can tell it from the visitor's own typing. */
let lastEarlierEdit: { draft: string; quoteIds: readonly string[] } | null = null;
/**
 * Brings an earlier question back to the box with its words and, when it was sent with quotes, the same quote chips, so sending
 * asks the same question again. The box is replaced only when it is empty or still holds exactly what the last Edit put there.
 */
function stageEarlierEdit(words: string, quotes: readonly string[], sources: readonly (string | null)[] | undefined): "staged" | "kept" {
  const now = getOakWorkspace(), prior = lastEarlierEdit;
  const untouched = Boolean(prior) && now.draft === prior!.draft && now.quotes.length === prior!.quoteIds.length && now.quotes.every((quote, index) => quote.id === prior!.quoteIds[index]);
  const holdsSame = now.draft.trim() === words.trim() && now.quotes.length === quotes.length && now.quotes.every((quote, index) => quote.text === quotes[index]);
  if ((now.draft.trim() || now.quotes.length) && !untouched && !holdsSame) return "kept";
  if (!holdsSame) {
    for (const quote of now.quotes) removeOakQuote(quote.id);
    setOakDraft(words);
    quotes.forEach((text, index) => addOakQuote(text, sources?.[index] ?? undefined));
  }
  const after = getOakWorkspace();
  lastEarlierEdit = { draft: after.draft, quoteIds: after.quotes.map(quote => quote.id) };
  return "staged";
}

/**
 * Review v4 (Perplexity and Claude footers): the row keeps only Copy and Ask again beside the Sources pill. Copy with
 * sources and the three open-in links live in one More menu, each link still naming its site and opening a new tab.
 */
function OakAnswerMore({ copied, onCopySources, openInPrompt }: { copied: boolean; onCopySources: () => void; openInPrompt: string }) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  return <span className="oak-turn__more" ref={node => setHost(node?.closest<HTMLElement>(".oak-workspace") ?? null)}>
    <Menu modal={false}>
      <Tooltip>
        <TooltipTrigger render={<MenuTrigger aria-label="More actions" render={<Button type="button" variant="ghost" size="icon" />} />}>
          <Icon name="moreHorizontal" />
        </TooltipTrigger>
        <TooltipContent>More</TooltipContent>
      </Tooltip>
      <MenuContent container={host ?? undefined} side="top" align="start" className="oak-turn__more-menu" aria-label="More actions">
        <MenuGroup>
          <MenuItem nativeButton render={<button type="button" />} onClick={onCopySources}>
            <Icon name={copied ? "copyCheck" : oakMeaningIcons["action.copy-with-sources"]} />{copied ? "Copied with sources" : "Copy with sources"}
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup aria-label="Open this answer in another assistant">
          {oakOpenInProviders.map(provider => <MenuItem key={provider.id} render={<a className="oak-turn__more-link" href={provider.href(openInPrompt)}
            target="_blank" rel="noopener noreferrer" aria-label={`Open in ${provider.label} (new tab)`} />}>
            <img src={provider.icon} alt="" width={16} height={16} />Open in {provider.label}
          </MenuItem>)}
        </MenuGroup>
      </MenuContent>
    </Menu>
  </span>;
}

type StoppedKind = NonNullable<OakConversationMessage["failure"]> | "stopped";
/**
 * Every way a turn can stop, in Oak's voice: what happened, what next, the art for that state, and which ways forward it
 * offers. Q03: one neutral notice for all of them; only a real limit tints its tile gold (brief O4, O5). Retry appears only
 * where asking again can help, and a limit never puts the question back in the box, since sending it meets the same limit.
 * Q13: a pause and a spent budget each offer one way forward (Retry after the pause, Contact Steve until the budget opens).
 */
const stoppedCards: Record<StoppedKind, { title: string; detail: string; poses: readonly OakActivitySpritePose[]; icon: IconName;
  tone: "limit" | "neutral"; retry?: boolean; contact?: boolean; askElsewhere?: boolean; signIn?: boolean }> = {
  // Q13: the detail is written per visitor (oakAllowanceComesBack), since the 30-day cap returns answers on another clock.
  allowance: { title: "You have used the answers available for now.", detail: "One comes back every 4 hours. Ask again then, or contact Steve.",
    poses: ["waiting"], icon: "clock", tone: "limit", contact: true },
  unavailable: { title: "I can’t answer on this site yet.", detail: "Nothing was sent, and your question is back in the message box.",
    poses: ["closed"], icon: "agentClosed", tone: "neutral", contact: true, askElsewhere: true },
  offline: { title: "The connection dropped.", detail: "Your question is back in the message box, ready when you're online.",
    poses: ["unplugged"], icon: "offline", tone: "neutral", retry: true },
  unreachable: { title: "I couldn't reach my server just now.", detail: "Your question is back in the message box. Try again in a moment.",
    poses: ["far-server", "unplugged"], icon: "offline", tone: "neutral", retry: true },
  busy: { title: "The model is busy right now.", detail: "I asked twice and it didn't answer in time. Your question is back in the box.",
    poses: ["busy-line", "waiting"], icon: "clock", tone: "neutral", retry: true },
  paused: { title: "New questions are paused for a few minutes.", detail: "A few answers didn't finish. Your question and your answers are untouched.",
    poses: ["short-break", "waiting"], icon: "clock", tone: "neutral", retry: true },
  budget: { title: "I've used this month's free answers.", detail: "New questions open again next month.",
    poses: ["budget-paused"], icon: "clock", tone: "limit", contact: true },
  "budget-today": { title: "I've used today's free answers.", detail: "New questions open again tomorrow.",
    poses: ["budget-paused"], icon: "clock", tone: "limit", contact: true },
  network: { title: "This network has used today's free answers.", detail: "Everyone on one network shares a daily limit. New questions open again tomorrow.",
    poses: ["budget-paused"], icon: "clock", tone: "limit", contact: true, askElsewhere: true },
  // R19 live: the guardrail's own card, calm and plain. No Retry: the same words meet the same filter.
  injection: { title: "That read like instructions to an AI, so I stopped.", detail: "Ask it as a question about Steve's work instead.",
    poses: [], icon: "lock", tone: "neutral" },
  stopped: { title: "This answer stopped before it finished.", detail: "Your question is back in the message box.",
    poses: ["retry"], icon: "alert", tone: "neutral", retry: true },
};

/** What happened to a stopped turn, in the words its notice uses, for the one live region (Q03-G4). */
export function oakStoppedTitle(message: Pick<OakConversationMessage, "failure" | "state">) {
  return message.state === "interrupted" && !message.failure ? "You stopped this answer." : stoppedCards[message.failure ?? "stopped"].title;
}

/** One anatomy for every stopped turn: art at the left, a bold title, one quiet line, then the ways forward on their own row. */
function OakStoppedCard({ message, question, retry, onContact, onSignIn, questionInBox = true, allowance }: {
  /** The visitor's allowance, so a spent one says truthfully how its answers come back. */
  allowance?: OakAllowanceStatus;
  message: OakConversationMessage; question: string; retry: "resend" | "ask-again" | null; onContact: () => void; onSignIn?: () => void; guest?: boolean;
  /** False when a draft typed while the answer ran stayed in the box instead of this question (D156). */
  questionInBox?: boolean;
}) {
  const sprites = useOakSprites();
  const kind: StoppedKind = message.failure ?? "stopped";
  const card = stoppedCards[kind];
  // A turn the visitor stopped shows the paused pose; one that failed shows the retry pose.
  const poses = kind === "stopped" && message.state === "interrupted" ? ["paused", ...card.poses] as const : card.poses;
  const pose = poses.find(candidate => sprites[candidate]);
  // T23a-11: a send that never arrived offers Retry on the visitor's bubble, so the card does not repeat it.
  const offerRetry = card.retry && retry !== null && !oakSendNeverArrived(message);
  const offerSignIn = card.signIn && onSignIn;
  // Every visitor's answers refill the same way (ADR 0002), so guests see the same card. A paused budget names its reset time.
  const title = card.title;
  const detail = !questionInBox ? `${offerRetry ? `${message.state === "interrupted" ? "Continue" : "Retry"} sends this question again. ` : ""}What you were typing stays in the message box.`
    : kind === "budget" || kind === "budget-today" || kind === "network" ? `${oakBudgetReset(kind === "budget" ? "month" : "today")}. Ask again then, or contact Steve.`
    : kind === "allowance" ? `${oakAllowanceComesBack(allowance)} Ask again then, or contact Steve.`
    : card.detail;
  const actions = offerRetry || card.contact || card.askElsewhere || offerSignIn;
  return <div className="oak-turn__stopped" role="note" data-failure={message.failure} data-tone={card.tone}>
    <span className="oak-turn__stopped-art oak-art-tile" aria-hidden="true">{pose ? <OakSprite pose={pose} size="medium" /> : <Icon name={card.icon} />}</span>
    <div className="oak-turn__stopped-body">
      <p className="oak-turn__stopped-title">{title}</p>
      <p className="oak-turn__stopped-detail">{detail}</p>
      {actions ? <div className="oak-turn__stopped-actions">
        {/* Q09: a turn the visitor stopped continues; one that failed retries. Each verb is its own word. */}
        {offerRetry ? <Button type="button" variant="secondary" size="sm" onClick={() => retryOakTurn(message.id)}>
          {message.state === "interrupted" ? <><Icon name="continue" />Continue</> : <><Icon name="retry" />Retry</>}</Button> : null}
        {offerSignIn ? <Button type="button" size="sm" onClick={onSignIn}><Icon name="login" />Sign in to save conversations</Button> : null}
        {card.contact ? <Button type="button" variant={offerRetry ? "ghost" : "secondary"} size="sm" onClick={onContact}><Icon name="mail" />Contact Steve</Button> : null}
        {/* The visitor's own question goes to that site with the public llms.txt, so each link names it and opens a new tab. */}
        {card.askElsewhere ? <span className="oak-turn__open-in" role="group" aria-label="Ask this question in another assistant">
          {oakOpenInProviders.map(provider => <Tooltip key={provider.id}>
            <TooltipTrigger render={<a className="oak-turn__open-in-link" href={provider.href(oakOpenInPrompt(question))} target="_blank" rel="noopener noreferrer"
              aria-label={`Ask in ${provider.label} (new tab)`} />}>
              <img src={provider.icon} alt="" width={16} height={16} />
            </TooltipTrigger>
            <TooltipContent>Ask in {provider.label}</TooltipContent>
          </Tooltip>)}
        </span> : null}
      </div> : null}
    </div>
  </div>;
}

/**
 * Returns the reply's id and whether Retry can resend it, as one string so the store read stays stable between keystrokes.
 */
function sendFailedAfter(questionId: string) {
  const state = getOakWorkspace(), index = state.messages.findIndex(message => message.id === questionId), reply = state.messages[index + 1];
  if (index < 0 || !reply || !oakSendNeverArrived(reply)) return null;
  return `${oakRetryKind(state, reply.id) === "resend" ? "retry" : "none"}:${reply.id}`;
}

function OakSendFailed({ questionId }: { questionId: string }) {
  const failed = React.useSyncExternalStore(subscribeOakWorkspace, () => sendFailedAfter(questionId), () => null);
  if (!failed) return null;
  const [retry, replyId] = [failed.startsWith("retry:"), failed.slice(failed.indexOf(":") + 1)];
  return <p className="oak-turn__send-failed"><Icon name="alert" size={14} /><span>Failed to send</span>
    {retry ? <Button type="button" variant="ghost" size="sm" onClick={() => retryOakTurn(replyId)}><Icon name="retry" size={14} />Retry</Button> : null}</p>;
}

/** One transcript turn: the visitor's message, or Oak's visible reasoning, validated answer and actions. */
export function OakTurn({ message, question, asked = question, questionInBox, allowance, progress, citationLabels, contactPreference, retry, copied, onCopy, onContact, onSignIn, onAnswered, guest = false, enter = true, opening = false, latest = false, usedTools, editable = false, editsEarlier = false, related = [] }: {
  /** v3: the newest answer's follow-up questions, shown as rows under it. */
  related?: readonly string[];
  /** Q09: this is the newest question and nothing is running, so it offers Edit question. */
  editable?: boolean;
  /** PR 1e: `editable` is on a question with turns after it (set only behind oakEditEarlierQuestions). */
  editsEarlier?: boolean;
  /** Q13: the visitor's allowance, for the spent-allowance card's refill line. */
  allowance?: OakAllowanceStatus;
  /** Q06: tools an earlier turn of this chat already used, so the next-step card never offers them again. */
  usedTools?: ReadonlySet<import("@/lib/oakNextStep").OakNextStepAction>;
  /** `question` is the visitor's own words; `asked` is the question as sent, quotes included, for links that export it (D149). */
  message: OakConversationMessage; question: string; asked?: string; questionInBox?: boolean; progress: string; citationLabels?: OakCitationLabels;
  contactPreference: OakWorkspaceState["contactPreference"]; retry: "resend" | "ask-again" | null;
  copied: string | null; onCopy: (key: string, text: string) => void; onContact: () => void; enter?: boolean;
  /** Offered on the allowance card when a guest can sign in for an account allowance. */
  onSignIn?: () => void;
  /** Kept for callers; every visitor now sees the same refilling-allowance card (ADR 0002). */
  guest?: boolean;
  /** The conversation's first answer: Oak is just getting ready, so the still pose stands in for the thinking loop. */
  opening?: boolean;
  /** The answer is on screen (after its trail folded), so the transcript can bring its start into view (D124). */
  onAnswered?: (id: string) => void;
  /** The conversation's newest turn: only its narrowing pills can ask. */
  latest?: boolean;
}) {
  const sprites = useOakSprites();
  const reduced = useReducedMotion();
  const entry = oakMotion("turn", reduced);
  const user = message.role === "user";
  const steps = message.steps ?? [];
  const stopped = message.state === "interrupted" || message.state === "failed";
  const answer = message.answer;
  const kind = !user && answer ? (oakIsScopeDecline(answer) ? oakScopeDeclineKind : oakAnswerKinds[answer.kind]) : undefined;
  const kindPose = answer ? kindPoses[answer.kind] : undefined;
  const quoted = user ? message.quoted : undefined;
  const [editNote, setEditNote] = React.useState<"staged" | "kept" | null>(null);
  const clearEditNote = React.useCallback(() => setEditNote(null), []);
  const editQuestion = () => {
    const words = quoted ? quoted.text : message.text;
    markOakRedo(message.id, getOakWorkspace().messages.length, () => {
      if (!editsEarlier) { setOakDraft(words); return true; }
      const note = stageEarlierEdit(words, quoted?.quotes ?? [], message.quoteSources);
      setEditNote(note);
      return note === "staged";
    });
    document.getElementById("oak-composer-input")?.focus();
  };
  React.useEffect(() => { if (user) bindOakRedo(message.id, getOakWorkspace().messages); }, [user, message.id]);
  // R19 review S4: a role-fit turn still reading draws its review's shape, one row per requirement line (the skeleton caps at six).
  const pendingRole = !user && !answer && message.state === "pending" ? getOakRoleDescription(message.id) : undefined;
  // Ticket 122: the plan arrives at the first search and the answer only after the model loop, so a planned turn draws its ghosts first.
  const preAnswer = !user && !answer && message.state === "pending" && oakPlanFirstOn() && Boolean(message.plan);
  const arranged = answer?.kind === "sourced" || answer?.kind === "gap" ? answer : null;
  // Ticket 230: the Worker's contact card part is drawn as the Contact card, by a work answer itself, else after the narrowing question or the Retry line.
  // shortcut: OakShowMeAs does not pass it on, so with that flag on the bare button stays; pass it through if both flip.
  const contactAfter = oakCardAfterAnswerOn() && !oakShowMeAsOn() && Boolean(arranged || answer?.kind === "clarify" || message.state === "failed") && message.cards.some(card => card.kind === "contact");
  const body = answer?.kind === "document" ? <OakDocumentAnswer answer={answer} />
    : answer?.kind === "advice" ? <OakAdviceAnswer answer={answer} citationLabels={citationLabels} contactPreference={contactPreference} onBrief={openOakContactBrief} onDecline={declineOakContactOffer} />
    : answer?.kind === "role-fit" ? <OakRoleFitReview answer={answer} citationLabels={citationLabels} onContact={onContact} roleDescription={getOakRoleDescription(message.id)} />
    : arranged || preAnswer ? React.createElement(oakShowMeAsOn() ? OakShowMeAs : OakArrangedAnswer, { id: message.id, answer: arranged, ui: message.ui, question,
      citationLabels, latest: latest && message.state === "complete", live: enter, plan: message.plan, pending: message.state === "pending", ...(contactAfter ? { contactAfter } : {}) })
    : answer?.kind === "contact" ? <OakHandoff offerDraft={answer.offerDraft} reason={answer.reason} contactPreference={contactPreference} onContact={onContact} />
    : answer?.kind === "declined" ? <OakAcknowledgment text={answer.acknowledgment} />
    : answer?.kind === "clarify" ? <OakNarrowing question={answer.question} options={answer.options} latest={latest && message.state === "complete"} />
    : answer?.kind === "proposal" ? <OakProposal question={question} onContact={onContact} />
    : message.text ? <p>{message.text}</p>
    : pendingRole ? <OakRoleFitSkeleton rows={pendingRole.split(/\n+/).filter(line => /\p{L}{3}/u.test(line)).length} />
    : null;
  const bodyOffersContact = (answer?.kind === "contact" && contactPreference === "open") || answer?.kind === "proposal" || answer?.kind === "role-fit" || contactAfter;
  // A live answer settles in in order: its label, the answer with each point and its sources, then the actions. A reopen renders still.
  const flow = enter && !user;
  // D87: while the trail's last thought is still typing, the answer waits under the held lines. D115: it also waits for the
  // trail to fold, so it lands in place below a still trail instead of sliding up under the reader.
  const [trailTyping, setTrailTyping] = React.useState(false);
  // Ticket 152: the trail's settle phase lives in settlePhase, which the transcript also reads before it moves the view.
  const settle = useOakSettle(message.id);
  const trailSettled = settle.phase === "folding" || settle.phase === "settled";
  const pending = message.state === "pending";
  const reportTrail = React.useCallback((settled: boolean, held: boolean) =>
    advanceOakSettle(message.id, settled ? "fold" : pending ? "pending" : "complete", held), [message.id, pending]);
  const foldEnd = React.useCallback(() => advanceOakSettle(message.id, "fold-end"), [message.id]);
  const trail = !user && (message.state === "pending" || steps.length > 0);
  // The Worker sends the answer before research and finish, so an answer that lands while the turn is still pending waits
  // too; it never shows under a live trail and then vanishes while the trail folds (D158).
  // Ticket 17: a planned answer is the exception; its lead and ghosts stand under the live trail, the point of the plan.
  const hold = flow && trail && !(oakPlanFirstOn() && message.plan) && ((message.state === "pending" && Boolean(answer)) ||
    (message.state === "complete" && (trailTyping || !trailSettled)));
  // A fold that never reports its end (a missed animation event) can never keep an answer off screen, nor a held fold the view.
  const foldWait = flow && trail && message.state === "complete" && !trailTyping && settle.phase !== "settled";
  React.useEffect(() => foldWait ? settleOakAfterFallback(message.id) : undefined, [foldWait, message.id, settle.phase]);
  let order = 0;
  const kindIn = oakArrival(kind ? order++ : order, flow, reduced);
  const bodyIn = oakArrival(body ? order++ : order, flow, reduced);
  const researchIn = oakArrival(message.research ? order++ : order, flow, reduced);
  const cardsIn = message.cards.map(() => oakArrival(order++, flow, reduced));
  // Actions wait for a work answer's last word to resolve, as in Beautiful UI's StreamingText.
  const arrival = oakArrival(order, flow, reduced);
  const revealMs = !flow || reduced || !answer ? 0 : answer.kind === "sourced" || answer.kind === "gap" ? oakAnswerRevealPlan(answer).total
    : oakCardPartsMs(answer.kind === "advice" ? 4 + (answer.evidence.length ? 1 : 0) + (answer.contactOffer && contactPreference === "open" ? 1 : 0)
      : answer.kind === "role-fit" ? 1 + answer.rows.length + (answer.coverage ? 1 : 0) + (answer.contactTopics.length ? 1 : 0)
      : answer.kind === "document" ? answer.claims.length + 2 : 0);
  const footerIn = revealMs ? { ...arrival, transition: { ...arrival.transition, delay: (OAK_REVEAL_BASE_MS + revealMs) / 1000 + 0.1 } } : arrival;
  // The actions stay out of the tab order until they have faded in, so focus never lands on a button nobody can see.
  const [footerSettled, setFooterSettled] = React.useState(!flow || Boolean(reduced));
  const answered = !user && !hold && Boolean(kind || body || message.research || message.cards.length || (message.state === "complete" && answer));
  // D128: at most one tool suggested from the visitor's own question and the validated answer kind.
  // Q17: an arranged answer that already offers a Proposal is that suggestion, so the card steps aside.
  // A bridge Quote draws its invitation once its record facts load, so this turn re-renders then and the card follows it.
  useOakRecordFacts("", answer && message.ui?.program.includes('"bridge"') ? answer.knowledgeRevision : "");
  const proposed = answer && (answer.kind === "sourced" || answer.kind === "gap") && oakOpenUIProposes(answer, message.ui, message.id);
  const suggested = !user && message.state === "complete" && !proposed ? oakNextStep(question, answer, contactPreference, usedTools) : null;
  // Ticket 230: the Contact card closing the answer is already the brief, so the brief next step steps aside.
  const nextStep = contactAfter && suggested?.action === "brief" ? null : suggested;
  const actionRow = Boolean(!user && message.state === "complete" && answer && !["contact", "declined", "clarify", "proposal"].includes(answer.kind));
  const relatedShown = related.length > 0 && message.state === "complete" && !hold;
  // An arranged answer's own follow-ups (its Pills block) are this turn's Related rows: they move under the action row.
  const arrangedRelated = actionRow && answer && (answer.kind === "sourced" || answer.kind === "gap")
    && oakOpenUIPillQuestions(message.ui, answer.claims.map(claim => claim.id)).length > 0;
  const relatedTitleId = `${message.id}-related`;
  // PR 1b: with a next step on screen, the whole Related section lives in its drawer.
  const relatedInDrawer = Boolean(nextStep) && (relatedShown || arrangedRelated);
  React.useEffect(() => { if (answered && message.state === "complete") onAnswered?.(message.id); }, [answered, message.state, message.id, onAnswered]);
  // D124: no skeleton under the trail; a held answer is marked on the turn so follow-ups and captures can wait for it.
  return <MotionMessage align={user ? "end" : "start"} data-state={message.state} data-held={hold ? "" : undefined}
    initial={enter ? entry.initial : false} animate={entry.animate} transition={entry.transition}>
    <MessageContent>
      <h3 className="sr-only">{user ? "You" : "Oak AI Agent"}</h3>
      {trail ? <OakChainOfThought message={message} question={question} progress={progress}
        citationLabels={citationLabels} enter={enter} opening={opening} onTyping={setTrailTyping} onSettled={reportTrail} onFoldEnd={foldEnd} retry={retry} /> : null}
      {/* D123: the quotes the question was sent with, read-only above the visitor's own words (kept through save and sign-in, D140). */}
      {quoted ? <div role="group" aria-label="Quoted from Oak's answer" className="oak-turn__quotes">{quoted.quotes.map((quote, index) => <OakQuoteChip key={index} text={quote} />)}</div> : null}
      {/* Review v6: the newest question's Edit sits beside its bubble, so the reply starts right under the question. */}
      {user && (quoted ? quoted.text : body) ? <div className="oak-turn__question">
        {/* Q09: the newest question can go back to the message box to be changed and sent again. */}
        {editable ? <div className="oak-turn__question-actions">
          {/* Ticket 106: wider screens open the tooltip beside the pencil, off the header controls and the Marker row; on a phone it opens under the whole question (209, 240). */}
          <IconAction icon="pencilEdit" label="Edit question" hint={editsEarlier ? OAK_EDIT_EARLIER_HINT : undefined} side="left" underQuestion onClick={editQuestion} />
        </div> : null}
        <Bubble variant="default"><BubbleContent>{quoted ? <p>{quoted.text}</p> : body}</BubbleContent></Bubble>
      </div> : null}
      {user ? <OakSendFailed questionId={message.id} /> : null}
      {user && editable && editsEarlier ? <Marker className="oak-turn__edit-again" render={<button type="button" onClick={editQuestion} />}>
        <MarkerIcon><Icon name="pencilEdit" size={14} /></MarkerIcon><MarkerContent>Edit and ask again from here</MarkerContent>
      </Marker> : null}
      {user && editsEarlier && editNote ? <OakEditEarlierNote staged={editNote === "staged"} onDone={clearEditNote} /> : null}
      {answered ? <div className="oak-turn__answer" data-arrive={flow && !reduced ? "live" : undefined}>
      {!user && message.ui?.status === "done" && oakWhatChangedOn() ? <OakWhatChanged next={message.ui.program}
        previous={replacedProgram(message.id)} /> : null}
      {kind ? <motion.p initial={kindIn.initial} animate={kindIn.animate} transition={kindIn.transition} className="oak-turn__kind" data-kind={answer?.kind}>
        <span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone={(answer && kindTones[answer.kind]) ?? "neutral"}>
          {/* v3: one Oak per turn. The folded trail already shows him, so the eyebrow keeps its glyph. */}
          {kindPose && sprites[kindPose] && !trail ? <OakSprite pose={kindPose} size="badge" /> : <Icon name={oakMeaningIcons[kind.meaning]} />}</span></span>
        <span>{kind.label}</span></motion.p> : null}
      {body ? <MotionBubble initial={bodyIn.initial} animate={bodyIn.animate} transition={bodyIn.transition} variant="ghost"><BubbleContent>{body}</BubbleContent></MotionBubble> : null}
      {message.research ? <motion.div initial={researchIn.initial} animate={researchIn.animate} transition={researchIn.transition}>
        <OakPublicResearch event={message.research} state={message.state} answer={answer} citationLabels={citationLabels} question={question} /></motion.div> : null}
      {/* R12 (live, 2026-10-20): a handoff, proposal or role-fit review already offers Contact Steve in its own card, so the
          Worker's contact card would be a second, bare button under it. One way to write to Steve per turn. */}
      {message.cards.map((card, index) => card.kind === "contact" && bodyOffersContact ? null : (
        <motion.section initial={cardsIn[index]!.initial} animate={cardsIn[index]!.animate} transition={cardsIn[index]!.transition} className="oak-message__card" key={`${message.id}:card:${index}`}>
          {card.kind === "navigate" ? <a href={oakPortfolioNavigationHref(card.url)}><span>{card.label}</span><Icon name="arrowUpRight" /></a>
            : card.kind === "contact" ? <Button variant="secondary" size="sm" onClick={onContact}>Contact Steve</Button>
            : <>
              {/* The Worker copies the visitor's own request (never model text); its provenance label is for the record, not the reader. */}
              <h4><span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone="neutral"><Icon name={oakMeaningIcons["tool.draft"]} /></span></span>
                <span>Your request</span></h4>
              <p>{oakVisitorRequest(card.text)}</p>
              <Button variant="secondary" size="sm" onClick={() => onCopy(`${message.id}:${index}`, oakVisitorRequest(card.text))}>
                <Icon name={copied === `${message.id}:${index}` ? "copyCheck" : "copy"} />
                {copied === `${message.id}:${index}` ? "Request copied" : "Copy request"}
              </Button>
            </>}
        </motion.section>
      ))}
      {nextStep ? <OakNextStep step={nextStep} question={question} arrival={footerIn} /> : null}
      {relatedInDrawer ? <OakOtherWays arrival={footerIn}>
        {relatedShown ? <OakRelated questions={related} titleId={relatedTitleId} /> : <OakRelatedTitle id={relatedTitleId} />}
        {arrangedRelated ? <div className="oak-turn__pills-slot" id={`${message.id}-pills`} /> : null}
      </OakOtherWays> : null}
      {/* A handoff, a nod, a narrowing question or a proposal has nothing worth copying or taking to another assistant. */}
      {/* Mounted with the footer, so the capsule holds its place (undrawn) while the footer fades in and nothing grows late. */}
      {actionRow && answer && oakAnswerOrnamentOn() ? <OakAnswerOrnament messageId={message.id} answer={answer} citationLabels={citationLabels} copied={copied === `${message.id}:answer`} onCopy={() => onCopy(`${message.id}:answer`, oakNoteLast(answer, message.text))} latest={latest} settled={footerSettled} /> : null}
      {actionRow && answer ? <MotionFooter initial={footerIn.initial} animate={footerIn.animate} transition={footerIn.transition}
        inert={!footerSettled} onAnimationComplete={() => setFooterSettled(true)} className="oak-turn__footer">
        {/* Review v5: one row closes an answer. "Related" leads on the left, every action sits on the right, and the related
            rows follow below. With no related questions the actions keep the same right-hand place. */}
        {(relatedShown || arrangedRelated) && !relatedInDrawer ? <OakRelatedTitle id={relatedTitleId} /> : null}
        <div className="oak-turn__actions" role="group" aria-label="Answer actions">
        {answer.kind === "sourced" || answer.kind === "gap" ? <OakAnswerSources answer={answer} citationLabels={citationLabels} /> : null}
        <IconAction icon={copied === `${message.id}:answer` ? "copyCheck" : "copy"} label={copied === `${message.id}:answer` ? "Copied" : "Copy answer"} answerCopy
          onClick={() => onCopy(`${message.id}:answer`, oakNoteLast(answer, message.text))} />
        {retry ? <IconAction icon="retry" label="Ask again" onClick={() => {
          const messages = getOakWorkspace().messages, at = messages.findIndex(turn => turn.id === message.id);
          markOakRedo(messages[at - 1]?.id ?? "", messages.length, () => retryOakTurn(message.id));
        }} /> : null}
        <OakAnswerMore copied={copied === `${message.id}:sources`} openInPrompt={oakOpenInPrompt(asked, answer)}
          onCopySources={() => onCopy(`${message.id}:sources`, oakAnswerWithSources(oakNoteLast(answer, message.text), answer, citationLabels))} />
        </div>
        {/* v3: a confirmed answer needs no receipt line; only a held one says it is still settling. */}
        {message.usage?.state === "held" ? <span className="oak-turn__usage"><Icon name="clock" />Usage is still being confirmed.</span> : null}
      </MotionFooter> : null}
      {/* A turn stopped after its answer arrived has no action row, so its Sources pill stands alone under the answer. */}
      {!user && message.state !== "complete" && answer && (answer.kind === "sourced" || answer.kind === "gap") ? <div className="oak-turn__sources-only">
        <OakAnswerSources answer={answer} citationLabels={citationLabels} /></div> : null}
      {arrangedRelated && !relatedInDrawer ? <motion.div initial={footerIn.initial} animate={footerIn.animate} transition={footerIn.transition}
        className="oak-turn__pills-slot" id={`${message.id}-pills`} /> : null}
      {relatedShown && !relatedInDrawer ? <motion.div initial={footerIn.initial} animate={footerIn.animate} transition={footerIn.transition}>
        <OakRelated questions={related} labelledBy={actionRow ? relatedTitleId : undefined} /></motion.div> : null}
      </div> : null}
      {stopped ? <>
        {message.state === "interrupted" ? <Marker role="status" aria-live="off">
          <MarkerIcon><Icon name="stop" size={14} /></MarkerIcon><MarkerContent>Stopped</MarkerContent></Marker> : null}
        <OakStoppedCard message={message} question={asked} retry={retry} onContact={onContact} onSignIn={onSignIn} guest={guest} questionInBox={questionInBox} allowance={allowance} />
      </> : null}
      {contactAfter && !arranged ? <OakContactAfter id={message.id} /> : null}
    </MessageContent>
  </MotionMessage>;
}
