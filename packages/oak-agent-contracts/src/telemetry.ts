import { z } from 'zod';
export const TELEMETRY_RECEIPT_HEADER = 'x-oak-telemetry-receipt';
export const telemetryProviderSchema = z.enum(['sentry', 'posthog']);
export type TelemetryProvider = z.infer<typeof telemetryProviderSchema>;
/** No arbitrary properties, Error, URL, request, account identity or content is accepted. */
export const safeFundingTelemetrySchema = z.strictObject({
  surface: z.enum(['browser', 'server']), event: z.enum(['funding-connect', 'funding-disconnect']),
  outcome: z.enum(['success', 'failure']), method: z.enum(['manual', 'oauth', 'unknown']),
  failure: z.enum(['none', 'funding-unavailable']), correlationId: z.uuid(),
}).refine(value => (value.outcome === 'success') === (value.failure === 'none'));
export type SafeFundingTelemetry = z.infer<typeof safeFundingTelemetrySchema>;
export const safeChatTerminalTelemetrySchema = z.strictObject({
  surface: z.enum(['browser', 'server']), event: z.literal('chat-terminal-failure'), outcome: z.literal('failure'),
  method: z.literal('unknown'), failure: z.literal('chat-unavailable'), correlationId: z.uuid(),
  stage: z.enum(['prepare', 'stream', 'resolve']),
  /** P04-G5: Steve's own account. Tagged so analytics can filter owner traffic out instead of the event being dropped. */
  audience: z.literal('owner').optional(),
  category: z.enum(['invalid-tool-input', 'unknown-tool', 'tool-choice', 'tool-execution', 'provider-http-rejection',
    'model-stream-error', 'unknown-source', 'unsafe-draft', 'tool-limit', 'output-schema', 'input-envelope',
    'evidence-envelope', 'output-limit', 'invalid-answer', 'retrieval-required', 'no-output', 'unknown']),
});
/** P07-G2: the cookieless funnel. `correlationId` is the tab's own random id, one per tab and shared by every step, never a person or event id. */
export const funnelSteps = ['open', 'first-question', 'answer', 'follow-up', 'contact'] as const;
export const funnelStepSchema = z.enum(funnelSteps);
export const safeFunnelTelemetrySchema = z.strictObject({
  surface: z.enum(['browser', 'server']), event: z.literal('funnel'), outcome: z.literal('success'), method: z.literal('unknown'),
  failure: z.literal('none'), correlationId: z.uuid(), step: funnelStepSchema,
});
/** P07-G1: a Worker request that ended in a 5xx. Route stage and status only, so the Sentry fingerprint stays fixed and no prompt, transcript or key can ride along. */
export const workerFailureStages = ['auth', 'conversations', 'owner', 'documents', 'ocr', 'telemetry', 'funding', 'transcription', 'research',
  'status', 'health', 'csp-report', 'chat', 'cancel', 'grants', 'funnel', 'report', 'feedback', 'other'] as const;
export const safeWorkerFailureTelemetrySchema = z.strictObject({
  surface: z.enum(['browser', 'server']), event: z.literal('worker-failure'), outcome: z.literal('failure'), method: z.literal('unknown'),
  failure: z.literal('worker-unavailable'), correlationId: z.uuid(), stage: z.enum(workerFailureStages), status: z.number().int().min(500).max(599),
});
/** Q17: an arranged answer the browser could not render, so the visitor saw the plain answer. A fixed reason, never the program. */
export const openuiFallbackReasons = ['parse', 'coverage', 'render'] as const;
/** 14a: the first failing component's type name and the OpenUI error code, both closed shapes so no program or claim text can ride along. */
export const openuiFallbackComponentSchema = z.string().max(40).regex(/^[A-Za-z][A-Za-z0-9]*$/);
export const openuiFallbackCodes = ['missing-required', 'null-required', 'unknown-component', 'inline-reserved', 'excess-args', 'type-mismatch',
  'unknown-function', 'no-root', 'runtime-error', 'render-error', 'parse-exception', 'parse-failed', 'tool-not-found', 'tool-error', 'mcp-error'] as const;
export const safeOpenUIFallbackTelemetrySchema = z.strictObject({
  surface: z.enum(['browser', 'server']), event: z.literal('openui-fallback'), outcome: z.literal('failure'), method: z.literal('unknown'),
  failure: z.literal('openui-fallback'), correlationId: z.uuid(), reason: z.enum(openuiFallbackReasons),
  component: openuiFallbackComponentSchema.optional(), code: z.enum(openuiFallbackCodes).optional(),
});
export const safeTelemetrySchema = z.union([safeFundingTelemetrySchema, safeChatTerminalTelemetrySchema, safeFunnelTelemetrySchema, safeWorkerFailureTelemetrySchema,
  safeOpenUIFallbackTelemetrySchema]);
export type SafeTelemetry = z.infer<typeof safeTelemetrySchema>;
export const telemetryReceiptRequestSchema = z.strictObject({ receipt: z.string().max(1024).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/) });
/** Browser to Worker bodies for the funnel and for "Report this answer". Ids only, never text. */
export const funnelRequestSchema = z.strictObject({ step: funnelStepSchema, tabId: z.uuid() });
/** Q17: the browser's one report per fallen-back arranged answer, through the funnel route. A malformed component or code is dropped, so the fallback still counts. */
export const openuiFallbackRequestSchema = z.strictObject({ event: z.literal('openui-fallback'), tabId: z.uuid(), reason: z.enum(openuiFallbackReasons),
  component: openuiFallbackComponentSchema.optional().catch(undefined), code: z.enum(openuiFallbackCodes).optional().catch(undefined) });
/** The reported question and answer travel with the report, so it is useful even when the turn's own trace was sampled out (review r3). */
export const answerReportRequestSchema = z.strictObject({ requestId: z.uuid(), conversationId: z.uuid(),
  question: z.string().max(4000).optional(), answer: z.string().max(8000).optional() });
/** Q09-G3: a visitor's thumbs on one answer. A closed reason list, never free text; a reason only goes with thumbs down. */
export const answerFeedbackReasons = ['not-accurate', 'not-helpful', 'missing-sources', 'too-long'] as const;
export type AnswerFeedbackReason = typeof answerFeedbackReasons[number];
export const answerFeedbackRequestSchema = z.strictObject({ requestId: z.uuid(), conversationId: z.uuid(),
  score: z.union([z.literal(0), z.literal(1)]), reason: z.enum(answerFeedbackReasons).optional() })
  .refine(value => value.score === 0 || value.reason === undefined);
