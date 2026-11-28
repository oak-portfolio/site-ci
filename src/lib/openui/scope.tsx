import * as React from "react";
import { z } from "zod";
import { useIsStreaming } from "@openuidev/react-lang";
import type { OakSourceCard } from "@/lib/oakCitationLabels";
import { oakPendingFor, oakPendingPlaces, type OakPendingChildren, type OakPendingKind } from "@/lib/oakOpenUISkeletons";
import { announceOakBlock } from "./a11y/oakBlockAnnounce";
import type { AnswerClaim } from "../../../packages/oak-agent-contracts/src/types";
import type { OakOpenUIProposal } from "../../../packages/oak-agent-contracts/src/openui/prompt-options";
import { oakOpenUIStated } from "../../../packages/oak-agent-contracts/src/openui/verdict";
import type { OakClaimFacts } from "../../../packages/oak-agent-contracts/src/openui/block-view";

/** R16: the page a claim's first citation names, as an answer card shows it. Every fact here is the site's, not the model's. */
export type OakOpenUISource = Readonly<{
  title: string;
  /** The cited URL (with its section), for a Source card. */
  url: string;
  /** The page's own route, for a Project or Role title. */
  page: string;
  /** False when this page's labels cannot vouch for the URL: the card then shows its title without a link. */
  verified: boolean;
  /** The page's small cover (its og:image), for a Source card without a card image. */
  cover?: string;
  card?: OakSourceCard;
}>;

export type OakOpenUIScope = Readonly<{
  /** The answer's message id, so a proposal's receipt outlasts the transcript remounting while its tool is open. */
  id: string;
  /** The answer's knowledge revision, so a block that reads a record's reviewed facts asks for the right revision. */
  knowledgeRevision?: string;
  /** Ticket 326: the answer is a gap, so a flow Diagram draws no line of steps. */
  gap?: boolean;
  claims: ReadonlyMap<string, AnswerClaim>;
  /** A claim's validated text and its one source chip, drawn by the agent's own components. */
  renderClaim: (claim: AnswerClaim) => React.ReactNode;
  /** The answer's gathered Sources button, the same one a Markdown answer ends with. */
  renderSources: () => React.ReactNode;
  /** The tool's own tile (the Tools menu row it opens), so a proposal and the menu read as one tool. */
  renderProposalArt: (action: OakOpenUIProposal) => React.ReactNode;
  /** Ticket 49: the Contact card, drawn by the island so its fixed links (LinkedIn, a reviewed booking link) stay out of this library. */
  renderContactCard?: (conversationId: string | null) => React.ReactNode;
  /** The one proposal the app allows: the answer's own next tool (Q04), or none. Any other proposal renders nothing. */
  proposal: OakOpenUIProposal | null;
  /** That tool's next-step card (its own title and hint), so the proposal never wears model words and reads as that card. */
  proposalStep: Readonly<{ title: string; hint: string }> | null;
  /** A Proposal block in this layout already shows the allowed proposal, so a bridge Quote draws no second invitation. */
  proposed?: boolean;
  /** Older turns keep their layout but their pills and proposal stay inactive, like narrowing pills. */
  latest: boolean;
  /** R16: the card facts for a claim's first citation, only when the labels match the answer's knowledge revision. */
  cardOf?: (claim: AnswerClaim) => OakOpenUISource | null;
  /** Ticket 349: the turn view's claim facts (block-view.ts), the reading the printer also prints from. */
  claimFacts: OakClaimFacts;
  /** Ticket 349: the turn view's word that a Stack stands among the answer's blocks, so its Project and Role cards show their record by title. */
  stacked: boolean;
  /** R16: a card title's link to a page from those labels (the island draws it, so this library writes no link). */
  renderLink?: (url: string, text: string) => React.ReactNode;
  /** Q17-G4: a SiteCard row's link to a site page or an approved site item's own URL (the island draws it); absent, the row is plain text. */
  renderSiteLink?: (link: { href: string; className: string; children: React.ReactNode }) => React.ReactNode;
  /** Q25-G30: the visitor asked about tools. Cards drop tiles that are not tools, and their chips too when a Stack lists every tool once. */
  tools?: Readonly<{ listed: boolean }>;
  /** Ticket 327: the Worker's word that the question asks about roles or time; false drops each card's record line, absent keeps it. */
  dated?: boolean;
  /** Ticket 16: while the layout streams, the Stats, Compare and Timeline lines still waiting on children (absent when settled or off). */
  pending?: readonly OakPendingChildren[];
}>;

export const OakOpenUIScopeContext = React.createContext<OakOpenUIScope | null>(null);
export function useScope() {
  const scope = React.useContext(OakOpenUIScopeContext);
  if (!scope) throw new Error("openui-scope-missing");
  return scope;
}

/** ARCH@40: the claim facts the block views decide from (block-view.ts), read from the island's scope. */
export const useFacts = (): OakClaimFacts => useScope().claimFacts;

export const claimId = z.string().describe('A claim id from the input, such as "claim-2".');
export const label = (max: number) => z.string().max(max);

const LOADING: Record<OakPendingKind, string> = { board: "Loading the board", compare: "Loading the comparison", stats: "Loading the numbers", timeline: "Loading the timeline" };

/**
 * Ticket 16: how many children of this container have not streamed yet (0 once settled). The container finds its own entry
 * from the statement names of the children it already shows.
 */
export function useWaiting(kind: OakPendingKind, shown: readonly unknown[]) {
  const streaming = useIsStreaming();
  const { pending, id } = useScope();
  const waiting = waitingPlaces(streaming, pending, kind, shown);
  // The skeleton is aria-hidden, so its text equivalent is said once per answer through the transcript's one region.
  React.useEffect(() => { if (waiting > 0) announceOakBlock(`${id}:pending:${kind}`, LOADING[kind]); }, [id, kind, waiting > 0]);
  return waiting;
}

function waitingPlaces(streaming: boolean, pending: OakOpenUIScope["pending"], kind: OakPendingKind, shown: readonly unknown[]) {
  if (!streaming || !pending) return 0;
  const names = shown.map(item => (item as { statementId?: unknown } | null)?.statementId).filter((name): name is string => typeof name === "string");
  // Children written inline have no statement name; a container that shows only those has nothing left to hold places for.
  if (shown.length > 0 && names.length === 0) return 0;
  return oakPendingPlaces(oakPendingFor(pending, kind, names), names);
}

/** A placeholder is a settled item's shape drawn in bars; `data-pending` is what the shimmer, and its still reduced-motion form, key on. */
export const SkelBar = ({ size }: { size?: "short" | "long" | "value" | "chip" }) =>
  <span className="oak-openui-card__bar" data-short={size === "short" ? "" : undefined} data-long={size === "long" ? "" : undefined}
    data-value={size === "value" ? "" : undefined} data-chip={size === "chip" ? "" : undefined} />;

/** The claim's text and chip, or nothing for an id the answer does not have (the verdict already sends that to the fallback). */
export function Claim({ id }: { id: string }) {
  const { claims, renderClaim } = useScope();
  const claim = claims.get(id);
  return claim ? <>{renderClaim(claim)}</> : null;
}

/** A number or date is shown only where the claim itself states it, as a whole token; otherwise the block reads as the plain claim. */
export function oakVerbatim(claim: AnswerClaim | undefined, text: string) {
  return Boolean(claim && oakOpenUIStated(claim.text, text));
}
