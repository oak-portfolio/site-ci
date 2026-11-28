/** Admission uses the layout viewport. VisualViewport remains a rendering constraint only. */
export const oakViewportNotice = "Use a larger window to open Oak AI Agent.";
type Layout = Readonly<{ width: number; height: number; outerWidth: number; outerHeight: number; orientation: number | undefined }>;
let stable: Layout | null = null;
let keyboardBaseline: Layout | null = null;
let keyboardCompressed = false;
function layout(): Layout {
  return { width: window.innerWidth, height: window.innerHeight, outerWidth: window.outerWidth,
    outerHeight: window.outerHeight, orientation: window.screen?.orientation?.angle };
}
function sameWindow(a: Layout, b: Layout) {
  return a.width === b.width && a.outerWidth === b.outerWidth && a.outerHeight === b.outerHeight && a.orientation === b.orientation;
}
function editable(target: EventTarget | null) {
  return target instanceof HTMLElement && !target.closest("[inert], [hidden]") &&
    (target.isContentEditable || target.matches("textarea:not(:disabled):not([readonly]), input:not(:disabled):not([readonly]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])"));
}
export function isOakViewportSupported() {
  if (typeof window === "undefined") return false;
  const next = layout();
  // resize-content keyboards can shorten innerHeight as well as VisualViewport. A focused
  // field's pre-keyboard layout survives that compression only while the window frame,
  // width and orientation remain unchanged. Real window changes retire the baseline.
  if (keyboardBaseline && (!sameWindow(next, keyboardBaseline) || next.height > keyboardBaseline.height ||
      (keyboardCompressed && next.height >= keyboardBaseline.height))) {
    keyboardBaseline = null; keyboardCompressed = false;
  }
  if (keyboardBaseline && next.height < keyboardBaseline.height) keyboardCompressed = true;
  stable = keyboardBaseline && next.height < keyboardBaseline.height ? { ...next, height: keyboardBaseline.height } : next;
  return stable.width >= 360 && stable.height >= 600;
}
export function installOakViewportSupport(onChange: () => void) {
  stable = layout(); keyboardBaseline = null; keyboardCompressed = false;
  const changed = () => { isOakViewportSupported(); onChange(); };
  const focus = (event: FocusEvent) => {
    if (editable(event.target) && !keyboardBaseline) keyboardBaseline = stable ?? layout();
  };
  const orientation = () => { keyboardBaseline = null; keyboardCompressed = false; changed(); };
  document.addEventListener("focusin", focus);
  window.addEventListener("resize", changed);
  window.addEventListener("orientationchange", orientation);
  window.visualViewport?.addEventListener("resize", changed);
  changed();
  return () => {
    document.removeEventListener("focusin", focus);
    window.removeEventListener("resize", changed);
    window.removeEventListener("orientationchange", orientation);
    window.visualViewport?.removeEventListener("resize", changed);
    keyboardBaseline = null;
  };
}
