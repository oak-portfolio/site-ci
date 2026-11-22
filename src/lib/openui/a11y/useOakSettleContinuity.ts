import * as React from "react";

/** A drawn block by its tag and text: the same block drawn again after the settle remount has the same id. */
const blockId = (element: Element | null | undefined) => {
  const block = element?.closest(".oak-openui > *");
  return block ? `${block.tagName}${block.textContent}` : null;
};
/** A control by its block and its own label, so a reordered layout still finds it; twins with the same id are told apart by their order. */
const controlId = (control: HTMLElement) => [blockId(control), control.tagName, control.getAttribute("aria-label"), control.getAttribute("href"), control.textContent].join("\u0001");

/**
 * r110b: the settle remount costs a live answer its entrance (it would replay) and its focus. Remember the focused control by
 * what it is (its block, its label, its place among twins) and the blocks on screen, then before paint finish the replayed
 * entrance of blocks that were already shown and refocus that control. Spread the returned handlers on `frame`.
 */
export function useOakSettleContinuity(frame: React.RefObject<HTMLDivElement | null>, streaming: boolean, settled: boolean) {
  const focusOn = React.useRef<{ id: string; nth: number } | null>(null);
  const shown = React.useRef<string[]>([]);
  const focusables = () => [...frame.current?.querySelectorAll<HTMLElement>("a[href], button, [tabindex]") ?? []];
  const onFocus = (event: React.FocusEvent) => {
    const control = event.target as HTMLElement, id = controlId(control);
    focusOn.current = { id, nth: focusables().filter(other => controlId(other) === id).indexOf(control) };
  };
  const onBlur = (event: React.FocusEvent) => { if (event.target.isConnected && document.hasFocus()) focusOn.current = null; };
  const wasStreaming = React.useRef(streaming);
  React.useLayoutEffect(() => {
    const remounted = settled && wasStreaming.current;
    wasStreaming.current = streaming;
    if (!frame.current) return;
    if (remounted) {
      const before = [...shown.current];
      frame.current.getAnimations({ subtree: true }).forEach(animation => {
        const block = animation.effect instanceof KeyframeEffect ? blockId(animation.effect.target) : null;
        const at = block === null ? -1 : before.indexOf(block);
        if ((animation as CSSAnimation).animationName === "oak-openui-in" && at >= 0) { before.splice(at, 1); animation.finish(); }
      });
      const target = focusOn.current;
      if (target && document.activeElement === document.body) focusables().filter(control => controlId(control) === target.id)[target.nth]?.focus({ preventScroll: true });
    }
    shown.current = [...frame.current.querySelectorAll<HTMLElement>(".oak-openui > *")].map(block => blockId(block)!);
  });
  return { onFocus, onBlur };
}
