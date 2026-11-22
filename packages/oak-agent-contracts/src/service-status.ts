import type { SemanticRetrievalStatus } from './semantic-retrieval-status.ts';
/** Server-owned aggregate contract. No content, credentials, account IDs or raw errors. */
export type ServiceEvidenceState = 'verified' | 'estimated' | 'stale' | 'unknown';
export type SafeServiceFailure = 'none' | 'configuration' | 'quota' | 'rate' | 'rate-or-quota-unknown' | 'transport' | 'deadline' | 'storage' | 'capture';
/** Retained local OCR operations. Reconciled provider-reported costs do not attest a provider balance or invoice. */
export type VisitorPaidOcrStatus = Readonly<{
  funding: 'visitor'; unit: 'micro-usd';
  readState: 'verified' | 'unavailable' | 'deadline';
  states: Readonly<{ quoted: number | null; cancelled: number | null; dispatching: number | null;
    exposureHeld: number | null; denied: number | null; settled: number | null }>;
  /** App-observed results only. Missing legacy and nonterminal observations remain unclassified. */
  outcomes: Readonly<{ completed: number | null; failed: number | null; timedOut: number | null;
    cancelled: number | null; denied: number | null; unclassified: number | null }>;
  parserHeldMicroUsd: number | null; modelHeldMicroUsd: number | null;
  /** Sum of immutable receipts for settled records only. Unresolved operations remain in holds. */
  providerReportedMicroUsd: number | null;
  actualCharge: 'unknown'; settlement: 'unknown'; remainingMicroUsd: null;
}>;
/** Lifetime inspection counters. Receipt-only inspection does not attest extracted text or provider capacity. */
export type DocumentLocalInspectionStatus = Readonly<{
  enabled: boolean;
  admission: 'disabled' | 'available' | 'blocked' | 'exhausted' | 'failed';
  failure: SafeServiceFailure;
  attempts: number | null; accepted: number | null; receiptOnly: number | null;
  failed: number | null; timedOut: number | null;
  lastAttemptAt: number | null; lastSuccessAt: number | null;
  lastOutcome: 'none' | 'in-progress' | 'accepted' | 'receipt-only' | 'failed' | 'timed-out' | 'unknown';
}>;
export type ServiceStatus = Readonly<{
  schemaVersion: 1;
  service: 'model-generation' | 'diagnostic-traces' | 'transcription' | 'owner-alerts' | 'public-research' | 'document-extraction' | 'document-ocr' | 'error-telemetry' | 'product-analytics' | 'semantic-retrieval';
  enabled: boolean;
  admission: 'disabled' | 'available' | 'blocked' | 'exhausted' | 'failed';
  failure: SafeServiceFailure;
  /** Admission policy, never proof of a provider balance. Untagged status is legacy. */
  admissionBasis?: 'verified-provider' | 'local-cap';
  /** Application exposure cap, separately labeled from vendor credit. */
  localBudget?: Readonly<{ limit: number | null; consumed?: number | null; reserved: number | null; remainingBound: number | null }>;
  evidence: Readonly<{ settings: ServiceEvidenceState; providerUsage: ServiceEvidenceState; localReservations: ServiceEvidenceState }>;
  allowance: Readonly<{
    unit: 'micro-usd' | 'root-traces' | 'audio-seconds' | 'emails' | 'conversion-attempts' | 'parser-credits' | 'telemetry-events' | 'embedding-milli-neurons';
    limit: number | null; providerObserved: number | null; reserved: number | null;
    conservativeUsed: number | null; remainingBound: number | null;
    periodStart: number | null; periodEnd: number | null;
    reset: 'utc-calendar-month' | 'utc-calendar-day' | 'provider-reported' | 'unknown';
  }>;
  /** Required only on semantic-retrieval. Validated by the shared schema. */
  semanticRetrieval?: SemanticRetrievalStatus;
  /** Local inspection is independent of the legacy remote conversion status and its allowance. */
  documentExtraction?: Readonly<{ localInspection: DocumentLocalInspectionStatus }>;
  /** Visitor-paid local observations are independent of the Free parser-credit allowance. */
  documentOcr?: Readonly<{ visitorPaid: VisitorPaidOcrStatus }>;
  health: Readonly<{
    lastCheckAt: number | null; settingsObservedAt: number | null; usageObservedAt: number | null;
    lastAttemptAt: number | null; lastSuccessAt: number | null;
    accepted: number | null; failed: number | null; timedOut: number | null;
  }>;
}>;

/** One Deepgram key queue record may cap the key at its whole credit (Oakfolio: $200). The Worker enforces it; the browser mirrors it (Q16-D5). */
export const voiceLocalCapMaxMicroUsd = 1_000_000_000;
