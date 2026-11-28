import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader, stubSets } from './design-rework/load-tsx.mjs';
const load = createLoader({ use: [stubSets.react], stubs: { './oakAccountClient': { oakAuthorizationHeaders: async () => ({ Authorization: 'Bearer synthetic-session' }) } },
  globals: { window: { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980 } } });
const { createOakOcrClient, OakOcrError, oakOcrCapFromUsd } = load('src/lib/oakOcrClient.ts');
const { createOakDocumentsClient, OakDocumentOcrRequired } = load('src/lib/oakDocumentsClient.ts');
const { createOakDocumentsWorkspace } = load('src/lib/oakDocumentsWorkspace.ts');
const { ocrPolicySchema, ocrQuoteSchema } = load('packages/oak-agent-contracts/src/ocr.ts');
const operation = { principalHash: 'P'.repeat(43), conversationId: '11111111-1111-4111-8111-111111111111',
  submissionId: '22222222-2222-4222-8222-222222222222', generation: 1 };
const owner = { conversationId: operation.conversationId, accountEpoch: 1 };
const session = { tabId: '33333333-3333-4333-8333-333333333333', handle: 'H'.repeat(43) };
const quoteId = '44444444-4444-4444-8444-444444444444';
const disclosure = { processor: 'Synthetic local processor', recipient: 'Synthetic local transport', parser: 'Synthetic test parser',
  processing: 'Controlled local test, no external processing.', retention: 'Controlled test memory only. Not production terms.' };
async function fixture() {
  const file = new File(['SYNTHETIC_PRIVATE_SCAN'], 'scan.pdf', { type: 'application/pdf' });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
  const receipt = { payload: { ...operation, version: 3, slot: 0, expectedSlots: 1, parserRevision: 't18-feature-preflight-v4',
    expiresAt: Date.now() + 60_000, kind: 'pdf', originalSha256: digest, originalBytes: file.size, pdfPages: 2,
    pdfStructuralExpandedBytes: 0, pdfCounters: { visited: 0, tokens: 0, xref: 0, objects: 0, pageNodes: 0 },
    mediaEligibility: { revision: 't18-media-v1', status: 'image-present', reason: 'image' },
    preflightWarnings: ['source-sections-unverified', 'processor-coverage-unverified'] }, signature: 'a'.repeat(64) };
  const quote = { quoteId, expiresAt: Date.now() + 20_000, policyRevision: 'synthetic-policy-v1', termsRevision: 'synthetic-terms-v1',
    parserBoundMicroUsd: 100, modelBoundMicroUsd: 200, totalBoundMicroUsd: 300, chargeEvidence: 'estimate-only', funding: 'visitor',
    disclosure, scope: { coverage: 'whole-document', pages: 2, originalBytes: file.size },
    source: { ...operation, originalSha256: digest, receiptId: receipt.signature } };
  const funding = { session, revision: 1, expiresAt: Date.now() + 60_000 };
  return { file, receipt, quote, funding };
}
const signal = () => new AbortController().signal;
const status = (state = 'exposure-held') => ({ quoteId, state, parserHeldMicroUsd: state === 'exposure-held' ? 100 : 0,
  modelHeldMicroUsd: state === 'exposure-held' ? 200 : 0, actualCharge: state === 'exposure-held' ? 'unknown' : 'not-dispatched', retryAllowed: false });
