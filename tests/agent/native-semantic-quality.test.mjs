import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { QualityRecords, executeNativeQuality, analyzeNativeQuality } from '../../scripts/agent/native-semantic-quality.mjs';

test('operational records retain old pins, reject duplicate claims and detect changed evidence', () => {
  const directory=mkdtempSync(join(tmpdir(),'oak-quality-records-'));
  try {
    const path=join(directory,'result.json'),records=new QualityRecords(path);
    records.add('input.json',{mode:'controlled-test',validFrom:1});
    const pin=records.pin('input.json','result.json');
    records.add('operation-intent.json',{consumed:true,retryAllowed:false});
    assert.deepEqual(records.pin('input.json','result.json'),pin);
    assert.throws(()=>{records.read().entries['input.json'].value.validFrom=3;});
    assert.throws(()=>records.add('operation-intent.json',{consumed:true}));
    assert.throws(()=>records.add('../escape.json',{}));
    assert.equal(readdirSync(directory).length,1);
    const data=JSON.parse(readFileSync(path));
    data.entries['input.json'].value.validFrom=2;
    writeFileSync(path,JSON.stringify(data));
    assert.throws(()=>new QualityRecords(path).get('input.json'));
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

function controlledOperator(unknown=false) {
  const events=[],values=new Map(),claims=new Set();
  const SELECTORS=['install',...Array.from({length:24},(_,n)=>`quality-controlled-${n}`),'status','invalidate'];
  const contract={
    SELECTORS,present:name=>values.has(name),localJson:name=>values.get(name),readJson:path=>values.get(path),
    readArtifact:path=>path,verifyPins:()=>{},requirePrepared:()=>({}),bindings:()=>({controlled:true}),
    writeOnce(name,value){assert.ok(!values.has(name));values.set(name,value);return {path:name};},
    stop(reason){if(!values.has('STOP.json'))values.set('STOP.json',{reason,retryAllowed:false});},
    accountExposure:()=>({known:0,held:0,maximum:7}),
  };
  const account={
    generate(action){events.push(`generate:${action}`);return {path:action};},
    accept(action){events.push(`verify:${action}`);},
    intent(action){assert.ok(!claims.has(action));claims.add(action);values.set(`account-${action}-INTENT.json`,{consumed:true});events.push(`claim:${action}`);},
    dispatch(action){assert.ok(claims.has(action));events.push(`dispatch:${action}`);},
    record(action,result){events.push(`record:${action}`);values.set(`account-${action}-RESULT.json`,result);},
  };
  const invoke={
    generate(operation){events.push(`request:${operation}`);},accept(){},
    async invoke(operation){events.push(`native:${operation}`);const name=`private-${operation}-RESULT.json`;
      values.set(`private-${operation}-INTENT.json`,{consumed:true});
      values.set(name,{operation,outcome:unknown&&operation==='quality-controlled-0'?'unknown':'accepted-quality-metadata',selected:{controlled:true},timings:{}});
      return {path:name};},
  };
  const adapter={
    async account(action){assert.ok(claims.has(action));events.push(`adapter:${action}`);return {outcomeKnown:true,state:action==='off'?'independent-OFF':action};},
    async postupload(){events.push('actual-proof-adapter');return {proofPin:{path:'controlled-browser-proof'}};},
  };
  return {op:{contract,prepare:{async prepare(){values.set('PREPARED.json',{});}},account,invoke},adapter,events};
}

test('controlled execution follows 27 native selectors, claims before account dispatch and finishes OFF', async () => {
  const {op,adapter,events}=controlledOperator();
  const result=await executeNativeQuality({controlled:true},adapter,op);
  assert.equal(result.nativeQueries,24);
  assert.equal(events.filter(e=>e.startsWith('native:')).length,27);
  assert.equal(result.endpointOffIndependentlyVerified,true);
  assert.equal(result.qualityAccepted,false);
  assert.equal(result.servingAccepted,false);
  assert.equal(result.stopped,true);
  for(const action of ['upload','module','enable','disable','off'])
    assert.ok(events.indexOf(`claim:${action}`)<events.indexOf(`adapter:${action}`));
});

test('an unknown controlled model operation is never replayed and cleanup still runs', async () => {
  const {op,adapter,events}=controlledOperator(true);
  const result=await executeNativeQuality({controlled:true},adapter,op);
  assert.equal(events.filter(e=>e.startsWith('native:')).length,2);
  assert.equal(result.nativeQueries,0);assert.equal(result.unknownQueries,1);
  assert.equal(result.failure,'refused-or-unknown');
  assert.equal(result.endpointOffIndependentlyVerified,true);
  assert.equal(result.historicalHoldsRetained,true);
});

const helper=resolve('.local-setup/cp175-native-quality-successor-r1/contract.mjs');
test('current local plan reuses accepted CP175 facts without writes and preserves bounded native admission',
  {skip:!existsSync(helper)},async()=>{
    const c=await import(helper),{operatorPlan,derivePlan,deriveGrant}=c;
    const resultPath=resolve('.local-setup/cp175-native-quality-successor-r1/OPERATOR-RESULT.json');
    const before=existsSync(resultPath)?readFileSync(resultPath):null;
    const plan=operatorPlan();
    assert.equal(plan.mode,'plan');assert.equal(plan.writes,0);assert.equal(plan.compilerRuns,0);
    assert.equal(plan.credentialReads,0);assert.equal(plan.networkCalls,0);assert.equal(plan.modelCalls,0);
    assert.equal(plan.quality.earliestUtcDate,'2026-10-11');assert.equal(plan.quality.wholeReadAdmissionIncrement,4094808);
    assert.equal(plan.quality.dailyReadRows,5000000);assert.equal(plan.admission.limitBytes,64000000);
    assert.equal(plan.admission.minimumRequiredBytes,63545969);assert.equal(plan.admission.storageFits,true);
    assert.equal(plan.admission.remainingBytes,5521408);assert.equal(plan.admission.queryBytes,229376);
    assert.equal(plan.admission.maximumRequiredBytes,63775345);assert.equal(plan.admission.maximumMetadataBytes,1548288);
    assert.equal(plan.publication.pointerPostInvalidationVerified,false);
    assert.deepEqual(existsSync(resultPath)?readFileSync(resultPath):null,before);
    const d=derivePlan(),at=Date.parse('2026-10-11T00:00:00Z'),recordedAt=new Date(at).toISOString();
    // Pure controlled metadata only. This fixture never initializes or invokes a native grant.
    const input={schema:'oak.native-quality.operator-input.v1',window:{reviewedAt:at,validFrom:at,expiresAt:at+5400000,cleanupExpiresAt:at+86400000,costExpiresAt:at+5400000},
      qualification:{freePlan:{recordedAt,accountId:d.a.plan.accountId??'4984669b264c296b5f6dfa34d1dfc06c',workersPlan:'Free',upgradeClicked:false},
        noPaid:{recordedAt,accountId:'4984669b264c296b5f6dfa34d1dfc06c',model:'@cf/baai/bge-small-en-v1.5',paidFallback:false,freeExcess:'operation-refusal',providerRemainingBalance:null,controlledMilliNeuronsPerToken:2,controlledRequestMilliNeurons:0},
        retry:{recordedAt,jsAutomaticRetries:0,durableClaimBeforeAi:true,rpcMaxAttempts:0},
        bindings:{recordedAt,accountId:'4984669b264c296b5f6dfa34d1dfc06c',ownerScript:'oak-rag-setup-owner',namespaceId:'f3d5ce0d3e0c4834a26fd782118945fa',AI:'ai',retryMaxAttempts:0,namespaceRetained:true,newMigration:false},
        ownCaller:{recordedAt,accountId:'4984669b264c296b5f6dfa34d1dfc06c',ownerScript:'oak-rag-setup-owner',namespaceId:'f3d5ce0d3e0c4834a26fd782118945fa',actorName:'4984669b264c296b5f6dfa34d1dfc06c',actorIdentityCheckedAgainstIdFromName:true,privateSelectorAuthorizationRequired:true,wholeRunAtomicAdmissionRequired:true,historicalHoldsRetained:true}},preupload:{proofPin:null,screenshotPins:[]}};
    assert.equal(deriveGrant(input,d).g.maxModelCalls,24);
    for(const mutate of [
      v=>{for(const key of ['reviewedAt','validFrom','expiresAt','cleanupExpiresAt','costExpiresAt'])v.window[key]-=86400000;for(const row of Object.values(v.qualification))row.recordedAt='2026-10-10T00:00:00Z';},
      v=>{v.window.expiresAt++;v.window.costExpiresAt++;},
      v=>{v.window.cleanupExpiresAt++;},
      v=>{v.qualification.freePlan.recordedAt='2026-10-10T00:00:00Z';},
      v=>{v.qualification.noPaid.paidFallback=true;},
    ]){const changed=structuredClone(input);mutate(changed);assert.throws(()=>deriveGrant(changed,d));}
    const {cleanupAuthority,validateCleanupAuthority,validateConsumedCleanup}=await import(resolve('.local-setup/cp175-native-quality-successor-r1/cleanup.mjs'));
    const digest='a'.repeat(64),planPin={path:c.artifactPath('OPERATOR-PLAN.json'),bytes:1,sha256:digest};
    const accepted={...d,planPin,reviewPin:planPin},x={...deriveGrant(input,d),helperPins:d.plan.helperPins};
    const b={grantSha256:digest,sourceIdentitySha256:digest,packetSha256:digest,helperSha256:c.hash(d.plan.helperPins),
      qualificationSha256:digest,executionPlanSha256:digest,operationalPlanSha256:digest};
    const authority=cleanupAuthority(x,b,{sha256:digest,bytes:1},{sha256:digest},accepted);
    assert.deepEqual(validateCleanupAuthority(authority),authority);
    const authorityPin={path:c.artifactPath('CLEANUP-AUTHORITY.json'),bytes:1,sha256:digest};
    const uploadIntentPin={path:c.artifactPath('account-upload-INTENT.json'),bytes:1,sha256:digest};
    const evidence=['PREPARED.json','ACTION-upload.js','EVIDENCE-preupload.json','CLEANUP-AUTHORITY.json']
      .map(name=>({path:c.artifactPath(name),bytes:1,sha256:digest}));
    const uploadStage=c.plannedStageManifest('account-upload',b,evidence,accepted);
    const uploadIntent={schema:'oak.sqlite-fresh-quality-account-intent.cp175-quality-postmerge-r1-candidate',action:'upload',
      consumed:true,reservedAccountCalls:1,retryAllowed:false,modelCalls:0,credentialReads:0,servingAccepted:false,bindings:b,
      cleanupAuthorityPin:authorityPin,cleanupReviewPin:authorityPin,uploadMetadataSha256:digest,sourcePin:evidence[1],
      reviewPin:{path:c.artifactPath('STAGE-account-upload.json'),bytes:1,sha256:digest}};
    const context={authorityPin,reviewPin:authorityPin,uploadIntentPin,now:input.window.expiresAt+1,accepted};
    assert.equal(validateConsumedCleanup(authority,authority,uploadIntent,uploadStage,context).grantSha256,digest);
    assert.throws(()=>validateConsumedCleanup(authority,authority,uploadIntent,uploadStage,{...context,now:input.window.cleanupExpiresAt}));
  });

// Native-shaped records here are controlled unit fixtures, never native proof.
// The real operator supplies the existing strict contract validators. These
// fixtures exercise the analysis boundary with the actual mapper and retriever.
async function completedAnalysisFixture(options = {}) {
  const actual = await import(helper), cleanup = await import(resolve('.local-setup/cp175-native-quality-successor-r1/cleanup.mjs'));
  const directory = mkdtempSync(join(tmpdir(), 'oak-quality-analysis-'));
  const records = new QualityRecords(join(directory, 'result.json'));
  const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
  const snapshot = JSON.parse(readFileSync(resolve('src/data/generated/knowledgeSnapshot.json')));
  const document = snapshot.documents.find(value => value.id === 'work:ecosmartloop');
  const passage = document.passages.find(value => options.longPassage ? value.text.length > 700 : value.text.length > 100 && value.text.length < 600);
  const citation = { passageId: passage.id, offset: 0, contentSha256: digest(passage.text) };
  const identity = { knowledgeRevision: snapshot.revision, revocationGeneration: snapshot.revocationGeneration,
    embeddingConfigId: 'controlled-analysis', indexId: 'controlled-analysis' };
  const manifest = { identity, vectors: ['a', 'b'].map(id => ({ id, citations: [citation] })) };
  const queries = Array.from({ length: 24 }, (_, n) => ({ id: `controlled-${n}`, text: 'What did he do?' }));
  const cases = queries.map((query, n) => ({ ...query, query: query.text,
    relevantPassageIds: n < 15 ? [passage.id] : [], misleadingPassageIds: n < 15 ? [] : [passage.id] }));
  const SELECTORS = ['install', ...queries.map(query => `quality-${query.id}`), 'status', 'invalidate'];
  const localPin = name => records.pin(name, actual.RESULT_PATH);
  const pin = path => path.startsWith(actual.RESULT_PATH + '#') ? localPin(path.split('#')[1]) :
    { path, bytes: readFileSync(resolve(path)).length, sha256: digest(readFileSync(resolve(path))) };
  const helperPins = actual.HELPERS.map(name => pin(actual.LOCAL + name));
  const plan = { helperPins, checkerPin: helperPins[0],
    stages: ['upload', 'disable', 'off'].map(action => ({ action: `account-${action}`, controlledUnitFixture: true })) };
  records.add('OPERATOR-PLAN.json', plan);
  const candidateId = digest('controlled-candidate'), grantSha256 = digest('controlled-grant');
  const bindings = { grantSha256, sourceIdentitySha256: digest('controlled-source'), packetSha256: digest('controlled-packet'),
    helperSha256: actual.hashJson(helperPins), qualificationSha256: digest('controlled-qualification'),
    executionPlanSha256: localPin('OPERATOR-PLAN.json').sha256, operationalPlanSha256: localPin('OPERATOR-PLAN.json').sha256 };
  const x = { g: { proofLane: 'native', candidateId }, grantSha256, helperPins,
    // Analysis must remain readable after this historical dispatch window.
    w: { validFrom: 1, expiresAt: 5_400_001, cleanupExpiresAt: 86_400_001 },
    prepared: { workerSha256: digest('controlled-worker'), workerBytes: 1 }, publication: {},
    accepted: { plan, planPin: localPin('OPERATOR-PLAN.json'), reviewPin: localPin('OPERATOR-PLAN.json'), packet: { cases } },
    assembly: { plan: { manifest }, source: { snapshot, configuration: { queryProcessing: { prefix: '' } } },
      rawQueries: queries, queries: queries.map(query => ({ id: query.id, inputSha256: digest(query.text) })) } };
  const c = { SELECTORS, requirePrepared: () => x, bindings: () => bindings, present: name => records.has(name),
    localJson: name => records.get(name), localPin, pin,
    readJson: path => records.get(path.split('#')[1]), readArtifact: path => readFileSync(resolve(path), 'utf8'),
    hashJson: digest, pinUnion: actual.pinUnion,
    verifyPins(pins) { for (const value of actual.pinUnion(pins)) assert.deepEqual(pin(value.path), value); },
    writeOnce(name, value) { records.add(name, value); return localPin(name); },
    initialHistory: () => ({ chainSha256: grantSha256, pins: [] }),
    validateHistoricalRequest(request, operation, ordinal, _, supplied, history) {
      assert.equal(request.operation, operation); assert.equal(request.ordinal, ordinal);
      assert.deepEqual(supplied, bindings); assert.equal(request.previousChainSha256, history.chainSha256);
    },
    requirePlannedStage(name, suppliedBindings, evidencePins, accepted) {
      if (name.startsWith('account-')) actual.validatePlannedStage(records.get(`STAGE-${name}.json`), name, suppliedBindings, evidencePins, accepted);
      return localPin(`STAGE-${name}.json`);
    },
    validateAcceptedDiagnostic(diagnostic) { assert.equal(diagnostic.nativeFetchEntered, true); },
    validateSelected(selected, _grant, _publication, assembly, operation) {
      const index = queries.findIndex(query => `quality-${query.id}` === operation);
      assert.equal(selected.queryId, queries[index].id); assert.equal(selected.ordinal, 25 + index);
      assert.equal(selected.queryInputSha256, assembly.queries[index].inputSha256);
      assert.equal(selected.candidateId, candidateId);
    },
    advanceHistory(ordinal, intent, result, _pin, supplied, actualBindings, history) {
      assert.equal(result.outcome, 'accepted-quality-metadata'); assert.equal(result.outcomeKnown, true);
      assert.deepEqual(result.bindings, actualBindings); assert.equal(result.previousChainSha256, history.chainSha256);
      if (ordinal > 0 && ordinal < 25) c.validateSelected(result.selected, supplied.g, supplied.publication, supplied.assembly, SELECTORS[ordinal]);
      return { ...history, chainSha256: digest([history.chainSha256, result.selected]) };
    } };
  let history = c.initialHistory();
  for (const [ordinal, operation] of SELECTORS.entries()) {
    const requestName = `REQUEST-${operation}.json`, stageName = `STAGE-private-${operation}.json`;
    records.add(requestName, { operation, ordinal, previousChainSha256: history.chainSha256, evidencePins: [] });
    records.add(stageName, { controlledUnitFixture: true });
    records.add(`private-${operation}-INTENT.json`, { requestPin: localPin(requestName), reviewPin: localPin(stageName) });
    records.add(`private-${operation}-DIAGNOSTIC.json`, { nativeFetchEntered: true });
    const query = queries[ordinal - 1];
    const selected = query ? { queryId: query.id, ordinal: 24 + ordinal, queryInputSha256: digest(query.text), candidateId,
      scanReceiptSha256: digest(operation), matches: [{ id: 'a', score: 1 }, { id: 'b', score: 0.9 }],
      citationIds: [passage.id], citationsSha256: digest([citation]) } : {};
    const result = { outcome: 'accepted-quality-metadata', outcomeKnown: true, bindings,
      previousChainSha256: history.chainSha256, diagnosticPin: localPin(`private-${operation}-DIAGNOSTIC.json`), selected };
    if (options.mutateResult) options.mutateResult(result, ordinal);
    if (operation !== options.omitOperation) records.add(`private-${operation}-RESULT.json`, result);
    history = { ...history, chainSha256: digest([history.chainSha256, selected]) };
  }
  records.add('STOP.json', { consumed: true });
  const addClosure = (name, value) => {
    const recorded = structuredClone(value); options.mutateClosure?.(name, recorded); records.add(name, recorded);
  };
  addClosure('PREPARED.json', x.prepared); addClosure('UPLOAD-METADATA.json', { controlledUnitFixture: true });
  const authority = cleanup.cleanupAuthority(x, bindings, { sha256: x.prepared.workerSha256, bytes: x.prepared.workerBytes },
    localPin('UPLOAD-METADATA.json'), x.accepted);
  addClosure('CLEANUP-AUTHORITY.json', authority);
  records.add('ACTION-upload.js', 'controlled-unit-source-never-dispatched');
  addClosure('EVIDENCE-preupload.json', { controlledUnitFixture: true });
  const authorityPin = localPin('CLEANUP-AUTHORITY.json');
  const uploadEvidence = ['PREPARED.json', 'ACTION-upload.js', 'EVIDENCE-preupload.json', 'CLEANUP-AUTHORITY.json'].map(localPin);
  const uploadStage = actual.plannedStageManifest('account-upload', bindings, uploadEvidence, x.accepted);
  addClosure('STAGE-account-upload.json', uploadStage);
  const upload = { schema: 'oak.sqlite-fresh-quality-account-intent.cp175-quality-postmerge-r1-candidate', action: 'upload',
    consumed: true, reservedAccountCalls: 1, retryAllowed: false, modelCalls: 0, credentialReads: 0, servingAccepted: false, bindings,
    cleanupAuthorityPin: authorityPin, cleanupReviewPin: authorityPin, uploadMetadataSha256: authority.uploadMetadataSha256,
    sourcePin: localPin('ACTION-upload.js'), reviewPin: localPin('STAGE-account-upload.json') };
  addClosure('account-upload-INTENT.json', upload);
  const uploadIntentPin = localPin('account-upload-INTENT.json');
  const cleanupBindings = { ...bindings, cleanupAuthoritySha256: authorityPin.sha256, uploadIntentSha256: uploadIntentPin.sha256 };
  for (const action of ['disable', 'off']) {
    records.add(`ACTION-${action}.js`, 'controlled-unit-source-never-dispatched');
    const evidencePins = [localPin(`ACTION-${action}.js`), authorityPin, authorityPin, uploadIntentPin, ...authority.executorHelperPins,
      ...(action === 'off' ? [localPin('account-disable-INTENT.json')] : [])];
    addClosure(`STAGE-account-${action}.json`, actual.plannedStageManifest(`account-${action}`, cleanupBindings, evidencePins, x.accepted));
    addClosure(`account-${action}-INTENT.json`, { ...upload, action, bindings: cleanupBindings,
      sourcePin: localPin(`ACTION-${action}.js`), reviewPin: localPin(`STAGE-account-${action}.json`), uploadIntentPin });
    addClosure(`account-${action}-RESULT.json`, {
      schema: 'oak.sqlite-fresh-quality-account-result.cp175-quality-postmerge-r1-candidate', action,
      accountId: authority.accountId, ownerScript: authority.ownerScript, namespaceId: authority.namespaceId, grantSha256,
      workerSha256: x.prepared.workerSha256, accountCalls: 1, cleanupAuthoritySha256: authorityPin.sha256,
      uploadIntentSha256: uploadIntentPin.sha256, uploadMetadataSha256: authority.uploadMetadataSha256,
      retryAllowed: false, modelCalls: 0, providerCalls: 0, credentialsPersisted: false, rawSourceReturned: false,
      rawSourcePersisted: false, servingAccepted: false, retirementAuthorized: false, namespaceRetained: true, holdsReset: false,
      outcomeKnown: true, intentSha256: localPin(`account-${action}-INTENT.json`).sha256,
      ...(action === 'off' ? { state: 'independent-OFF', disabled: true, previewsEnabled: false, independentReadback: true } :
        { state: 'disable-acknowledged', disableRequested: true, independentOffPending: true }),
    });
  }
  return { op: { contract: c, cleanup }, records, x, passage, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}

test('native analysis composes exact candidates through real mapping/fusion and retains explicit evidence boundaries', { skip: !existsSync(helper) }, async context => {
  const fixture = await completedAnalysisFixture({ longPassage: true });
  try {
    const report = await analyzeNativeQuality(fixture.op);
    assert.deepEqual(report.metrics, { cases: 24, goldCases: 15, noGoldCases: 9, nativeHitAt3: 15,
      fusedHitAt3: 15, lexicalHitAt3: 0, hybridCases: 24, nativeCandidateReplayCalls: 24 });
    for (const row of report.rows) {
      assert.equal(row.route, 'hybrid'); assert.equal(row.replayAdapterCalls, 1);
      assert.equal(row.dedup.nativeCitationRows, 2); assert.equal(row.dedup.nativeMappedPassages, 1);
      assert.equal(row.dedup.uniqueReturnedPassages, 1);
      assert.equal(row.citations[0].url, fixture.passage.citationUrl);
      assert.equal(row.citations[0].passageId, fixture.passage.id);
      assert.equal(row.citations[0].end, 700); assert.equal(row.deeperReads[0].offset, 700);
      assert.equal(row.deeperReads[0].end, fixture.passage.text.length);
      assert.equal(row.deeperReads[0].url, fixture.passage.citationUrl);
      assert.equal(row.fallback.identicalToLexical, true); assert.equal(row.fallback.degradation, 'unavailable');
      assert.equal(row.fallback.adapterCalls, 1); assert.deepEqual(row.fallback.citations, []);
    }
    assert.equal(report.rows[15].fused.hitAt3, null);
    assert.deepEqual(report.rows[15].fused.hardNegativeIds, [fixture.passage.id]);
    const allPins = Object.values(report.inputPinGroups).flat();
    assert.ok(new Set(allPins.map(pin => pin.path)).size > 256);
    assert.throws(() => fixture.op.contract.pinUnion(allPins), /refused/);
    for (const pins of Object.values(report.inputPinGroups)) assert.deepEqual(fixture.op.contract.pinUnion(pins), pins);
    for (const operation of fixture.op.contract.SELECTORS) for (const name of [
      `private-${operation}-INTENT.json`, `private-${operation}-RESULT.json`, `REQUEST-${operation}.json`,
      `STAGE-private-${operation}.json`, `private-${operation}-DIAGNOSTIC.json`])
      assert.ok(report.inputPinGroups.nativeChain.some(pin => pin.path.endsWith('#' + name)));
    context.diagnostic(`retained native pins: ${report.inputPinGroups.nativeChain.length}; runtime pins: ${report.inputPinGroups.runtime.length}`);
    for (const name of ['CLEANUP-AUTHORITY.json', 'account-upload-INTENT.json', 'STAGE-account-upload.json',
      'account-disable-INTENT.json', 'STAGE-account-disable.json', 'account-disable-RESULT.json',
      'account-off-INTENT.json', 'STAGE-account-off.json', 'account-off-RESULT.json'])
      assert.ok(allPins.some(pin => pin.path.endsWith('#' + name)));
    for (const field of ['nativeCalls', 'networkCalls', 'credentialReads', 'modelCalls']) assert.equal(report[field], 0);
    for (const field of ['liveChatRouteProved', 'nativeServingAdmissionProved', 'nativeCacheParityProved',
      't11CanonicalFacetFundingParityProved', 'generatedAnswerQualityProved', 'qualityAccepted', 'servingAccepted', 'publicActivationAuthorized']) assert.equal(report[field], false);
    assert.deepEqual(fixture.records.get('ANALYSIS.json'), report);
    assert.deepEqual(await analyzeNativeQuality(fixture.op), report);
  } finally { fixture.dispose(); }
});

test('native analysis refuses incomplete, unknown, foreign-candidate and mismatched-query evidence without recording a report', { skip: !existsSync(helper) }, async () => {
  for (const options of [
    { omitOperation: 'invalidate' },
    { mutateResult(result, ordinal) { if (ordinal === 1) result.outcome = 'unknown'; } },
    { mutateResult(result, ordinal) { if (ordinal === 1) result.selected.candidateId = 'foreign'; } },
    { mutateResult(result, ordinal) { if (ordinal === 1) result.selected.queryInputSha256 = 'foreign'; } },
    { mutateResult(result, ordinal) { if (ordinal === 1) result.bindings = { foreign: true }; } },
  ]) {
    const fixture = await completedAnalysisFixture(options);
    try {
      await assert.rejects(analyzeNativeQuality(fixture.op));
      assert.equal(fixture.records.has('ANALYSIS.json'), false);
    } finally { fixture.dispose(); }
  }
});

test('native analysis refuses a changed frozen query and current source revision before claiming compositional evidence', { skip: !existsSync(helper) }, async () => {
  for (const mutate of [
    fixture => { fixture.x.accepted.packet.cases[0].query = 'A different public query'; },
    fixture => { fixture.x.assembly.source.snapshot.revision = `oak-${'f'.repeat(64)}`; },
  ]) {
    const fixture = await completedAnalysisFixture(); mutate(fixture);
    try {
      await assert.rejects(analyzeNativeQuality(fixture.op));
      assert.equal(fixture.records.has('ANALYSIS.json'), false);
    } finally { fixture.dispose(); }
  }
});

test('native analysis refuses foreign or unconsumed cleanup authority, stages, intents and OFF projections', { skip: !existsSync(helper) }, async () => {
  for (const [name, field, value] of [
    ['CLEANUP-AUTHORITY.json', 'namespaceId', 'foreign'],
    ['CLEANUP-AUTHORITY.json', 'workerSha256', 'f'.repeat(64)],
    ['STAGE-account-upload.json', 'mechanicalVerification', false],
    ['account-upload-INTENT.json', 'consumed', false],
    ['STAGE-account-off.json', 'dispatchAuthorized', true],
    ['account-disable-INTENT.json', 'consumed', false],
    ['account-off-INTENT.json', 'reservedAccountCalls', 0],
    ['account-off-INTENT.json', 'uploadMetadataSha256', 'foreign'],
    ['account-disable-RESULT.json', 'outcomeKnown', false],
    ['account-off-RESULT.json', 'accountId', 'foreign'],
    ['account-off-RESULT.json', 'namespaceId', 'foreign'],
    ['account-off-RESULT.json', 'cleanupAuthoritySha256', 'foreign'],
    ['account-off-RESULT.json', 'intentSha256', 'foreign'],
  ]) {
    const fixture = await completedAnalysisFixture({ mutateClosure(recordName, record) { if (recordName === name) record[field] = value; } });
    try {
      await assert.rejects(analyzeNativeQuality(fixture.op));
      assert.equal(fixture.records.has('ANALYSIS.json'), false);
    } finally { fixture.dispose(); }
  }
});

test('native analysis bundles and pins actual validation dependencies and refuses their drift on report readback', { skip: !existsSync(helper) }, async () => {
  const fixture = await completedAnalysisFixture();
  try {
    const report = await analyzeNativeQuality(fixture.op);
    const dependencyPin = report.inputPinGroups.runtime.find(pin => /\/node_modules\/zod\/.+\/schemas\.[cm]?js$/.test(pin.path));
    assert.ok(dependencyPin, 'the runtime Zod validator bytes must be bundled and pinned');
    assert.ok(report.inputPinGroups.runtime.filter(pin => pin.path.includes('/node_modules/zod/')).length > 1);
    const originalPin = fixture.op.contract.pin, originalVerify = fixture.op.contract.verifyPins;
    fixture.op.contract.verifyPins = pins => {
      for (const pin of fixture.op.contract.pinUnion(pins)) assert.deepEqual(pin.path === dependencyPin.path ?
        { ...originalPin(pin.path), sha256: 'f'.repeat(64) } : originalPin(pin.path), pin);
    };
    await assert.rejects(analyzeNativeQuality(fixture.op));
    fixture.op.contract.verifyPins = originalVerify;
    const originalJson = fixture.op.contract.localJson;
    fixture.op.contract.localJson = name => {
      const value = originalJson(name);
      if (name === 'ANALYSIS.json') value.inputPinGroups.runtime.push({ ...value.inputPinGroups.nativeChain[0], sha256: 'e'.repeat(64) });
      return value;
    };
    await assert.rejects(analyzeNativeQuality(fixture.op), /native-semantic-quality-refused/);
  } finally { fixture.dispose(); }
});
