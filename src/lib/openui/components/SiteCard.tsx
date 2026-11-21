import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakSiteCardOn } from "@/lib/oakFlags/siteCard";
import { ClaimList, usePending } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";
import { oakSiteKinds, type OakSiteKind } from "./site/items";

export type SiteCardProps = { claims: string[]; kind: OakSiteKind };

function SiteGhost() {
  return <div className="oak-site oak-openui-card" data-pending="" aria-hidden="true">
    <span className="oak-site__head"><span className="oak-site__tile" /><span className="oak-openui-card__bars"><SkelBar size="short" /><SkelBar size="long" /></span></span>
    {[0, 1, 2].map(index => <span key={index} className="oak-site__row"><SkelBar /></span>)}
  </div>;
}

const Off = ({ claims }: SiteCardProps) => <ClaimList ids={claims} />;
const Lazy = oakLazyView<SiteCardProps>(() => import("./site/SiteView"), SiteGhost, Off);

function SiteCardBlock({ claims, kind }: SiteCardProps) {
  const waiting = usePending(claims);
  if (!oakSiteCardOn()) return <Off claims={claims} kind={kind} />;
  if (kind === "notOnSite") return <>
    <p className="oak-site-quiet"><Icon name="info" size={14} /><span>This is not on the site yet.</span></p>
    <ClaimList ids={claims} />
  </>;
  return waiting ? <SiteGhost /> : <Lazy claims={claims} kind={kind} />;
}

export const SiteCard = defineComponent({
  name: "SiteCard",
  description: "A public site item in its own look: app (an app and its pages), resource (the site's AI files, only when asked about them), section (the home value cards), career-rail (his roles on one rail), proof (the home proof sections), social (where else to find Steve), notOnSite (an item not on the site yet: a quiet line, never its content). Mascot, tour, now and digest show the claims as points.",
  props: z.object({ claims: z.array(claimId), kind: z.enum(oakSiteKinds) }),
  component: ({ props }) => <SiteCardBlock claims={props.claims} kind={props.kind} />,
});