const settledStatus = () => ({ ...status(), state: 'settled', actualCharge: 'verified', parserHeldMicroUsd: 0, modelHeldMicroUsd: 0,
  accounting: { generationId: 'gen-fixture-ledger', parserInclusion: 'unknown', upstreamInclusion: 'separate', settlement: 'unknown' },
  settlementReceipt: { source: 'openrouter-generation-v1', generationId: 'gen-fixture-ledger', parserInclusion: 'included-in-openrouter-account-charge',
    parserPlatformBreakdown: 'unknown', openRouterChargeMicroUsd: 100, isByok: true, upstreamInferenceChargeMicroUsd: 20,
    totalChargeMicroUsd: 120, settlement: 'provider-reported' } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

test('server policy has mandatory bounded disclosures with no production defaults; quote source and sums are strict', async () => {
  const f = await fixture();
  const policy = { revision: 'test-policy', termsRevision: 'test-terms', engine: 'test-parser', disclosure,
    parserBoundMicroUsd: 100, modelBoundMicroUsd: 200, quoteLifetimeMs: 30000, principalDailyCap: 1, globalDailyCap: 1, concurrencyCap: 1 };
  assert.equal(ocrPolicySchema.safeParse(policy).success, true);
  for (const key of Object.keys(disclosure)) {
    const changed = structuredClone(policy); delete changed.disclosure[key];
    assert.equal(ocrPolicySchema.safeParse(changed).success, false);
  }
  assert.equal(ocrQuoteSchema.safeParse({ ...f.quote, totalBoundMicroUsd: 301 }).success, false);
  assert.equal(ocrQuoteSchema.safeParse({ ...f.quote, output: 'PRIVATE_CANARY' }).success, false);
});
test('visitor USD caps convert exact decimals and reject rounding, exponent and beyond-bound input', () => {
  for (const [input, expected] of [['0', 0], ['0.000001', 1], ['0.000010', 10], ['0.3', 300000], ['1.000000', 1000000]])
    assert.equal(oakOcrCapFromUsd(input), expected);
  for (const invalid of ['', '0.0000001', '0.1234567', '1.000001', '1e-6', '-0.1', 'NaN', 'Infinity', '0.'])
    assert.equal(oakOcrCapFromUsd(invalid), null);
});

test('quote sends only exact receipt, visitor session and chosen cap; rejects missing disclosures, scope and source drift', async () => {
  const f = await fixture(), calls = []; let response = f.quote;
  const client = createOakOcrClient(async (url, init) => { calls.push({ url, init }); return Response.json(response); });
  assert.deepEqual(await client.quote(f.receipt, session, 300, signal()), f.quote);
  assert.equal(calls[0].url, '/api/oak/ocr/quote');
  assert.equal(calls[0].init.cache, 'no-store'); assert.equal(calls[0].init.credentials, 'same-origin'); assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].init.body), { receipt: f.receipt, funding: session, visitorCapMicroUsd: 300 });
  assert.equal(calls[0].init.body.includes('SYNTHETIC_PRIVATE_SCAN'), false);
  for (const change of [q => { delete q.disclosure; }, q => { q.scope.pages++; }, q => { q.source.generation++; },
    q => { q.source.receiptId = 'b'.repeat(64); }, q => { q.expiresAt = Date.now() - 1; }, q => { q.scope.coverage = 'selected-pages'; }]) {
    response = structuredClone(f.quote); change(response);
    await assert.rejects(client.quote(f.receipt, session, 300, signal()), OakOcrError);
  }
});

test('confirm requires both explicit consents and exact original; accepted admission never becomes extraction success', async () => {
  const f = await fixture(), calls = [];
  const client = createOakOcrClient(async (url, init) => { calls.push({ url, init }); return Response.json(status()); });
  for (const consent of [{ scopeAndTerms: false, visitorCharges: true }, { scopeAndTerms: true, visitorCharges: false }])
    await assert.rejects(client.confirm(f.quote, f.receipt, f.file, session, consent, signal()), /ocr-confirmation-required/);
  assert.equal(calls.length, 0);
  await assert.rejects(client.confirm(f.quote, f.receipt, new Blob(['X'.repeat(f.file.size)]), session,
    { scopeAndTerms: true, visitorCharges: true }, signal()), /ocr-source/);
  assert.equal(calls.length, 0);
  const result = await client.confirm(f.quote, f.receipt, f.file, session, { scopeAndTerms: true, visitorCharges: true }, signal());
  assert.equal(result.state, 'exposure-held'); assert.equal('output' in result, false);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(atob(body.originalBase64), 'SYNTHETIC_PRIVATE_SCAN'); assert.deepEqual(body.funding, session);
  assert.deepEqual(body.confirmation, { policyRevision: f.quote.policyRevision, termsRevision: f.quote.termsRevision,
    parserBoundMicroUsd: 100, modelBoundMicroUsd: 200, totalBoundMicroUsd: 300 });
  const fakeSuccess = createOakOcrClient(async () => Response.json({ state: 'ready', output: 'FAKE_TEXT' }));
  await assert.rejects(fakeSuccess.confirm(f.quote, f.receipt, f.file, session, { scopeAndTerms: true, visitorCharges: true }, signal()), /ocr-result-unverified/);
});

