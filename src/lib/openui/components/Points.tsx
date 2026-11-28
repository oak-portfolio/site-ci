import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakKindDecisions, oakKindDecisionsOn } from "@/lib/oakFlags/kindDecisions";
import { ClaimList } from "../cards";
import { Claim, claimId, SkelBar } from "../scope";
import { PointsDecisions } from "./points/decisions";

/** Ticket 17: a planned Points list's ghost, its rows with their tick tiles. Ticket 107: a row sizes from its hidden claim, so it wraps as the filled row does in any font. */
export function PointsGhost({ count, claims = [] }: { count: number; claims?: readonly string[] }) {
  return <ul className="oak-openui__points oak-openui-skel" data-rows="" data-pending="">{Array.from({ length: count }, (_, index) => {
    const lines = <><span className="oak-openui-ghost__line"><SkelBar size="long" /></span><span className="oak-openui-ghost__line" data-narrow=""><SkelBar size="long" /></span>
      <span className="oak-openui-ghost__line"><SkelBar /></span></>;
    return <li key={index}><span className="oak-openui__point-mark oak-openui-skel__mark" />
      <span className="oak-openui__point-text" data-sized={claims[index] ? "" : undefined}>
        {claims[index] ? <><span className="oak-openui-ghost__claim"><Claim id={claims[index]} /></span><span className="oak-openui-ghost__bars">{lines}</span></> : lines}</span></li>;
  })}</ul>;
}

const props = z.object({ claims: z.array(claimId), mode: z.enum(["decisions"]).optional() });

export const Points = defineComponent({
  name: "Points",
  description: "2 to 5 parallel claims as bullets. Not for an ordered sequence (Steps) or dated events (Timeline).",
  // Ticket 238: the render library always parses mode; the decisions look stays behind oakKindDecisionsOn().
  props,
  component: ({ props }) => oakKindDecisionsOn() && props.mode === "decisions" ? <PointsDecisions ids={props.claims} /> : <ClaimList ids={props.claims} />,
});

/** Ticket 60: the prompt library's Points, so the prompt and spec.json teach mode only once the constant flips. */
export const PointsTaught = oakKindDecisions ? Points : defineComponent({ ...Points, props: props.omit({ mode: true }) as unknown as typeof props });
