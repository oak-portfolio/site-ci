import * as React from "react";
import { Icon } from "@/components/ui/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brandIconRegistry, type BrandIconEntry } from "@/data/brandIconRegistry";
import { oakCitationLabel, oakCitationUnverified, oakSourceCover, oakSourceShortLabel, oakSourceSite, type OakCitationLabels } from "@/lib/oakCitationLabels";
import { oakMeaningIcons, oakSourceLabels, oakSourceMeaning } from "@/lib/oakMeaningIcons";
import { useOakExcerpt } from "@/lib/oakSourceExcerpts";
import type { PublicCitation } from "../../../packages/oak-agent-contracts/src/types";
import { faviconDataUriSchema } from "../../../packages/oak-agent-contracts/src/public-research";
import { OakSprite } from "./OakActivitySprite";
import { oakAnswerOrnamentOn } from "@/lib/oakFlags/answerOrnament";
import { oakSourceArt } from "./OakCitations";

/** Any other bundled brand in the registry, so a newly added icon (OpenRouter) needs no second host entry (D131). */
const registryIcon = (host: string) => (Object.values(brandIconRegistry) as BrandIconEntry[]).find(entry => {
  const domain = entry.domain.replace(/^www\./, "");
  return entry.assetPath && (host === domain || host.endsWith(`.${domain}`));
})?.assetPath ?? null;

/** The workspace element, so a popup or panel portals inside it and keeps its tokens and focus ownership. */
export function useOakWorkspaceHost() {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const anchor = React.useCallback((node: HTMLElement | null) => setHost(node?.closest<HTMLElement>(".oak-workspace") ?? null), []);
  return [host, anchor] as const;
}

/** Which picture a source has: Steve's page with a cover shows it, another host shows its bundled brand icon, else none. */
export function oakSourceFaceImage({ url, cover }: { url: string; cover?: string }) {
  const site = oakSourceSite(url);
  if (cover && site.firstParty) return { face: "cover" as const, src: cover };
  const icon = site.icon ?? registryIcon(site.host);
  return icon ? { face: "brand" as const, src: icon } : null;
}

/**
 * A source's face (review v6): a real picture or nothing. Steve's page shows its cover, another host shows its bundled
 * brand icon, and a source with neither shows its name alone, never a stand-in initial or type glyph. Never a fetch to the
 * source's site or a favicon service.
 */
export function OakSourceFace({ url, documentId, cover }: { url: string; documentId?: string; cover?: string }) {
  const image = oakSourceFaceImage({ url, cover });
  if (!image) return null;
  const site = oakSourceSite(url);
  const meaning = site.firstParty && documentId ? oakSourceMeaning({ documentId }) : "source.web";
  return <span className="oak-source-face" data-source-type={meaning.replace("source.", "")} data-face={image.face} aria-hidden="true">
    {image.face === "cover" ? <img src={image.src} alt="" loading="lazy" decoding="async" /> : <img src={image.src} alt="" width={16} height={16} />}
  </span>;
}

/**
 * R21 (Oak, review v18): an external web source's face. The Worker fetched its favicon and sent it as a data: URI, so this
 * page never asks another site for one. A source without a usable favicon shows the web Hugeicon instead.
 */
export function oakWebSourceFace(favicon?: string) {
  return favicon && faviconDataUriSchema.safeParse(favicon).success
    ? { face: "favicon" as const, src: favicon }
    : { face: "icon" as const, icon: oakMeaningIcons["source.web"] };
}

/** The same tile on a research row (24px) and on its source chip (16px, set by the chip's CSS). */
export function OakWebSourceFace({ favicon }: { favicon?: string }) {
  const face = oakWebSourceFace(favicon);
  return <span className="oak-web-face" data-face={face.face} aria-hidden="true">
    {face.face === "favicon" ? <img src={face.src} alt="" decoding="async" /> : <Icon name={face.icon} size={14} />}
  </span>;
}

/** What a cited source is called and where it lives, shared by the chip, its popover and the Sources panel. */
export function oakSourceView(citation: PublicCitation, knowledgeRevision: string, citationLabels: OakCitationLabels | undefined) {
  const site = oakSourceSite(citation.url);
  const kind = site.firstParty ? oakSourceLabels[oakSourceMeaning(citation)] ?? "Source" : site.host;
  const title = oakCitationLabel(citation, knowledgeRevision, citationLabels, site.firstParty ? kind : site.host);
  // Provenance in words, not only a favicon: Steve's own pages are Portfolio, anything else is Web.
  return { kind, title, short: oakSourceShortLabel(title), origin: site.firstParty ? "Portfolio" : "Web" };
}

/**
 * One source row: face and site, the title, then a two-line excerpt of the cited passage. A number leads it only in the
 * Sources panel. A link this page cannot check is marked Unverified, stays listed, and is not offered as a link.
 */
