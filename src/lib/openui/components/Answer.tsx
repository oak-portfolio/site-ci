import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakOpenUIIntro } from "../../../../packages/oak-agent-contracts/src/openui/verdict";

export function defineAnswer(block: z.ZodType) {
  return defineComponent({
    name: "Answer",
    description: "The root of every arranged answer: its blocks in reading order.",
    props: z.object({ children: z.array(block) }),
    // R17: an answer that opens on cards or numbers starts with one framing line in the app's own words.
    component: ({ props, renderNode }) => {
      const intro = oakOpenUIIntro((props.children as unknown[]).map(child => (child as { typeName?: string } | null)?.typeName ?? ""));
      return <div className="oak-openui">{intro ? <p className="oak-openui__prose oak-openui__intro">{intro}</p> : null}{renderNode(props.children)}</div>;
    },
  });
}
