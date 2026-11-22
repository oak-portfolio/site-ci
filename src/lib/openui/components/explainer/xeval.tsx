import * as React from "react";
import { Button } from "@/components/ui/button";
import { OakFigure } from "../../figure/OakFigure";
import { useExplainerSay, type ExplainerPresetProps } from "./shared";

export const XEVAL = {
  title: "An eval loop, round by round",
  bar: 0.9,
  start: 0,
  rounds: [
    { label: "Round 1", change: "The first run of 40 test questions.",
      checks: [{ name: "Cites a source", passed: 28, total: 40 }, { name: "Stays on topic", passed: 36, total: 40 }, { name: "Says I don't know", passed: 22, total: 40 }] },
    { label: "Round 2", change: "The prompt now asks for a source on every claim.",
      checks: [{ name: "Cites a source", passed: 38, total: 40 }, { name: "Stays on topic", passed: 37, total: 40 }, { name: "Says I don't know", passed: 24, total: 40 }] },
    { label: "Round 3", change: "Questions with no answer now get a plain I don't know.",
      checks: [{ name: "Cites a source", passed: 38, total: 40 }, { name: "Stays on topic", passed: 38, total: 40 }, { name: "Says I don't know", passed: 37, total: 40 }] },
  ],
} as const;

type Round = (typeof XEVAL.rounds)[number];
type Check = Round["checks"][number];
const rate = (check: Check) => check.passed / check.total;
const percent = (value: number) => `${Math.round(value * 100)}%`;
export const xevalClears = (round: Round): Check[] => round.checks.filter(check => rate(check) >= XEVAL.bar);
const sayRound = (round: Round) => `${round.label}: ${xevalClears(round).length} of ${round.checks.length} checks clear ${percent(XEVAL.bar)}. ${round.change}`;

/** Pass rates per check against a fixed bar; the round chips step through the loop, each row says in words whether it clears, and no record covers it, so no Bridge. */
export function XEval({ titleId }: ExplainerPresetProps) {
  const [at, setAt] = React.useState<number>(XEVAL.start);
  const say = useExplainerSay();
  const round = XEVAL.rounds[at]!;
  const pick = (next: number) => { if (next === at) return; setAt(next); say(sayRound(XEVAL.rounds[next]!)); };
  return <>
    <h3 id={titleId} className="oak-explainer__title">{XEVAL.title}</h3>
    <OakFigure caption={`${round.label} pass rates against a ${percent(XEVAL.bar)} bar`} items={round.checks.map(check => ({ label: check.name,
      value: `${check.passed} of ${check.total}, ${percent(rate(check))}, ${rate(check) >= XEVAL.bar ? "clears the bar" : "below the bar"}` }))}>
      <ol className="oak-explainer__checks">{round.checks.map(check => <li key={check.name} data-clears={rate(check) >= XEVAL.bar ? "" : undefined}>
        <span className="oak-explainer__passage">{check.name}</span>
        <svg className="oak-explainer__score" viewBox="0 0 100 6" preserveAspectRatio="none" role="presentation" focusable="false">
          <rect className="oak-explainer__score-track" width={100} height={6} rx={3} />
          <rect className="oak-explainer__score-fill" width={rate(check) * 100} height={6} rx={3} />
          <line className="oak-explainer__bar-mark" x1={XEVAL.bar * 100} x2={XEVAL.bar * 100} y1={0} y2={6} />
        </svg>
        <span className="oak-explainer__score-value">{percent(rate(check))}</span>
        <span className="oak-explainer__fate">{rate(check) >= XEVAL.bar ? "Clears the bar" : "Below the bar"}</span>
      </li>)}</ol>
    </OakFigure>
    <div className="oak-explainer__controls">
      <div className="oak-explainer__chips" role="group" aria-label="Eval round">{XEVAL.rounds.map((row, index) =>
        <Button key={row.label} type="button" variant="secondary" size="sm" aria-pressed={index === at} onClick={() => pick(index)}>{row.label}</Button>)}</div>
      <p className="oak-explainer__now">{sayRound(round)}</p>
    </div>
  </>;
}
