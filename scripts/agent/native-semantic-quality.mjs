#!/usr/bin/env node
/** Native quality operator. The default command reads local evidence only.
 * Account actions cross the authenticated Cloudflare connector; native queries
 * keep the reviewed Keychain transport and server-side finite grant. */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = '.local-setup/cp175-native-quality-successor-r1/';
const refusal = () => { throw new Error('native-semantic-quality-refused'); };
const sha = value => createHash('sha256').update(value).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const recordBytes = value => typeof value === 'string' ? Buffer.from(value) : encoded(value);
const immutable = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) immutable(child); Object.freeze(value); }
  return value;
};

/** One atomic result file replaces the host's per-record JSON companions.
 * Fragment pins commit to immutable entries, not to a mutable whole-file hash.
 * This is an operational record, never an independent-review certificate. */
export class QualityRecords {
  constructor(path) { this.path = path; }
  read() {
    if (!existsSync(this.path)) return immutable({ schema: 'oak.native-quality-records.v1', entries: {} });
    const stat = lstatSync(this.path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 32_000_000) refusal();
    const key = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (key === this.cacheKey) return this.cached;
    const data = JSON.parse(readFileSync(this.path, 'utf8'));
    if (data?.schema !== 'oak.native-quality-records.v1' || !data.entries ||
        typeof data.entries !== 'object' || Array.isArray(data.entries) ||
        Object.keys(data).sort().join('|') !== 'entries|schema') refusal();
    for (const [name, record] of Object.entries(data.entries)) {
      this.name(name);
      const bytes = recordBytes(record.value);
      if (Object.keys(record).sort().join('|') !== 'bytes|sha256|value' ||
          record.bytes !== bytes.length || record.sha256 !== sha(bytes)) refusal();
    }
    this.cacheKey = key; this.cached = immutable(data);
    return this.cached;
  }
  name(name) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,140}\.json$/.test(name) && !/^ACTION-[a-z]+\.js$/.test(name)) refusal();
  }
  get(name) {
    this.name(name);
    const record = this.read().entries[name];
    if (!record) refusal();
    return structuredClone(record.value);
  }
  has(name) { this.name(name); return Object.hasOwn(this.read().entries, name); }
  pin(name, publicPath) {
    this.get(name);
    const { bytes, sha256 } = this.read().entries[name];
    return { path: `${publicPath}#${name}`, bytes, sha256 };
  }
  add(name, value) {
    this.name(name);
    const lock = `${this.path}.lock`, temporary = `${this.path}.${process.pid}.tmp`;
    let lockFd, outputFd;
    try {
      try { lockFd = openSync(lock, 'wx', 0o600); }
      catch {
        // Only a known dead writer's lock can be recovered. A live writer wins.
        const stat = lstatSync(lock), owner = JSON.parse(readFileSync(lock, 'utf8'));
        if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(owner.pid) || owner.pid < 1) refusal();
        try { process.kill(owner.pid, 0); refusal(); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
        if (lstatSync(lock).ino !== stat.ino) refusal();
        unlinkSync(lock); lockFd = openSync(lock, 'wx', 0o600);
      }
      writeFileSync(lockFd, JSON.stringify({ pid: process.pid })); fsyncSync(lockFd);
      this.cacheKey = undefined;
      const data = structuredClone(this.read());
      if (Object.hasOwn(data.entries, name)) refusal();
      const bytes = recordBytes(value);
      data.entries[name] = { bytes: bytes.length, sha256: sha(bytes), value: structuredClone(value) };
      outputFd = openSync(temporary, 'wx', 0o600);
      writeFileSync(outputFd, encoded(data)); fsyncSync(outputFd); closeSync(outputFd); outputFd = undefined;
      renameSync(temporary, this.path);
      const directory = openSync(dirname(this.path), 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
      this.cacheKey = undefined;
    } finally {
      if (outputFd !== undefined) closeSync(outputFd);
      if (lockFd !== undefined) { closeSync(lockFd); unlinkSync(lock); }
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return this.get(name);
  }
}

async function operator() {
  const base = new URL(`../../${LOCAL}`, import.meta.url);
  const [contract, prepare, account, invoke, cleanup] = await Promise.all([
    import(new URL('contract.mjs', base)), import(new URL('prepare.mjs', base)),
    import(new URL('account.mjs', base)), import(new URL('invoke.mjs', base)), import(new URL('cleanup.mjs', base)),
  ]);
  return { contract, prepare, account, invoke, cleanup };
}

/** Small execution interface for a host with authenticated account/proof tools.
 * The adapter executes the bounded source and supplies actual postupload proof.
 * No adapter is loaded or called by plan. Unknown operations remain consumed. */
export async function executeNativeQuality(input, adapter, loaded) {
  if (typeof adapter?.account !== 'function' || typeof adapter?.postupload !== 'function') refusal();
  const op = loaded ?? await operator(), { contract: c, prepare, account, invoke } = op;
  await prepare.prepare(input);
  const dispatch = async action => {
    const sourcePin = beginAccount(op, action);
    let result;
    try { result = await adapter.account(action, c.readArtifact(sourcePin.path)); }
    catch { c.stop(`account-${action}-unknown`); throw new Error('native-account-outcome-unknown'); }
    return account.record(action, result);
  };
  let failure;
  try {
    await dispatch('upload'); await dispatch('module');
    const proof = await adapter.postupload(status(op));
    recordPostupload(op, proof);
    await dispatch('enable');
    for (const operation of c.SELECTORS) {
      invoke.generate(operation); invoke.accept(operation);
      const resultPin = await invoke.invoke(operation);
      if (c.readJson(resultPin.path).outcome !== 'accepted-quality-metadata') refusal();
    }
  } catch (error) { c.stop('operator-refused-or-unknown'); failure = error; }
  finally {
    // Cleanup is allowed after source/window drift under the original authority.
    if (c.present('account-upload-INTENT.json')) {
      for (const action of ['disable', 'off']) {
        try { await dispatch(action); } catch (error) { failure ??= error; }
      }
    }
    c.stop('finite-quality-scope-consumed');
  }
  const result = status(op);
  if (failure) return { ...result, failure: 'refused-or-unknown' };
  return result;
}

function beginAccount(op, action) {
  const { account } = op;
  const sourcePin = account.generate(action);
  account.accept(action); account.intent(action);
  if (['upload', 'module', 'enable'].includes(action)) account.dispatch(action);
  return sourcePin;
}
function recordPostupload(op, proof) {
  const { contract: c, account } = op, x = c.requirePrepared();
  // The supplied pin is an actual fresh Browser observation, not an approval.
  c.verifyPins([proof.proofPin, ...(proof.screenshotPins ?? [])]);
  c.writeOnce('EVIDENCE-postupload.json', {
    schema: 'oak.sqlite-fresh-quality-browser-evidence.cp175-quality-postmerge-r1-candidate',
    phase: 'postupload', bindings: c.bindings(x), proofPin: proof.proofPin,
    screenshotPins: proof.screenshotPins ?? [],
  });
  return account.accept('module-proof');
}
function status({ contract: c }) {
  const privateResults = c.SELECTORS.filter(operation => c.present(`private-${operation}-RESULT.json`))
    .map(operation => c.localJson(`private-${operation}-RESULT.json`));
  const knownQueries = privateResults.filter(r => r.operation.startsWith('quality-') && r.outcome === 'accepted-quality-metadata').length;
  const unknownQueries = c.SELECTORS.filter(operation => operation.startsWith('quality-') &&
    c.present(`private-${operation}-INTENT.json`) && !privateResults.some(r => r.operation === operation && r.outcome === 'accepted-quality-metadata')).length;
  const off = c.present('account-off-RESULT.json') ? c.localJson('account-off-RESULT.json') : null;
  return {
    prepared: c.present('PREPARED.json'), nativeQueries: knownQueries, unknownQueries,
    accountExposure: c.accountExposure(), stopped: c.present('STOP.json'),
    endpointOffIndependentlyVerified: off?.outcomeKnown === true && off.state === 'independent-OFF',
    resultPath: resolve(ROOT, LOCAL, 'OPERATOR-RESULT.json'),
    queryResults: privateResults.filter(r => r.operation.startsWith('quality-')).map(r => ({
      operation: r.operation, outcome: r.outcome, selected: r.selected, timings: r.timings,
    })),
    qualityAccepted: false, servingAccepted: false, retryAllowed: false,
    historicalHoldsRetained: true, providerBalance: 'unknown',
  };
}

/** Recheck the completed native chain without reopening its expired dispatch
 * window. Existing validators bind every immutable fragment to its source,
 * query, candidate, request, diagnostic and preceding operation. */
function completedQuality(c, cleanup) {
  const x = c.requirePrepared(), bindings = c.bindings(x), pins = [];
  if (x.g.proofLane !== 'native' || c.SELECTORS.length !== 27 || !c.present('STOP.json')) refusal();
  let history = c.initialHistory(x.grantSha256);
  for (const [ordinal, operation] of c.SELECTORS.entries()) {
    const names = [`private-${operation}-INTENT.json`, `private-${operation}-RESULT.json`, `REQUEST-${operation}.json`];
    const [intentPin, resultPin, requestPin] = names.map(name => c.localPin(name));
    const [intent, result, request] = names.map(name => c.localJson(name));
    c.validateHistoricalRequest(request, operation, ordinal, x, bindings, history);
    const reviewPin = c.requirePlannedStage(`private-${operation}`, {
      ...bindings, operation, requestManifestSha256: requestPin.sha256, previousChainSha256: history.chainSha256,
    }, c.pinUnion([...request.evidencePins, requestPin]), x.accepted);
    if (c.hashJson(intent.requestPin) !== c.hashJson(requestPin) || c.hashJson(intent.reviewPin) !== c.hashJson(reviewPin)) refusal();
    c.validateAcceptedDiagnostic(c.readJson(result.diagnosticPin.path), operation, intentPin, x);
    const tuple = [intentPin, resultPin, requestPin, reviewPin, result.diagnosticPin];
    c.verifyPins([...request.evidencePins, ...tuple]); pins.push(...tuple);
    history = c.advanceHistory(ordinal, intent, result, intentPin, x, bindings, history);
    history.pins = [intentPin, resultPin, reviewPin, requestPin, result.diagnosticPin];
  }
  pins.push(...completedCleanup(c, cleanup, x, bindings), c.localPin('STOP.json'));
  return { x, bindings, pins: c.pinUnion(pins), chainSha256: history.chainSha256 };
}

/** Validate original cleanup records without authorizing another dispatch or
 * checking today's clock. The recorded source enforced the cleanup window;
 * this historical composition only verifies its authority and consumed pins. */
function completedCleanup(c, cleanup, x, bindings) {
  const authorityPin = c.localPin('CLEANUP-AUTHORITY.json'), authority = c.localJson('CLEANUP-AUTHORITY.json');
  const metadataPin = c.localPin('UPLOAD-METADATA.json'), uploadIntentPin = c.localPin('account-upload-INTENT.json');
  const upload = c.localJson('account-upload-INTENT.json'), uploadStagePin = c.localPin('STAGE-account-upload.json');
  if (c.hashJson(authority) !== c.hashJson(cleanup.cleanupAuthority(x, bindings,
    { sha256: x.prepared.workerSha256, bytes: x.prepared.workerBytes }, metadataPin, x.accepted))) refusal();
  const context = cleanup.validateConsumedCleanup(authority, authority, upload, c.localJson('STAGE-account-upload.json'),
    { authorityPin, reviewPin: authorityPin, uploadIntentPin, now: authority.validFrom, accepted: x.accepted });
  const pins = [authorityPin, metadataPin, uploadIntentPin, uploadStagePin, ...authority.executorHelperPins,
    ...c.localJson('STAGE-account-upload.json').evidencePins];
  if (c.hashJson(upload.reviewPin) !== c.hashJson(uploadStagePin)) refusal();
  for (const action of ['disable', 'off']) {
    const sourcePin = c.localPin(`ACTION-${action}.js`), intentPin = c.localPin(`account-${action}-INTENT.json`);
    const intent = c.localJson(`account-${action}-INTENT.json`), result = c.localJson(`account-${action}-RESULT.json`);
    const evidencePins = [sourcePin, authorityPin, authorityPin, uploadIntentPin, ...authority.executorHelperPins,
      ...(action === 'off' ? [c.localPin('account-disable-INTENT.json')] : [])];
    const stagePin = c.requirePlannedStage(`account-${action}`, context.bindings, evidencePins, x.accepted);
    for (const [field, pin] of Object.entries({ sourcePin, reviewPin: stagePin, cleanupAuthorityPin: authorityPin,
      cleanupReviewPin: authorityPin, uploadIntentPin })) if (c.hashJson(intent[field]) !== c.hashJson(pin)) refusal();
    if (intent.schema !== 'oak.sqlite-fresh-quality-account-intent.cp175-quality-postmerge-r1-candidate' ||
        intent.action !== action || c.hashJson(intent.bindings) !== c.hashJson(context.bindings) ||
        intent.uploadMetadataSha256 !== metadataPin.sha256 || intent.consumed !== true || intent.reservedAccountCalls !== 1 ||
        intent.retryAllowed !== false || intent.modelCalls !== 0 || intent.credentialReads !== 0 || intent.servingAccepted !== false ||
        result.schema !== 'oak.sqlite-fresh-quality-account-result.cp175-quality-postmerge-r1-candidate' ||
        result.action !== action || result.outcomeKnown !== true || result.intentSha256 !== intentPin.sha256 ||
        result.accountId !== authority.accountId || result.ownerScript !== authority.ownerScript || result.namespaceId !== authority.namespaceId ||
        result.grantSha256 !== x.grantSha256 || result.workerSha256 !== x.prepared.workerSha256 || result.accountCalls !== 1 ||
        result.cleanupAuthoritySha256 !== authorityPin.sha256 || result.uploadIntentSha256 !== uploadIntentPin.sha256 ||
        result.uploadMetadataSha256 !== metadataPin.sha256 || result.retryAllowed !== false || result.modelCalls !== 0 ||
        result.providerCalls !== 0 || result.credentialsPersisted !== false || result.rawSourceReturned !== false ||
        result.rawSourcePersisted !== false || result.servingAccepted !== false || result.retirementAuthorized !== false ||
        result.namespaceRetained !== true || result.holdsReset !== false || (action === 'disable' ?
          result.state !== 'disable-acknowledged' || result.disableRequested !== true || result.independentOffPending !== true :
          result.state !== 'independent-OFF' || result.disabled !== true || result.previewsEnabled !== false || result.independentReadback !== true)) refusal();
    pins.push(...evidencePins, stagePin, intentPin, c.localPin(`account-${action}-RESULT.json`));
  }
  c.verifyPins(pins);
  return c.pinUnion(pins);
}

/** Compile the existing TypeScript functions in memory, without a new runner,
 * output file, provider binding or credential. Pin the exact bytes esbuild read. */
async function analysisRuntime(c) {
  const worker = resolve(ROOT, 'workers/oak-agent'), require = createRequire(resolve(worker, 'package.json'));
  const esbuild = require('esbuild'), inputPins = new Map();
  const lockPath = 'workers/oak-agent/package-lock.json', lockPin = c.pin(lockPath);
  if (esbuild.version !== JSON.parse(c.readArtifact(lockPath)).packages['node_modules/esbuild'].version) refusal();
  const main = require.resolve('esbuild');
  const compilerPins = [main, resolve(main, '../../package.json'), require.resolve('@esbuild/darwin-arm64/bin/esbuild')]
    .map(path => c.pin(path.slice(ROOT.length + 1)));
  const build = await esbuild.build({
    stdin: { contents: "export { sqliteCanonicalMatches } from './src/knowledge/sqlite-semantic-service.ts';\n" +
      "export { retrievePortfolio } from './src/knowledge/retrieval.ts';\n" +
      "export { sources, evidence } from './src/knowledge/snapshot.ts';\n" +
      "export { default as snapshot } from '../../src/data/generated/knowledgeSnapshot.json';",
      resolveDir: worker, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', target: 'node24', write: false, logLevel: 'silent',
    plugins: [{ name: 'pin-analysis-inputs', setup(build) {
      build.onLoad({ filter: /\.(?:ts|[cm]?js|json)$/ }, async ({ path }) => {
        if (!path.startsWith(ROOT + '/')) refusal();
        const relative = path.slice(ROOT.length + 1), pin = c.pin(relative), contents = c.readArtifact(relative);
        if (sha(Buffer.from(contents)) !== pin.sha256) refusal();
        inputPins.set(relative, pin);
        return { contents, loader: path.endsWith('.json') ? 'json' : path.endsWith('.ts') ? 'ts' : 'js' };
      });
    } }],
  });
  const sourcePins = c.pinUnion([lockPin, ...compilerPins, ...inputPins.values()]);
  c.verifyPins(sourcePins);
  const module = new Module(resolve(worker, 'native-quality-analysis.cjs'));
  module.filename = resolve(worker, 'native-quality-analysis.cjs'); module.paths = Module._nodeModulePaths(worker);
  module._compile(build.outputFiles[0].text, module.filename);
  return { ...module.exports, sourcePins };
}

function rankingMetrics(ids, testCase) {
  const relevant = new Set(testCase.relevantPassageIds), negatives = new Set(testCase.misleadingPassageIds);
  const first = ids.findIndex(id => relevant.has(id)), hardNegatives = ids.filter(id => negatives.has(id));
  return { firstRelevantRank: first < 0 ? null : first + 1, hitAt3: relevant.size ? first >= 0 && first < 3 : null,
    relevantAt3: ids.slice(0, 3).filter(id => relevant.has(id)).length, targetCount: relevant.size,
    hardNegativeIds: hardNegatives, hardNegativeBeforeRelevant: first < 0 ? null : ids.slice(0, first).some(id => negatives.has(id)) };
}

function boundExcerpt(value, runtime) {
  const source = value.ok && runtime.sources.get(value.passageId);
  if (!source || value.excerptOffset < 0 || value.excerptEnd - value.excerptOffset > 700 ||
      value.text !== source.passage.text.slice(value.excerptOffset, value.excerptEnd) ||
      value.citation.documentId !== source.document.id || value.citation.passageId !== source.passage.id ||
      value.citation.sectionId !== source.passage.sectionId || value.citation.url !== source.passage.citationUrl) refusal();
  return { ...value.citation, offset: value.excerptOffset, end: value.excerptEnd, excerptSha256: sha(value.text),
    contentSha256: sha(source.passage.text), nextOffset: value.nextOffset };
}

/** Each complete group retains the existing verifier's 256-pin bound. Shared
 * paths must commit to the same bytes across the two groups. */
function verifyAnalysisInputs(c, groups) {
  if (!groups || Object.keys(groups).sort().join('|') !== 'nativeChain|runtime' ||
      Object.values(groups).some(pins => !Array.isArray(pins))) refusal();
  const byPath = new Map();
  for (const pins of Object.values(groups)) for (const pin of pins) {
    if (byPath.has(pin.path) && c.hashJson(byPath.get(pin.path)) !== c.hashJson(pin)) refusal();
    byPath.set(pin.path, pin);
  }
  for (const pins of Object.values(groups)) c.verifyPins(pins);
}

/** Native candidates, replayed locally through the actual mapper and fusion.
 * Neither this report nor its synthetic unavailable-port branch is a live chat,
 * serving authorization, factual-entailment review or T11 funding-parity proof. */
export async function analyzeNativeQuality(loaded) {
  const { contract: c, cleanup } = loaded ?? await operator();
  const completed = completedQuality(c, cleanup), { x } = completed;
  if (c.present('ANALYSIS.json')) {
    const report = c.localJson('ANALYSIS.json');
    c.verifyPins([c.localPin('ANALYSIS.json')]);
    verifyAnalysisInputs(c, report.inputPinGroups);
    if (report.schema !== 'oak.native-quality.compositional-analysis.v1' ||
        c.hashJson(report.bindings) !== c.hashJson(completed.bindings) || report.nativeChainSha256 !== completed.chainSha256) refusal();
    return report;
  }
  const runtime = await analysisRuntime(c), manifest = x.assembly.plan.manifest;
  if (c.hashJson(runtime.snapshot) !== c.hashJson(x.assembly.source.snapshot) ||
      runtime.snapshot.revision !== manifest.identity.knowledgeRevision || runtime.snapshot.revocationGeneration !== manifest.identity.revocationGeneration) refusal();
  const cases = x.accepted.packet.cases, queries = x.assembly.rawQueries, rows = [];
  if (queries.length !== 24 || cases.length !== 24) refusal();
  for (const [index, query] of queries.entries()) {
    const testCase = cases[index], proof = x.assembly.queries[index], operation = `quality-${query.id}`;
    if (testCase.id !== query.id || testCase.query !== query.text || query.text.length > 240 ||
        sha(x.assembly.source.configuration.queryProcessing.prefix + query.text) !== proof.inputSha256) refusal();
    const result = c.localJson(`private-${operation}-RESULT.json`), selected = result.selected;
    c.validateSelected(selected, x.g, x.publication, x.assembly, operation);
    const matches = runtime.sqliteCanonicalMatches(manifest, selected.matches, 12);
    if (c.hashJson(matches) !== selected.citationsSha256 || c.hashJson(matches.map(m => m.passageId)) !== c.hashJson(selected.citationIds)) refusal();
    let replayCalls = 0, unavailableCalls = 0;
    const port = { identity: manifest.identity, async search(input) {
      if (input.query !== query.text || input.limit !== 12 || input.signal.aborted || ++replayCalls !== 1) refusal();
      return { identity: manifest.identity, matches };
    } };
    const fused = await runtime.retrievePortfolio(query.text, { signal: new AbortController().signal, semantic: port });
    const lexical = await runtime.retrievePortfolio(query.text, { signal: new AbortController().signal });
    const unavailable = await runtime.retrievePortfolio(query.text, { signal: new AbortController().signal,
      semantic: { identity: manifest.identity, async search(input) {
        if (input.query !== query.text || input.signal.aborted || ++unavailableCalls !== 1) refusal();
        throw new Error('local-analysis-unavailable-port');
      } } });
    const citations = fused.evidence.map(value => boundExcerpt(value, runtime));
    const ids = citations.map(value => value.passageId), lexicalIds = lexical.evidence.map(value => value.passageId);
    const fallbackCitations = unavailable.evidence.map(value => boundExcerpt(value, runtime));
    if (new Set(ids).size !== ids.length || ids.length > 3 ||
        c.hashJson(unavailable.evidence) !== c.hashJson(lexical.evidence) ||
        fused.observation.usage.semanticAdapterCalls !== replayCalls ||
        unavailable.observation.usage.semanticAdapterCalls !== unavailableCalls) refusal();
    const deeperReads = fused.evidence.filter(value => value.nextOffset !== null).map(value =>
      boundExcerpt(runtime.evidence(value.passageId, value.nextOffset), runtime));
    const nativeIds = matches.map(value => value.passageId);
    rows.push({ queryId: query.id, queryInputSha256: proof.inputSha256, ordinal: selected.ordinal,
      resultPin: c.localPin(`private-${operation}-RESULT.json`), nativeScanReceiptSha256: selected.scanReceiptSha256,
      mappedPassageIds: nativeIds, native: rankingMetrics(nativeIds, testCase), lexical: rankingMetrics(lexicalIds, testCase),
      fused: rankingMetrics(ids, testCase), route: fused.observation.route, degradation: fused.observation.degradation,
      replayAdapterCalls: replayCalls, rejectedCandidates: fused.observation.rejectedCandidates,
      dedup: { nativeCitationRows: selected.matches.reduce((n, match) => n + manifest.vectors.find(v => v.id === match.id).citations.length, 0),
        nativeMappedPassages: nativeIds.length, top3LexicalSemanticOverlap: nativeIds.slice(0, 3).filter(id => lexicalIds.slice(0, 3).includes(id)).length,
        uniqueReturnedPassages: ids.length },
      citations, deeperReads, fallback: { scope: 'local-injected-unavailability', adapterCalls: unavailableCalls,
        route: unavailable.observation.route, degradation: unavailable.observation.degradation,
        identicalToLexical: true, citations: fallbackCitations } });
  }
  const gold = rows.filter(row => row.native.targetCount > 0);
  const report = { schema: 'oak.native-quality.compositional-analysis.v1',
    scope: 'native-fixed-query-candidates-replayed-through-local-mapper-and-retrieval',
    bindings: completed.bindings, nativeChainSha256: completed.chainSha256,
    manifestSha256: c.hashJson(manifest), candidateId: x.g.candidateId, sourceRevision: runtime.snapshot.revision,
    inputPinGroups: { nativeChain: completed.pins, runtime: runtime.sourcePins },
    localBounds: { semanticCandidates: 12, returnedPassages: 3, excerptCharacters: 700, extraReadsPerQuery: 3 },
    metrics: { cases: rows.length, goldCases: gold.length, noGoldCases: rows.length - gold.length,
      nativeHitAt3: gold.filter(row => row.native.hitAt3).length, fusedHitAt3: gold.filter(row => row.fused.hitAt3).length,
      lexicalHitAt3: gold.filter(row => row.lexical.hitAt3).length,
      hybridCases: rows.filter(row => row.route === 'hybrid').length,
      nativeCandidateReplayCalls: rows.reduce((n, row) => n + row.replayAdapterCalls, 0) }, rows,
    nativeCalls: 0, networkCalls: 0, credentialReads: 0, modelCalls: 0,
    liveChatRouteProved: false, nativeServingAdmissionProved: false, nativeCacheParityProved: false,
    t11CanonicalFacetFundingParityProved: false, generatedAnswerQualityProved: false,
    supportScope: 'exact-source-excerpts-and-canonical-citations; claim-entailment-and-no-gold-answer-review-pending',
    qualityAccepted: false, servingAccepted: false, publicActivationAuthorized: false, retryAllowed: false };
  verifyAnalysisInputs(c, report.inputPinGroups);
  // Recheck the native chain and source after awaited local composition, before
  // appending one immutable fragment to the existing consolidated record.
  if (c.hashJson(completedQuality(c, cleanup)) !== c.hashJson(completed)) refusal();
  c.writeOnce('ANALYSIS.json', report);
  return report;
}

async function main(args) {
  const [command = 'plan', action] = args, op = await operator(), c = op.contract;
  if (command === 'plan' && args.length <= 1) return c.operatorPlan();
  if (command === 'status' && args.length === 1) return status(op);
  if (command === 'analyze' && args.length === 1) return analyzeNativeQuality(op);
  if (command === 'prepare' && args.length === 2) {
    const input = JSON.parse(readFileSync(resolve(action), 'utf8'));
    return { recorded: await op.prepare.prepare(input), ...status(op) };
  }
  if (command === 'account' && args.length === 2) {
    const pin = beginAccount(op, action);
    return { action, source: c.readArtifact(pin.path), sourcePin: pin, resultCommand: `account-result ${action}` };
  }
  if (command === 'account-result' && args.length === 2) {
    const raw = readFileSync(0); if (raw.length > 12288) refusal();
    op.account.record(action, JSON.parse(raw)); return status(op);
  }
  if (command === 'postupload' && args.length === 2) {
    return { recorded: recordPostupload(op, JSON.parse(readFileSync(resolve(action), 'utf8'))) };
  }
  if (command === 'queries' && args.length === 1) {
    for (const operation of c.SELECTORS) {
      op.invoke.generate(operation); op.invoke.accept(operation);
      const pin = await op.invoke.invoke(operation);
      if (c.readJson(pin.path).outcome !== 'accepted-quality-metadata') return status(op);
    }
    c.stop('finite-quality-scope-consumed'); return status(op);
  }
  refusal();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n'))
    .catch(() => { process.stderr.write('native-semantic-quality-refused\n'); process.exitCode = 1; });
}
