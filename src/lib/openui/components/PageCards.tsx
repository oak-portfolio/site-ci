import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakPageCardsOn } from "@/lib/oakFlags/pageCards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";
import { Source } from "./Source";

export type PageCardsProps = { claims: string[] };

// DESIGN.md "Answer cards": a card's cover is inset and takes the card radius less that inset, so it is media, not a nested card.
export const COVER_OK = "card-in-card: the cover is the page card's inset media";

export const PageCardGhost = () => <div className="oak-page-card oak-openui-skel" data-ghost="" data-pending="" aria-hidden="true"><span className="oak-page-card__head">
  <span className="oak-page-card__cover" data-judge-ok={COVER_OK} /><span className="oak-page-card__text"><SkelBar size="chip" /><SkelBar size="long" /><SkelBar /></span>
</span></div>;

export function PageCardsGhost({ count = 2 }: { count?: number }) {
  return <div className="oak-page-cards oak-openui-skel" data-pending="" aria-hidden="true"><div className="oak-page-cards__grid">
    {Array.from({ length: Math.max(1, count) }, (_, index) => <PageCardGhost key={index} />)}
  </div></div>;
}

export const SourceOf = ({ claim }: { claim: string }) => <>{Source.component({ props: { claim } } as never)}</>;
export const PageCardsOff = ({ claims }: PageCardsProps) => <>{claims.map(claim => <SourceOf key={claim} claim={claim} />)}</>;
const Lazy = oakLazyView<PageCardsProps>(() => import("./PageCardsView"), () => <PageCardsGhost />, PageCardsOff);
const PageCardsBlock = ({ claims }: PageCardsProps) => oakPageCardsOn() ? <Lazy claims={claims} /> : <PageCardsOff claims={claims} />;

export const PageCards = defineComponent({
  name: "PageCards",
  description: "Only when the visitor asks which pages cover a topic or where to read more about something: pass every claim, even just one; it shows one card per cited page with its cover and title, the first open on the cited section. For those questions it replaces the Source card. Never for contact.",
  props: z.object({ claims: z.array(claimId).min(1).max(4) }),
  component: ({ props }) => <PageCardsBlock claims={props.claims} />,
});
