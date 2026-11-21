import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakEvidenceChartOn } from "@/lib/oakFlags/evidenceChart";
import type { OakEvidenceMode } from "../../../../packages/oak-agent-contracts/src/openui/views/evidence-chart";
import { ClaimList } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";

export type EvidenceChartProps = { claims: readonly string[]; mode?: OakEvidenceMode };

/** A caption line, a drawing-sized block and two legend lines, so the settled figure lands in the same room. */
export function EvidenceChartGhost() {
  return <div className="oak-evidence oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-evidence__ghost-head"><SkelBar size="short" /><SkelBar size="chip" /></span>
    <span className="oak-evidence__ghost-drawing" />
    <span className="oak-evidence__ghost-head"><SkelBar size="value" /><SkelBar size="value" /></span>
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
