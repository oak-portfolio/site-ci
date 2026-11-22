import { useCallback, useEffect, useRef, useState } from 'react';
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { getOakAccountContext, mountOakSignIn, resumeOakAccount, subscribeOakAccountContext } from '@/lib/oakAccountClient';
import { readOakSignInConfiguration } from '@/lib/oakSignInConfiguration';
import { OakOwnerAccessError, requestOakOwnerServices } from '@/lib/oakOwnerServicesClient';
import type { OwnerServicesAction, OwnerServicesView, OwnerServiceRecord } from '../../../packages/oak-agent-contracts/src/owner-services';
import { OakOwnerProviderAccounts, ownerProviderNames, ownerAccountCategoryNames } from './OakOwnerProviderAccounts';
import { OakOwnerKeyQueue } from './OakOwnerKeyQueue';

const serviceNames = { 'model-generation': 'Model answers', 'diagnostic-traces': 'LangSmith traces',
  transcription: 'Deepgram transcription', 'public-research': 'Exa research', 'document-extraction': 'Document extraction', 'document-ocr': 'Document OCR', 'error-telemetry': 'Sentry errors', 'product-analytics': 'PostHog events', 'semantic-retrieval': 'Semantic retrieval' } as const;
const conditionNames = { disabled: 'Off', ready: 'Available', 'near-limit': 'Near limit', exhausted: 'Limit reached',
  blocked: 'Blocked', failure: 'Check service', stale: 'Outdated observation', unknown: 'Unknown',
  'near-expiry': 'Expiring soon', 'swap-now': 'Swap now', expired: 'Expired' } as const;
const admissionNames = { disabled: 'Off', available: 'Available', blocked: 'Blocked', exhausted: 'Limit reached', failed: 'Check service' } as const;
const quotaRecheckNotices = { never: 'A quota recheck reads usage only. It does not send email or start monitoring.',
  checking: 'Checking email quota.', verified: 'Email quota checked. Sending still follows the observed limits.',
  'permission-denied': 'Quota reading is unavailable with this key. Existing email holds are preserved.',
  'rate-limited': 'Quota reading was rate limited. Existing email holds are preserved.',
  unavailable: 'Email quota could not be verified. Existing email holds are preserved.',
  deadline: 'The email quota check did not finish in time. Existing email holds are preserved.',
  cancelled: 'The email quota check was cancelled. Existing email holds are preserved.',
  superseded: 'A newer email or monitoring change superseded this check. Existing email holds are preserved.' } as const;
const date = (value: number | null) => value === null ? 'Unknown' : new Date(value).toLocaleString();
/** Clerk keeps `__client_uat` (a non-zero sign-in time) on the site while a session lives; zero or absent means signed out. */
const hasClerkSessionHint = () => typeof document !== 'undefined' && /(?:^|;\s*)__client_uat(?:_[A-Za-z0-9]+)?=[1-9]\d*/.test(document.cookie ?? '');
function amount(value: number | null, unit: OwnerServiceRecord['status']['allowance']['unit']) {
  if (value === null) return 'Unknown';
  if (unit === 'micro-usd') return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value / 1_000_000);
  const labels = { 'root-traces': 'traces', 'audio-seconds': 'seconds', emails: 'emails', 'conversion-attempts': 'conversion attempts', 'parser-credits': 'parser credits', 'telemetry-events': 'events', 'embedding-milli-neurons': 'milli-neurons' };
  return `${value.toLocaleString()} ${labels[unit]}`;
}
const count = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString();
function visitorPaidUsd(value: number | null) {
  if (value === null) return 'Unknown';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value / 1_000_000);
}
const retrievalDate = (value: number | null) => value === null || Number.isNaN(new Date(value).getTime()) ? 'Unknown' : new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace(/Z$/, ' UTC');
const generationLabel = (value: string | null) => value === null ? 'Unknown' : <abbr title={value} aria-label={value}>{value.slice(0, 16)}…</abbr>;
const degradationNames = { off: 'Off', 'policy-invalid': 'Local budget authorization unavailable', 'producer-unavailable': 'Approved generation unavailable', 'incompatible-generation': 'Generation incompatible',
  'capacity-unknown': 'Capacity unknown', 'capacity-stale': 'Capacity observation outdated', 'capacity-refreshing': 'Refreshing capacity',
  'capacity-unavailable': 'Capacity unavailable', quota: 'Capacity limit reached', concurrency: 'Concurrency limit reached', none: 'None' } as const;
const refreshReasonNames = { none: 'None', dependency: 'Dependency unavailable', account: 'Account evidence unavailable', evidence: 'Evidence unavailable',
  timeout: 'Timed out', aborted: 'Cancelled', read: 'Read unavailable', recovery: 'Recovery pending', storage: 'Storage unavailable' } as const;
