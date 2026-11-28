import { grantRedeemResponseSchema, type GrantRedeemResponse } from '../../packages/oak-agent-contracts/src/grants';
import { oakAuthorizationHeaders } from './oakAccountClient';

const messages: Record<string, string> = {
  'grant-invalid': 'That code does not look right. Check it and try again.',
  'grant-used': 'That code has already been used.',
  'grant-expired': 'That code has expired. Ask Steve for a new one.',
  'grant-revoked': 'That code is no longer valid. Ask Steve for a new one.',
  'grant-rate-limited': 'Too many tries. Wait a few minutes and try again.',
};
export class OakGrantError extends Error {}

/** P09-G1: one POST. Guests need no sign-in; a signed-in visitor's session credits the account instead. */
export async function redeemOakGrantCode(code: string, signal?: AbortSignal): Promise<GrantRedeemResponse> {
  let response: Response;
  try {
    response = await fetch('/api/oak/grants/redeem', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', ...await oakAuthorizationHeaders() }, body: JSON.stringify({ code }) });
  } catch { throw new OakGrantError('Could not reach Oak. Try again in a moment.'); }
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new OakGrantError(messages[body?.error ?? ''] ?? 'Could not use that code. Try again in a moment.');
  const parsed = grantRedeemResponseSchema.safeParse(body);
  if (!parsed.success) throw new OakGrantError('Could not use that code. Try again in a moment.');
  return parsed.data;
}
