import { TELEMETRY_RECEIPT_HEADER, telemetryReceiptRequestSchema } from '../../packages/oak-agent-contracts/src/telemetry';
/** Deliberate funding outcomes retain cookie-only verification. */
export function observeOakFundingResponse(response: Response): void {
  sendReceipt({ receipt: response.headers.get(TELEMETRY_RECEIPT_HEADER) });
}
/** Chat reuses the actual request's authorization. No identity, event fields or caller UUID is sent. */
export function observeOakChatReceipt(value: unknown, authorization: Readonly<Record<string, string>>): void {
  sendReceipt(value, authorization);
}
function sendReceipt(value: unknown, authorization: Readonly<Record<string, string>> = {}): void {
  try {
    const parsed = telemetryReceiptRequestSchema.safeParse(value);
    if (!parsed.success) return;
    const token = new Headers(authorization).get('authorization');
    void fetch('/api/oak/telemetry', { method: 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(1000),
    }).then(result => { void result.body?.cancel().catch(() => {}); }).catch(() => {});
  } catch { /* Monitoring must not replace a product outcome, including synchronous transport failures. */ }
}
