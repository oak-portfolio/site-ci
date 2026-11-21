import * as React from "react";
import { OakFigure } from "../../figure/OakFigure";
import { ExplainerStepper, type ExplainerPresetProps } from "./shared";

export const XOFFSTEPS = {
  title: "How a leaf makes food",
  steps: [
    { label: "Light", line: "Sunlight lands on the leaf, and its green chlorophyll catches the energy." },
    { label: "Water", line: "Roots pull water from the soil and send it up the stem into the leaf." },
    { label: "Air", line: "Tiny pores on the leaf take in carbon dioxide from the air." },
    { label: "Sugar", line: "The light's energy joins water and carbon dioxide into sugar, and oxygen goes back out." },
  ],
} as const;

const FLOWS = [
  { step: 0, x1: 56, y1: 30, x2: 138, y2: 78, label: "light", lx: 70, ly: 24 },
  { step: 1, x1: 180, y1: 190, x2: 180, y2: 136, label: "water", lx: 204, ly: 178 },
  { step: 2, x1: 14, y1: 112, x2: 112, y2: 108, label: "carbon dioxide", lx: 58, ly: 130 },
  { step: 3, x1: 248, y1: 92, x2: 346, y2: 72, label: "sugar", lx: 304, ly: 66 },
  { step: 3, x1: 248, y1: 124, x2: 346, y2: 144, label: "oxygen", lx: 304, ly: 160 },
] as const;

/** General steps with no claim about Steve, so no Bridge line: a leaf, what flows in and what flows out, stepped by the visitor. */
export function XOffSteps({ titleId }: ExplainerPresetProps) {
  const [at, setAt] = React.useState(0);
  return <>
    <h3 id={titleId} className="oak-explainer__title">{XOFFSTEPS.title}</h3>
    <OakFigure caption="What goes in and what comes out" items={XOFFSTEPS.steps.map((step, index) => ({ label: `${index + 1}. ${step.label}`, value: step.line }))}>
      <svg className="oak-explainer__xleaf" viewBox="0 0 360 200" role="presentation" focusable="false">
        <path className="oak-explainer__leaf" d="M116 108 C150 52 222 52 250 108 C222 160 150 160 116 108 Z M126 108 H240" />
        {FLOWS.map(flow => {
          const angle = Math.atan2(flow.y2 - flow.y1, flow.x2 - flow.x1), head = (turn: number) =>
            `${flow.x2 - 8 * Math.cos(angle + turn)},${flow.y2 - 8 * Math.sin(angle + turn)}`;
          return <g key={flow.label} className="oak-explainer__call" data-current={flow.step === at ? "" : undefined} data-done={flow.step < at ? "" : undefined}>
            <line x1={flow.x1} y1={flow.y1} x2={flow.x2} y2={flow.y2} />
            <polyline points={`${head(0.5)} ${flow.x2},${flow.y2} ${head(-0.5)}`} />
            <text className="oak-explainer__svg-label" x={flow.lx} y={flow.ly} textAnchor="middle">{flow.label}</text>
          </g>;
        })}
      </svg>
    </OakFigure>
    <ExplainerStepper noun="Step" rows={XOFFSTEPS.steps} at={at} onGo={setAt} />
  </>;
}
