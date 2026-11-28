import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import type { OakExplainerTopic } from "@/data/oakExplainerTopics";
import { announceOakBlock } from "../../a11y/oakBlockAnnounce";
import { OakFigure } from "../../figure/OakFigure";
import { OakOpenUIScopeContext } from "../../scope";
import { ExplainerBridge } from "./bridge";

/** The topic's fixed steps as tiles; the stepper below the figure is the keyboard surface and names the step in words. */
export function Concept({ topic, titleId }: { topic: OakExplainerTopic; titleId: string }) {
  const [at, setAt] = React.useState(0);
  const block = `${React.useContext(OakOpenUIScopeContext)?.id ?? ""}:${React.useId()}`;
  const steps = topic.steps, last = steps.length - 1;
  const go = (next: number) => {
    const to = Math.max(0, Math.min(last, next));
    setAt(to);
    announceOakBlock(block, `Step ${to + 1} of ${steps.length}, ${steps[to]!.label}: ${steps[to]!.line}`, { repeat: true });
  };
  return <>
    <h3 id={titleId} className="oak-explainer__title">{topic.title}</h3>
    <OakFigure caption="Step by step" items={steps.map((step, index) => ({ label: `${index + 1}. ${step.label}`, value: step.line }))}>
      <ol className="oak-explainer__steps">{steps.map((step, index) => <li key={step.label} className="oak-explainer__step" data-current={index === at ? "" : undefined}>
        <span className="oak-explainer__mark">{index + 1}</span><span className="oak-explainer__name">{step.label}</span>
        {index < last ? <span className="oak-explainer__arrow"><Icon name="arrowRight" size={16} /></span> : null}
      </li>)}</ol>
    </OakFigure>
    <div className="oak-explainer__stepper">
      <Button type="button" variant="ghost" size="icon" aria-label="Previous step" focusableWhenDisabled disabled={at === 0} onClick={() => go(at - 1)}><Icon name="arrowLeft" size={16} /></Button>
      <p className="oak-explainer__now"><span className="oak-explainer__count">Step {at + 1} of {steps.length}, {steps[at]!.label}</span><span>{steps[at]!.line}</span></p>
      <Button type="button" variant="ghost" size="icon" aria-label="Next step" focusableWhenDisabled disabled={at === last} onClick={() => go(at + 1)}><Icon name="arrowRight" size={16} /></Button>
    </div>
    <ExplainerBridge topic={topic} />
  </>;
}
