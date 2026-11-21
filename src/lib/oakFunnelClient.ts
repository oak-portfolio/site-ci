import type { OpenUIErrorCode } from "@openuidev/lang-core";
import type { openuiFallbackCodes } from "../../packages/oak-agent-contracts/src/telemetry";
import { oakAuthorizationHeaders } from "./oakAccountClient";

/** P07-G2: the anonymous funnel. One random id per browser tab (sessionStorage, no cookie), reused for every step, never per event. */
export type OakFunnelStep = "open" | "first-question" | "answer" | "follow-up" | "contact";
type FunnelMessage = Readonly<{ id: string; role: string; state: string; answer?: unknown }>;

let memoryTab: string | undefined;
export function oakFunnelTabId(storage?: Pick<Storage, "getItem" | "setItem">): string {
  try {
    const store = storage ?? sessionStorage;
    const saved = store.getItem("oak-funnel-tab");
    if (saved) return saved;
    const id = crypto.randomUUID();
    store.setItem("oak-funnel-tab", id);
    return id;
  } catch {
    // Storage can be blocked; the id then lasts for the page's life, which is still one per tab.
    return (memoryTab ??= crypto.randomUUID());
  }
}

async function sendOakFunnel(step: OakFunnelStep, tabId: string) {
  try {
    // The Worker drops the step when the bearer is Steve's own account.
    const authorization = await oakAuthorizationHeaders().catch(() => ({}));
    void fetch("/api/oak/funnel", { method: "POST", credentials: "same-origin", keepalive: true, redirect: "error",
      headers: { "Content-Type": "application/json", ...authorization }, body: JSON.stringify({ step, tabId }),
      signal: AbortSignal.timeout(2500) }).then(result => { void result.body?.cancel().catch(() => {}); }).catch(() => {});
  } catch { /* Analytics never changes what the visitor sees. */ }
}

/**
 * Turns workspace changes into funnel steps. A turn counts only when it is seen starting (pending), so reopening a saved
 * conversation reports nothing. `open` and `contact` are once per tab; questions and answers are once per turn.
 */
export function createOakFunnel(send: (step: OakFunnelStep) => void) {
  const live = new Set<string>(), seen = new Set<string>(), answered = new Set<string>();
  let asked = 0, opened = false, contacted = false;
  return {
    open() { if (!opened) { opened = true; send("open"); } },
    contact() { if (!contacted) { contacted = true; send("contact"); } },
    observe(messages: readonly FunnelMessage[]) {
      for (const message of messages) {
        if (message.role !== "assistant") continue;
        if (!seen.has(message.id)) {
          seen.add(message.id);
          if (message.state === "pending") { live.add(message.id); send(asked++ === 0 ? "first-question" : "follow-up"); }
        }
        if (live.has(message.id) && message.state === "complete" && message.answer && !answered.has(message.id)) { answered.add(message.id); send("answer"); }
      }
    },
  };
}

let funnel: ReturnType<typeof createOakFunnel> | undefined;
export const getOakFunnel = () => (funnel ??= createOakFunnel(step => { void sendOakFunnel(step, oakFunnelTabId()); }));

type WorkerFallbackCode = (typeof openuiFallbackCodes)[number];
/** Ticket 101: OpenUI's error codes, but `never` when the Worker's hand-copied list drifts from them either way, so `npm run check` fails. */
export type OakOpenUIFallbackCode = [Exclude<OpenUIErrorCode, WorkerFallbackCode>, Exclude<WorkerFallbackCode, OpenUIErrorCode>] extends [never, never] ? OpenUIErrorCode : never;
export type OakOpenUIFailure = Readonly<{ component?: string; code?: OakOpenUIFallbackCode }>;

/**
 * Q17: one report per arranged answer that fell back to the plain answer. A fixed reason, and (ticket 14b) the first failing
 * registered component and its OpenUI code; never the layout, the answer or an error message.
 */
export function sendOakOpenUIFallback(reason: "parse" | "coverage" | "render", { component, code }: OakOpenUIFailure = {}) {
  void (async () => {
    try {
      const authorization = await oakAuthorizationHeaders().catch(() => ({}));
      const result = await fetch("/api/oak/funnel", { method: "POST", credentials: "same-origin", keepalive: true, redirect: "error",
        headers: { "Content-Type": "application/json", ...authorization },
        body: JSON.stringify({ event: "openui-fallback", tabId: oakFunnelTabId(), reason, component, code }), signal: AbortSignal.timeout(2500) });
      void result.body?.cancel().catch(() => {});
    } catch { /* Analytics never changes what the visitor sees. */ }
  })();
}
