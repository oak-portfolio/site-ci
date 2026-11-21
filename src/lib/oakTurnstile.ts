/**
 * P03-G1: one Turnstile pass per guest before the first sponsored answer. The Worker remembers the pass in an
 * HttpOnly cookie, so the browser only holds the single-use token until the first send succeeds.
 */
type Turnstile = { render: (node: HTMLElement, options: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }

/**
 * `refused`: the Worker rejected the pass, so show the widget even if auth status said the guest had passed. `failed`: the script never loaded.
 * R11 `challenge`: the widget renders interaction-only, so a pass that needs nobody stays `idle` and never shows; Cloudflare's
 * before-interactive callback makes it `interactive` (the workspace switches to verification mode); Cancel makes it `dismissed`.
 * `placeholder`: the states gallery shows the view with a static box instead of Cloudflare's widget.
 */
export type OakTurnstileChallenge = "idle" | "interactive" | "dismissed";
// `attempt` remounts the widget after a failure, so Retry also recovers a script that never loaded.
export type OakTurnstileState = Readonly<{ token: string | null; passed: boolean; refused: boolean; failed: boolean; challenge: OakTurnstileChallenge; placeholder: boolean; attempt: number }>;
const initial: OakTurnstileState = { token: null, passed: false, refused: false, failed: false, challenge: "idle", placeholder: false, attempt: 0 };
let state: OakTurnstileState = initial;
let widget: string | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<OakTurnstileState>) => { state = { ...state, ...next }; for (const listener of listeners) listener(); };

export const subscribeOakTurnstile = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getOakTurnstileState = () => state;
export const getOakTurnstileServerState = (): OakTurnstileState => initial;

/** The site key the guest still has to pass, or undefined once they have (or never need to). */
export function oakTurnstileSiteKey(authStatus: { kind: string; humanPassed?: boolean; turnstileSiteKey?: string } | null | undefined, turnstile: OakTurnstileState): string | undefined {
  return authStatus?.kind === "guest" && !turnstile.passed && (!authStatus.humanPassed || turnstile.refused) ? authStatus.turnstileSiteKey : undefined;
}
/** Cancel leaves verification mode without sending; the question stays in the message box. */
export function dismissOakTurnstileChallenge() { if (state.challenge === "interactive") set({ challenge: "dismissed" }); }
export function reopenOakTurnstileChallenge() { if (state.challenge === "dismissed") set({ challenge: "interactive" }); }
/** Gallery only: show verification mode with a placeholder where Cloudflare's widget would sit. */
export function setOakTurnstileFixture() { set({ challenge: "interactive", placeholder: true }); }

/** The single-use token rides on the next chat request only. */
export function oakTurnstileHeaders(): Record<string, string> {
  return state.token && !state.passed ? { "X-Turnstile": state.token } : {};
}
export function markOakTurnstilePassed() { if (state.token && !state.passed) set({ passed: true, token: null, refused: false }); }
export const failOakTurnstile = () => set({ failed: true, token: null, challenge: "idle" });
/** R11 review: a failed check offers Retry, which remounts the widget for a fresh challenge. */
export const retryOakTurnstile = () => set({ failed: false, token: null, challenge: "idle", attempt: state.attempt + 1 });
/** R11 review: signing out starts a fresh guest, so no pass, token or challenge carries over from before. */
export const resetOakTurnstileState = () => set({ ...initial, attempt: state.attempt + 1 });
/** The Worker refused the token (expired, reused, or the pass cookie was lost): show a fresh challenge. */
export function resetOakTurnstile() {
  set({ passed: false, token: null, refused: true });
  if (widget) window.turnstile?.reset(widget);
}

let script: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const tag = document.createElement("script");
    tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    tag.async = true;
    tag.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile-unavailable"));
    tag.onerror = () => { script = null; reject(new Error("turnstile-unavailable")); };
    document.head.append(tag);
  });
  return script;
}

/** Renders the managed widget into `node`; returns its cleanup. */
export async function mountOakTurnstile(node: HTMLElement, siteKey: string): Promise<() => void> {
  const turnstile = await loadTurnstile();
  set({ failed: false });
  const id = turnstile.render(node, {
    sitekey: siteKey, action: "oak-chat", theme: "dark", size: "flexible", appearance: "interaction-only",
    callback: (token: string) => set({ token, challenge: "idle" }),
    // A visitor who cancelled stays out of verification mode when an unsolved challenge times out and asks again.
    "before-interactive-callback": () => { if (state.challenge !== "dismissed") set({ challenge: "interactive" }); },
    // The view stays until the token (callback) or a failure arrives, so a failure after the click never hides behind it.
    "expired-callback": () => set({ token: null }),
    // R11 review: interaction-only hides Cloudflare's own error, so a failure shows the composer's Retry note instead.
    "error-callback": () => { failOakTurnstile(); return true; },
    "unsupported-callback": () => failOakTurnstile(),
    "timeout-callback": () => failOakTurnstile(),
  });
  widget = id;
  return () => {
    if (widget === id) widget = null;
    turnstile.remove(id);
    if (state.challenge !== "idle") set({ challenge: "idle" });
  };
}
