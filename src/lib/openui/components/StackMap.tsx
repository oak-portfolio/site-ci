import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakStackMapOn } from "@/lib/oakFlags/stackMap";
import { ClaimList, ToolChip } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar, useScope } from "../scope";
import { oakOpenUIStack } from "./Stack";

export type StackMapProps = { claims: readonly string[]; mode?: "tools" | "venn" };

/** Tool tiles, then one group of claim lines per claim, so the settled tiles and Points list land in the same room. */
function StackMapGhost({ claims }: { claims: number }) {
  return <><ul className="oak-stack-map__tools oak-openui-skel" data-pending="" aria-hidden="true">
    {Array.from({ length: 6 }, (_, index) => <li key={index} className="oak-stack-map__tool"><span className="oak-stack-map__trigger">
      <span className="oak-stack-map__mark" /><span className="oak-stack-map__label"><SkelBar size="long" /></span></span></li>)}</ul>
    <span className="oak-stack-map__ghost-lead oak-openui-skel" data-pending="" aria-hidden="true">{Array.from({ length: claims }, (_, index) =>
      <span key={index}><SkelBar size="long" /><SkelBar /><SkelBar size="short" /></span>)}</span></>;
}

export const StackMapPending = ({ claims }: StackMapProps) =>
  <div className="oak-stack-map" data-picture-ok="the tool logos land with the claims"><StackMapGhost claims={Math.max(claims.length, 1)} /></div>;

function Off({ claims: ids }: StackMapProps) {
  const { claims, cardOf } = useScope();
  const items = oakOpenUIStack([...claims.values()], cardOf);
  return <>{items.length >= 2 ? <ul className="oak-openui-chips oak-openui-stack" aria-label="Tools named in this answer">
    {items.map(item => <ToolChip key={item} item={item} />)}</ul> : null}<ClaimList ids={ids.filter(id => claims.has(id))} /></>;
}

const Lazy = oakLazyView<StackMapProps>(() => import("./StackMapView"), StackMapPending, Off);
const StackMapBlock = ({ claims, mode }: StackMapProps) => oakStackMapOn() ? <Lazy claims={claims} mode={mode} /> : <Off claims={claims} />;

export const StackMap = defineComponent({
  name: "StackMap",
  description: "When the visitor asks what tools, tech or stack Steve uses, or which projects used a tool: pass every claim that names tools; it shows each tool once with its mark and how many of those projects use it, and a tap shows which. Mode venn when the visitor asks what two projects share or have in common, or which used both of two tools: pass those claims; it splits the tools into only the first, both, only the second. Never for who owned what.",
  props: z.object({ claims: z.array(claimId), mode: z.enum(["tools", "venn"]).optional() }),
  component: ({ props }) => <StackMapBlock claims={props.claims} mode={props.mode} />,
});
