import type * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Icon } from "@/components/ui/Icon";
import { oakOpenUIOwnWords } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { Claim, claimId, label, oakVerbatim, useScope } from "../scope";

function MeterView({ label: name, percent, claim: id }: { label: string; percent: number; claim: string }) {
  const { claims } = useScope();
  const share = Math.round(percent);
  const title = oakOpenUIOwnWords(name, 40);
  if (!title || share < 0 || share > 100 || !oakVerbatim(claims.get(id), `${share}%`)) return <p className="oak-openui__prose"><Claim id={id} /></p>;
  return <div className="oak-openui__meter">
    <span className="oak-openui__glyph" aria-hidden="true"><Icon name="activitySpark" size={16} /></span>
    <p className="oak-openui__meter-head"><span>{title}</span><span>{share}%</span></p>
    <span className="oak-openui__meter-track" role="img" aria-label={`${title}: ${share}%`}>
      <span className="oak-openui__meter-fill" style={{ "--oak-openui-share": share / 100 } as React.CSSProperties} /></span>
    <p className="oak-openui__metric-claim"><Claim id={id} /></p>
  </div>;
}

export const Meter = defineComponent({
  name: "Meter",
  description: "A share of a whole that a claim states as a percentage, 0 to 100, with a 1 to 4 word label.",
  props: z.object({ label: label(40), percent: z.number(), claim: claimId }),
  component: ({ props }) => <MeterView label={props.label} percent={props.percent} claim={props.claim} />,
});
