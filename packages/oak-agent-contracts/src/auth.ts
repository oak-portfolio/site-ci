import { z } from "zod";

// P03-G6: skip Zod's `new Function` speed-up probe so the site's CSP never sees an eval (Workers forbid eval anyway).
z.config({ jitless: true });

export const oakPurposeOptions = [
  { value: "recruiting", label: "Hiring or recruiting" },
  { value: "consulting", label: "Discussing a project" },
  { value: "research", label: "Research or collaboration" },
  { value: "exploring", label: "Exploring Steve's work" },
  { value: "other", label: "Something else" },
] as const;
export const oakPurposeSchema = z.enum(["recruiting", "consulting", "research", "exploring", "other"]);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const allowance = z.strictObject({ completed: count, pending: count, limit: count, remaining: count });
/** The refilling allowance: answers held now, and when the next one comes back (null while full). */
const answers = z.strictObject({ limit: count, remaining: count, refillsAt: count.nullable() });

/** Public account state contains no subject identifiers, session tokens or visitor intake text. */
export const oakAuthStatusSchema = z.strictObject({
  configured: z.boolean(),
  kind: z.enum(["guest", "account"]),
  phase: z.enum(["guest", "sign-in-required", "continue-required", "ready"]),
  role: z.enum(["visitor", "owner"]),
  publishableKey: z.string().regex(/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/).max(300).nullable(),
  purpose: oakPurposeSchema.nullable(),
  /** One allowance for every visitor (ADR 0002): a refilling bucket plus a rolling 30-day cap. */
  allowance: z.strictObject({ answers, window: allowance, /** Redeemed grant-code answers left; absent at zero. */ granted: count.optional() }),
  /** P03-G1: present only while the Worker enforces Turnstile; the guest renders the widget before the first send. */
  turnstileSiteKey: z.string().regex(/^[0-9a-zA-Z_-]{1,100}$/).optional(),
  /** P03-G1: the guest's pass cookie is still valid, so the widget stays hidden after a reload. Sent with turnstileSiteKey. */
  humanPassed: z.boolean().optional(),
});
const optionalText = z.string().trim().max(160).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
export const oakAuthContinuationSchema = z.strictObject({
  conversationId: z.uuid().optional(),
  purpose: oakPurposeSchema,
  company: optionalText.optional(),
  referral: optionalText.optional(),
});
export type OakPurpose = z.infer<typeof oakPurposeSchema>;
export type OakAuthStatus = z.infer<typeof oakAuthStatusSchema>;
export type OakAuthContinuation = z.infer<typeof oakAuthContinuationSchema>;

/** Public sign-in configuration is never identity, allowance or continuation authority. */
export const oakSignInConfigurationSchema = z.discriminatedUnion("configured", [
  z.strictObject({ kind: z.literal("sign-in-config"), configured: z.literal(true),
    publishableKey: z.string().regex(/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/).max(300), guestRecoveryAvailable: z.literal(true).optional() }),
  z.strictObject({ kind: z.literal("sign-in-config"), configured: z.literal(false), publishableKey: z.null(), guestRecoveryAvailable: z.literal(true).optional() }),
]);
export type OakSignInConfiguration = z.infer<typeof oakSignInConfigurationSchema>;

/** Explicit abandonment grants no access to the previous guest's conversation or documents. */
export const oakGuestRecoveryRequestSchema = z.strictObject({ action: z.literal("abandon-guest-session") });
export type OakGuestRecoveryRequest = z.infer<typeof oakGuestRecoveryRequestSchema>;