test('transport bounds errors, oversized replies, ignored aborts, deadlines and late responses without leaking payloads', async () => {
  const f = await fixture();
  for (const transport of [async () => Response.json({ error: 'PRIVATE_CANARY ' + session.handle }, { status: 503 }),
    async () => new Response('X'.repeat(16_001)), async () => { throw new Error('PRIVATE_CANARY'); }]) {
    const client = createOakOcrClient(transport);
    await assert.rejects(client.quote(f.receipt, session, 300, signal()), error => error instanceof OakOcrError && !error.message.includes('PRIVATE_CANARY') && !error.message.includes(session.handle));
  }
  const late = deferred(), client = createOakOcrClient(() => late.promise, async () => ({}), () => Date.now(), 5);
  await assert.rejects(client.quote(f.receipt, session, 300, signal()), /ocr-timeout/);
  late.resolve(Response.json(f.quote));
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(client.quote(f.receipt, session, 300, stopped.signal), /ocr-cancelled/);
  let cancelled = false;
  const hanging = createOakOcrClient(async () => new Response(new ReadableStream({ start() {}, cancel() { cancelled = true; } })), async () => ({}), () => Date.now(), 5);
  await assert.rejects(hanging.quote(f.receipt, session, 300, signal()), /ocr-timeout/);
  assert.equal(cancelled, true);
});

test('explicit status includes only current optional funding and validates reconciled charge binding without reparse', async () => {
  const calls = [], client = createOakOcrClient(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) }); return Response.json(settledStatus());
  });
  assert.equal((await client.status(quoteId, signal(), session)).actualCharge, 'verified');
  assert.equal((await client.status(quoteId, signal())).state, 'settled');
  assert.deepEqual(calls, [{ url: '/api/oak/ocr/status', body: { quoteId, funding: session } },
    { url: '/api/oak/ocr/status', body: { quoteId } }]);
  await assert.rejects(client.status(quoteId, signal(), { ...session, key: 'PRIVATE_CANARY' }), /ocr-source/);
  assert.equal(calls.length, 2);
  const corrupted = settledStatus(); corrupted.settlementReceipt.generationId = 'gen-unrelated';
  await assert.rejects(createOakOcrClient(async () => Response.json(corrupted)).status(quoteId, signal()), /ocr-result-unverified/);
});

test('actual document transport retains only genuine single scan receipt without commit/extract/finalize or OCR dispatch', async () => {
  const f = await fixture(), calls = [];
  const client = createOakDocumentsClient(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/begin')) return Response.json({ ...operation, expectedSlots: 1, expiresAt: f.receipt.payload.expiresAt, disclosures: {} });
    return Response.json({ receipt: f.receipt });
  });
  await assert.rejects(client.prepare([{ kind: 'pdf', body: f.file, label: f.file.name }], owner.conversationId, signal(), { job() {}, progress() {} }),
    error => error instanceof OakDocumentOcrRequired && error.receipt.signature === f.receipt.signature && error.input.body === f.file);
  assert.equal(calls.length, 2); assert.equal(calls.some(call => /ocr|commit|extract|finalize/.test(call.url)), false);
});

