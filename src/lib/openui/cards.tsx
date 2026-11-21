import * as React from "react";
import { useIsStreaming } from "@openuidev/react-lang";
import { Icon } from "@/components/ui/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { OakSourceCard } from "@/lib/oakCitationLabels";
import { oakSourceBackdrop, oakToolMarks } from "@/lib/oakChatFlags";
import { oakToolMark } from "@/lib/oakToolMarks";
import type { AnswerClaim } from "../../../packages/oak-agent-contracts/src/types";
import { Claim, useScope, type OakOpenUISource } from "./scope";

/*
 * R16 answer cards. Each card names claims by id like every block; its cover, title, role, dates, stack and metrics come
 * from the cited page's own labels (OakOpenUISource), never from the program. With no card facts for that page (another
 * revision, another host) a card renders as the plain block it stands for, so nothing the model wrote becomes a fact.
 * References (Mobbin): Replit project cards (cover 1.8:1, muted meta), Fabric source cards (OG image inset, favicon-tile
 * fallback), Juicebox tenure tiles (uppercase label over value), Braintrust chips (one height, roomy gap).
 */

/**
 * A stack item the text names as a whole word ("Next.js" in "built with next.js", never "Go" inside "good"). A one-word item
 * must match its case (R16 review: "motion cues" named the Motion library, and stacks list Memory, Recovery, Handoff).
 */
export function oakOpenUINames(text: string, item: string) {
  const escaped = item.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const oneWord = /^[A-Za-z]+$/.test(item.trim());
  return Boolean(escaped) && new RegExp(`(?<![\\w])${escaped}(?![\\w])`, oneWord ? "" : "i").test(text);
}

/**
 * While the program streams, a card whose line has arrived but none of whose claim ids has shows its skeleton. Once one id
 * is known the card renders with the known ones (R16 review: a whole-card skeleton hid claims the waiting list had dropped).
 */
export function usePending(ids: readonly string[]) {
  const streaming = useIsStreaming();
  const { claims } = useScope();
  return streaming && !ids.some(id => claims.has(id));
}

/**
 * R17 (Oak, review v14: "no proper skeleton matching the content"): a pending card is its settled row's own shape, the
 * project's thumbnail, the role's dates column or the source's icon tile, beside the title and meta lines.
 */
export function CardSkeleton({ kind }: { kind: "project" | "role" | "source" }) {
  const bars = <span className="oak-openui-card__bars"><span className="oak-openui-card__bar" /><span className="oak-openui-card__bar" data-short="" /></span>;
  // R17 review: each skeleton is its settled item's own layout, the source's excerpt line above its row included.
  if (kind === "source") return <div className="oak-openui-source" data-pending="" data-face="image" aria-hidden="true">
    <span className="oak-openui-source__kicker"><span className="oak-openui-source__tile" /><span className="oak-openui-card__bar" data-short="" /></span>
    <span className="oak-openui-card__bars"><span className="oak-openui-card__bar" data-long="" /><span className="oak-openui-card__bar" /></span>
    <span className="oak-openui-source__page" data-backdrop={oakSourceBackdrop ? "" : undefined} /></div>;
  if (kind === "role") return <div className="oak-openui-card oak-openui-role" data-pending="" aria-hidden="true">
    <span className="oak-openui-role__art" /><span className="oak-openui-role__body">
      <span className="oak-openui-role__head"><span className="oak-openui-card__bar" data-head="" /><span className="oak-openui-card__bar" data-date="" /></span>
      <span className="oak-openui-role__titles"><span className="oak-openui-card__bar" data-chip="" /><span className="oak-openui-card__bar" data-chip="" data-wide="" /><span className="oak-openui-card__bar" data-chip="" /></span>
      <span className="oak-openui-card__bars"><span className="oak-openui-card__bar" data-long="" /><span className="oak-openui-card__bar" /></span></span></div>;
  return <div className="oak-openui-card oak-openui-project" data-pending="" aria-hidden="true"><span className="oak-openui-card__head"><span className="oak-openui-card__thumb" />{bars}</span>
    <span className="oak-openui-card__bars"><span className="oak-openui-card__bar" data-long="" /><span className="oak-openui-card__bar" /></span></div>;
}

/** Timeline artwork's shape (2000x1050), the default when a card carries no ratio. */
export const OAK_ART_RATIO = 2000 / 1050;

/**
 * R20 (Oak, review v17): a card's picture, whole at its own shape. The frame takes the ratio, so the layout is set before the
 * image loads and nothing is cropped.
 */
export function OakArt({ className, src, alt, ratio }: { className: string; src: string; alt: string; ratio?: number }) {
  return <span className={`oak-openui-art ${className}`} style={{ "--oak-art-ratio": ratio ?? OAK_ART_RATIO } as React.CSSProperties}>
    <img src={src} alt={alt} loading="lazy" decoding="async" /></span>;
}

/**
 * The first of these claims that cites one page, which has a card of this kind, and which claims cite only that page. R16
 * review: a claim citing another page must never sit under this page's title, cover and stack, so `others` follow the card
 * as plain points. Ticket 211: that includes a claim whose first citation is this page but which cites more pages too.
 */
