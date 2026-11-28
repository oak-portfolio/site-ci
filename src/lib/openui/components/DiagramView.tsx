import { oakRecordFactsState, useOakRecordFacts, type OakWorkFacts } from "@/lib/oakRecordFacts";
import { oakDiagramPresetsForced } from "@/lib/oakFlags/diagram";
import { OAK_OPENUI_BLOCKS } from "../../../../packages/oak-agent-contracts/src/openui/blocks.generated";
import { oakDiagramShape, oakDiagramWords } from "../../../../packages/oak-agent-contracts/src/openui/views/diagram-words";
import { usePending } from "../cards";
import { Claim, useScope } from "../scope";
import { DiagramFigure } from "./diagram/DiagramFigure";
import { DiagramMindmap } from "./diagram/mindmap";
import { DiagramQuadrant } from "./diagram/quadrant";
import { DiagramRadar, type OakDiagramRecord } from "./diagram/radar";
import { DiagramTreeview } from "./diagram/treeview";
import { DiagramGhost, DiagramOff, type DiagramProps } from "./Diagram";

/**
 * The cited record's systemMap as a figure, led by the claim; no record facts or fewer than two steps is the Steps list.
 * Radar and quadrant compare every work record the claim cites, and draw the first record's flow when it cites only one.
 * Ticket 326: a flow or layers Diagram that oakDiagramWords prints no line for (a gap answer, or a lead that holds every label) is the lead alone.
 */
export default function DiagramView({ claim: id, preset, from }: DiagramProps) {
  const { claims, cardOf, knowledgeRevision = "", gap = false } = useScope();
  const claim = claims.get(id);
  const document = claim?.citations[0]?.documentId ?? "";
  const facts = useOakRecordFacts(document, knowledgeRevision);
  const waiting = usePending([id]);
  if (waiting || facts.status === "pending") return <DiagramGhost />;
  const steps = facts.status === "loaded" && facts.facts.kind === "work" ? facts.facts.systemMap : [];
  if (!claim || steps.length < 2) return <DiagramOff claim={id} from={from} />;
  const nameOf = (at: number) => cardOf?.({ ...claim, citations: claim.citations.slice(at, at + 1) })?.title.split(":")[0]!.trim()
    || claim.citations[at]!.documentId.replace(/^[^:]*:/, "");
  const name = nameOf(0);
  const records: OakDiagramRecord[] = [...new Map(claim.citations.map((citation, at) => {
    const state = oakRecordFactsState(citation.documentId, knowledgeRevision);
    return [citation.documentId, state.status === "loaded" && state.facts.kind === "work" ? { name: nameOf(at), facts: state.facts as OakWorkFacts } : null] as const;
  })).values()].filter(record => record !== null);
  const shape = oakDiagramShape(preset, oakDiagramPresetsForced() ?? OAK_OPENUI_BLOCKS.Diagram?.taughtPresets ?? [], records.length);
  const first = records[0]!;
  const quiet = (shape === "flow" || shape === "layers") && !oakDiagramWords(shape, { name, steps, names: [], lead: claim.text, gap }).length;
  return <div className="oak-diagram__block">
    <p className="oak-diagram__lead"><Claim id={id} /></p>
    {quiet ? null
      : shape === "mindmap" ? <DiagramMindmap name={first.name} cover={first.facts.cover} steps={steps} />
      : shape === "treeview" ? <DiagramTreeview name={first.name} steps={steps} />
      : shape === "radar" ? <DiagramRadar records={records} />
      : shape === "quadrant" ? <DiagramQuadrant records={records} />
      : <DiagramFigure name={name} steps={steps} preset={shape} />}
  </div>;
}
