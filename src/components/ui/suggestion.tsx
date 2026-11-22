import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { motion, useReducedMotion } from "motion/react";
import { oakMotion, oakPress } from "@/lib/oakMotion";
import { cn } from "@/lib/utils";

/**
 * `wheel="sideways"` is for a one-row list that scrolls sideways: a vertical mouse wheel moves the row while it can
 * still move, and the page scrolls as usual once the row reaches either end. Trackpads already scroll sideways.
 */
export function Suggestions({ className, wheel, ...props }: Omit<React.ComponentProps<"div">, "ref"> & { wheel?: "sideways" }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const row = ref.current;
    if (!row || wheel !== "sideways") return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const room = row.scrollWidth - row.clientWidth;
      const step = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
      const next = Math.min(room, Math.max(0, row.scrollLeft + step));
      if (room <= 0 || Math.abs(next - row.scrollLeft) < 1) return;
      event.preventDefault();
      row.scrollLeft = next;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, [wheel]);
  return <div ref={ref} data-slot="suggestions" className={cn("ui-suggestions", className)} {...props} />;
}

/**
 * `icon` is a decorative leading glyph; `trailing` an optional decorative end glyph. Pressing gives a small scale cue.
 * `order` staggers a fresh row: each chip rises in a beat after the one before it.
 */
export function Suggestion({ suggestion, onSelect, icon, trailing, order, ...props }: Omit<React.ComponentProps<typeof BaseButton>, "onClick" | "onSelect" | "children" | "className"> & {
  suggestion: string;
  onSelect: (text: string) => void;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  order?: number;
}) {
  const reduced = useReducedMotion();
  const press = oakPress(reduced);
  const rise = order === undefined || reduced ? null : oakMotion("reveal", false);
  return <BaseButton type="button" data-slot="suggestion" className="ui-suggestion" data-with-icon={icon ? "" : undefined}
    render={<motion.button whileTap={press.whileTap} transition={press.transition}
      initial={rise?.initial} animate={rise ? { ...rise.animate, transition: { ...rise.transition, delay: 0.06 + order! * 0.05 } } : undefined} />}
    {...props} onClick={() => onSelect(suggestion)}>
    {icon ? <span className="ui-suggestion__icon" aria-hidden="true">{icon}</span> : null}
    <span className="ui-suggestion__label">{suggestion}</span>
    {trailing ? <span className="ui-suggestion__trailing" aria-hidden="true">{trailing}</span> : null}
  </BaseButton>;
}
