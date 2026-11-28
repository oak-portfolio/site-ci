import * as React from "react";
import { defineComponent, useIsStreaming } from "@openuidev/react-lang";
import { z } from "zod";
import { oakEvidenceChartOn } from "@/lib/oakFlags/evidenceChart";
import type { OakEvidenceMode } from "../../../../packages/oak-agent-contracts/src/openui/views/evidence-chart";
import { announceOakBlock } from "../a11y/oakBlockAnnounce";
import { ClaimList } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar, useScope } from "../scope";
import { PointsGhost } from "./Points";

export type EvidenceChartProps = { claims: readonly string[]; mode?: OakEvidenceMode };

/** Rows drawn while no claim id is known yet: the gallery's five-record chart, so a typical answer lands without a jump. */
export const GHOST_ROWS = 5;
const LOADING = "Loading the chart";

/**
 * Ticket 293: the settled proof figure in bars, built on the figure's own frame, head, legend and bar rows so it holds the
 * same room: one bar row per cited record and one line per claim once the claims are in hand, five of each before. Hidden
 * from assistive tech; while the answer streams, the transcript's one region says it is loading.
 */
export function EvidenceChartGhost({ claims = [] }: Partial<EvidenceChartProps>) {
  const { id, claims: known } = useScope();
  const streaming = useIsStreaming();
  const cited = claims.flatMap(claim => known.get(claim)?.citations[0]?.documentId ?? []);
  const bars = new Set(cited).size || GHOST_ROWS, lines = cited.length ? claims.length : GHOST_ROWS;
  React.useEffect(() => { if (streaming) announceOakBlock(`${id}:pending:evidence`, LOADING); }, [id, streaming]);
  return <div className="oak-evidence oak-openui-skel oak-openui-evidence" data-pending="" aria-hidden="true">
    <div className="oak-figure">
      <div className="oak-figure__head"><span className="oak-evidence__ghost-caption"><SkelBar size="short" /></span>
        <span className="oak-evidence__ghost-switch oak-openui-card__bar" /></div>
      <div className="oak-figure__bars">
        <span className="oak-figure__legend"><SkelBar /><SkelBar /></span>
        {Array.from({ length: bars }, (_, index) => <span key={index} className="oak-figure__bar-row">
          <span className="oak-figure__bar-head"><SkelBar size="short" /><SkelBar size="short" /></span>
          <span className="oak-figure__bar oak-openui-card__bar" data-ghost="" /></span>)}
      </div>
    </div>
    <PointsGhost count={lines} claims={cited.length ? claims : []} />
  </div>;
}

const Off = ({ claims }: EvidenceChartProps) => <ClaimList ids={claims} />;
const Lazy = oakLazyView<EvidenceChartProps>(() => import("./EvidenceChartView"), EvidenceChartGhost, Off);
const EvidenceChartBlock = ({ claims, mode }: EvidenceChartProps) => oakEvidenceChartOn() ? <Lazy claims={claims} mode={mode} /> : <Off claims={claims} />;

export const EvidenceChart = defineComponent({
  name: "EvidenceChart",
  description: "How much proof is published, for a question like \"what proof is there for <project>?\" or \"how much of this work is verified?\": the published artifacts of each record the claims cite, with the rest only as a held count. Mode proof (default, a bar per record), donut (the published share of all) or sankey (each record flowing to published and held). Never for a question about tools, stack or skills.",
  props: z.object({ claims: z.array(claimId), mode: z.enum(["proof", "donut", "sankey"]).optional() }),
  component: ({ props }) => <EvidenceChartBlock claims={props.claims} mode={props.mode} />,
});