export function useCard(ids: readonly string[], kind: OakSourceCard["kind"]) {
  const { claims, cardOf } = useScope();
  const list = ids.map(id => claims.get(id)).filter((claim): claim is AnswerClaim => Boolean(claim));
  const aboutOnePage = (claim: AnswerClaim) => claim.citations.length > 0 && claim.citations.every(citation => citation.documentId === claim.citations[0]!.documentId);
  const lead = list.find(claim => aboutOnePage(claim) && cardOf?.(claim)?.card?.kind === kind);
  const source = lead ? cardOf?.(lead) ?? null : null;
  const page = lead?.citations[0]?.documentId;
  const own = list.filter(claim => aboutOnePage(claim) && claim.citations[0]!.documentId === page);
  return { list: own, source, card: source?.card, page, own: own.map(claim => claim.id), others: ids.filter(id => !own.some(claim => claim.id === id)) };
}

/** A card's title: a link to the page when the labels vouch for its URL, else its title alone. */
export function CardLink({ to, verified, children }: { to: string; verified: boolean; children: string }) {
  const { renderLink } = useScope();
  return <>{verified && renderLink ? renderLink(to, children) : children}</>;
}

export function CardTitle({ source, title }: { source: OakOpenUISource; title: string }) {
  return <h4 className="oak-openui-card__title"><CardLink to={source.page} verified={source.verified}>{title}</CardLink></h4>;
}

/** Claims as the plain Points list, the block every card degrades to; `className` marks the list inside a card. */
export function ClaimList({ ids, className, page }: { ids: readonly string[]; className?: string; page?: string }) {
  const { claims } = useScope();
  if (!ids.length) return null;
  // R17 review: inside a card, a claim citing only the card's own page drops its chip; the card's title already links there.
  const own = (id: string) => Boolean(page) && Boolean(claims.get(id)?.citations.length) && claims.get(id)!.citations.every(citation => citation.documentId === page);
  // Ticket 14: the plain Points list reads as rows, each led by a tick tile (decoration, hidden from assistive tech); a card's list keeps its bullets.
  const rows = !className;
  return <ul className={className ? `oak-openui__points ${className}` : "oak-openui__points"} data-rows={rows ? "" : undefined} role={rows ? "list" : undefined}>{ids.map(id =>
    <li key={id} data-own-page={own(id) ? "" : undefined}>{rows ? <span className="oak-openui__point-mark" aria-hidden="true"><Icon name="tick" size={12} /></span> : null}
      {rows ? <span className="oak-openui__point-text"><Claim id={id} /></span> : <Claim id={id} />}</li>)}</ul>;
}

/**
 * A card's claims: R18 (Oak, review v15: the cards "feel too generic"; Gemini, Juicebox and Perplexity item answers give each
 * item one sentence of why before its specifics): the first claim reads as the item's lead line in full white, the rest
 * follow as quieter points. Every claim still shows once.
 */
export function CardClaims({ ids, page, about }: { ids: readonly string[]; page?: string; about?: string }) {
  const { claims } = useScope();
  if (!ids.length) return null;
  const own = Boolean(page) && Boolean(claims.get(ids[0]!)?.citations.length) && claims.get(ids[0]!)!.citations.every(citation => citation.documentId === page);
  const rest = ids.slice(1);
  // R21 (Oak, review v18: the cards read "way too text heavy"): a card shows its lead claim; the rest fold under one quiet
  // "n more" control, kept in the page (hidden until found) so every claim is placed once and find-in-page still reaches it.
  return <>
    <p className="oak-openui-card__lead" data-own-page={own ? "" : undefined}><Claim id={ids[0]!} /></p>
    {rest.length ? <Collapsible className="oak-openui-card__more">
      <CollapsibleTrigger className="oak-openui-card__more-trigger" aria-label={about ? `${rest.length} more about ${about}` : undefined}>
        <span>{rest.length} more</span><Icon name="arrowDown" size={14} /></CollapsibleTrigger>
      {/* hidden="until-found": the browser's find-in-page opens the fold on a match. */}
      <CollapsibleContent hiddenUntilFound className="oak-openui-card__more-panel"><ClaimList ids={rest} className="oak-openui-card__claims" page={page} /></CollapsibleContent>
    </Collapsible> : null}
  </>;
}

/**
 * Ticket 15 (the explored brand marks): a tool chip leads with the tool's bundled brand mark when the registry has one, and
 * is the plain text chip when it has none. The mark is decoration (the tool's name stays the chip's only words) and is
 * never fetched from another site.
 */
export function ToolChip({ item }: { item: string }) {
  const mark = oakToolMarks ? oakToolMark(item) : null;
  // Ticket 23 (hiring nit 2): a tool the registry has no mark for leads with one neutral glyph, so every chip has the same shape.
  return <li className="oak-openui-chip" data-mark={mark ? "" : undefined} data-glyph={mark ? undefined : ""}>
    {mark ? <img className="oak-openui-chip__mark" src={mark} alt="" width={16} height={16} loading="lazy" decoding="async" />
      : <Icon name="code" size={14} className="oak-openui-chip__glyph" />}{item}</li>;
}
