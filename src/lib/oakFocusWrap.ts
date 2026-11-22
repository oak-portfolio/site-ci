const focusable = "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), iframe, [tabindex]";

type TabKey = Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">;

export function focusStops(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusable)]
    // r192 P2: a disabled control (directly or in a disabled fieldset) or a visibility:hidden one cannot take focus.
    // Safari before 17.4 has no checkVisibility; client rects there drop display:none and hidden, the style check visibility:hidden or collapse (r194 N1).
    .filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && !node.closest("[inert]")
      && (node.checkVisibility ? node.checkVisibility({ visibilityProperty: true })
        : node.getClientRects().length > 0 && getComputedStyle(node).visibility === "visible"));
}

// Base UI's guards and cross-origin frames move focus a frame late, so Tab at an edge is wrapped by hand (m5 M5, m6 M6).
export function wrapTab(event: TabKey, root: ParentNode & Node, pullIn = false): void {
  if (event.key !== "Tab") return;
  const stops = focusStops(root);
  const first = stops[0], last = stops.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  const atEdge = active === (event.shiftKey ? first : last);
  if (!atEdge && !(pullIn && !root.contains(active))) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}
