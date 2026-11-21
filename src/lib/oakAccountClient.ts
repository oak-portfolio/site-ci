import { oakAuthContinuationSchema, oakAuthStatusSchema, type OakAuthContinuation, type OakAuthStatus, type OakGuestRecoveryRequest } from "../../packages/oak-agent-contracts/src/auth";
import type { Clerk } from "@clerk/clerk-js";

/**
 * The mounted sign-in matches the workspace (DESIGN.md, D54 and D69): colours as direct values, because Clerk derives
 * shades with color-mix and needs literals. Controls are 48px tall with 12px corners like the inset groups; Continue is
 * the workspace's white primary with near-black ink; a focused field wears the launcher ring as its edge. The panel
 * already names the step, so Clerk's own header is hidden and the card draws no frame of its own.
 */
const oakClerkRing = "linear-gradient(120deg, #4b6fff 0%, #8b5cf6 38.2%, #ec4899 61.8%, #f5b942 100%)";
const oakClerkField = { height: "3rem", minHeight: "3rem", padding: "0.75rem 1rem", borderRadius: "0.75rem", backgroundColor: "#141414",
  border: "1px solid rgba(255, 255, 255, 0.14)", boxShadow: "none", fontSize: "0.9375rem" };
export const oakClerkAppearance = {
  variables: {
    colorBackground: "#0c0c0c",
    colorForeground: "#ffffff",
    colorMutedForeground: "rgba(255, 255, 255, 0.68)",
    colorMuted: "#111111",
    colorPrimary: "#ffffff",
    colorPrimaryForeground: "#050505",
    colorInput: "#111111",
    colorInputForeground: "#ffffff",
    colorBorder: "rgba(255, 255, 255, 0.2)",
    colorNeutral: "#ffffff",
    // Clerk draws this as a 4px halo on focus; kept faint so the launcher-ring edge carries the focus.
    colorRing: "rgba(139, 92, 246, 0.14)",
    colorDanger: "#ef4444",
    colorShadow: "#000000",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    fontFamilyButtons: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    fontSize: "0.875rem",
    borderRadius: "0.75rem",
  },
  options: { socialButtonsVariant: "blockButton" as const },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "none", border: "none", borderRadius: "0", boxShadow: "none", background: "transparent" },
    card: { padding: "0.5rem 0 1rem", gap: "1.5rem", border: "none", boxShadow: "none", background: "transparent" },
    header: { display: "none" },
    main: { gap: "1.25rem" },
    // Clerk draws edges with a faint shadow that vanishes on the dark panel; real borders keep the Google button visible.
    socialButtonsBlockButton: { ...oakClerkField, padding: "0 1rem", fontWeight: 500,
      "&:hover": { backgroundColor: "#1c1c1c", borderColor: "rgba(255, 255, 255, 0.26)" } },
    socialButtonsBlockButtonText: { fontSize: "0.9375rem" },
    // Clerk pins this badge past the button's top-right corner, where the panel's scroller clips it; it sits inside instead.
    lastAuthenticationStrategyBadge: { inset: "auto", top: "50%", right: "0.75rem", transform: "translateY(-50%)",
      padding: "0.125rem 0.5rem", borderRadius: "999px", border: "1px solid rgba(139, 92, 246, 0.36)",
      backgroundColor: "rgba(139, 92, 246, 0.16)", color: "rgba(255, 255, 255, 0.82)", fontSize: "0.6875rem", fontWeight: 500, boxShadow: "none" },
    dividerLine: { backgroundColor: "rgba(255, 255, 255, 0.12)" },
    dividerText: { color: "rgba(255, 255, 255, 0.48)", fontSize: "0.8125rem" },
    formFieldRow: { gap: "1rem" },
    formFieldLabel: { color: "rgba(255, 255, 255, 0.68)", fontSize: "0.8125rem", fontWeight: 500, paddingBottom: "0.25rem" },
    // iOS zooms the page into any focused input under 16px; touch screens get body-size field text like the workspace fields.
    formFieldInput: { ...oakClerkField,
      // The ring edge is the focus indicator here, so the site's generic white focus outline would only double it.
      "&:focus, &:focus-visible": { outline: "none", border: "1px solid transparent",
        background: `linear-gradient(#141414, #141414) padding-box, ${oakClerkRing} border-box`, boxShadow: "0 0 0 4px rgba(139, 92, 246, 0.12)" },
      "@media (hover: none) and (pointer: coarse)": { fontSize: "1rem" } },
    otpCodeFieldInput: { width: "2.75rem", height: "3rem", borderRadius: "0.75rem", border: "1px solid rgba(255, 255, 255, 0.14)", backgroundColor: "#141414",
      "&:focus, &:focus-visible": { outline: "none", borderColor: "#8b5cf6", boxShadow: "0 0 0 4px rgba(139, 92, 246, 0.16)" } },
    formButtonPrimary: { height: "3rem", borderRadius: "999px", border: "none", backgroundColor: "#ffffff", backgroundImage: "none",
      color: "#050505", fontSize: "0.9375rem", fontWeight: 500, textTransform: "none", boxShadow: "none",
      transition: "background-color 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
      "&:hover": { backgroundColor: "#e6e6e6", transform: "translateY(-1px)" },
      "&:active": { transform: "scale(0.97)" },
      "&:focus-visible": { outline: "2px solid #c4b5fd", outlineOffset: "2px" } },
    buttonArrowIcon: { color: "#050505" },
    footer: { background: "transparent", marginTop: "0.25rem" },
    footerActionLink: { color: "#c4b5fd", fontWeight: 500, "&:hover": { color: "#ffffff" } },
    formFieldAction: { color: "#c4b5fd" },
    identityPreviewEditButton: { color: "#c4b5fd" },
    formResendCodeLink: { color: "#c4b5fd" },
  },
};

