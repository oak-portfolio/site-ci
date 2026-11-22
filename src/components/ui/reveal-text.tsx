import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text that is already whole, revealed word by word out of a soft blur. Ported from Beautiful UI's StreamingText ("words
 * resolve out of blur"), with no timers: each word carries its index and CSS staggers it from `start` by `step`, so the
 * full text is in the DOM from the first frame for copying and assistive tech. The animation only runs inside a caller's
 * live scope (`.oak-turn__answer[data-arrive="live"]`), so a reopened answer or reduced motion renders at rest.
 */
export function RevealText({ text, start = 0, step = 24, className }: {
  text: string;
  /** Delay before the first word, in ms. */
  start?: number;
  /** Delay between words, in ms. */
  step?: number;
  className?: string;
}) {
  let word = 0;
  const startMs = `${Math.round(start)}ms`;
  const stepMs = `${Math.round(step * 10) / 10}ms`;
  return <span data-slot="reveal-text" className={cn("ui-reveal-text", className)}
    style={{ "--ui-reveal-start": startMs, "--ui-reveal-step": stepMs } as React.CSSProperties}>
    {text.split(/(\s+)/).map((part, index) => !part || /^\s+$/.test(part) ? part
      : <span key={index} className="ui-reveal-text__word" style={{ "--ui-word": word++ } as React.CSSProperties}>{part}</span>)}
  </span>;
}

/** Words in a text, as `RevealText` counts them. */
export function revealWordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}