export function OakSourceRow({ citation, knowledgeRevision, citationLabels, number }: {
  citation: PublicCitation; knowledgeRevision: string; citationLabels?: OakCitationLabels; number?: number;
}) {
  const view = oakSourceView(citation, knowledgeRevision, citationLabels);
  const verified = !oakCitationUnverified(citation, knowledgeRevision, citationLabels);
  // An unchecked link is not offered, so naming its known page cannot dress up a wrong URL.
  const title = verified ? view.title : citationLabels?.knowledgeRevision === knowledgeRevision
    ? citationLabels.documents.find(document => document.documentId === citation.documentId)?.title ?? view.title : view.title;
  const excerpt = useOakExcerpt(citation.passageId, knowledgeRevision);
  const body = <>
    {number ? <span className="oak-source-row__number">{number}</span> : null}
    <span className="oak-source-row__text">
      <span className="oak-source-row__kind"><OakSourceFace url={citation.url} documentId={citation.documentId} cover={oakSourceCover(citation, knowledgeRevision, citationLabels)} /><span className="oak-source-row__kind-text">{view.kind}</span>
        {verified ? <span className="oak-source-row__origin" data-origin={view.origin.toLowerCase()}>{view.origin}</span>
          : <span className="oak-source-row__origin" data-origin="unverified"><Icon name="alert" size={12} />Unverified</span>}</span>
      <span className="oak-source-row__title">{title}</span>
      {excerpt ? <span className="oak-source-row__excerpt">{excerpt}</span> : null}
    </span>
  </>;
  return verified ? <a className="oak-source-row" href={citation.url}>{body}</a>
    : <div className="oak-source-row" data-verified="false" title="This link could not be checked, so it is not opened from here.">{body}</div>;
}

/**
 * The quiet chip that closes an answer point (ChatGPT and Perplexity): the first source's short name, then +N for the rest.
 * Hover, focus plus Enter, or a tap opens a popover listing that point's sources, one row per document. It opens below the
 * chip (ticket 23), so it never covers the header or the question above the answer; it flips up only where there is no room.
 */
export function OakSourceChip({ citations, knowledgeRevision, citationLabels }: {
  citations: readonly PublicCitation[]; knowledgeRevision: string; citationLabels?: OakCitationLabels;
}) {
  const [host, anchor] = useOakWorkspaceHost();
  // Q25-G26: Escape puts focus back on this chip before the popover unmounts; otherwise the dialog around Oak can take it first.
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const sources = Array.from(new Map(citations.map(citation => [citation.documentId, citation])).values());
  const first = sources[0];
  if (!first) return null;
  const view = oakSourceView(first, knowledgeRevision, citationLabels);
  const more = sources.length - 1;
  const art = !more && oakSourceSite(first.url).firstParty ? oakSourceArt[oakSourceMeaning(first)] : undefined;
  // v3: one cited page with a cover shows the cover across the popover's top, the way the page itself opens.
  const cover = !more ? oakSourceCover(first, knowledgeRevision, citationLabels) : undefined;
  // Ticket 58: behind the switch the popover grows from the chip (Base UI's --transform-origin) and names its record.
  const grow = oakAnswerOrnamentOn();
  const record = grow && !more && oakSourceSite(first.url).firstParty ? `From the ${view.short} ${view.kind.toLowerCase()}` : null;
  return <span className="oak-source-chip" ref={anchor}>
    <Popover onOpenChange={(open, details) => { if (!open && details.reason === "escape-key") trigger.current?.focus(); }}>
      {/* Ticket 23 (label in name, WCAG 2.5.3): the name starts with the chip's own visible words, then the full title. */}
      <PopoverTrigger ref={trigger} openOnHover delay={150} closeDelay={100} className="oak-source-chip__trigger"
        aria-label={`Sources: ${view.short}${more ? ` +${more}` : ""}${view.title !== view.short ? `, ${view.title}` : ""}`}>
        <OakSourceFace url={first.url} documentId={first.documentId} cover={oakSourceCover(first, knowledgeRevision, citationLabels)} />
        <span className="oak-source-chip__label">{view.short}</span>
        {more ? <span className="oak-source-chip__more">+{more}</span> : null}
      </PopoverTrigger>
      <PopoverContent container={host ?? undefined} finalFocus={trigger} side="bottom" align="start" className="oak-source-popover" data-grow={grow || undefined} aria-label="Sources for this point">
        {cover ? <img className="oak-source-popover__cover" data-media="" src={cover} alt="" loading="lazy" decoding="async" />
          : art ? <OakSprite pose={art} className="oak-source-popover__art" /> : null}
        <ul className="oak-source-list">
          {sources.map(citation => <li key={citation.documentId}>
            <OakSourceRow citation={citation} knowledgeRevision={knowledgeRevision} citationLabels={citationLabels} />
          </li>)}
        </ul>
        {record ? <p className="oak-source-popover__record">{record}</p> : null}
      </PopoverContent>
    </Popover>
  </span>;
}
