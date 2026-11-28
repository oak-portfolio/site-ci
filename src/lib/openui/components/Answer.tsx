import { defineComponent, useIsStreaming } from "@openuidev/react-lang";
import { createContext, useContext, type ReactNode } from "react";
import { z } from "zod";
import { oakFramingLineCountOn } from "@/lib/oakFlags/framingLineCount";
import { oakOpenUIFramingLine } from "../../../../packages/oak-agent-contracts/src/openui/verdict";
import type { OakOpenUINode } from "../../../../packages/oak-agent-contracts/src/openui/views/node";
import { useScope } from "../scope";

/** Ticket 295: this answer holds a Stack, so its Project and Role cards show their record by title, as the pairwise printer reads them. */
const OakStackHeld = createContext(false);
export const useOakStackHeld = () => useContext(OakStackHeld);

/** R17: an answer that opens on cards or numbers starts with one Framing line in the app's own words (ticket 227: counted behind oakFramingLineCount). */
function FramingLine({ blocks }: { blocks: readonly unknown[] }) {
  const { claims } = useScope();
  const intro = oakOpenUIFramingLine(blocks, id => claims.get(id)?.citations.map(citation => citation.documentId) ?? [], oakFramingLineCountOn());
  return intro ? <p className="oak-openui__prose oak-openui__intro">{intro}</p> : null;
}

/** Ruling 110: a Stack draws when the answer finishes, so chips that resolve early never sit above blocks still streaming in. */
function AnswerBlocks({ blocks, renderNode }: { blocks: readonly OakOpenUINode[]; renderNode: (value: unknown) => ReactNode }) {
  const streaming = useIsStreaming();
  return <OakStackHeld.Provider value={useScope().stacked}>
    {renderNode(streaming ? blocks.filter(child => child?.typeName !== "Stack") : blocks)}</OakStackHeld.Provider>;
}

export function defineAnswer(block: z.ZodType) {
  return defineComponent({
    name: "Answer",
    description: "The root of every arranged answer: its blocks in reading order.",
    props: z.object({ children: z.array(block) }),
    component: ({ props, renderNode }) => <div className="oak-openui"><FramingLine blocks={props.children as unknown[]} />
      <AnswerBlocks blocks={props.children as OakOpenUINode[]} renderNode={renderNode} /></div>,
  });
}
