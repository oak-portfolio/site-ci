import { oakBridgeInvitationDraws } from "@/lib/oakBridgeInvitation";
import * as React from "react";
import type { OpenUIError } from "@openuidev/lang-core";
import { BuiltinActionType, createParser, Renderer, type ActionEvent, type ParseResult } from "@openuidev/react-lang";
import { Icon } from "@/components/ui/Icon";
import { socialLinks } from "@/data/homePage";
import { oakRenderLibrary, OakOpenUIScopeContext, type OakOpenUIScope } from "@/lib/openui";
import { oakCitationLabel, oakCitationUnverified, oakSourceDocument, oakSourceSite, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakNextSteps, type OakNextStepAction } from "@/lib/oakNextStep";
import { oakTypedSkeletons } from "@/lib/oakChatFlags";
import { oakPlanFirstOn } from "@/lib/oakFlags/planFirst";
import { oakRecordCardsAtPlanOn } from "@/lib/oakFlags/recordCardsAtPlan";
import { oakGapNoteBelowOn } from "@/lib/oakFlags/gapNoteBelow";
import { oakCardAfterAnswerOn } from "@/lib/oakFlags/cardAfterAnswer";
import { oakContactCardAllowed } from "@/lib/oakContactCardOnce";
import { oakOpenUIPendingChildren } from "@/lib/oakOpenUISkeletons";
import { OakGhostColumn, useOakGhostRows } from "@/lib/openui/ghostRows";
import { useOakSettleContinuity } from "@/lib/openui/a11y/useOakSettleContinuity";
import { oakLazyView } from "@/lib/openui/figure/oakLazyView";
import { askOakSuggestion, getOakWorkspace } from "@/lib/oakWorkspace";
import { sendOakOpenUIFallback, type OakOpenUIFailure } from "@/lib/oakFunnelClient";
import { OAK_OPENUI_BLOCKS } from "../../../packages/oak-agent-contracts/src/openui/blocks.generated";
import { oakOpenUILeadStream, oakOpenUIOverviewClaim, oakOpenUIProgramCovers, oakOpenUIShows, oakOpenUIToolsQuestion, type OakAnswerUi } from "../../../packages/oak-agent-contracts/src/openui/verdict";
import { oakOpenUIProposalFor, type OakOpenUIProposal } from "../../../packages/oak-agent-contracts/src/openui/prompt-options";
import type { OakAnswerPlan } from "../../../packages/oak-agent-contracts/src/openui/plan";
import type { OakAnswer } from "../../../packages/oak-agent-contracts/src/types";
import { OakClaimText, OakWorkAnswer } from "./OakWorkAnswer";
import { useOakRecordOnlyUi } from "./OakRecordOnlyBlocks";
import { OakPlanGhostColumn, oakPlanRecordCards } from "./OakRecordOnlyBlocks";
import { runOakNextStep } from "./OakNextStep";

type WorkAnswer = Extract<OakAnswer, { kind: "sourced" | "gap" }>;

type ContactCardProps = { conversationId: string | null };
const Nothing = () => null;
const OakContactCard = oakLazyView<ContactCardProps>(() => import("./OakContactCard").then(module => ({ default: module.OakContactCard })), null, Nothing);

/** Ticket 230: the Contact card closing a turn that carries the Worker's contact card part, once per conversation. */
export function OakContactAfter({ id }: { id: string }) {
  const conversationId = getOakWorkspace().conversationId;
  return oakContactCardAllowed(conversationId, id) ? <OakContactCard conversationId={conversationId} /> : null;
}

const oakSiteOwnUrls: ReadonlySet<string> = new Set(socialLinks.map(link => link.href));

