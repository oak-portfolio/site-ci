import * as React from "react";

/**
 * For a view a block opens (a viewer, a palette, an expanded figure). Spread the result on the view's own element: Escape
 * from inside it calls `onEscape` and stops there, after handlers inside the view have seen it (one that calls
 * preventDefault keeps the view open), so it closes only this view and Escape elsewhere is left alone. When the view
 * unmounts with focus inside it (or dropped to body), focus goes back to `opener`; when the opener is gone too, to its
 * figure, then to its answer (`[data-message-id]`). Focus the visitor moved elsewhere stays where it is.
 */
export function useReturnFocus<T extends HTMLElement = HTMLDivElement>(opener: React.RefObject<HTMLElement | null>, onEscape?: () => void) {
  const ref = React.useRef<T>(null);
  const escape = React.useRef(onEscape);
  React.useEffect(() => { escape.current = onEscape; });
  React.useEffect(() => {
    const view = ref.current, target = opener.current;
    const figure = target?.closest<HTMLElement>("figure");
    const message = (target ?? view)?.closest("[data-message-id]")?.getAttribute("data-message-id");
    return () => {
      const active = document.activeElement;
      if (active && active !== document.body && !view?.contains(active)) return;
      const answer = message ? document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(message)}"]`) : null;
      const back = [target, figure, answer].find(node => node?.isConnected);
      if (!back) return;
      if (back !== target && !back.hasAttribute("tabindex")) back.tabIndex = -1;
      back.focus();
    };
  }, [opener]);
  const onKeyDown = React.useCallback((event: React.KeyboardEvent<T>) => {
    if (event.key !== "Escape" || event.defaultPrevented || !escape.current) return;
    event.preventDefault();
    event.stopPropagation();
    escape.current();
  }, []);
  return { ref, onKeyDown };
}
