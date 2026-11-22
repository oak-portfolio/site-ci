import { oakSignInConfigurationSchema, type OakSignInConfiguration } from "../../packages/oak-agent-contracts/src/auth";
import { OakAccountError, oakClerkFrontendDomain, getOakAccountContext } from "./oakAccountClient";

/** Recovery metadata includes same-origin cookies for guest classification.
 * Adds no Authorization header and never initializes Clerk or changes account context. */
export async function readOakSignInConfiguration(signal?: AbortSignal): Promise<OakSignInConfiguration> {
  if (signal?.aborted) throw new OakAccountError("cancelled");
  const epoch = getOakAccountContext().epoch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>, timedOut = false;
  let rejectDeadline: (error: OakAccountError) => void;
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, 5000);
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  const abort = () => controller.abort();
  const stopped = () => { cancel(); rejectDeadline(new OakAccountError(timedOut ? "unavailable" : "cancelled")); };
  controller.signal.addEventListener("abort", stopped, { once: true });
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const pending = fetch("/api/oak/auth/status?recovery=sign-in", { method: "GET", credentials: "same-origin",
      cache: "no-store", redirect: "error", signal: controller.signal, headers: { Accept: "application/json" } });
    void pending.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
    const response = await Promise.race([pending, deadline]);
    if (!response.ok || !response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      void response.body?.cancel().catch(() => {}); throw new OakAccountError("unavailable");
    }
    reader = response.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, text = "";
    for (;;) {
      const part = await Promise.race([reader.read(), deadline]);
      if (controller.signal.aborted) throw new OakAccountError("unavailable");
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024) throw new OakAccountError("unavailable");
      text += decoder.decode(part.value, { stream: true });
    }
    const value = oakSignInConfigurationSchema.parse(JSON.parse(text + decoder.decode()));
    if (value.configured) oakClerkFrontendDomain(value.publishableKey);
    if (controller.signal.aborted || epoch !== getOakAccountContext().epoch) throw new OakAccountError("cancelled");
    return value;
  } catch { cancel(); throw new OakAccountError(signal?.aborted || epoch !== getOakAccountContext().epoch ? "cancelled" : "unavailable"); }
  finally { clearTimeout(timer!); signal?.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", stopped); reader?.releaseLock(); }
}