/** Q17-G4: a SiteCard link is a same-site path or an approved site item's own URL (a new tab, said aloud); anything else is plain text. */
export function oakSiteLink({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  if (oakSiteOwnUrls.has(href)) return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a>;
  return /^\/(?![/\\])[^\s\\]*$/.test(href) ? <a className={className} href={href}>{children}</a> : <span className={className}>{children}</span>;
}
type Fallback = "parse" | "coverage" | "render";
/** Ticket 122: a planned turn whose answer has not arrived reads as an answer with no claims yet, so each ghost draws its bars. */
const PENDING: WorkAnswer = { kind: "sourced", claims: [], acknowledgment: null, schema: "oak.answer.v1", speaker: "oak-ai-host", operations: [],
  characterVersion: "", hardPolicyVersion: "", knowledgeRevision: "" };

/**
 * R16: what a card shows for a claim's first citation, from this page's labels of the answer's own knowledge revision (as
 * `oakSourceCover` reads them). Labels from another revision give no card, so the card renders as its plain block.
 */
export function oakOpenUICardOf(claim: WorkAnswer["claims"][number], knowledgeRevision: string, labels: OakCitationLabels | undefined) {
  const citation = claim.citations[0];
  const document = citation ? oakSourceDocument(citation, knowledgeRevision, labels) : undefined;
  if (!citation || !document) return null;
  return {
    title: oakCitationLabel(citation, knowledgeRevision, labels, oakSourceSite(citation.url).host),
    url: citation.url,
    page: document.canonicalUrl,
    verified: !oakCitationUnverified(citation, knowledgeRevision, labels),
    ...(document.cover ? { cover: document.cover } : {}),
    ...(document.card ? { card: document.card } : {}),
  };
}

/** Each proposal opens the same tool as the Tools menu row and the next-step card, with the visitor's question in it. */
export const oakOpenUIProposalTools: Record<OakOpenUIProposal, OakNextStepAction> = {
  compareRole: "role", prepareBrief: "brief", openDocuments: "documents", getAdvice: "advice",
};

/** The library's own parser, so the island judges a program exactly as the Renderer reads it, during the same render. */
let parser: ReturnType<typeof createParser> | undefined;
export function oakOpenUIParse(program: string): ParseResult {
  return (parser ??= createParser(oakRenderLibrary.toJSONSchema(), "Answer")).parse(program);
}

/** The proposal an arranged answer may show: the app's own next tool for this answer (Q04), or none. */
export function oakOpenUIProposalOf(answer: Pick<WorkAnswer, "nextTool"> | null | undefined): OakOpenUIProposal | null {
  return answer?.nextTool ? oakOpenUIProposalFor[answer.nextTool] : null;
}

/** True when a settled, valid layout shows the proposal the app allows, so the next-step card would only repeat it. */
export function oakOpenUIProposes(answer: Pick<WorkAnswer, "nextTool" | "claims" | "knowledgeRevision"> | null | undefined, ui: OakAnswerUi | null | undefined, messageId: string) {
  const allowed = oakOpenUIProposalOf(answer);
  const shown = answer && allowed ? oakOpenUIShows(ui, answer.claims.map(claim => claim.id)) : null;
  if (!answer || !shown) return false;
  if (shown.proposal === allowed) return true;
  const ids = /\bQuote\(\s*(\[[^\]]*\])\s*,\s*"bridge"/.exec(ui?.program ?? "")?.[1];
  if (!ids) return false;
  const text = answer.claims.filter(claim => ids.includes(`"${claim.id}"`)).map(claim => claim.text).join(" ");
  return oakBridgeInvitationDraws(text, answer.knowledgeRevision, messageId, allowed, false);
}

/** Every claim id the parsed layout places: only the claim props of blocks reached from the root count. */
export function oakPlacedClaims(result: ParseResult | null): Set<string> {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "element") return;
    for (const [key, prop] of Object.entries((value as { props: Record<string, unknown> }).props)) {
      // R27g: a CompareRow's second item's claim (also) is placed too.
      if ((key === "claim" || key === "also") && typeof prop === "string") found.add(prop);
      else if (key === "claims" && Array.isArray(prop)) prop.forEach(id => { if (typeof id === "string") found.add(id); });
      else visit(prop);
    }
  };
  visit(result?.root ?? null);
  return found;
}

/**
 * The settled verdict: a root, no parse errors or missing names, and every claim placed exactly as the answer has them.
 * Anything else renders the plain answer (the Markdown path), which is always complete underneath.
 */
export function oakOpenUIVerdict(program: string, result: ParseResult | null, claimIds: readonly string[]): Fallback | null {
  if (!result?.root || result.meta.incomplete || result.meta.errors.length || result.meta.unresolved.length || result.meta.orphaned.length) return "parse";
  const placed = oakPlacedClaims(result);
  return oakOpenUIProgramCovers(program, claimIds) && claimIds.every(id => placed.has(id)) && placed.size === claimIds.length ? null : "coverage";
}

/** Ticket 14b: the first error naming a registered block gives the component and its code; with none, the first error's code alone. */
export function oakOpenUIFirstFailure(errors: readonly Pick<OpenUIError, "code" | "component">[]): OakOpenUIFailure {
  const named = errors.find(error => error.component && Object.hasOwn(OAK_OPENUI_BLOCKS, error.component));
  return named ? { component: named.component, code: named.code } : errors[0] ? { code: errors[0].code } : {};
}

/** Only a URL the answer itself cites may open from a layout; anything else is ignored. */
export function oakOpenUICitedUrl(answer: WorkAnswer, url: unknown) {
  return typeof url === "string" && answer.claims.some(claim => claim.citations.some(citation => citation.url === url)) ? url : null;
}

class OakOpenUIBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}


