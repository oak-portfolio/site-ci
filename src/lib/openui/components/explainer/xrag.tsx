import * as React from "react";
import { Button } from "@/components/ui/button";
import { OakFigure } from "../../figure/OakFigure";
import { oakExplainerTopic } from "@/data/oakExplainerTopics";
import { ExplainerBridge } from "./bridge";
import { useExplainerSay, type ExplainerPresetProps } from "./shared";

export const XRAG = {
  title: "How retrieval picks passages",
  query: "How do I reset my password?",
  ks: [1, 3, 5],
  start: 3,
  passages: [
    { text: "Reset a password from Settings, then Security.", score: 0.91 },
    { text: "Reset links expire after one hour.", score: 0.84 },
    { text: "Two-factor codes arrive by text or an app.", score: 0.62 },
    { text: "Change your display name under Profile.", score: 0.41 },
    { text: "Receipts arrive by email each month.", score: 0.22 },
    { text: "Dark mode follows the system setting.", score: 0.12 },
  ],
} as const;

const ranked = [...XRAG.passages].sort((a, b) => b.score - a.score);
const sayK = (k: number) => `Top ${k}: the model reads ${k} ${k === 1 ? "passage" : "passages"}, ${ranked.length - k} left out.`;

/** Passages ranked by similarity score; the top-k chips choose how many reach the prompt, and each row says kept or left out. */
export function XRag({ titleId }: ExplainerPresetProps) {
  const [k, setK] = React.useState<number>(XRAG.start);
  const say = useExplainerSay();
  const pick = (next: number) => { if (next === k) return; setK(next); say(sayK(next)); };
  return <>
    <h3 id={titleId} className="oak-explainer__title">{XRAG.title}</h3>
    <p className="oak-explainer__query">Question: {XRAG.query}</p>
    <OakFigure caption="Passages ranked by score" items={ranked.map((row, index) => ({ label: `${index + 1}. ${row.text}`,
      value: `score ${row.score.toFixed(2)}, ${index < k ? "kept" : "left out"}` }))}>
      <ol className="oak-explainer__passages">{ranked.map((row, index) => <li key={row.text} data-kept={index < k ? "" : undefined}>
        <span className="oak-explainer__rank">{index + 1}</span>
        <span className="oak-explainer__passage">{row.text}</span>
        <svg className="oak-explainer__score" viewBox="0 0 100 6" preserveAspectRatio="none" role="presentation" focusable="false">
          <rect className="oak-explainer__score-track" width={100} height={6} rx={3} />
          <rect className="oak-explainer__score-fill" width={row.score * 100} height={6} rx={3} />
        </svg>
        <span className="oak-explainer__score-value">{row.score.toFixed(2)}</span>
        <span className="oak-explainer__fate">{index < k ? "Kept" : "Left out"}</span>
      </li>)}</ol>
    </OakFigure>
    <div className="oak-explainer__controls">
      <div className="oak-explainer__chips" role="group" aria-label="Passages kept">{XRAG.ks.map(value =>
        <Button key={value} type="button" variant="secondary" size="sm" aria-pressed={value === k} onClick={() => pick(value)}>Top {value}</Button>)}</div>
      <p className="oak-explainer__now">{sayK(k)}</p>
    </div>
    <ExplainerBridge topic={oakExplainerTopic("rag")} />
  </>;
}
