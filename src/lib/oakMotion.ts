import type { TargetAndTransition, Transition } from "motion/react";

/** DESIGN.md motion tokens in Motion units: `--motion-standard`, `--motion-quick`, `--motion-mode`, `--motion-page`. */
export const oakMotionTokens = {
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  quick: 0.16,
  mode: 0.24,
  page: 0.32,
};

/**
 * How long a settled turn holds its reasoning open (after its last thought has typed) before folding it, long enough to see
 * the last check settle.
 */
export const OAK_ANSWER_SETTLE_MS = 450;
/**
 * D115: the answer arrives once the trail has folded, so its first words start to resolve this soon after it mounts.
 * Mirrored as `--oak-reveal-base` in oakAgent.css.
 */
export const OAK_REVEAL_BASE_MS = 120;

export type OakMotionSpeed = "quick" | "mode" | "page";
export type OakMotionPreset = { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition; transition: Transition };

/** Token timing, or an instant change when the visitor prefers reduced motion. */
export function oakTransition(speed: OakMotionSpeed, reduced: boolean | null): Transition {
  return reduced ? { duration: 0 } : { duration: oakMotionTokens[speed], ease: oakMotionTokens.ease };
}

const shown: Record<string, string | number> = { opacity: 1, transform: "none", scale: 1, y: 0, height: "auto" };
const presets = {
  /** Workspace panel slides in from the reading edge. */
  panel: { hidden: { opacity: 0, transform: "translateX(16px)" }, speed: "mode" },
  /** A full-screen workspace only fades in and out (Oak, live): the window is a surface, and its contents rise in on a
   * short stagger in CSS (`data-entering`), so nothing scales or slides the whole screen. */
  window: { hidden: { opacity: 0 }, speed: "page" },
  /** Centered dialogs fade; their CSS transform owns centering. */
  dialog: { hidden: { opacity: 0 }, speed: "mode" },
  backdrop: { hidden: { opacity: 0 }, speed: "mode" },
  /** A new transcript turn rises a few pixels. */
  turn: { hidden: { opacity: 0, transform: "translateY(6px)" }, speed: "mode" },
  /** Expanded tool detail drops in under its header. */
  expand: { hidden: { opacity: 0, transform: "translateY(-4px)" }, speed: "quick" },
  /** A workflow panel or a fresh group of follow-up chips rises into place. */
  reveal: { hidden: { opacity: 0, transform: "translateY(8px)" }, speed: "mode" },
  /** A label being replaced lifts away upward as its successor rises in with `reveal`. Use its `exit`. */
  lift: { hidden: { opacity: 0, transform: "translateY(-8px)" }, speed: "mode" },
  /** A status glyph or activity sprite that just changed settles in from slightly small. Independent `scale`, as in `oakPress`. */
  pop: { hidden: { opacity: 0, scale: 0.85 }, speed: "quick" },
  /** A panel's hero picture settles onto its ground: a little smaller and lower, over a page beat (D88). */
  settle: { hidden: { opacity: 0, scale: 0.8, transform: "translateY(8px)" }, speed: "page" },
  /** Reasoning steps open to their natural height while Oak thinks and fold away once the answer lands. */
  fold: { hidden: { opacity: 0, height: 0 }, speed: "mode" },
} satisfies Record<string, { hidden: TargetAndTransition; speed: OakMotionSpeed }>;

/**
 * Enter and exit states for one animation. Q10: reduced motion keeps fades only: nothing moves, scales or grows, and a preset
 * that fades still fades on the quick token, so a panel or card never pops in from nowhere. Presets without opacity rest.
 */
export function oakMotion(name: keyof typeof presets, reduced: boolean | null): OakMotionPreset {
  const { hidden, speed } = presets[name];
  const rest = Object.fromEntries(Object.keys(hidden).map(key => [key, shown[key]]));
  if (!reduced) return { initial: hidden, animate: rest, exit: hidden, transition: oakTransition(speed, false) };
  if (!("opacity" in hidden)) return { initial: rest, animate: rest, exit: rest, transition: oakTransition(speed, true) };
  const faded = { ...rest, opacity: 0 };
  return { initial: faded, animate: rest, exit: faded, transition: oakTransition("quick", false) };
}

/** Pressed feedback for chips. Independent `scale`, because Motion reads a resting `transform: none` as a zero matrix. */
export function oakPress(reduced: boolean | null): { whileTap?: TargetAndTransition; transition: Transition } {
  return reduced ? { transition: oakTransition("quick", true) } : { whileTap: { scale: 0.97 }, transition: oakTransition("quick", false) };
}

/**
 * One piece of a live answer arriving in order (label, answer, sources, actions): the reveal preset, delayed by its place.
 * A turn already on screen renders at rest, and reduced motion fades in all at once.
 */
export function oakArrival(order: number, live: boolean, reduced: boolean | null): Pick<OakMotionPreset, "animate" | "transition"> & { initial: TargetAndTransition | false } {
  const reveal = oakMotion("reveal", reduced);
  if (!live) return { initial: false, animate: reveal.animate, transition: reveal.transition };
  return { initial: reveal.initial, animate: reveal.animate, transition: reduced ? reveal.transition : { ...reveal.transition, delay: 0.05 + order * 0.09 } };
}
