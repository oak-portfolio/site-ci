import * as React from "react";
import { oakGraphLayout, type OakGraphLayout } from "../../layout/oakGraphLayout";
import { OakFigure } from "../../figure/OakFigure";
import { oakExplainerTopic } from "@/data/oakExplainerTopics";
import { ExplainerBridge } from "./bridge";
import { ExplainerStepper, type ExplainerPresetProps } from "./shared";

export const STATEDIAG = {
  title: "A voice agent's states",
  steps: [
    { label: "Idle", line: "The microphone is closed until the visitor taps to talk." },
    { label: "Listening", line: "Speech streams to text while the visitor talks." },
    { label: "Thinking", line: "The model reads the words and plans a reply." },
    { label: "Speaking", line: "Text to speech plays the reply, then the agent goes back to Idle." },
  ],
} as const;

const NODE = { nodeWidth: 132, nodeHeight: 40, gap: 22 } as const;
const RETURN = 36;
let laid: Promise<OakGraphLayout> | null = null;

/** The states through the dagre helper, plus the one return wire from the last state to the first. */
export function StateDiag({ titleId }: ExplainerPresetProps) {
  const [at, setAt] = React.useState(0);
  const [layout, setLayout] = React.useState<OakGraphLayout | null>(null);
  React.useEffect(() => {
    let live = true;
    (laid ??= oakGraphLayout(STATEDIAG.steps, NODE)).then(result => { if (live) setLayout(result); });
    return () => { live = false; };
  }, []);
  const steps = STATEDIAG.steps;
  return <>
    <h3 id={titleId} className="oak-explainer__title">{STATEDIAG.title}</h3>
    <OakFigure caption="Each state and the next one" items={steps.map((step, index) => ({ label: `${index + 1}. ${step.label}`,
      value: `${step.line} Next: ${steps[(index + 1) % steps.length]!.label}.` }))}>
      {layout ? <StateDrawing layout={layout} at={at} /> : <span className="oak-explainer__state-space" />}
    </OakFigure>
    <ExplainerStepper noun="State" rows={steps} at={at} onGo={setAt} />
    <ExplainerBridge topic={oakExplainerTopic("voice-agents")} />
  </>;
}

function StateDrawing({ layout, at }: { layout: OakGraphLayout; at: number }) {
  const first = layout.nodes[0]!, last = layout.nodes[layout.nodes.length - 1]!;
  const right = first.x + first.width, lane = right + RETURN - 8;
  const back = `M${right} ${last.y + last.height / 2} H${lane} V${first.y + first.height / 2} H${right + 2}`;
  return <svg className="oak-explainer__xstate" viewBox={`0 0 ${layout.width + RETURN} ${layout.height}`} role="presentation" focusable="false">
    {layout.edges.map(edge => {
      const end = edge.points[edge.points.length - 1]!;
      return <g key={edge.from} className="oak-explainer__wire" data-current={edge.from === at ? "" : undefined}>
        <polyline points={edge.points.map(point => `${point.x},${point.y}`).join(" ")} />
        <polyline points={`${end.x - 5},${end.y - 6} ${end.x},${end.y} ${end.x + 5},${end.y - 6}`} />
      </g>;
    })}
    <g className="oak-explainer__wire" data-current={at === layout.nodes.length - 1 ? "" : undefined}>
      <path d={back} />
      <polyline points={`${right + 8},${first.y + first.height / 2 - 5} ${right + 2},${first.y + first.height / 2} ${right + 8},${first.y + first.height / 2 + 5}`} />
    </g>
    {layout.nodes.map((node, index) => <g key={node.label} className="oak-explainer__state" data-current={index === at ? "" : undefined}>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.height / 2} />
      <text className="oak-explainer__svg-label" x={node.x + node.width / 2} y={node.y + node.height / 2 + 4} textAnchor="middle">{node.label}</text>
    </g>)}
  </svg>;
}
