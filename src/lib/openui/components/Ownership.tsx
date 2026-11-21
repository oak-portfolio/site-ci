import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakOwnershipBlockOn } from "@/lib/oakFlags/ownership";
import { ClaimList } from "../cards";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";

export type OwnershipProps = { claim: string; mode?: "split" | "tree" | "roll" };

export function OwnershipGhost() {
  const line = <span className="oak-openui-ghost__line"><SkelBar size="long" /></span>;
  const side = (rows: number, fold: boolean) => <span className="oak-ownership__side">
    <span className="oak-ownership__title">{line}</span>
    {Array.from({ length: rows }, (_, index) => <span key={index} className="oak-ownership__row">{line}</span>)}
    {fold ? <span className="oak-ownership__row">{line}</span> : null}
  </span>;
  return <div className="oak-ownership oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-ownership__lead">{line}{line}</span>
    <span className="oak-ownership__switch">{line}</span>
    <span className="oak-ownership__split">{side(3, true)}{side(3, false)}</span>
  </div>;
}

const OwnershipOff = ({ claim }: OwnershipProps) => <ClaimList ids={[claim]} />;
const Lazy = oakLazyView<OwnershipProps>(() => import("./OwnershipView"), OwnershipGhost, OwnershipOff);
const OwnershipBlock = ({ claim, mode }: OwnershipProps) => oakOwnershipBlockOn() ? <Lazy claim={claim} mode={mode} /> : <OwnershipOff claim={claim} />;

export const Ownership = defineComponent({
  name: "Ownership",
  description: "Who did what on one project the visitor named: Steve's owned areas beside his collaborators', from the record the one claim cites. Mode split (default), tree, or roll (a count of areas listed). Never for a question about the tools a project used.",
  props: z.object({ claim: claimId, mode: z.enum(["split", "tree", "roll"]).optional() }),
  component: ({ props }) => <OwnershipBlock claim={props.claim} mode={props.mode} />,
});
