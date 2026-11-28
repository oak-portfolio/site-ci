import * as React from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { oakMotion, oakMotionTokens } from "@/lib/oakMotion";
import { cn } from "@/lib/utils";

const ChainOfThoughtOpen = React.createContext<{ open: boolean; auto: boolean; held: boolean; folded: () => void }>({ open: false, auto: false, held: false, folded: () => {} });

/**
 * A collapsible reasoning trace: a header that summarizes the thinking, then its steps. Ported from AI Elements Chain of
 * Thought onto Base UI Collapsible; the caller owns open state so it can open while thinking and fold once an answer lands.
 * Base UI hides a closed panel at once, so the root stays open (marked `data-folding`) until Motion's fold has played.
 * `data-fold="held"` marks a planned turn's settle: the trail kept every row, so it folds in flow over a longer spring to keep the
 * answer under it moving less than a line and a half a frame (the held fold in DESIGN.md).
 * `data-fold="auto"` marks a fold the caller starts on its own (the answer landed): its steps fade out quickly in place,
 * out of the flow, so whatever follows the trail arrives in its final position instead of sliding up as the steps collapse.
 */
export function ChainOfThought({ className, open, disabled, onOpenChange, onFoldEnd, "data-fold": fold, ...props }: Omit<React.ComponentProps<typeof Collapsible.Root>, "open"> & {
  open: boolean; "data-state"?: string; "data-enter"?: string; "data-fold"?: "auto" | "held";
  /** The fold has finished playing and the steps are gone. */
  onFoldEnd?: () => void;
}) {
  const [folding, setFolding] = React.useState(false);
  const [was, setWas] = React.useState(open);
  if (was !== open) {
    setWas(open);
    setFolding(!open);
  }
  // With nothing left to fold (the caller drops the steps), no exit will play to end the fold, so end it here.
  if (folding && disabled) setFolding(false);
  const foldEnd = React.useRef(onFoldEnd);
  foldEnd.current = onFoldEnd;
  const folded = React.useCallback(() => { setFolding(false); foldEnd.current?.(); }, []);
  const auto = fold === "auto", held = fold === "held";
  const value = React.useMemo(() => ({ open, auto, held, folded }), [open, auto, held, folded]);
  // Mid-fold the root still reads open, so Base UI asks to close; to the visitor the trail is closing, so a click reopens it.
  const toggle: typeof onOpenChange = (next, details) => onOpenChange?.(folding ? true : next, details);
  return <ChainOfThoughtOpen.Provider value={value}>
    <Collapsible.Root data-slot="chain-of-thought" className={cn("ui-chain-of-thought", className as string)} open={open || folding}
      disabled={disabled} onOpenChange={toggle} data-folding={folding ? "" : undefined} data-fold={fold} {...props} />
  </ChainOfThoughtOpen.Provider>;
}

/** The whole header toggles the steps. */
export function ChainOfThoughtHeader({ className, ...props }: React.ComponentProps<typeof Collapsible.Trigger>) {
  return <Collapsible.Trigger data-slot="chain-of-thought-header" className={cn("ui-chain-of-thought__header", className as string)} {...props} />;
}

/**
 * Steps open to their natural height and fold away. Motion, not Base UI, owns the unmount so the fold can play. A long
 * trail folds on a critically damped spring (about half a second) with its text fading first, so it settles shut
 * rather than snapping, however tall it grew.
 */
/** The held fold's spring (DESIGN.md): the view glides on it too when it shows a planned answer from its start. */
export const heldFoldSpring = { type: "spring", visualDuration: 0.95, bounce: 0 } as const;

export function ChainOfThoughtContent({ className, ...props }: React.ComponentProps<typeof Collapsible.Panel>) {
  const { open, auto, held, folded } = React.useContext(ChainOfThoughtOpen);
  const reduced = useReducedMotion();
  const fold = oakMotion("fold", reduced);
  const transition = reduced ? fold.transition
    : { height: held ? heldFoldSpring : { type: "spring" as const, visualDuration: 0.5, bounce: 0 }, opacity: { duration: auto ? 0.14 : 0.4, ease: oakMotionTokens.ease } };
  // A trail already open on mount appears at rest, but only the panel skips its entrance: AnimatePresence's own
  // `initial={false}` would also reach every step inside, so new steps could never grow in.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Motion folds "auto" to 0 by laying out the end state once to measure it, and that layout clamps a scrolled transcript up by
  // the panel's height. A held fold is in flow, so its exit starts from its measured pixels and skips that layout.
  const panel = React.useRef<HTMLDivElement>(null);
  const pixels = held && !open ? panel.current?.offsetHeight ?? 0 : 0;
  const exit = { out: (from: number) => ({ ...fold.exit, ...(from ? { height: [from, 0] } : {}) }) };
  const fromPixels = held && !reduced;
  // The held exit lands in the heavy settle commit. A spring started there is first drawn after that stall and then
  // catches up in one frame, so the panel stays until a normal frame (under about 34ms) follows, capped at 600ms.
  const [shut, setShut] = React.useState(!open);
  React.useEffect(() => {
    if (open) return setShut(false);
    if (!fromPixels) return;
    const start = performance.now();
    let last = 0, id = 0;
    const tick = (t: number) => {
      if ((last && t - last < 34) || t - start > 600) return setShut(true);
      last = t;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [open, fromPixels]);
  return <AnimatePresence onExitComplete={folded} custom={pixels}>
    {open || (fromPixels && !shut) ? <Collapsible.Panel keepMounted data-slot="chain-of-thought-content" className={cn("ui-chain-of-thought__content", className as string)}
      ref={panel} render={<motion.div initial={mounted ? fold.initial : false} animate={fold.animate} variants={fromPixels ? exit : undefined} exit={fromPixels ? "out" : fold.exit} transition={transition} />} {...props} /> : null}
  </AnimatePresence>;
}