const queryHealthNames = { unobserved: 'Not observed', healthy: 'Successful query observed', degraded: 'Needs attention' } as const;
const queryOutcomeNames = { success: 'Pipeline completed', 'admission-blocked': 'Capacity admission blocked', 'configuration-blocked': 'Configuration blocked',
  'embedding-failure': 'Embedding failed', 'vector-query-failure': 'Vector query failed', 'invalid-response': 'Invalid provider response',
  'accounting-failure': 'Accounting confirmation unavailable', deadline: 'Timed out', cancelled: 'Cancelled', superseded: 'Generation changed' } as const;
/** Capacity and observed pipeline outcomes have separate evidence and timestamps. */
export function OakOwnerRetrievalStatus({ record, currentSnapshot = true }: { record: OwnerServiceRecord; currentSnapshot?: boolean }) {
  const retrieval = record.status.semanticRetrieval;
  if (!retrieval) return null;
  const sql = retrieval.backend === 'sqlite-do' ? retrieval.sqlite : undefined;
  const resources = [
    { name: 'Daily embeddings', unit: 'milli-neurons', period: 'UTC day', value: retrieval.resources.dailyEmbedding },
    ...(sql ? [
      { name: 'Daily SQL reads', unit: 'rows read', period: 'UTC day', value: sql.resources.readRows },
      { name: 'Daily SQL writes', unit: 'rows written', period: 'UTC day', value: sql.resources.writeRows },
      { name: 'Daily actor requests', unit: 'requests', period: 'UTC day', value: sql.resources.requests },
      { name: 'Reserved actor duration', unit: 'milliseconds', period: 'UTC day', value: sql.resources.durationMs },
      { name: 'Daily semantic searches', unit: 'queries', period: 'UTC day', value: sql.resources.queries },
      { name: 'Daily publication batches', unit: 'batches', period: 'UTC day', value: sql.resources.batches },
      { name: 'Daily embedding inputs', unit: 'tokens', period: 'UTC day', value: sql.resources.embeddingTokens },
      { name: 'Persistent storage', unit: 'bytes', period: 'Persistent', value: sql.resources.bytes },
      { name: 'Retained generations', unit: 'generations', period: 'Persistent', value: sql.resources.generations },
    ] : [
      { name: 'Monthly queries and ingestion', unit: 'queried dimensions', period: 'UTC month', value: retrieval.resources.monthlyQueries },
      { name: 'Persistent storage', unit: 'stored dimensions', period: 'Persistent', value: retrieval.resources.persistentStorage },
    ]),
  ];
  const compatibility = retrieval.compatibility;
  const local = retrieval.metering.basis === 'conditional-local-budget';
  return <section aria-labelledby="oak-owner-retrieval">
    <h2 id="oak-owner-retrieval">Semantic retrieval</h2>
    {sql ? <p className="oak-owner__note">Backend: SQLite Durable Object. Actor duration uses a conservative reserved bound. Billable provider duration remains unknown.</p> : null}
    <p>{currentSnapshot ? '' : 'Last known: '}{conditionNames[record.condition]}. Current admission: {currentSnapshot ? record.status.admission : 'Unknown'}. {currentSnapshot ? 'Degradation:' : 'Last known degradation:'} {degradationNames[retrieval.degradation]}.</p>
    <p className="oak-owner__note">{currentSnapshot ? 'Query health:' : 'Last known query health:'} {queryHealthNames[retrieval.queryHealth.state]}. Last outcome: {retrieval.queryHealth.lastOutcome === null ? 'Not observed' : queryOutcomeNames[retrieval.queryHealth.lastOutcome]}. Finished: {retrievalDate(retrieval.queryHealth.lastTerminalAt)}.</p>
    <p className="oak-owner__note">A completed pipeline does not establish relevance or answer quality. Keyword fallback remains available when semantic retrieval cannot run.</p>
    <div className="oak-owner__table-scroll" tabIndex={0} aria-label="Retrieval budgets, scroll horizontally for all columns">
      <table><caption className="sr-only">Independent retrieval capacity budgets and original observations</caption>
        <thead><tr><th scope="col">Budget and period</th><th scope="col">{local ? 'Local limit' : 'Limit'}</th><th scope="col">Provider high-water</th><th scope="col">Local bound</th><th scope="col">{local ? 'Local remaining' : 'Remaining bound'}</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{resources.map(({ name, unit, period, value }) => {
          const current = currentSnapshot && value.settingsQuality === 'verified' && value.localQuality === 'verified' &&
            (local ? retrieval.certificate?.state === 'active' : retrieval.refresh.state === 'ready' && value.usageQuality === 'verified');
          const limit = local ? value.localBudgetLimit ?? null : value.limit;
          const remaining = local ? value.localBudgetRemainingBound ?? null : value.remainingBound;
          return <tr key={value.unit}>
            <th scope="row">{name}<br />{unit}, {local && value.reset !== 'persistent' ? 'Local ' : ''}{period}<br />{value.reset === 'persistent' ? 'No calendar reset' : <>Starts: {retrievalDate(value.periodStart)}<br />Next reset: {retrievalDate(value.periodEnd)}</>}</th>
            <td>{limit === null ? 'Unknown' : limit.toLocaleString()}</td>
            <td>{value.providerHighWater === null ? 'Unknown' : <>{current ? '' : 'Last known: '}{value.providerHighWater.toLocaleString()}</>}</td>
            <td>{value.localBound === null ? 'Unknown' : value.localBound.toLocaleString()}</td>
            <td>{remaining === null ? 'Unknown' : <>{current ? '' : 'Last known: '}{remaining.toLocaleString()}</>}</td>
            <td>{local ? 'Local authorization' : 'Settings'}: {value.settingsQuality}<br />{retrievalDate(value.settingsObservedAt)}<br />Usage: {value.usageQuality}<br />{retrievalDate(value.usageObservedAt)}<br />Local: {value.localQuality}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="oak-owner__note">{local ? 'Local remaining counts only this service’s settled usage and holds. Provider balance is unknown; other account usage may exhaust Free capacity earlier. Local periods do not identify provider reset periods.' : 'Remaining bounds conservatively combine provider usage and local settled or held usage. These application limits do not establish a provider hard cap.'} Unresolved holds are preserved.{sql ? ' SQL holds remain charged after UTC reset. Storage and retained generations have no calendar reset.' : ''}</p>
    <p className="oak-owner__note">{currentSnapshot ? 'Capacity refresh:' : 'Last known capacity refresh:'} {retrieval.refresh.state}. Reason: {refreshReasonNames[retrieval.refresh.reason]}. Fetched: {retrievalDate(retrieval.refresh.fetchedAt)}. Next due: {retrievalDate(retrieval.refresh.nextDueAt)}.</p>
    {local ? <p className="oak-owner__note">Free certificate: {retrieval.certificate?.state ?? 'absent'}. Proof lane: {retrieval.certificate?.proofLane === 'controlled' ? 'Controlled local test' : retrieval.certificate?.proofLane === 'native' ? 'Native reviewed scope' : 'Unknown'}. Revision: {retrieval.certificate?.revision ?? 'Unknown'}. Valid until: {retrievalDate(retrieval.certificate?.expiresAt ?? null)}. Native no-paid enforcement: {retrieval.metering.upstreamHardCapEstablished ? 'Verified for the reviewed scope' : 'Not verified'}.</p> : null}
    <details><summary>Generation and refresh details</summary>
      <p className="oak-owner__note">Content generation: {generationLabel(retrieval.generation.contentRevision)}. Revocation generation: {retrieval.generation.revocationGeneration ?? 'Unknown'}. Embedding configuration: {generationLabel(retrieval.generation.configurationSha256)}. Retrieval generation: {generationLabel(retrieval.generation.key)}.</p>
      <p className="oak-owner__note">Compatibility: {compatibility.state}. Content: {compatibility.content}. Revocation: {compatibility.revocation}. Configuration: {compatibility.configuration}. Index: {compatibility.index}. Dimensions: {compatibility.dimensions}. Metric: {compatibility.metric}. Readiness: {compatibility.readiness}.</p>
      <p className="oak-owner__note">Evidence revision: {retrieval.refresh.evidenceRevision ?? 'Unknown'}. Settings observed: {retrievalDate(retrieval.refresh.settingsObservedAt)}. Usage observed: {retrievalDate(retrieval.refresh.usageObservedAt)}.</p>
      <p className="oak-owner__note">Concurrency: {(sql?.concurrency ?? retrieval.concurrency).activeOperations ?? 'Unknown'} active operations. Limit: {(sql?.concurrency ?? retrieval.concurrency).limit ?? 'Unknown'}. Remaining slots: {(sql?.concurrency ?? retrieval.concurrency).remainingBound ?? 'Unknown'}. Concurrency is separate from capacity budgets.</p>
      <p className="oak-owner__note">Query observations for this generation. Last attempt: {retrievalDate(retrieval.queryHealth.lastAttemptAt)}. Last success: {retrievalDate(retrieval.queryHealth.lastSuccessAt)}. Attempts: {retrieval.queryHealth.attempts ?? 'Unknown'}. Successful: {retrieval.queryHealth.successes ?? 'Unknown'}. Failed: {retrieval.queryHealth.failures ?? 'Unknown'}. Timed out: {retrieval.queryHealth.deadlines ?? 'Unknown'}.</p>
    </details>
  </section>;
}
const utcDayDate = (value: number | null) => value === null || Number.isNaN(new Date(value).getTime()) ? 'Unknown' : new Date(value).toISOString().slice(0, 10);
const inspectionOutcomeNames = { none: 'Not observed', 'in-progress': 'Inspecting', accepted: 'Text extracted',
  'receipt-only': 'Inspection receipt only', failed: 'Failed', 'timed-out': 'Timed out', unknown: 'Unknown' } as const;
/** Local inspection and remote conversion counts have separate scopes. */
export function OakOwnerDocumentStatus({ status, currentSnapshot = true }: { status: OwnerServiceRecord['status']; currentSnapshot?: boolean }) {
  const day = utcDayDate(status.allowance.periodStart), nextDay = utcDayDate(status.allowance.periodEnd);
  const inspection = status.documentExtraction?.localInspection;
  const count = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString();
  return <section aria-labelledby="oak-owner-documents">
    <h2 id="oak-owner-documents">Document extraction</h2>
    {inspection ? <>
      <h3>Local inspection</h3>
      <p>{currentSnapshot ? '' : 'Last known: '}Inspection is {inspection.enabled ? inspection.admission : 'disabled'}. Last outcome: {inspectionOutcomeNames[inspection.lastOutcome]}.</p>
      <dl className="oak-owner__totals">
        <div><dt>Inspection attempts</dt><dd>{count(inspection.attempts)}</dd></div>
        <div><dt>Text extracted</dt><dd>{count(inspection.accepted)}</dd></div>
        <div><dt>Receipt only</dt><dd>{count(inspection.receiptOnly)}</dd></div>
        <div><dt>Failed</dt><dd>{count(inspection.failed)}</dd></div>
        <div><dt>Timed out</dt><dd>{count(inspection.timedOut)}</dd></div>
      </dl>
      <p className="oak-owner__note">Lifetime app counts. An inspection receipt can identify a scan before any text is extracted. Timeouts are included in failures. These counts do not establish provider Free capacity.</p>
      <p className="oak-owner__note">Last inspection: {date(inspection.lastAttemptAt)}. Last text extraction: {date(inspection.lastSuccessAt)}.</p>
    </> : null}
    <h3>Remote conversion</h3>
    <p>{currentSnapshot ? '' : 'Last known: '}Remote conversion is {status.enabled ? status.admission : 'disabled'}.</p>
    <p className="oak-owner__note">App conversion counts for UTC day {day}. Next reset: {nextDay}{nextDay === 'Unknown' ? '' : ' 00:00 UTC'}. This cap applies only to remote conversion.</p>
    <dl className="oak-owner__totals">
      <div><dt>Local daily cap</dt><dd>{amount(status.localBudget?.limit ?? null, 'conversion-attempts')}</dd></div>
      <div><dt>Consumed</dt><dd>{amount(status.localBudget?.consumed ?? null, 'conversion-attempts')}</dd></div>
      <div><dt>Held</dt><dd>{amount(status.localBudget?.reserved ?? null, 'conversion-attempts')}</dd></div>
      <div><dt>Remaining bound</dt><dd>{amount(status.localBudget?.remainingBound ?? null, 'conversion-attempts')}</dd></div>
    </dl>
    <p className="oak-owner__note">Provider allowance: Unknown. Local conversion attempts do not measure provider credits or neurons.</p>
    <h3>Lifetime remote conversion attempts</h3>
    <dl className="oak-owner__totals">
      <div><dt>Accepted</dt><dd>{amount(status.health.accepted, 'conversion-attempts')}</dd></div>
      <div><dt>Failed</dt><dd>{amount(status.health.failed, 'conversion-attempts')}</dd></div>
      <div><dt>Timed out</dt><dd>{amount(status.health.timedOut, 'conversion-attempts')}</dd></div>
    </dl>
    <p className="oak-owner__note">Timeouts are included in failed attempts. These totals exclude local text reads and upload rejections. Last attempt: {date(status.health.lastAttemptAt)}. Last success: {date(status.health.lastSuccessAt)}. Checked {date(status.health.lastCheckAt)}.</p>
  </section>;
}
function OakOwnerOcrStatus({ record, currentSnapshot }: { record: OwnerServiceRecord; currentSnapshot: boolean }) {
  const { status } = record, visitorPaid = status.documentOcr?.visitorPaid;
  const verifiedRead = visitorPaid?.readState === 'verified';
  const visitorPaidCount = (value: number | null) => verifiedRead ? count(value) : 'Unknown';
  const visitorPaidAmount = (value: number | null) => verifiedRead ? visitorPaidUsd(value) : 'Unknown';
  const visitorPaidRead = visitorPaid?.readState === 'verified' ? 'Verified local read' : visitorPaid?.readState === 'deadline' ? 'Timed out' : visitorPaid?.readState === 'unavailable' ? 'Unavailable' : 'Unknown';
  return <section id="oak-owner-ocr" aria-labelledby="oak-owner-ocr-heading">
    <h2 id="oak-owner-ocr-heading">Document OCR</h2>
    {!currentSnapshot ? <p className="oak-owner__note">Last known: this snapshot may be outdated.</p> : null}
    <p>Scanned-page reading on Steve's Vertex credit: {admissionNames[status.admission]}.</p>
    <h3>Visitor-paid OCR</h3>
    <p>Local records: {visitorPaidRead}.</p>
    <dl className="oak-owner__totals">
      <div><dt>Parser hold (USD)</dt><dd>{visitorPaidAmount(visitorPaid?.parserHeldMicroUsd ?? null)}</dd></div>
      <div><dt>Model hold (USD)</dt><dd>{visitorPaidAmount(visitorPaid?.modelHeldMicroUsd ?? null)}</dd></div>
      <div><dt>Provider-reported cost (USD)</dt><dd>{visitorPaidAmount(visitorPaid?.providerReportedMicroUsd ?? null)}</dd></div>
      <div><dt>Reconciled operations</dt><dd>{visitorPaidCount(visitorPaid?.states.settled ?? null)}</dd></div>
      <div><dt>Quotes</dt><dd>{visitorPaidCount(visitorPaid?.states.quoted ?? null)}</dd></div>
      <div><dt>Cancelled before dispatch</dt><dd>{visitorPaidCount(visitorPaid?.states.cancelled ?? null)}</dd></div>
      <div><dt>In progress</dt><dd>{visitorPaidCount(visitorPaid?.states.dispatching ?? null)}</dd></div>
      <div><dt>Uncertain exposure</dt><dd>{visitorPaidCount(visitorPaid?.states.exposureHeld ?? null)}</dd></div>
      <div><dt>Denied before dispatch</dt><dd>{visitorPaidCount(visitorPaid?.states.denied ?? null)}</dd></div>
    </dl>
    <p><strong>App outcomes</strong></p>
    <dl className="oak-owner__totals">
      <div><dt>Completed</dt><dd>{visitorPaidCount(visitorPaid?.outcomes.completed ?? null)}</dd></div>
      <div><dt>Failed</dt><dd>{visitorPaidCount(visitorPaid?.outcomes.failed ?? null)}</dd></div>
      <div><dt>Timed out</dt><dd>{visitorPaidCount(visitorPaid?.outcomes.timedOut ?? null)}</dd></div>
      <div><dt>Cancelled</dt><dd>{visitorPaidCount(visitorPaid?.outcomes.cancelled ?? null)}</dd></div>
      <div><dt>Denied before dispatch</dt><dd>{visitorPaidCount(visitorPaid?.outcomes.denied ?? null)}</dd></div>
      <div><dt>No terminal outcome</dt><dd>{visitorPaidCount(visitorPaid?.outcomes.unclassified ?? null)}</dd></div>
    </dl>
    <p className="oak-owner__note">Counts cover retained local records. Quotes may have expired. Exposure-held records are uncertain, not success or failure.</p>
    <p className="oak-owner__note">App outcomes describe local processing, not parser quality or billing. Missing terminal observations can be legacy or pending, and a hold does not establish a charge.</p>
    <p className="oak-owner__note">Provider-reported cost covers reconciled records only, including separately reported BYOK model usage. Unresolved costs remain held. Final invoices and remaining visitor funds: Unknown.</p>
  </section>;
}
function OwnerSignIn({ publishableKey, onReady }: { publishableKey: string; onReady: () => void }) {
  const node = useRef<HTMLDivElement>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!node.current) return;
    let closed = false, cleanup: (() => void) | undefined;
    void mountOakSignIn(node.current, publishableKey, () => { if (!closed) onReady(); })
      .then(stop => { if (closed) stop(); else cleanup = stop; }).catch(() => { if (!closed) setFailed(true); });
    return () => { closed = true; cleanup?.(); };
  }, [publishableKey, onReady]);
  return <><div ref={node} />{failed ? <p role="status">Sign-in could not load. Refresh when ready.</p> : null}</>;
}
export function OakOwnerServices() {
  const [view, setView] = useState<OwnerServicesView | null>(null), [pending, setPending] = useState(false);
  const [currentSnapshot, setCurrentSnapshot] = useState(false);
  const [notice, setNotice] = useState<string | null>(null), [key, setKey] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false), [threshold, setThreshold] = useState('80');
  const current = useRef(0), request = useRef<AbortController | null>(null), resumed = useRef(false);
  const refresh = useCallback(async (action?: OwnerServicesAction) => {
    request.current?.abort(); const generation = ++current.current, controller = new AbortController(); request.current = controller;
    setPending(true); setNotice(null); setCurrentSnapshot(false);
    try {
      const value = await requestOakOwnerServices(action, controller.signal);
      if (current.current !== generation || controller.signal.aborted) return;
      setView(value); setCurrentSnapshot(true); setKey(null); setSigningIn(false);
      if (value.alerting.thresholdPercent !== null) setThreshold(String(value.alerting.thresholdPercent));
    } catch (error) {
      if (current.current !== generation || controller.signal.aborted) return;
      if (error instanceof OakOwnerAccessError && ['sign-in-required', 'owner-required'].includes(error.code)) {
        setView(null); setKey(null); setSigningIn(false); setNotice('Sign in with the owner account to view service usage.');
        try {
          const configuration = await readOakSignInConfiguration(controller.signal);
          if (current.current === generation && !controller.signal.aborted) setKey(configuration.configured ? configuration.publishableKey : null);
          // A fresh page load has not loaded the account SDK, so a live session sends no token. Load it once, and only when
          // Clerk's own cookie says a session exists: a refused visitor without one still never loads the SDK.
          if (!resumed.current && configuration.configured && configuration.publishableKey && !getOakAccountContext().authenticated && hasClerkSessionHint()) {
            resumed.current = true; void resumeOakAccount(configuration.publishableKey).catch(() => {});
          }
        } catch { if (current.current === generation && !controller.signal.aborted) setKey(null); }
      } else if (!(error instanceof OakOwnerAccessError && error.code === 'cancelled')) setNotice('Current usage could not be checked. The last observation may be outdated.');
    } finally { if (current.current === generation) setPending(false); }
  }, []);
  const onReady = useCallback(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    void refresh();
    // Private aggregates leave the screen at once; the server, not the browser, decides whether the new account is the owner.
    const stop = subscribeOakAccountContext(() => { setView(null); void refresh(); });
    return () => { current.current++; request.current?.abort(); stop(); };
  }, [refresh]);
  useEffect(() => {
    if (!view || signingIn) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && !pending) void refresh(); }, 60_000);
    return () => clearInterval(timer);
  }, [view, signingIn, pending, refresh]);
  const model = view?.services.find(item => item.status.service === 'model-generation');
  const documents = view?.services.find(item => item.status.service === 'document-extraction');
  const ocr = view?.services.find(item => item.status.service === 'document-ocr');
  const retrieval = view?.services.find(item => item.status.service === 'semantic-retrieval');
  return <div className="oak-owner__content" aria-busy={pending}>
    <div className="oak-owner__actions">
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => { void refresh(); }}>{pending ? 'Checking…' : 'Refresh usage'}</Button>
      {!view && key && !signingIn ? <Button type="button" size="sm" onClick={() => setSigningIn(true)}>Sign in</Button> : null}
    </div>
    {notice ? <p role="status">{notice}</p> : null}
    {signingIn && key ? <OwnerSignIn publishableKey={key} onReady={onReady} /> : null}
    {view && model ? <>
      {!currentSnapshot ? <p className="oak-owner__note">Last known: retained observations may be outdated. Snapshot checked {date(view.checkedAt)}.</p> : null}
      <OakOwnerKeyQueue />
      <section aria-labelledby="oak-owner-model">
        <h2 id="oak-owner-model">Model budget</h2>
        <dl className="oak-owner__totals">
          <div><dt>Recorded spend</dt><dd>{amount(model.status.allowance.conservativeUsed, 'micro-usd')}</dd></div>
          <div><dt>Reserved</dt><dd>{amount(model.status.allowance.reserved, 'micro-usd')}</dd></div>
          <div><dt>Effective limit</dt><dd>{amount(model.status.allowance.limit, 'micro-usd')}</dd></div>
          <div><dt>Available bound</dt><dd>{amount(model.status.allowance.remainingBound, 'micro-usd')}</dd></div>
        </dl>
        <p className="oak-owner__note">Checked {date(model.status.health.lastCheckAt)}. Next UTC month: {date(model.status.allowance.periodEnd)}. Settled model costs follow the UTC month. Unresolved holds carry into the next month.</p>
        <p className="oak-owner__note">This is Oakfolio's model budget. <a href="https://openrouter.ai/activity" target="_blank" rel="noopener noreferrer">OpenRouter</a> and <a href="https://smith.langchain.com/" target="_blank" rel="noopener noreferrer">LangSmith</a> show model usage and costs. <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer">Google Billing</a> holds the separate Vertex credit observations.</p>
      </section>
      <section aria-labelledby="oak-owner-services">
        <h2 id="oak-owner-services">Services</h2>
        <div className="oak-owner__table-scroll" tabIndex={0} aria-label="Service usage, scroll horizontally for all columns">
          <table><caption className="sr-only">Service status and bounded allowance observations</caption>
            <thead><tr><th scope="col">Service</th><th scope="col">State</th><th scope="col">Used</th><th scope="col">Reserved</th><th scope="col">Remaining bound</th><th scope="col">Evidence</th></tr></thead>
            <tbody>{view.services.map(({ status, condition }) => {
              const localTelemetryBudget = status.admissionBasis === 'local-cap' &&
                (status.service === 'error-telemetry' || status.service === 'product-analytics') ? status.localBudget : undefined;
              return <tr key={status.service}>
                <th scope="row">{serviceNames[status.service as keyof typeof serviceNames]}</th><td>{currentSnapshot ? '' : 'Last known: '}{conditionNames[condition]}</td>
                {status.service === 'semantic-retrieval' ? <td colSpan={3}><a href="#oak-owner-retrieval">{status.semanticRetrieval?.backend === 'sqlite-do' ? 'See retrieval budgets' : 'See three retrieval budgets'}</a></td> : status.documentExtraction ? <td colSpan={3}><a href="#oak-owner-documents">See local inspection and remote conversion</a></td> : status.service === 'document-ocr' ? <td colSpan={3}><a href="#oak-owner-ocr">See OCR credits and visitor holds</a></td> : <>
                  <td>{localTelemetryBudget ? <>Local used: {amount(localTelemetryBudget.consumed ?? null, status.allowance.unit)}</> : amount(status.allowance.conservativeUsed, status.allowance.unit)}</td>
                  <td>{localTelemetryBudget ? <>Local reserved: {amount(localTelemetryBudget.reserved, status.allowance.unit)}</> : amount(status.allowance.reserved, status.allowance.unit)}</td>
                  <td>{localTelemetryBudget ? <>Local remaining: {amount(localTelemetryBudget.remainingBound, status.allowance.unit)}</> : amount(status.allowance.remainingBound, status.allowance.unit)}</td>
                </>}
                <td>Settings: {status.evidence.settings}<br />Provider usage: {status.evidence.providerUsage}<br />Local reservations: {status.evidence.localReservations}
                  {localTelemetryBudget ? <><br />Local budget limit: {amount(localTelemetryBudget.limit, status.allowance.unit)}<br />Provider headroom: Unknown</> : null}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <p className="oak-owner__note">Provider credit balances are unknown unless independently verified. A local remaining bound is an admission limit, not an account balance. Replacing a provider key preserves usage and alert history.</p>
      </section>
    <OakOwnerProviderAccounts accounts={view.providerAccounts} currentSnapshot={currentSnapshot} />
    <p className="oak-owner__note">App usage alerts continue when provider credit is unknown. They track this app's configured limits and holds. Spending elsewhere in the account is not included.</p>
      {retrieval ? <OakOwnerRetrievalStatus record={retrieval} currentSnapshot={currentSnapshot} /> : null}
      {documents ? <OakOwnerDocumentStatus status={documents.status} currentSnapshot={currentSnapshot} /> : null}
      {ocr ? <OakOwnerOcrStatus record={ocr} currentSnapshot={currentSnapshot} /> : null}
      <section aria-labelledby="oak-owner-alerts">
        <h2 id="oak-owner-alerts">Email alerts</h2>
        <p>{view.alerting.started ? 'Monitoring is running.' : 'Monitoring is stopped.'} {view.alerting.senderReady ? 'Resend sending is configured.' : 'Email delivery is not configured.'}</p>
        {view.alerting.expiryWarningMs !== undefined ? <p className="oak-owner__note">Known expiry dates warn {Number((view.alerting.expiryWarningMs / 86_400_000).toFixed(2))} days in advance. Unknown expiry dates remain unknown.</p> : null}
        {view.alerting.emailQuota ? <p className="oak-owner__note">
          {view.alerting.emailQuota.hold === 'none' ? 'Email quota: ' : 'Email alerts are paused. Usage: '}
          {view.alerting.emailQuota.dailyUsed === null ? 'daily usage unknown' : `${view.alerting.emailQuota.dailyUsed}/${view.alerting.emailQuota.dailyLimit} daily usage at last check`}, {' '}
          {view.alerting.emailQuota.monthlyUsed === null ? 'monthly usage unknown' : `${view.alerting.emailQuota.monthlyUsed}/${view.alerting.emailQuota.monthlyLimit} monthly usage at last check`}.
          {' '}Checked {date(view.alerting.emailQuota.observedAt)}.
          {view.alerting.emailQuota.hold === 'daily' ? ` Sending can resume after ${date(view.alerting.emailQuota.pauseUntil)}.` : null}
          {['monthly', 'unknown'].includes(view.alerting.emailQuota.hold) ? ' A verified quota reset is needed before sending resumes.' : null}
        </p> : null}
        <div className="oak-owner__actions"><Button type="button" size="sm" variant="ghost" disabled={pending || !view.alerting.senderReady || (view.alerting.emailQuotaRecheck?.nextAllowedAt ?? 0) > Date.now()} onClick={() => { void refresh({ action: 'recheck-email-quota' }); }}>Recheck email quota</Button></div>
        <p className="oak-owner__note" role="status">{quotaRecheckNotices[view.alerting.emailQuotaRecheck?.state ?? 'never']}
          {(view.alerting.emailQuotaRecheck?.nextAllowedAt ?? 0) > Date.now() ? ` Recheck available after ${date(view.alerting.emailQuotaRecheck!.nextAllowedAt)}.` : null}
        </p>
        {view.alerting.droppedTransitions > 0 ? <p role="status">The pending email queue reached its limit. {view.alerting.droppedTransitions} alert transitions could not be queued. Service checks and limits continue.</p> : null}
        <form className="oak-owner__alert-form" onSubmit={event => { event.preventDefault(); const value = Number(threshold); if (Number.isInteger(value) && value > 0 && value < 100) void refresh({ action: view.alerting.started ? 'configure' : 'start', thresholdPercent: value }); }}>
          <Field><FieldLabel htmlFor="oak-owner-threshold">Alert at percent of allowance</FieldLabel>
            <Input id="oak-owner-threshold" type="number" min="1" max="99" step="1" required value={threshold} disabled={pending || !view.alerting.featureEnabled} onChange={event => setThreshold(event.target.value)} />
          </Field>
          <div className="oak-owner__actions"><Button type="submit" size="sm" disabled={pending || !view.alerting.featureEnabled}>{view.alerting.started ? 'Update threshold' : 'Start monitoring'}</Button>
            {view.alerting.started ? <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { void refresh({ action: 'stop' }); }}>Stop monitoring</Button> : null}</div>
        </form>
        {!view.alerting.featureEnabled ? <p className="oak-owner__note">Monitoring is disabled in this environment. Service limits still apply.</p> : null}
        <p className="oak-owner__note">Last poll: {date(view.alerting.lastPollAt)}. Next poll: {date(view.alerting.nextPollAt)}.</p>
        {view.alerting.incidents.length ? <ol className="oak-owner__incidents">{view.alerting.incidents.map(incident => <li key={incident.id}>
          <strong>{serviceNames[incident.service]}: {incident.kind === 'retrieval-generation-change' ? 'Configuration changed' : conditionNames[incident.to]}</strong><span>{date(incident.createdAt)}. Delivery: {incident.delivery.replaceAll('-', ' ')}. Attempts: {incident.attempts}.</span>
          {incident.account ? <span>{ownerProviderNames[incident.account.provider]}, account {incident.account.scope.slice(0, 12)}. {ownerAccountCategoryNames[incident.account.category]}. {incident.account.expiresAt === null ? '' : `${incident.account.evidence === 'verified' ? '' : 'Last known: '}Expires ${date(incident.account.expiresAt)}.`} Evidence: {incident.account.evidence}.</span> : null}
          {incident.budgetBasis === 'local-budget' ? <span>App budget alert. Provider account credit may be unknown.</span> : null}
          <span>{incident.account && incident.account.category !== 'credit' ? 'Expiry date warning. Monthly resets are separate.' : incident.thresholdPercent === null || incident.configurationRevision === null ? 'The monitoring settings for this earlier alert are unknown.' : `${incident.kind === 'retrieval-generation-change' ? 'Monitoring threshold at the time' : 'Trigger threshold'}: ${incident.thresholdPercent}%.`}</span>
        </li>)}</ol> : <p>No recorded alert transitions.</p>}
        <p className="oak-owner__note">Email API acceptance, provider delivery and observed inbox receipt are separate states. Alerts contain service, threshold, time and dashboard context only.</p>
      </section>
    </> : null}
  </div>;
}
