import { z } from 'zod';

/** Grant codes (CONTEXT.md): `OAK-` then 26 characters with no I, L, O or U, in dashed groups (130 bits). */
export const GRANT_CODE_PATTERN = /^OAK-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{6}$/;

/** What a visitor typed, forgiven for case, spaces, dashes and the look-alike letters Crockford base32 drops. */
export function normalizeGrantCode(input: string) {
  const bare = input.toUpperCase().replace(/[\s-]/g, '').replace(/^OAK/, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const code = bare.length === 26 ? `OAK-${bare.slice(0, 5)}-${bare.slice(5, 10)}-${bare.slice(10, 15)}-${bare.slice(15, 20)}-${bare.slice(20)}` : null;
  return code && GRANT_CODE_PATTERN.test(code) ? code : null;
}

export const grantRedeemRequestSchema = z.strictObject({ code: z.string().min(1).max(64) });
export const grantRedeemResponseSchema = z.strictObject({
  granted: z.number().int().positive(), redeemed: z.boolean(), balance: z.number().int().nonnegative(),
});
export type GrantRedeemResponse = z.infer<typeof grantRedeemResponseSchema>;

export const ownerGrantCreateSchema = z.strictObject({
  answers: z.number().int().min(1).max(200).optional(),
  days: z.number().int().min(1).max(30).optional(),
  label: z.string().trim().max(80).refine(value => !/[\u0000-\u001f\u007f]/u.test(value)).optional(),
});
export const ownerGrantRevokeSchema = z.strictObject({ id: z.uuid() });
