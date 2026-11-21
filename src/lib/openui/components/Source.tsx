import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakSourceSite } from "@/lib/oakCitationLabels";
import { oakSourceBackdrop } from "@/lib/oakChatFlags";
import { oakSourceButtonOn } from "@/lib/oakFlags/sourceButton";
import { oakMeaningIcons, oakSourceMeaning } from "@/lib/oakMeaningIcons";
import { CardLink, CardSkeleton, usePending } from "../cards";
import { Claim, claimId, useScope } from "../scope";

/** A page's icon tile when it has no picture: its bundled brand icon, else its kind's icon. Never a fetched favicon. */
function SourceTile({ url, documentId }: { url: string; documentId: string }) {
  const site = oakSourceSite(url);
  const meaning = site.firstParty ? oakSourceMeaning({ documentId }) : "source.web";
  return <span className="oak-openui-source__tile" aria-hidden="true">
    {site.icon ? <img src={site.icon} alt="" width={20} height={20} /> : <Icon name={oakMeaningIcons[meaning]} size={20} />}
  </span>;
}

/**
 * R19 (Oak, review v16, third flag: "still too amateur, make it more spacious, modern, intuitive and visual"; Mobbin
 * ChatGPT citations panel, Perplexity artifacts; Apple HIG clear glass over media): a source is a citation card. The site
 * leads as a kicker (what makes it a citation), the claim follows as a pull quote, and the page itself is a picture under
 * it with its title on a scrim and one glass "open" control. A page without a cover shows a quiet panel with its icon tile.
 */
function SourceView({ claim: id }: { claim: string }) {
  const pending = usePending([id]);
  const { claims, cardOf } = useScope();
  if (pending) return <CardSkeleton kind="source" />;
  const claim = claims.get(id);
  if (!claim) return null;
  const citation = claim.citations[0];
  const source = cardOf?.(claim) ?? null;
  if (!citation || !source) return <p className="oak-openui__prose"><Claim id={id} /></p>;
  const site = oakSourceSite(source.url);
  const picture = site.firstParty ? source.card?.image ?? source.cover : undefined;
  return <article className="oak-openui-source" data-face={picture ? "image" : "tile"}>
    <p className="oak-openui-source__kicker"><SourceTile url={source.url} documentId={citation.documentId} /><span>{site.host}</span>
      {/* R21 (review v18: "too much text"): only an outside page says so; Steve's own pages need no label. */}
      {site.firstParty ? null : <span className="oak-openui-source__kind">External page</span>}</p>
    <p className="oak-openui-source__excerpt" data-one-source={claim.citations.length === 1 ? "" : undefined}><Claim id={id} /></p>
    <div className={picture ? "oak-openui-source__page oak-media-tile" : "oak-openui-source__page"} data-backdrop={picture && oakSourceBackdrop ? "" : undefined}>
      {/* Ticket 15 (the explored media backdrop): a blurred copy fills the frame behind the whole picture; decoration only. */}
      {picture && oakSourceBackdrop ? <img className="oak-openui-source__backdrop" src={picture} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null}
      {picture ? <><img className="oak-openui-source__cover" src={picture} alt="" loading="lazy" decoding="async" /><span className="oak-openui-source__scrim" aria-hidden="true" /></> : null}
      {picture ? null : <span className="oak-openui-source__face-tile" aria-hidden="true">{site.icon ? <img src={site.icon} alt="" width={24} height={24} />
        : <Icon name={oakMeaningIcons[site.firstParty ? oakSourceMeaning({ documentId: citation.documentId }) : "source.web"]} size={24} />}</span>}
      <div className="oak-openui-source__face-text">
        <h4 className="oak-openui-card__title oak-openui-source__title"><CardLink to={source.url} verified={source.verified}>{source.title}</CardLink></h4>
        {picture ? null : <span className="oak-openui-source__host">{site.host}</span>}
      </div>
      <span className="oak-openui-source__open" data-button={oakSourceButtonOn() ? "" : undefined} aria-hidden="true"><Icon name="arrowUpRight" size={18} /></span>
    </div>
  </article>;
}

export const Source = defineComponent({
  name: "Source",
  description: "One claim as a link card to the page it cites, with that page's title, site and preview image.",
  props: z.object({ claim: claimId }),
  component: ({ props }) => <SourceView claim={props.claim} />,
});
