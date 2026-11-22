import * as React from "react";

/**
 * PR gate 4: while a disclosure is open, Escape from inside it (or from its trigger) collapses it, returns focus to the
 * trigger and stops there, so the chat stays open; with it closed, Escape reaches the workspace as on main.
 * The listener is native and runs in the capture phase on the wrapper: React routes key events through the component tree
 * (and portaled content), so a bubbling React handler would hear Escape only after the chat had already closed.
 */
export function useEscapeCollapse(open: boolean, setOpen: (open: boolean) => void) {
  const wrapper = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const isOpen = React.useRef(false);
  isOpen.current = open;
  const close = React.useRef(setOpen);
  close.current = setOpen;
  React.useEffect(() => {
    const node = wrapper.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isOpen.current) return;
      event.preventDefault();
      event.stopPropagation();
      close.current(false);
      trigger.current?.focus({ preventScroll: true });
    };
    node.addEventListener("keydown", onKeyDown, true);
    return () => node.removeEventListener("keydown", onKeyDown, true);
  }, []);
  return { wrapper, trigger };
}
