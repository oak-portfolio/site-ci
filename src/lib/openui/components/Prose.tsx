import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { Claim, claimId, SkelBar } from "../scope";

/** Ticket 17: a planned paragraph's ghost, its text lines as bars one line box tall. Ticket 107: it sizes from its hidden claim, so it wraps as the filled paragraph does in any font. */
export function ProseGhost({ claim }: { claim?: string }) {
  const lines = <><span className="oak-openui-ghost__line"><SkelBar size="long" /></span><span className="oak-openui-ghost__line"><SkelBar size="long" /></span>
    <span className="oak-openui-ghost__line" data-narrow=""><SkelBar size="long" /></span><span className="oak-openui-ghost__line" data-narrow=""><SkelBar /></span>
    <span className="oak-openui-ghost__line"><SkelBar size="short" /></span></>;
  return <p className="oak-openui__prose oak-openui-skel" data-pending="" data-sized={claim ? "" : undefined}>
    {claim ? <><span className="oak-openui-ghost__claim"><Claim id={claim} /></span><span className="oak-openui-ghost__bars">{lines}</span></> : lines}</p>;
}

export const Prose = defineComponent({
  name: "Prose",
  description: "One claim as a paragraph. The default block; use it when the claim is not part of a list, sequence, comparison or number.",
  props: z.object({ claim: claimId }),
  component: ({ props }) => <p className="oak-openui__prose"><Claim id={props.claim} /></p>,
});
