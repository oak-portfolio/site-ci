import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { announceOakBlock } from "../../a11y/oakBlockAnnounce";
import { OakOpenUIScopeContext } from "../../scope";

/** A preset draws its own fixed subject, so the model's topic never reaches it; its Bridge line names that subject's record. */
export type ExplainerPresetProps = { titleId: string };
export type ExplainerStepRow = Readonly<{ label: string; line: string }>;

/** One announcement per change, through the transcript region, keyed by this block. */
export function useExplainerSay() {
  const block = `${React.useContext(OakOpenUIScopeContext)?.id ?? ""}:${React.useId()}`;
  return (text: string) => announceOakBlock(block, text, { repeat: true });
}

/** Back and next below a stepped figure; the count names the row in words, so the highlight is never the only signal. */
export function ExplainerStepper({ noun, rows, at, onGo }: { noun: string; rows: readonly ExplainerStepRow[]; at: number; onGo: (to: number) => void }) {
  const say = useExplainerSay(), last = rows.length - 1;
  const go = (next: number) => {
    const to = Math.max(0, Math.min(last, next));
    if (to === at) return;
    onGo(to);
    say(`${noun} ${to + 1} of ${rows.length}, ${rows[to]!.label}: ${rows[to]!.line}`);
  };
  const name = noun.toLowerCase();
  return <div className="oak-explainer__stepper">
    <Button type="button" variant="ghost" size="icon" aria-label={`Previous ${name}`} focusableWhenDisabled disabled={at === 0} onClick={() => go(at - 1)}><Icon name="arrowLeft" size={16} /></Button>
    <p className="oak-explainer__now"><span className="oak-explainer__count">{noun} {at + 1} of {rows.length}, {rows[at]!.label}</span><span>{rows[at]!.line}</span></p>
    <Button type="button" variant="ghost" size="icon" aria-label={`Next ${name}`} focusableWhenDisabled disabled={at === last} onClick={() => go(at + 1)}><Icon name="arrowRight" size={16} /></Button>
  </div>;
}
