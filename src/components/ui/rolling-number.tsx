import * as React from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type Roll = { char: string; leaving: string | null; direction: number };

// One spring drives both digits' offsets from the same callback, so they start, move and settle on the same frame even when
// the main thread is busy. No fade: the slot clips, so mid-roll shows the bottom of one digit over the top of the next,
// like an odometer, and is never blank. The leaving digit keeps the element it arrived in (same key), so a tick that lands
// mid-roll starts it from the offset it had reached instead of snapping it back to 0.
const offsetOf = (digit: HTMLElement | null) => Number(/(-?[\d.]+)%/.exec(digit?.style.transform ?? "")?.[1] ?? 0);

function Slot({ char, direction, reduced }: { char: string; direction: number; reduced: boolean | null }) {
  const [roll, setRoll] = React.useState<Roll>({ char, leaving: null, direction });
  if (roll.char !== char) setRoll({ char, leaving: reduced ? null : roll.char, direction });
  const arriving = React.useRef<HTMLSpanElement>(null);
  const leaving = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    if (!roll.leaving) return;
    const from = offsetOf(leaving.current);
    const place = (progress: number) => {
      if (arriving.current) arriving.current.style.transform = `translateY(${(1 - progress) * roll.direction * 100}%)`;
      if (leaving.current) leaving.current.style.transform = `translateY(${from + (-roll.direction * 100 - from) * progress}%)`;
    };
    place(0);
    const run = animate(0, 1, { type: "spring", duration: 0.38, bounce: 0.15, onUpdate: place, onComplete: () => setRoll(current => current === roll ? { ...roll, leaving: null } : current) });
    return () => run.stop();
  }, [roll]);
  return <span className="ui-rolling-number__slot">
    {roll.leaving ? <span key={roll.leaving} ref={leaving} className="ui-rolling-number__digit" data-leaving="" aria-hidden="true">{roll.leaving}</span> : null}
    <span key={roll.char} ref={arriving} className="ui-rolling-number__digit">{roll.char}</span>
  </span>;
}

/**
 * A number whose changed digits roll like an odometer: up when it grows, down when it shrinks. Ported from Beautiful UI's
 * ApprovalCard RollingDigits onto Motion. Slots are keyed from the right, so 9 to 10 rolls the ones and adds a tens digit
 * instead of shifting every place. The digits are the text; the leaving digit rolls out pinned over the arriving one in the
 * same slot on one shared progress value, so the slot keeps its width and clips both (no gap, no digit escaping the line), hidden from assistive tech.
 * Reduced motion swaps digits at once.
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const previous = React.useRef(value);
  const direction = value < previous.current ? -1 : 1;
  React.useEffect(() => { previous.current = value; }, [value]);
  const chars = String(value).split("");
  return <span data-slot="rolling-number" className={cn("ui-rolling-number", className)}>
    {chars.map((char, index) => <Slot key={chars.length - index} char={char} direction={direction} reduced={reduced} />)}
  </span>;
}
