import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod";
import { oakDiagramBlockOn } from "@/lib/oakFlags/diagram";
import { OAK_OPENUI_BLOCKS } from "../../../../packages/oak-agent-contracts/src/openui/blocks.generated";
import { OAK_DIAGRAM_PRESETS, type OakDiagramPreset } from "../../../../packages/oak-agent-contracts/src/openui/views/diagram";
import { oakLazyView } from "../figure/oakLazyView";
import { claimId, SkelBar } from "../scope";
import { Steps } from "./Steps";

export type DiagramProps = { claim: string; preset?: OakDiagramPreset; from?: number };

export function DiagramGhost() {
  return <div className="oak-diagram oak-openui-skel" data-pending="" aria-hidden="true">
    <span className="oak-diagram__ghost"><SkelBar size="long" /><SkelBar size="long" /><SkelBar /></span>
  </div>;
}

const StepsList = Steps.component;
export const DiagramOff = ({ claim, from }: DiagramProps) => <StepsList props={{ claims: [claim], from }} renderNode={() => null} />;
const Lazy = oakLazyView<DiagramProps>(() => import("./DiagramView"), DiagramGhost, DiagramOff);
const DiagramBlock = ({ claim, preset, from }: DiagramProps) => oakDiagramBlockOn()
  ? <Lazy claim={claim} preset={preset} from={from} /> : <DiagramOff claim={claim} from={from} />;

const PRESET_PHRASES: Partial<Record<OakDiagramPreset, string>> = {
  flow: "flow (default, steps in order)",
  layers: "layers (stacked layers, for a layers question)",
  blockdiag: "blockdiag (boxes with a line each)",
  mindmap: "mindmap (its parts around its cover, for \"what are the parts of <project>?\")",
  treeview: "treeview (its parts as an outline)",
  radar: "radar (two or more projects the claim cites, compared by how many steps, artifacts, metrics and sections each record publishes)",
  quadrant: "quadrant (the cited projects placed by published proof and case study status, for \"which case studies have the most proof?\")",
};

/** The preset sentence names only presets a fragment teaches, so an untaught preset stays out of the prompt until its flip. */
export function oakDiagramPresetSentence(taughtPresets: readonly string[]) {
  const phrases = OAK_DIAGRAM_PRESETS.filter(preset => taughtPresets.includes(preset)).flatMap(preset => PRESET_PHRASES[preset] ?? []);
  return `preset: ${phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} or ${phrases.at(-1)}` : phrases[0] ?? ""}.`;
}

export const Diagram = defineComponent({
  name: "Diagram",
  description: `How one project works, for a question like "how does <project> work?", "walk me through its architecture" or "what are the layers of <project>?": the steps of the record the one claim cites, drawn as a diagram, even when that claim names only one part of it. ${oakDiagramPresetSentence(OAK_OPENUI_BLOCKS.Diagram?.taughtPresets ?? [])} from: the number of its first step when it continues an earlier list. Never for how the work went (research, prototype, testing) or when it was built.`,
  props: z.object({ claim: claimId, preset: z.enum(OAK_DIAGRAM_PRESETS).optional(), from: z.number().int().min(2).max(40).optional() }),
  component: ({ props }) => <DiagramBlock claim={props.claim} preset={props.preset} from={props.from} />,
});
