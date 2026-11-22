import * as React from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** The reading pace, in characters per millisecond (about ten words a second). */
export const STREAM_PACE = 0.055;
/**
 * A long block gets about this long to type out (never faster than three times the reading pace), so it usually finishes
 * before the provider's next block lands instead of ending in a catch-up. Short blocks keep the reading pace.
 */
export const STREAM_BUDGET_MS = 3800;

/**
 * Text that types itself in as it arrives. Ported from Beautiful UI's StreamText: characters reveal on animation frames,
 * the leading few resolve out of a soft blur, and a caret rides the edge while streaming. Adapted for live snapshots: when
 * `text` grows (a reasoning summary arriving in pieces), the reveal carries on from where it is instead of restarting, and
 * keeps a steady pace, so a thought that arrives whole still reads as streaming: the reading pace, or quicker for a long
 * block so it fits in about four seconds (D115). `settle` (a newer thought took over, or the answer landed) speeds the rest
 * up to three times the reading pace, never more than 12 characters in a frame, so it catches up without a jump (D87).
 * `paused` holds the reveal (an earlier thought is still typing); `onDone` fires
 * once the whole text is on screen. A shorter or different text restarts. `live={false}` (a turn already on screen) and
 * reduced motion show the whole text at once.
 */
export function StreamText({ text, live = true, caret = true, settle = false, finishMs, paused = false, delay = 0, blurTail = 6, onDone, className }: {
  text: string;
  live?: boolean;
  caret?: boolean;
  /** Catch up: what is left reveals at three times the reading pace. */
  settle?: boolean;
  /** Q16-D11: finish what is left within about this many milliseconds (the turn has ended), however long it is. */
  finishMs?: number;
  /** Hold the reveal where it is (nothing new shows) until this turns false. */
  paused?: boolean;
  /** Wait this long after mounting before the first character, so a row that is still opening never clips it. */
  delay?: number;
  /** How many trailing characters carry the soft blur edge. */
  blurTail?: number;
  /** Called once the whole text is on screen (at once when nothing types). */
  onDone?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const still = !live || Boolean(reduced);
  const [startAt] = React.useState(() => performance.now() + delay);
  const [count, setCount] = React.useState(still ? text.length : 0);
  // A rewrite (not a continuation of what is on screen) restarts the count in this same render, before any effect can
  // read the old count as finished and report the new text done (Codex review on PR #119).
  const [rendered, setRendered] = React.useState(text);
  if (rendered !== text) {
    setRendered(text);
    if (!still && !text.startsWith(rendered.slice(0, count))) setCount(0);
  }
  const shownRef = React.useRef(still ? text.length : 0);
  const textRef = React.useRef("");
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  React.useEffect(() => {
    // A text that is not a continuation of what is on screen starts over; a continuation keeps its place.
    if (!text.startsWith(textRef.current.slice(0, shownRef.current))) shownRef.current = 0;
    textRef.current = text;
    if (still) { shownRef.current = text.length; setCount(text.length); return; }
    if (paused) return;
    let frame = 0;
    let last = performance.now();
    // Fractional progress, so the pace is the same at 60Hz and 120Hz.
    let position = shownRef.current;
    // The pace is set for what is left when this text arrives, so it holds steady through the block.
    const steady = Math.min(STREAM_PACE * 3, Math.max(STREAM_PACE, (text.length - shownRef.current) / STREAM_BUDGET_MS));
    const finish = finishMs ? Math.max(STREAM_PACE * 3, (text.length - shownRef.current) / finishMs) : 0;
    const tick = (time: number) => {
      const behind = text.length - shownRef.current;
      if (behind <= 0) return;
      if (time < startAt && !settle) { last = time; frame = requestAnimationFrame(tick); return; }
      // Catching up runs at three times the reading pace. A long frame gap (a background tab) never dumps more than 12
      // characters at once (48 while finishing an ended turn).
      const rate = finish || (settle ? STREAM_PACE * 3 : steady);
      position = Math.min(text.length, position + Math.min(finish ? 48 : 12, Math.max(0, time - last) * rate));
      last = time;
      if (Math.floor(position) > shownRef.current) {
        shownRef.current = Math.floor(position);
        setCount(shownRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, still, settle, finishMs, paused, startAt]);

  const complete = count >= text.length;
  React.useEffect(() => { if (complete) doneRef.current?.(); }, [complete, text]);

  const shown = text.slice(0, count);
  const streaming = !still && count < text.length;
  const split = streaming ? Math.max(0, shown.length - blurTail) : shown.length;
  return <span data-slot="stream-text" className={cn("ui-stream-text", className)} data-streaming={streaming || undefined}>
    {shown.slice(0, split)}
    {split < shown.length ? <span className="ui-stream-text__tail">{shown.slice(split)}</span> : null}
    {caret && live ? <span aria-hidden="true" className="ui-stream-text__caret" /> : null}
    {/* The full text stays readable to assistive tech even while the reveal catches up. */}
    {streaming ? <span className="sr-only">{text.slice(count)}</span> : null}
  </span>;
}
