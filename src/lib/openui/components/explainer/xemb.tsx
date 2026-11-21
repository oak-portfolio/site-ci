import * as React from "react";
import { Input } from "@/components/ui/input";
import { oakExplainerTopic } from "@/data/oakExplainerTopics";
import { OakFigure } from "../../figure/OakFigure";
import { ExplainerBridge } from "./bridge";
import type { ExplainerPresetProps } from "./shared";

export const XEMB = {
  title: "Nearest neighbours in an embedding",
  query: { word: "puppy", x: 50, y: 50 },
  start: 3,
  points: [
    { word: "dog", x: 60, y: 42 }, { word: "kitten", x: 38, y: 58 }, { word: "cat", x: 34, y: 46 }, { word: "leash", x: 62, y: 66 },
    { word: "bone", x: 44, y: 72 }, { word: "wolf", x: 70, y: 28 }, { word: "piano", x: 16, y: 18 }, { word: "banana", x: 14, y: 86 },
    { word: "car", x: 88, y: 84 }, { word: "truck", x: 74, y: 92 },
  ],
} as const;

type Point = (typeof XEMB.points)[number];
const distance = (point: Point) => Math.hypot(point.x - XEMB.query.x, point.y - XEMB.query.y);
const byDistance = [...XEMB.points].sort((a, b) => distance(a) - distance(b));
export const xembNearest = (k: number): Point[] => byDistance.slice(0, k);
const sayK = (k: number) => `${k} nearest to ${XEMB.query.word}: ${xembNearest(k).map(point => point.word).join(", ")}.`;

/** Words placed by meaning on a plane; the native slider picks k, its valuetext is the one announcement, and the drawing joins the query to its k nearest points. */
export function XEmb({ titleId }: ExplainerPresetProps) {
  const [k, setK] = React.useState<number>(XEMB.start);
  const id = React.useId();
  const near = new Set(xembNearest(k).map(point => point.word));
  const radius = distance(byDistance[k - 1]!);
  const change = (event: React.ChangeEvent<HTMLInputElement>) => setK(Number(event.currentTarget.value));
  return <>
    <h3 id={titleId} className="oak-explainer__title">{XEMB.title}</h3>
    <OakFigure caption={`Words near "${XEMB.query.word}"`} items={byDistance.map(point => ({ label: point.word,
      value: `distance ${Math.round(distance(point))}, ${near.has(point.word) ? "a neighbour" : "not a neighbour"}` }))}>
      <svg className="oak-explainer__xemb" viewBox="0 0 100 100" role="presentation" focusable="false">
        <circle className="oak-explainer__reach" cx={XEMB.query.x} cy={XEMB.query.y} r={radius} />
        {xembNearest(k).map(point => <line key={point.word} className="oak-explainer__link" x1={XEMB.query.x} y1={XEMB.query.y} x2={point.x} y2={point.y} />)}
        {XEMB.points.map(point => <g key={point.word} className="oak-explainer__point" data-near={near.has(point.word) ? "" : undefined}>
          <circle cx={point.x} cy={point.y} r={1.8} />
          <text className="oak-explainer__svg-label" x={point.x} y={point.y - 3.2} textAnchor="middle">{point.word}</text>
        </g>)}
        <g className="oak-explainer__point" data-query="">
          <rect x={XEMB.query.x - 2.4} y={XEMB.query.y - 2.4} width={4.8} height={4.8} rx={1} />
          <text className="oak-explainer__svg-label" x={XEMB.query.x} y={XEMB.query.y + 7.5} textAnchor="middle">{XEMB.query.word}</text>
        </g>
      </svg>
    </OakFigure>
    <div className="oak-explainer__slider">
      <label htmlFor={id}>Neighbours</label>
      <output htmlFor={id}>{k}</output>
      <Input id={id} type="range" min={1} max={XEMB.points.length} step={1} value={k} onChange={change} aria-valuetext={sayK(k)} />
    </div>
    <p className="oak-explainer__now">{sayK(k)}</p>
    <ExplainerBridge topic={oakExplainerTopic("embeddings")} />
  </>;
}
