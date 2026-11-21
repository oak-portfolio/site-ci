/**
 * The quote chip sits in the composer, outside the Message Scroller's provider, so it cannot call `useMessageScroller()`.
 * The mounted transcript registers its `scrollToMessage` here; a chip jumps through it, so the scroller sees an explicit
 * jump and stops following the live edge.
 */
type Jump = (messageId: string, behavior: ScrollBehavior) => boolean;

let jump: Jump | null = null;

/** Returns the cleanup; a newer transcript's registration is never undone by an older one unmounting. */
export function registerOakTranscriptJump(next: Jump) {
  jump = next;
  return () => { if (jump === next) jump = null; };
}

/** True when the transcript took the jump; false when no transcript is mounted or the message is not in it. */
export function jumpOakTranscriptToMessage(messageId: string, behavior: ScrollBehavior) {
  return jump?.(messageId, behavior) ?? false;
}
