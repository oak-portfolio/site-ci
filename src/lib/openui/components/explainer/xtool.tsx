import * as React from "react";
import { oakExplainerTopic } from "@/data/oakExplainerTopics";
import { OakFigure } from "../../figure/OakFigure";
import { ExplainerBridge } from "./bridge";
import { ExplainerStepper, type ExplainerPresetProps } from "./shared";

const LANES = [{ name: "Visitor", x: 50 }, { name: "Model", x: 180 }, { name: "Tool", x: 310 }] as const;

export const XTOOL = {
  title: "A tool call, step by step",
  steps: [
    { label: "Ask", line: "The visitor asks: what is the weather in Paris?", from: 0, to: 1, wire: "question" },
    { label: "Call", line: "The model writes a call: get_weather with city Paris.", from: 1, to: 2, wire: "get_weather(city)" },
    { label: "Result", line: "The tool returns 18 C and cloudy.", from: 2, to: 1, wire: "{ 18 C, cloudy }" },
    { label: "Answer", line: "The model answers from the result: it is 18 C and cloudy in Paris.", from: 1, to: 0, wire: "answer" },
  ],
} as const;

const rowY = (index: number) => 72 + index * 40;

/** A sequence drawing: three lifelines and one arrow per step; the current arrow is the accent and the stepper names it. */
export function XTool({ titleId }: ExplainerPresetProps) {
  const [at, setAt] = React.useState(0);
  return <>
    <h3 id={titleId} className="oak-explainer__title">{XTOOL.title}</h3>
    <OakFigure caption="Who sends what, in order" items={XTOOL.steps.map((step, index) => ({ label: `${index + 1}. ${step.label}`, value: step.line }))}>
      <svg className="oak-explainer__xtool" viewBox="0 0 360 236" role="presentation" focusable="false">
        {LANES.map(lane => <g key={lane.name}>
          <rect className="oak-explainer__lane-head" x={lane.x - 40} y={8} width={80} height={28} rx={6} />
          <text className="oak-explainer__svg-label" x={lane.x} y={27} textAnchor="middle">{lane.name}</text>
          <line className="oak-explainer__lifeline" x1={lane.x} y1={36} x2={lane.x} y2={228} />
        </g>)}
        {XTOOL.steps.map((step, index) => {
          const x1 = LANES[step.from].x, x2 = LANES[step.to].x, y = rowY(index), dir = Math.sign(x2 - x1);
          return <g key={step.label} className="oak-explainer__call" data-current={index === at ? "" : undefined} data-done={index < at ? "" : undefined}>
            <line x1={x1} y1={y} x2={x2 - dir * 2} y2={y} />
            <polyline points={`${x2 - dir * 8},${y - 5} ${x2 - dir * 2},${y} ${x2 - dir * 8},${y + 5}`} />
            <text className="oak-explainer__svg-label" x={(x1 + x2) / 2} y={y - 8} textAnchor="middle">{index + 1}. {step.wire}</text>
          </g>;
        })}
      </svg>
    </OakFigure>
    <ExplainerStepper noun="Step" rows={XTOOL.steps} at={at} onGo={setAt} />
    <ExplainerBridge topic={oakExplainerTopic("tool-calling")} />
  </>;
}
