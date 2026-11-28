import * as React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/Icon";
import { oakSourceSite } from "@/lib/oakCitationLabels";
import { useOakRecordFacts } from "@/lib/oakRecordFacts";
import { showOakToast } from "@/lib/oakToasts";
import { addOakQuote, getOakWorkspace, setOakDraft } from "@/lib/oakWorkspace";
import { oakPageCardGroups, oakPageCardTitle, type OakPageGroup } from "../../../../packages/oak-agent-contracts/src/openui/views/page-cards";
import type { AnswerClaim } from "../../../../packages/oak-agent-contracts/src/types";
import { useReturnFocus } from "../a11y/useReturnFocus";
import { usePending } from "../cards";
import { Claim, useScope, type OakOpenUISource } from "../scope";
import { COVER_OK, PageCardGhost, PageCardsGhost, SourceOf, type PageCardsProps } from "./PageCards";

type Page = OakPageGroup<AnswerClaim, OakOpenUISource>;

const anchorOf = (url: string) => { try { return decodeURIComponent(new URL(url).hash.slice(1)); } catch { return ""; } };
const kindOf = (source: OakOpenUISource) => source.card?.kind === "work" ? "Case study" : source.card?.kind === "role" ? "Role" : oakSourceSite(source.url).host;

/** Stages the page's first claim as a quote chip, once, and, in an empty box, a question about the page. Nothing is sent. */
function askAbout(page: Page, title: string, message: string) {
  const { draft, quotes } = getOakWorkspace();
  const text = page.claims[0]!.text;
  const staged = quotes.some(quote => quote.source === message && text.startsWith(quote.text.replace(/\u2026$/, "")));
  if (!staged) {
    const added = addOakQuote(text, message);
    if (added !== "added") return showOakToast(added === "full" ? "selection-quotes-full" : "selection-no-room");
    if (!draft.trim()) setOakDraft(`Tell me more about ${title}.`);
  }
  requestAnimationFrame(() => {
    const box = document.querySelector<HTMLTextAreaElement>("#oak-composer-input:not(:disabled)");
    box?.focus({ preventScroll: true });
    box?.setSelectionRange(box.value.length, box.value.length);
  });
}

function QuickLook({ page, title, section, opener, onClose }: { page: Page; title: string; section?: string; opener: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const { id: message, renderLink } = useScope();
  const { ref, onKeyDown } = useReturnFocus(opener, onClose);
  const external = !oakSourceSite(page.url).firstParty;
  return <div ref={ref} className="oak-page-card__look" onKeyDown={onKeyDown}>
    {section ? <p className="oak-page-card__section">{section}</p> : null}
    {page.claims.map(claim => <p key={claim.id} className="oak-page-card__quote"><Claim id={claim.id} /></p>)}
    <div className="oak-page-card__actions">
      {page.source.verified && renderLink ? <span className="oak-page-card__open">{renderLink(page.url, "Open page")}
        {external ? null : <Icon name="arrowUpRight" size={16} aria-hidden="true" />}</span> : null}
      <button type="button" className="oak-page-card__ask" onClick={() => askAbout(page, title, message)}>
        <Icon name="helpCircle" size={16} aria-hidden="true" />Ask about this</button>
    </div>
  </div>;
}

function PageCard({ page, open, onOpen }: { page: Page; open: boolean; onOpen: (open: boolean) => void }) {
  const { knowledgeRevision = "" } = useScope();
  const state = useOakRecordFacts(page.documentId, knowledgeRevision);
  const opener = React.useRef<HTMLButtonElement>(null);
  if (state.status === "pending") return <PageCardGhost />;
  const facts = state.status === "loaded" && state.facts.kind === "work" ? state.facts : null;
  const title = oakPageCardTitle(page.source);
  const cover = page.source.card?.image ?? facts?.cover.src ?? page.source.cover;
  const anchor = anchorOf(page.url);
  const section = anchor ? facts?.sections.find(item => item.anchor === anchor)?.title : undefined;
  return <div className="oak-page-card" data-kind={page.source.card?.kind === "work" ? "work" : "page"} data-open={open ? "" : undefined}>
    <Collapsible open={open} onOpenChange={onOpen}>
      <CollapsibleTrigger ref={opener} className="oak-page-card__head"
        onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); onOpen(false); } }}>
        {cover ? <span className="oak-page-card__cover oak-media-tile" data-judge-ok={COVER_OK}><img src={cover} alt="" loading="lazy" decoding="async" /></span> : null}
        <span className="oak-page-card__text">
          <span className="oak-page-card__kind">{kindOf(page.source)}</span>
          <span className="oak-page-card__title">{title}</span>
          {facts?.dek ? <span className="oak-page-card__dek">{facts.dek}</span> : null}
        </span>
        <span className="oak-page-card__chevron" aria-hidden="true"><Icon name="arrowDown" size={16} /></span>
      </CollapsibleTrigger>
      <CollapsibleContent className="oak-page-card__panel">
        <QuickLook page={page} title={title} section={section} opener={opener} onClose={() => { onOpen(false); opener.current?.focus(); }} />
      </CollapsibleContent>
    </Collapsible>
  </div>;
}

export default function PageCardsView({ claims: ids }: PageCardsProps) {
  const { claims, cardOf } = useScope();
  const waiting = usePending(ids);
  const [open, setOpen] = React.useState<number | null>(0);
  if (waiting) return <PageCardsGhost count={Math.min(ids.length, 4)} />;
  const { pages, strays } = oakPageCardGroups(ids, id => claims.get(id), claim => cardOf?.(claim));
  return <>
    {pages.length ? <div className="oak-page-cards" data-count={pages.length}><div className="oak-page-cards__grid">
      {pages.map((page, index) => <PageCard key={page.documentId} page={page} open={open === index} onOpen={next => setOpen(next ? index : null)} />)}
    </div></div> : null}
    {strays.map(id => <SourceOf key={id} claim={id} />)}
  </>;
}