export type OakAccountErrorCode = "sign-in-required" | "unavailable" | "invalid-input" | "cancelled";
export class OakAccountError extends Error {
  constructor(readonly code: OakAccountErrorCode) { super(code); this.name = "OakAccountError"; }
}
type UIConstructor = NonNullable<NonNullable<Parameters<Clerk["load"]>[0]>["ui"]>["ClerkUI"];
type SDKEntry = { key: string; promise: Promise<Clerk> };
const instances = new Map<string, SDKEntry>();
let active: SDKEntry | null = null;
let accountAttempted = false;
// Q25-G32: a sign-in form the visitor has seen. A silent session resume (D66) loads the SDK without one, so a guest
// whose resume finds no account can still start a fresh guest session.
let signInShown = false;
let mountVersion = 0;
let unmountCurrent: (() => void) | null = null;
// Browser-only session context invalidates private callbacks. It is never server authority.
let accountEpoch = 0;
let accountFingerprint: string | null = null;
let lastAccountIdentity: string | null = null;
let accountVersion = 0;
// R12: a profile edit (new photo or name) keeps the session, so it repaints the avatar without starting a new epoch.
let profileStamp: string | null = null;
let observedClerk: Clerk | null = null;
let stopAccountListener: (() => void) | null = null;
const contextListeners = new Set<() => void>();
function observeAccount(clerk: Clerk | null) {
  const session = clerk?.session;
  const fingerprint = session?.status === "active" ? `${session.id}\u0000${clerk?.user?.id ?? session.user?.id ?? ""}` : null;
  const stamp = fingerprint ? String(clerk?.user?.updatedAt?.valueOf?.() ?? "") : null;
  if (fingerprint === accountFingerprint) {
    if (stamp !== profileStamp) { profileStamp = stamp; for (const listener of contextListeners) listener(); }
    return;
  }
  profileStamp = stamp;
  const identity = session?.status === "active" ? clerk?.user?.id ?? session.user?.id ?? session.id : null;
  if (identity !== null && identity !== lastAccountIdentity) { accountVersion++; lastAccountIdentity = identity; }
  accountFingerprint = fingerprint; accountEpoch++;
  for (const listener of contextListeners) listener();
}
export function getOakAccountContext() {
  observeAccount(observedClerk);
  return { epoch: accountEpoch, accountVersion, authenticated: accountFingerprint !== null };
}
/** Listening alone never loads Clerk or starts account access. */
export function subscribeOakAccountContext(listener: () => void) {
  contextListeners.add(listener);
  return () => { contextListeners.delete(listener); };
}
const httpTimeout = 5000, sdkTimeout = 10000, responseBytes = 8192;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(code: OakAccountErrorCode) { return new OakAccountError(code); }
async function within<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) { void work.catch(() => {}); throw failure("cancelled"); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(failure("unavailable")), ms);
    abort = () => reject(failure("cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([work, limit]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
/** Restricts the decoded public key host before using it as a script origin. */
export function oakClerkFrontendDomain(key: string): string {
  try {
    if (!/^pk_(?:test|live)_[A-Za-z0-9+/=_-]{1,280}$/.test(key)) throw failure("invalid-input");
    const encoded = key.slice(key.indexOf("_", 3) + 1).replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(encoded);
    if (!decoded.endsWith("$")) throw failure("invalid-input");
    const host = decoded.slice(0, -1);
    if (host.length > 253 || host !== host.toLowerCase() || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
      host.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      !(host.endsWith(".clerk.accounts.dev") || /^clerk\.(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(host)) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)) throw failure("invalid-input");
    return host;
  } catch { throw failure("invalid-input"); }
}
function loadUI(host: string, signal: AbortSignal): Promise<UIConstructor> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`;
    script.async = true; script.crossOrigin = "anonymous";
    let ended = false;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); script.onload = null; script.onerror = null; script.remove(); };
    const finish = (ok: boolean) => {
      if (ended) return; ended = true;
      const browser: Window & { __internal_ClerkUICtor?: UIConstructor } = window;
      const uiConstructor = browser.__internal_ClerkUICtor;
      cleanup();
      if (ok && typeof uiConstructor === "function") resolve(uiConstructor); else reject(failure("unavailable"));
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort, sdkTimeout);
    if (signal.aborted) { finish(false); return; }
    signal.addEventListener("abort", abort, { once: true });
    script.onload = () => finish(true); script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
}
function explicitSDK(key: string): SDKEntry {
  accountAttempted = true;
  if (active?.key !== key) {
    mountVersion++; unmountCurrent?.(); unmountCurrent = null; active = null;
    stopAccountListener?.(); stopAccountListener = null; observedClerk = null; observeAccount(null);
  }
  const host = oakClerkFrontendDomain(key);
  let entry = instances.get(key);
  if (!entry) {
    if (instances.size >= 4) throw failure("unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), sdkTimeout);
    const promise = within((async () => {
      const { Clerk } = await import("@clerk/clerk-js");
      if (controller.signal.aborted) throw failure("unavailable");
      const clerk = new Clerk(key);
      const ClerkUI = await loadUI(host, controller.signal);
      if (controller.signal.aborted) throw failure("unavailable");
      await clerk.load({ ui: { ClerkUI }, telemetry: false, polling: false, appearance: oakClerkAppearance });
      if (controller.signal.aborted) throw failure("unavailable");
      return clerk;
    })(), sdkTimeout, controller.signal).finally(() => { clearTimeout(timer); controller.abort(); });
    entry = { key, promise }; instances.set(key, entry);
    const failedEntry = entry;
    void promise.catch(() => {
      if (instances.get(key) === failedEntry) instances.delete(key);
      if (active === failedEntry) active = null;
    });
  }
  active = entry;
  const selected = entry;
  void entry.promise.then(clerk => {
    if (active !== selected || observedClerk === clerk) return;
    stopAccountListener?.(); observedClerk = clerk;
    stopAccountListener = clerk.addListener(() => { if (active === selected) observeAccount(clerk); }, { skipInitialEmit: false });
    observeAccount(clerk);
  }, () => {});
  return entry;
}

/** Guest calls never initialize Clerk. Attempted account calls cannot silently return guest headers. `fresh` skips the SDK's token cache. */
export async function oakAuthorizationHeaders(fresh = false): Promise<Record<string, string>> {
  if (!accountAttempted) return {};
  const entry = active;
  if (!entry) throw failure("sign-in-required");
  let live = false;
  try {
    const clerk = await within(entry.promise, httpTimeout);
    observeAccount(clerk);
    const epoch = accountEpoch;
    const session = clerk.session;
    if (entry !== active || !session || session.status !== "active") throw failure("sign-in-required");
    const current = () => entry === active && epoch === accountEpoch && clerk.session?.id === session.id && clerk.session.status === "active";
    // 202: Clerk rebuilds the Session object (same id) on a focus touch, and a mint past the bound on a live session is not a
    // sign-out. A mint that throws (a revoked session) still is.
    const token = await within(fresh ? session.getToken({ skipCache: true }) : session.getToken(), httpTimeout)
      .catch((error: unknown) => { live = error instanceof OakAccountError && error.code === "unavailable" && current(); throw error; });
    observeAccount(clerk);
    if (!current() || !token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 8192)
      throw failure("sign-in-required");
    return { Authorization: `Bearer ${token}` };
  } catch { throw failure(live ? "unavailable" : "sign-in-required"); }
}
export async function resumeOakAccount(publishableKey: string): Promise<boolean> {
  const entry = explicitSDK(publishableKey);
  try {
    await entry.promise;
    await oakAuthorizationHeaders();
    return entry === active;
  } catch (error) { throw error instanceof OakAccountError && error.code === "unavailable" ? error : failure("sign-in-required"); }
}
export async function mountOakSignIn(node: HTMLDivElement, publishableKey: string, onSession: () => void): Promise<() => void> {
  if (typeof window === "undefined") throw failure("unavailable");
  signInShown = true;
  const returnLocation = new URL(window.location.origin);
  returnLocation.pathname = window.location.pathname; returnLocation.search = window.location.search;
  const returnUrl = returnLocation.href;
  const entry = explicitSDK(publishableKey);
  unmountCurrent?.(); unmountCurrent = null;
  const version = ++mountVersion;
  let cleanupOnFailure = () => {};
  try {
    const clerk = await entry.promise;
    if (version !== mountVersion || entry !== active || !node.isConnected) return () => {};
    let mounted = true, notified: string | null = null;
    const notify = () => {
      if (mounted && version === mountVersion && entry === active && clerk.session?.status === "active" && clerk.session.id !== notified) {
        notified = clerk.session.id; onSession();
      }
    };
    clerk.mountSignIn(node, { routing: "hash", withSignUp: true, forceRedirectUrl: returnUrl, signUpForceRedirectUrl: returnUrl });
    cleanupOnFailure = () => { mounted = false; clerk.unmountSignIn(node); };
    const unsubscribe = clerk.addListener(notify, { skipInitialEmit: true });
    const cleanup = () => {
      if (!mounted) return; mounted = false;
      unsubscribe(); clerk.unmountSignIn(node);
      if (unmountCurrent === cleanup) unmountCurrent = null;
    };
    unmountCurrent = cleanup;
    cleanupOnFailure = cleanup;
    notify();
    return cleanup;
  } catch { cleanupOnFailure(); throw failure("unavailable"); }
}
async function parsedResponse(response: Response, signal: AbortSignal): Promise<OakAuthStatus> {
  const json = response.headers.get("content-type")?.toLowerCase().startsWith("application/json");
  if (!response.ok || !response.body || !json) {
    void response.body?.cancel().catch(() => {});
    // Only the Worker's own JSON 401/403 means the session is gone. The edge spend breaker (P03-G7) answers a bare
    // HTML 403 for all of /api/oak/*; that is the agent being paused, not the visitor's session ending.
    throw failure(response.status === 401 || (json && response.status === 403) ? "sign-in-required" : "unavailable");
  }
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const part = await within(reader.read(), httpTimeout, signal);
      if (signal.aborted) throw failure("cancelled");
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > responseBytes) throw failure("unavailable");
      text += decoder.decode(part.value, { stream: true });
    }
    const value = oakAuthStatusSchema.safeParse(JSON.parse(text + decoder.decode()));
    if (!value.success || (accountAttempted && value.data.kind !== "account")) throw failure("unavailable");
    return value.data;
  } catch (error) { cancel(); throw error instanceof OakAccountError ? error : failure("unavailable"); }
  finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
async function authRequest(url: string, input?: OakAuthContinuation | OakGuestRecoveryRequest, signal?: AbortSignal): Promise<OakAuthStatus> {
  const expectedEntry = active;
  const expectedEpoch = getOakAccountContext().epoch;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw failure("cancelled");
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, httpTimeout);
  try {
    const work = (async () => {
      const headers = await oakAuthorizationHeaders();
      if (controller.signal.aborted) throw failure("cancelled");
      const pending = fetch(url, { method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
        signal: controller.signal, headers: { ...headers, ...(input ? { "Content-Type": "application/json" } : {}) },
        ...(input ? { body: JSON.stringify(input) } : {}) });
      void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
      return parsedResponse(await within(pending, httpTimeout, controller.signal), controller.signal);
    })();
    const result = await within(work, httpTimeout, controller.signal);
    if (expectedEntry !== active || expectedEpoch !== getOakAccountContext().epoch) throw failure("sign-in-required");
    lastPurpose = { epoch: expectedEpoch, purpose: result.purpose };
    return result;
  } catch (error) { throw signal?.aborted ? failure("cancelled") : controller.signal.aborted ? failure("unavailable") : error instanceof OakAccountError ? error : failure("unavailable"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); controller.abort(); }
}
/** Q08: the purpose from the latest status of this account session; a sign-in change drops it. */
let lastPurpose: { epoch: number; purpose: OakAuthStatus["purpose"] } | null = null;
export function getOakAccountPurpose(): OakAuthStatus["purpose"] {
  return lastPurpose?.epoch === getOakAccountContext().epoch ? lastPurpose.purpose : null;
}
export function readOakAuthStatus(conversationId: string | null, signal?: AbortSignal): Promise<OakAuthStatus> {
  if (conversationId !== null && !uuid.test(conversationId)) return Promise.reject(failure("invalid-input"));
  return authRequest(`/api/oak/auth/status${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`, undefined, signal);
}
export function continueOakAccount(input: OakAuthContinuation): Promise<OakAuthStatus> {
  const parsed = oakAuthContinuationSchema.safeParse(input);
  if (!parsed.success) return Promise.reject(failure("invalid-input"));
  if (!accountAttempted) return Promise.reject(failure("sign-in-required"));
  return authRequest("/api/oak/auth/continue", parsed.data);
}

/** An attempted account session stays on its sign-in path, even when no token can be obtained. */
export function canRecoverOakGuestSession() { return !signInShown && !getOakAccountContext().authenticated; }

/**
 * R12: display-only identity from the account SDK already loaded in this browser, for the avatar, the account menu and
 * the greeting. It is read here and painted here; it is never sent to the Worker, stored or logged. The photo is the one
 * the visitor's sign-in provider gave (Google, GitHub), and only when they have one (`hasImage`), so a provider's
 * generated placeholder never stands in for a face.
 */
export type OakAccountIdentity = { name: string | null; firstName: string | null; email: string | null; imageUrl: string | null };
let identityFixture: OakAccountIdentity | null | undefined;
let identityCache: { key: string; value: OakAccountIdentity } | null = null;
/** Null until the SDK has a signed-in user. The same object comes back while nothing changed, so React can subscribe. */
export function getOakAccountIdentity(): OakAccountIdentity | null {
  let next: OakAccountIdentity | null = null;
  if (identityFixture !== undefined) next = identityFixture;
  else {
    const user = observedClerk?.session?.status === "active" ? observedClerk.user : null;
    if (user) next = { name: user.fullName?.trim() || null, firstName: user.firstName?.trim() || null,
      email: user.primaryEmailAddress?.emailAddress ?? null, imageUrl: user.hasImage && user.imageUrl ? user.imageUrl : null };
  }
  if (!next) { identityCache = null; return null; }
  const key = [next.name, next.firstName, next.email, next.imageUrl].join("\u0000");
  if (identityCache?.key !== key) identityCache = { key, value: next };
  return identityCache.value;
}
/** Design gallery only: stands in for a signed-in visitor's profile, since the gallery has no account session. */
export function setOakAccountIdentityFixture(identity: OakAccountIdentity | null) {
  identityFixture = identity;
  for (const listener of contextListeners) listener();
}

/**
 * R11: ends the account session in this browser. The account SDK clears its session cookie, so later requests carry no
 * account credentials and the Worker answers as a guest again. Local account state resets with it.
 */
export async function signOutOakAccount(publishableKey: string | null) {
  if (publishableKey) {
    const entry = explicitSDK(publishableKey);
    try {
      const clerk = await within(entry.promise, sdkTimeout);
      await within(clerk.signOut(), sdkTimeout);
    } catch { throw failure("unavailable"); }
  }
  mountVersion++; unmountCurrent?.(); unmountCurrent = null;
  stopAccountListener?.(); stopAccountListener = null; observedClerk = null; active = null;
  accountAttempted = false; signInShown = false; lastPurpose = null;
  observeAccount(null);
}
export async function recoverOakGuestSession(signal?: AbortSignal): Promise<OakAuthStatus> {
  if (!canRecoverOakGuestSession()) throw failure("sign-in-required");
  // The visitor chose a fresh guest session over the account a silent resume looked for, so this and later calls are guest calls.
  accountAttempted = false;
  const value = await authRequest("/api/oak/auth/recover-guest", { action: "abandon-guest-session" }, signal);
  if (value.kind !== "guest" || value.phase !== "guest") throw failure("unavailable");
  return value;
}
