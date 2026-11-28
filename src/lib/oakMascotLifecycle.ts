import type { OakMascotAnimation, OakMascotTrigger } from "@/data/oakMascot";

export type MascotSpeech = {
  key: number;
  contextId: string;
  /** The page context a note belongs to; an interleaved invite shows its own context but rotates on from this one. */
  rotationId?: string;
  text: string;
  trigger?: OakMascotTrigger;
  animation: OakMascotAnimation;
  source?: "scroll" | "direct";
};

/** An active-time clock: hidden time never advances a note or a typewriter. */
export class MascotReadingClock {
  private elapsed = 0;
  private started: number | null = null;
  constructor(private readonly wallTime = () => performance.now()) {}
  now() {
    return this.elapsed + (this.started === null ? 0 : this.wallTime() - this.started);
  }
  resume() {
    if (this.started === null) this.started = this.wallTime();
  }
  pause() {
    this.elapsed = this.now();
    this.started = null;
  }
}

type MascotReadingState = {
  clock: MascotReadingClock;
  initialized: boolean;
  collapsed: boolean;
  speech: MascotSpeech | null;
  typedText: string;
  bubbleMultiline: boolean;
  frame: number;
  animationName: OakMascotAnimation | null;
  activeSection: string | null;
  activeContext: string | null;
  lastSpeechAt: number;
  lastContextAt: Record<string, number>;
  speechKey: number;
  previousText: string | undefined;
  typewriter: { key: number; startedAt: number; visibleCount: number } | null;
  noteDeadline: { key: number; at: number } | null;
  welcomeDeadline: number | null;
  scrollDeadline: { key: number; at: number } | null;
};
const readingStates = new Map<string, MascotReadingState>();

/** Browser-session reading state survives optional audience-island removal on stub routes. */
export function retainMascotReadingState(path: string): MascotReadingState {
  const route = path.replace(/\/$/, "") || "/";
  let value = readingStates.get(route);
  if (!value) {
    value = {
      clock: new MascotReadingClock(), initialized: false, collapsed: false, speech: null, typedText: "",
      bubbleMultiline: false, frame: 0, animationName: null, activeSection: null,
      activeContext: null, lastSpeechAt: 0, lastContextAt: {}, speechKey: 0,
      previousText: undefined, typewriter: null, noteDeadline: null, welcomeDeadline: null, scrollDeadline: null,
    };
    // The site's eligible route set is small. Bound session memory if routes expand.
    if (readingStates.size >= 16) readingStates.delete(readingStates.keys().next().value!);
    readingStates.set(route, value);
  }
  return value;
}

/** Cancelling the owner invalidates callbacks even if a host delivers one after cancellation. */
export class MascotCallbackOwner {
  private generation = 0;
  private cleanups = new Set<() => void>();
  guard(callback: () => void) {
    const generation = this.generation;
    return () => { if (generation === this.generation) callback(); };
  }
  own(cleanup: () => void) {
    this.cleanups.add(cleanup);
    return () => { cleanup(); this.cleanups.delete(cleanup); };
  }
  cancel() {
    this.generation++;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
  }
}

export function getTypewriterGraphemes(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

export function typewriterVisibleCount(graphemeCount: number, elapsed: number, duration: number) {
  return Math.min(graphemeCount, Math.max(1, Math.ceil(Math.min(1, elapsed / duration) * graphemeCount)));
}
