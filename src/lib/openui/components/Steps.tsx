import type * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Claim, claimId, SkelBar } from "../scope";

/**
 * Ticket 17: a planned Steps list's ghost, its numbered discs on the rail and two text lines per step. A step with a claim
 * still to come lays that claim out hidden under its bars, so the step wraps as the filled one will in any font.
 */
export function StepsGhost({ count, claims = [] }: { count: number; claims?: readonly string[] }) {
  return <ol className="oak-openui__steps oak-openui-skel" data-pending="">{Array.from({ length: count }, (_, index) =>
    <li key={index}><span className="oak-openui__step-text" data-sized={claims[index] ? "" : undefined}>
      {claims[index] ? <span className="oak-openui-ghost__claim"><Claim id={claims[index]} /></span> : null}
      <span className="oak-openui-ghost__bars">
        <span className="oak-openui-ghost__line"><SkelBar size="long" /></span><span className="oak-openui-ghost__line" data-narrow=""><SkelBar size="long" /></span>
        <span className="oak-openui-ghost__line" data-narrow=""><SkelBar size="long" /></span><span className="oak-openui-ghost__line"><SkelBar /></span></span></span></li>)}</ol>;
}

export const Steps = defineComponent({
  name: "Steps",
  description: "2 to 8 claims that happened, or should be done, in this order, as a numbered list. from: the number of its first step when it continues an earlier list.",
  props: z.object({ claims: z.array(claimId), from: z.number().int().min(2).max(40).optional() }),
  // R25 live: a claim is its text and its source chip; unwrapped, each became its own item of the step's two-column grid,
  // so the chip fell to a row of its own under the number. The span keeps the claim one item in the text column.
  // R27k: a list that continues an earlier one (from) starts its count there, and says so to assistive tech (start).
  // Retro review: the parser does not hold a prop to its zod bound, so a model's from past 40 would number the steps from
  // it; only the stated range counts, and anything else starts at 1.
  component: ({ props }) => {
    const from = Number.isInteger(props.from) && props.from! >= 2 && props.from! <= 40 ? props.from : undefined;
    return <ol className="oak-openui__steps" start={from} data-from={from ? "" : undefined}
      style={{ "--oak-openui-step-from": (from ?? 1) - 1 } as React.CSSProperties}>
      {props.claims.map(id => <li key={id}><span className="oak-openui__step-text"><Claim id={id} /></span></li>)}</ol>;
  },
});
