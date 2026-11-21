import * as React from "react";
import { Input } from "@/components/ui/input";
import { OakFigure } from "../../figure/OakFigure";
import type { ExplainerPresetProps } from "./shared";

export const XGRAD = {
  title: "Gradient descent on one curve",
  from: 4,
  steps: 6,
  start: 1,
  rates: [
    { rate: 0.05, verdict: "Too small: it creeps toward the bottom and is still far off." },
    { rate: 0.2, verdict: "Steady: it settles near the bottom in a few steps." },
    { rate: 0.5, verdict: "Just right for this curve: one step lands on the bottom." },
    { rate: 0.8, verdict: "Large: it jumps across the bottom each step but still settles." },
    { rate: 1.1, verdict: "Too large: each jump overshoots further and it runs off the chart." },
  ],
} as const;

const W = 6, LEFT = 16, WIDTH = 208, TOP = 10, HEIGHT = 120;
const loss = (w: number) => w * w;
const px = (w: number) => LEFT + (w + W) / (2 * W) * WIDTH;
const py = (w: number) => TOP + HEIGHT - loss(w) / (W * W) * HEIGHT;
const CURVE = Array.from({ length: 49 }, (_, i) => -W + i * W / 24).map(w => `${px(w)},${py(w)}`).join(" ");

/** Each step moves w against the slope of loss = w squared, scaled by the learning rate. */
export const xgradPath = (rate: number): number[] =>
  Array.from({ length: XGRAD.steps }).reduce<number[]>(path => [...path, path.at(-1)! - rate * 2 * path.at(-1)!], [XGRAD.from]);
const sayRate = (index: number) => {
  const row = XGRAD.rates[index]!, end = loss(xgradPath(row.rate).at(-1)!), start = loss(XGRAD.from);
  return `Learning rate ${row.rate}: after ${XGRAD.steps} steps the loss is ${end.toFixed(2)}, ${end > start ? "up" : "down"} from ${start.toFixed(2)}. ${row.verdict}`;
};

/** One fixed loss curve; the native slider picks a fixture learning rate, its valuetext is the one announcement, and no Bridge line since no record covers it. */
export function XGrad({ titleId }: ExplainerPresetProps) {
  const [at, setAt] = React.useState<number>(XGRAD.start);
  const id = React.useId();
  const path = xgradPath(XGRAD.rates[at]!.rate);
  const off = path.findIndex(w => Math.abs(w) > W);
  const shown = off < 0 ? path : path.slice(0, off);
  const change = (event: React.ChangeEvent<HTMLInputElement>) => setAt(Number(event.currentTarget.value));
  return <>
    <h3 id={titleId} className="oak-explainer__title">{XGRAD.title}</h3>
    <OakFigure caption="Loss after each step" items={path.map((w, index) => ({ label: index ? `Step ${index}` : "Start",
      value: `w ${w.toFixed(2)}, loss ${loss(w).toFixed(2)}${Math.abs(w) > W ? ", off the chart" : ""}` }))}>
      <svg className="oak-explainer__xgrad" viewBox="0 0 240 150" role="presentation" focusable="false">
        <line className="oak-explainer__axis" x1={LEFT} y1={TOP + HEIGHT} x2={LEFT + WIDTH} y2={TOP + HEIGHT} />
        <polyline className="oak-explainer__curve" points={CURVE} />
        <polyline className="oak-explainer__link" points={shown.map(w => `${px(w)},${py(w)}`).join(" ")} />
        {shown.map((w, index) => <circle key={index} className="oak-explainer__descent" data-start={index ? undefined : ""} cx={px(w)} cy={py(w)} r={3} />)}
        <text className="oak-explainer__svg-label" x={px(0)} y={TOP + HEIGHT + 16} textAnchor="middle">lowest loss</text>
        <text className="oak-explainer__svg-label" x={px(XGRAD.from)} y={py(XGRAD.from) - 8} textAnchor="middle">start</text>
      </svg>
    </OakFigure>
    <div className="oak-explainer__controls">
      <div className="oak-explainer__slider">
        <label htmlFor={id}>Learning rate</label>
        <output htmlFor={id}>{XGRAD.rates[at]!.rate}</output>
        <Input id={id} type="range" min={0} max={XGRAD.rates.length - 1} step={1} value={at} onChange={change} aria-valuetext={sayRate(at)} />
      </div>
      <p className="oak-explainer__now">{sayRate(at)}</p>
    </div>
  </>;
}