function workspaceFixture(f, overrides = {}) {
  const calls = [];
  let funding = f.funding;
  // scanAllowance is display-only (the server enforces limits), so it stays out of the recorded calls.
  const docs = { scanAllowance: async () => null, cancel: async job => { calls.push(['document-cancel', job]); }, prepare: async (inputs) => {
    calls.push(['prepare', inputs]); throw new OakDocumentOcrRequired(f.receipt, inputs[0], operation);
  } };
  const ocr = { quote: async (...args) => { calls.push(['quote', args]); return f.quote; },
    confirm: async (...args) => { calls.push(['confirm', args]); return status(); },
    status: async (...args) => { calls.push(['status', args]); return status(); }, cancel: async () => { calls.push(['ocr-cancel']); return status('cancelled'); }, ...overrides };
  const store = createOakDocumentsWorkspace(docs, () => Date.now(), ocr, () => {
    if (!funding) throw new OakOcrError('ocr-funding-required'); return funding;
  });
  return { store, calls, funding: value => { funding = value; } };
}
test('dormant paid workspace entry points cannot quote or confirm, while draft and scanned source remain for Free review', async () => {
  const f = await fixture(), { store, calls } = workspaceFixture(f);
  try {
    store.setPaste('KEEP_MY_DRAFT'); store.stageFiles([f.file], owner); await store.prepareStagedFiles(owner);
    // P12-G3 retired the lane choice (chooseOcrLane, ocrLane); the paid entry points must still dispatch nothing.
    await store.requestOcrQuote(owner, 300);
    store.setOcrConsent(true, true); await store.confirmOcr(owner, quoteId); await store.confirmOcr(owner, quoteId);
    assert.equal(calls.filter(c=>c[0]==='prepare').length,1);
    assert.equal(calls.some(c=>['quote','confirm','status'].includes(c[0])),false);
    assert.equal(store.snapshot().ocrAttempted,false);
    assert.equal(store.snapshot().ocrQuote,null);assert.equal(store.snapshot().ocrSource.pages,2);
    assert.equal(store.snapshot().paste,'KEEP_MY_DRAFT');assert.deepEqual(store.snapshot().documents,[]);
    assert.equal(store.turnContext(),null);assert.equal(store.proofForExplicitSave(),null);
  } finally {store.disposeOwned();}
});
test('funding connection, renewal, replacement and disconnect cannot enable the dormant paid parser', async () => {
  for(const change of ['renewal','replacement','disconnect','expired']) {
    const f=await fixture(),{store,funding,calls}=workspaceFixture(f);
    try {
      store.stageFiles([f.file],owner);await store.prepareStagedFiles(owner);
      funding(change==='disconnect'?null:{...f.funding,...(change==='replacement'?{revision:2}:
        change==='expired'?{expiresAt:Date.now()-1}:{expiresAt:f.funding.expiresAt+120000})});
      store.fundingChanged();await store.requestOcrQuote(owner,300);store.setOcrConsent(true,true);await store.confirmOcr(owner,quoteId);
      assert.equal(calls.some(c=>['quote','confirm','ocr-cancel'].includes(c[0])),false);
      assert.equal(store.snapshot().ocrAttempted,false);assert.equal(store.snapshot().ocrSource.pages,2);
    } finally {store.disposeOwned();}
  }
});
test('source and account replacement discard old private authority even while paid entry points are unavailable', async () => {
  const f=await fixture(),{store,calls}=workspaceFixture(f);
  try {
    store.stageFiles([f.file],owner);await store.prepareStagedFiles(owner);await store.requestOcrQuote(owner,300);
    store.open({...owner,accountEpoch:2});assert.equal(store.snapshot().ocrSource,null);assert.deepEqual(store.snapshot().stagedFiles,[]);
    store.stageFiles([f.file],owner);await store.prepareStagedFiles(owner);store.stageFiles([new File(['other'],'other.txt')],owner);
    assert.equal(store.snapshot().ocrSource,null);store.disposeOwned('new-conversation');assert.deepEqual(store.snapshot().stagedFiles,[]);
    assert.equal(calls.some(c=>['quote','confirm'].includes(c[0])),false);
  } finally {store.disposeOwned();}
});
test('source expiry still cancels original authority without paid dispatch and preserves the draft', async () => {
  const f=await fixture();f.receipt.payload.expiresAt=Date.now()+35;
  const {store,calls}=workspaceFixture(f);
  try {
    store.setPaste('RETAIN_DRAFT');store.stageFiles([f.file],owner);await store.prepareStagedFiles(owner);await store.requestOcrQuote(owner,300);
    await new Promise(resolve=>setTimeout(resolve,45));assert.equal(store.snapshot().ocrSource,null);assert.equal(store.snapshot().ocrQuote,null);
    assert(calls.some(c=>c[0]==='document-cancel'));assert(!calls.some(c=>['quote','confirm'].includes(c[0])));
    assert.equal(store.snapshot().paste,'RETAIN_DRAFT');assert.equal(store.snapshot().stagedFiles.length,0);
  } finally {store.disposeOwned();}
});

