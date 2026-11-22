import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakFramingLineCountOn } from "@/lib/oakFlags/framingLineCount";
import { oakOpenUIFramingLine } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import { useScope } from "../scope";

/** R17: an answer that opens on cards or numbers starts with one Framing line in the app's own words (ticket 227: counted behind oakFramingLineCount). */
function FramingLine({ blocks }: { blocks: readonly unknown[] }) {
  const { claims } = useScope();
  const intro = oakOpenUIFramingLine(blocks, id => claims.get(id)?.citations.map(citation => citation.documentId) ?? [], oakFramingLineCountOn());
  return intro ? <p className="oak-openui__prose oak-openui__intro">{intro}</p> : null;
}

export function defineAnswer(block: z.ZodType) {
  return defineComponent({
    name: "Answer",
    description: "The root of every arranged answer: its blocks in reading order.",
    props: z.object({ children: z.array(block) }),
    component: ({ props, renderNode }) => <div className="oak-openui"><FramingLine blocks={props.children as unknown[]} />{renderNode(props.children)}</div>,
  });
}
