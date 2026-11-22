import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakScreensBlockOn } from "@/lib/oakFlags/screens";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";
import { Source } from "./Source";

export type ScreensProps = { claim: string };

export function ScreensGhost() {
  return <div className="oak-screens oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-screens__frame" data-ghost="" />
    <span className="oak-screens__claim"><SkelBar size="long" /><SkelBar /></span>
  </div>;
}

export const ScreensOff = ({ claim }: ScreensProps) => <>{Source.component({ props: { claim } } as never)}</>;
const Lazy = oakLazyView<ScreensProps>(() => import("./ScreensView"), ScreensGhost, ScreensOff);
const ScreensBlock = ({ claim }: ScreensProps) => oakScreensBlockOn() ? <Lazy claim={claim} /> : <ScreensOff claim={claim} />;

export const Screens = defineComponent({
  name: "Screens",
  description: "When the visitor asks to see a project or what its app looks like: shows that project's own screenshots whole in a large frame with a filmstrip, for the claim from its work page that fits best. It takes the place of that page's Source card, even when it is the only claim; the rest of the answer keeps its usual blocks and still ends with Sources and Pills. Never for several projects.",
  props: z.object({ claim: claimId }),
  component: ({ props }) => <ScreensBlock claim={props.claim} />,
});