function extractedResult(f, text = 'OCR ONLY\nSECOND', inference = 'failed') {
  const output = { documentId: '55555555-5555-4555-8555-555555555555', slots: [0], kind: 'pdf', text,
    sections: [{ id: 'section-1', start: 0, end: text.length, sourceStart: 0, sourceEnd: text.length }],
    offsetUnit: 'utf16', sourceMapping: 'openrouter-file-annotation-v1', pdfPages: 2,
    ocrSource: { quoteId, originalSha256: f.receipt.payload.originalSha256, receiptId: f.receipt.signature,
      annotationDigest: 'b'.repeat(64), engine: 'mistral-ocr' }, normalizedBytes: new TextEncoder().encode(text).byteLength,
    tokens: Math.ceil(text.length / 4), normalizationComplete: true, extractionCompleteness: 'unknown', pageMapping: 'unavailable',
    authority: 'visitor-text-only', warnings: ['no-factual-authority', 'processor-coverage-unverified', 'reading-order-unverified',
      'pdf-layout-unverified', 'page-count-only-no-text-map', 'ocr-visual-content-unverified'] };
  output.receipt = { payload: { ...operation, version: 1, expiresAt: f.receipt.payload.expiresAt,
    documentId: output.documentId, slots: [0], contentDigest: 'c'.repeat(64), parserRevision: 't18-reviewed-v2',
    processorRevision: 'openrouter-file-parser-v1', provenance: { kind: 'preflight', parents: [{ slot: 0, receiptId: f.receipt.signature }] } }, signature: 'd'.repeat(64) };
  return { quoteId, output, inference, status: { ...status(), accounting: {
    parserInclusion: 'unknown', upstreamInclusion: 'separate', settlement: 'unknown' } } };
}
test('confirmed signed annotation preview preserves source binding and supports a bounded response above quote-only limit', async () => {
  const f = await fixture(); let response = extractedResult(f, 'A'.repeat(20000));
  const client = createOakOcrClient(async () => Response.json(response));
  const consent = { scopeAndTerms: true, visitorCharges: true };
  assert.equal((await client.confirm(f.quote, f.receipt, f.file, session, consent, signal())).output.text.length, 20000);
  for (const mutate of [r => { r.output.ocrSource.originalSha256 = 'f'.repeat(64); },
    r => { r.output.ocrSource.receiptId = 'f'.repeat(64); }, r => { r.output.receipt.payload.generation++; },
    r => { r.output.receipt.payload.principalHash = 'Q'.repeat(43); }, r => { r.output.receipt.payload.provenance.parents[0].receiptId = 'f'.repeat(64); },
    r => { r.output.sections[0].sourcePage = 1; }, r => { r.output.extractionCompleteness = 'complete'; }]) {
    response = extractedResult(f); mutate(response);
    await assert.rejects(client.confirm(f.quote, f.receipt, f.file, session, consent, signal()), /ocr-result-unverified/);
  }
});
test('historical signed paid annotation preview retains selected-read and explicit save interfaces without a new paid operation', async () => {
  const f=await fixture(),result=extractedResult(f),{store,calls,funding}=workspaceFixture(f);
  try {
    store.installFreshOwned({operation,outputs:[result.output],selections:[]},owner);
    store.setPaste('DRAFT_RETAINED');const o=result.output;
    assert.equal(store.snapshot().documents[0].text,'OCR ONLY\nSECOND');assert.equal(store.turnContext(),null);
    store.setSelections([{documentId:o.documentId,sectionId:'section-1',start:0,end:8}]);assert.equal(store.selectForTurn(),true);
    assert.equal(store.turnContext().outputs[0].text,o.text);
    assert.equal(store.serializeForExplicitSave().documents[0].processorRevision,'openrouter-file-parser-v1');
    funding({...f.funding,expiresAt:f.funding.expiresAt+120000});store.fundingChanged();
    await store.requestOcrQuote(owner,300);await store.confirmOcr(owner,quoteId);
    assert(!calls.some(c=>['quote','confirm'].includes(c[0])));assert.equal(store.snapshot().paste,'DRAFT_RETAINED');
    store.open({...owner,accountEpoch:2});assert.equal(store.snapshot().documents.length,0);assert.equal(store.turnContext(),null);
  } finally {store.disposeOwned();}
});
test('historical paid preview keeps cancellation authority while ordinary Return and Use preserve selected context', async () => {
  for(const ending of ['ocr-cancel','owner-change']) {
    const f=await fixture(),result=extractedResult(f),{store,calls}=workspaceFixture(f);
    try {
      store.installFreshOwned({operation,outputs:[result.output],selections:[]},owner);store.setPaste('KEEP_COMPLETED_DRAFT');
      store.setSelections([{documentId:result.output.documentId,sectionId:'section-1',start:0,end:8}]);
      assert.equal(store.selectForTurn(),true);store.close();store.open(owner);
      assert.equal(store.turnContext().outputs[0].text,'OCR ONLY\nSECOND');
      assert.equal(calls.filter(c=>c[0]==='document-cancel').length,0);
      if(ending==='ocr-cancel')store.cancel(ending);else store.open({...owner,accountEpoch:2});
      assert.equal(calls.filter(c=>c[0]==='document-cancel').length,1);assert.equal(store.turnContext(),null);
      assert.equal(store.snapshot().documents.length,0);assert.equal(store.snapshot().paste,ending==='ocr-cancel'?'KEEP_COMPLETED_DRAFT':'');
      assert(!calls.some(c=>['quote','confirm'].includes(c[0])));
    } finally {store.disposeOwned();}
  }
});