/**
 * Q17: a sourced answer laid out by OpenUI. While the layout streams, claims it has not placed yet stay below it as plain
 * points, so nothing the visitor was reading disappears. A layout that fails to parse, leaves a claim out, or has a block
 * that throws once settled falls back to the plain answer and reports one `openui-fallback`. A block that throws while
 * streaming keeps OpenUI's last good rendering and reports nothing.
 * Ticket 17: with oakPlanFirst on, a pending turn's plan draws a ghost per planned block below what the layout has drawn.
 */
export function OakArrangedAnswer({ id, answer: given, ui: sent, question, citationLabels, latest, live = false, plan, pending = false, contactAfter = false }: {
  /** Null only on a pending planned turn before its answer arrives (ticket 122). */
  id: string; answer: WorkAnswer | null; ui: OakAnswerUi | null | undefined; question: string; citationLabels?: OakCitationLabels; latest: boolean;
  /** A turn arriving now, not a reopened chat: only a live fallback is reported, so a saved one is not counted again. */
  live?: boolean;
  /** The Worker's plan for this turn; ghosts draw only while the turn is still pending, so every terminal state clears them. */
  plan?: OakAnswerPlan | null;
  pending?: boolean;
  /** Ticket 230: the turn carries the Worker's contact card part, so the Contact card closes this answer. */
  contactAfter?: boolean;
}) {
  const answer = given ?? PENDING;
  const ui = useOakRecordOnlyUi(sent, plan, given);
  const [rendered, setRendered] = React.useState<Fallback | null>(null);
  const reported = React.useRef(false);
  const claimIds = React.useMemo(() => answer.claims.map(claim => claim.id), [answer]);
  const streaming = ui?.status === "streaming";
  const planned = oakPlanFirstOn() && pending && plan && (!ui || streaming) ? plan : null;
  // R17/R18: while streaming, the layout leads as the Worker will at settle (the written overview, else a multi-claim card's
  // first claim). A settled program is the Worker's own, already led and checked against the byte cap (R18 review, M1).
  const program = React.useMemo(() => !ui || ui.status === "fallback" ? "" : ui.status === "done" ? ui.program
    : oakOpenUILeadStream(ui.program, oakOpenUIOverviewClaim(answer.claims)), [ui, answer]);
  const result = React.useMemo(() => ui && ui.status !== "fallback" ? oakOpenUIParse(program) : null, [ui, program]);
  // Judged in the same render, so a failing layout never paints before the plain answer replaces it.
  const failed = rendered ?? (ui?.status === "done" ? oakOpenUIVerdict(program, result, claimIds) : null);
  React.useEffect(() => {
    if (!failed || !live || reported.current) return;
    reported.current = true;
    sendOakOpenUIFallback(failed, failed === "parse" ? oakOpenUIFirstFailure(result?.meta.errors ?? []) : {});
  }, [failed, live, result]);
  // OpenUI catches a block's own render crash and keeps its last good rendering, which is empty on first paint. Once settled,
  // that crash swaps in the plain answer; the report names the block here, before the swap's own effect could send it bare.
  const settled = ui?.status === "done";
  const onError = React.useCallback((errors: OpenUIError[]) => {
    const crashes = errors.filter(error => error.code === "render-error");
    if (!crashes.length || !settled) return;
    if (live && !reported.current) {
      reported.current = true;
      sendOakOpenUIFallback("render", oakOpenUIFirstFailure(crashes));
    }
    setRendered("render");
  }, [live, settled]);
  const scope = React.useMemo<OakOpenUIScope>(() => ({
    id,
    knowledgeRevision: answer.knowledgeRevision,
    claims: new Map(answer.claims.map(claim => [claim.id, claim])),
    renderClaim: claim => <OakClaimText claim={claim} knowledgeRevision={answer.knowledgeRevision} citationLabels={citationLabels} />,
    // Review v4: the Sources pill lives in the answer's action row, so a layout's own Sources slot renders nothing.
    renderSources: () => null,
    renderProposalArt: action => {
      const step = oakNextSteps[oakOpenUIProposalTools[action]];
      return <span className="oak-answer-tile" aria-hidden="true"><span className="oak-starter-glyph" data-tone={step.tone}><Icon name={step.icon} size={18} /></span></span>;
    },
    renderContactCard: conversationId => <OakContactCard conversationId={conversationId} />,
    proposal: oakOpenUIProposalOf(answer),
    proposed: Boolean(oakOpenUIProposalOf(answer)) && oakOpenUIShows(ui, claimIds)?.proposal === oakOpenUIProposalOf(answer),
    proposalStep: answer.nextTool ? oakNextSteps[answer.nextTool] : null,
    latest,
    // Q25-G30: a tools question lists every tool once and shows no tile that is not a tool.
    tools: oakOpenUIToolsQuestion(question) ? { listed: /^\s*\w+\s*=\s*Stack\(/m.test(program) } : undefined,
    cardOf: claim => oakOpenUICardOf(claim, answer.knowledgeRevision, citationLabels),
    // Ticket 16: only a streaming layout has children still to come.
    pending: streaming && oakTypedSkeletons ? oakOpenUIPendingChildren(program) : undefined,
    // A page from this answer's labels, or a Screens shot src from the loaded work record; never model text. Steve's pages open in place, another site in a new tab.
    renderLink: (url, text) => {
      const external = !oakSourceSite(url).firstParty;
      // R16 review: another site opens in a new tab, so the link says so to the eye and to a screen reader.
      return external ? <a href={url} target="_blank" rel="noopener noreferrer">{text}<span className="sr-only"> (new tab)</span>
        <Icon name="arrowUpRight" size={14} className="oak-openui-card__external" /></a> : <a href={url}>{text}</a>;
    },
    renderSiteLink: oakSiteLink,
  }), [id, answer, citationLabels, latest, question, program, streaming, ui, claimIds]);
  const onAction = React.useCallback((event: ActionEvent) => {
    if (!latest) return;
    if (event.type === BuiltinActionType.ContinueConversation) {
      // A pill asks its question as the visitor's next one; if a turn is running, it waits in the message box.
      if (!askOakSuggestion(event.humanFriendlyMessage)) document.getElementById("oak-composer-input")?.focus();
    } else if (event.type === BuiltinActionType.OpenUrl) {
      const url = oakOpenUICitedUrl(answer, event.params?.url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } else if (event.type in oakOpenUIProposalTools) {
      const action = oakOpenUIProposalTools[event.type as OakOpenUIProposal];
      runOakNextStep({ action, ...oakNextSteps[action] }, question);
    }
  }, [answer, latest, question]);
  const frame = React.useRef<HTMLDivElement>(null);
  const { onFocus, onBlur } = useOakSettleContinuity(frame, streaming, settled);
  const placed = oakPlacedClaims(result);
  const unplaced = answer.claims.flatMap(claim => placed.has(claim.id) ? [] : [claim.id]);
  const rows = useOakGhostRows({ id, plan: planned ? planned.blocks : null, result, unplaced, frame });
  // Ticket 169: a planned Project or Role block that names its records draws those cards from the page labels in place of its ghost.
  const recordCards = oakRecordCardsAtPlanOn() && planned ? oakPlanRecordCards(planned.blocks, citationLabels) : null;
  // Ticket 230: once per conversation, and never beside a Proposal already drawn as the Contact card.
  const after = contactAfter && oakCardAfterAnswerOn() && !(scope.proposed && scope.proposal === "prepareBrief") ? <OakContactAfter id={id} /> : null;
  if ((!ui && !planned) || ui?.status === "fallback" || failed || (answer.kind !== "sourced" && answer.kind !== "gap")) return <><OakWorkAnswer answer={answer} citationLabels={citationLabels} />{after}</>;
  // The ghosts stand in for the claims still to come; once none is waiting, unplaced claims show as plain points again.
  const waiting = streaming && !rows.some(row => !row.ghost.folding) ? answer.claims.filter(claim => !placed.has(claim.id)) : [];
  const noteBelow = oakGapNoteBelowOn() && answer.claims.length > 0;
  return <OakOpenUIScopeContext.Provider value={scope}>
    <div ref={frame} onFocus={onFocus} onBlur={onBlur} className="oak-openui-answer" data-streaming={streaming ? "" : undefined} aria-busy={streaming || undefined}>
      {answer.acknowledgment && !noteBelow ? <p>{answer.acknowledgment}</p> : null}
      <OakOpenUIBoundary onError={() => setRendered("render")}>
        {/* OpenUI drops a block's crash while streaming and never re-renders it; remounting once at settle lets one still
            crashing throw again where onError hears it (r110 P1). A saved chat mounts settled, so it never remounts. */}
        <Renderer key={settled ? "settled" : "streaming"} response={program} library={oakRenderLibrary} isStreaming={streaming} onAction={onAction} onError={onError} />
      </OakOpenUIBoundary>
      {recordCards?.size ? <OakPlanGhostColumn rows={rows} cards={recordCards} /> : <OakGhostColumn rows={rows} />}
      {waiting.map(claim => <p key={claim.id} className="oak-openui__prose oak-openui__waiting">
        <OakClaimText claim={claim} knowledgeRevision={answer.knowledgeRevision} citationLabels={citationLabels} /></p>)}
      {answer.acknowledgment && noteBelow ? <p className="oak-answer__note-below">{answer.acknowledgment}</p> : null}
    </div>
    {after}
  </OakOpenUIScopeContext.Provider>;
}
