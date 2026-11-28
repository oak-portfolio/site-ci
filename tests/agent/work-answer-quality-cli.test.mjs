import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { argumentsFor, buildPlan, createNativeFactory, nativeAdviceCaseId, readNativeFactory, runWorkAnswerQuality } from '../../scripts/agent/work-answer-quality.mjs';
import { regressionSet, adviceCases } from './evaluation-cases.v1.ts';
const guestId = '00000000-0000-4000-8000-000000000000';
const nativeMetadata = { schema: 'oak.work-answer-quality-native-metadata.v1', endpoint: 'https://oak-rag-setup-owner.owner.workers.dev/',
  ownerScript: 'oak-rag-setup-owner', authoritySha256: '9'.repeat(64), operation: 'advice-public',
  identity: { knowledgeRevision: regressionSet.sourceRevision, revocationGeneration: 1, embeddingConfigId: 'bge-test', indexId: 'sqlite:test' },
  facetId: 'product-interface', publicQuery: adviceCases.productInterface.support.quote,
  principal: { kind: 'guest', hash: createHash('sha256').update(`guest:${guestId}`).digest('base64url') }, guestId };

test('conflicting execution modes refuse in either order before any runner is invoked', () => {
  const modes = ['--plan', '--run', '--wire-check', '--compare-retained'];
  for (const first of modes) for (const second of modes) {
    if (first === second) continue;
    assert.throws(() => argumentsFor([first, second, '--cases', 'K07']), /choose-one-execution-mode/);
  }
});

test('retained comparison refuses model selection and output writes', () => {
  for (const flags of [['--cases', 'K07'], ['--batch', '1'], ['--out', '.local-setup/unwanted']])
    assert.throws(() => argumentsFor(['--compare-retained', ...flags]), /compare-retained-uses-fixed-inputs-and-stdout-only/);
});

test('single explicit modes retain existing plan and bounded run selection', () => {
  assert.deepEqual(argumentsFor([]), { mode: 'plan', batch: null, ids: null, output: null, nativeFactory: null });
  assert.deepEqual(argumentsFor(['--compare-retained']), { mode: 'compare-retained', batch: null, ids: null, output: null, nativeFactory: null });
  assert.deepEqual(argumentsFor(['--run', '--cases', 'K07']), { mode: 'run', batch: null, ids: ['K07'], output: null, nativeFactory: null });
  assert.deepEqual(argumentsFor(['--wire-check']), { mode: 'wire-check', batch: null, ids: null, output: null, nativeFactory: null });
});

test('native factory is opt-in for one versioned advice case and cannot be read in offline modes', () => {
  const path = '.local-setup/nonexistent-private-factory.json';
  for (const mode of ['--plan', '--wire-check', '--compare-retained'])
    assert.throws(() => argumentsFor([mode, '--native-factory', path]), /native-factory-is-run-only/);
  for (const flags of [['--batch', '1'], ['--cases', 'K07'], ['--cases', `${nativeAdviceCaseId},K07`]])
    assert.throws(() => argumentsFor(['--run', ...flags, '--native-factory', path]), /native-factory-requires-one-advice-case/);
  assert.throws(() => argumentsFor(['--run', '--cases', nativeAdviceCaseId, '--native-factory']), /native-factory-requires-one-path/);
  assert.equal(argumentsFor(['--run', '--cases', nativeAdviceCaseId, '--native-factory', path]).nativeFactory, path);
  const advice = buildPlan().cases.find(value => value.id === nativeAdviceCaseId);
  assert.deepEqual(advice.sourceIds, []);
  assert.equal(advice.taskKind, 'advice');
  assert.equal(advice.expectedKind, 'advice');
  assert.equal(advice.targetPassageId, adviceCases.productInterface.support.passageId);
});

test('parent exporter injection refuses offline and non-native selections before metadata, credential or output access', async () => {
  let sends = 0;
  const nativeExporter = { async send() { sends++; throw new Error('must-not-send'); } };
  for (const args of [['--plan'], ['--compare-retained'], ['--wire-check'], ['--run', '--cases', nativeAdviceCaseId],
    ['--run', '--cases', 'K07']])
    await assert.rejects(runWorkAnswerQuality(args, { nativeExporter }), /native-exporter-requires-native-advice-run/);
  assert.equal(sends, 0);
});

test('native metadata loader reads private repo-local regular files and rejects secret fields, extra authority and path escape', () => {
  const local = mkdtempSync(resolve('.local-setup', 'quality-factory-test-')), outside = mkdtempSync(resolve(tmpdir(), 'oak-quality-factory-'));
  const path = resolve(local, 'factory.json');
  const fixture = nativeMetadata;
  const write = value => writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  try {
    write(fixture);
    assert.deepEqual(readNativeFactory(path), fixture);
    chmodSync(path, 0o644);
    assert.throws(() => readNativeFactory(path), /native-factory-must-be-private-owner-file/);
    chmodSync(path, 0o600);
    for (const value of [{ ...fixture, certificate: {} }, { ...fixture, principal: { ...fixture.principal, kind: 'account' } },
      { ...fixture, setupSecret: '7'.repeat(64) }, { ...fixture, sessionSigningKey: 'synthetic-secret-0000000000000000' },
      { ...fixture, guestCookie: 'synthetic-cookie' }, { ...fixture, keychainHelperPath: 'unreviewed-reader' },
      { ...fixture, guestId: '00000000-0000-0000-0000-000000000000' },
      { ...fixture, publicQuery: 'An arbitrary frontend query' }, { ...fixture, endpoint: 'https://unreviewed.invalid/' },
      { ...fixture, identity: { ...fixture.identity, revocationGeneration: 2 } }]) {
      write(value); assert.throws(() => readNativeFactory(path));
    }
    write(fixture);
    symlinkSync(path, resolve(local, 'symlink.json'));
    assert.throws(() => readNativeFactory(resolve(local, 'symlink.json')));
    writeFileSync(resolve(outside, 'factory.json'), JSON.stringify(fixture), { mode: 0o600 });
    assert.throws(() => readNativeFactory(resolve(outside, 'factory.json')), /native-factory-must-be-repo-local/);
    symlinkSync(outside, resolve(local, 'outside'));
    assert.throws(() => readNativeFactory(resolve(local, 'outside/factory.json')), /native-factory-must-be-repo-local/);
  } finally { rmSync(local, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('native runtime signs and verifies the frozen guest in memory before reading a credential through a private pipe', async () => {
  let reads = 0; const bytes = Buffer.from('7'.repeat(64));
  const factory = await createNativeFactory(nativeMetadata, async () => { reads++; return bytes; });
  assert.equal(reads, 1);
  assert.equal(factory.schema, 'oak.work-answer-quality-native.v1');
  assert.deepEqual(factory.principal, nativeMetadata.principal);
  assert.ok(factory.guestCookie.startsWith(`__Host-oak_session=${guestId}.`));
  assert.equal(factory.sessionSigningKey.length, 64);
  assert.equal(factory.setupSecret, '7'.repeat(64));
  assert.ok(bytes.every(value => value === 0));
  assert.equal(Object.hasOwn(factory, 'guestId'), false);
  assert.equal(Object.hasOwn(nativeMetadata, 'setupSecret'), false);
  for (const invalid of [{ ...nativeMetadata, principal: { kind: 'guest', hash: 'v'.repeat(43) } },
    { ...nativeMetadata, setupSecret: '7'.repeat(64) }, { ...nativeMetadata, guestCookie: 'unreviewed' }])
    await assert.rejects(createNativeFactory(invalid, async () => { reads++; return Buffer.from('7'.repeat(64)); }));
  assert.equal(reads, 1);
  const malformed = Buffer.from('bad');
  await assert.rejects(createNativeFactory(nativeMetadata, async () => malformed), /native-setup-credential-unavailable/);
  assert.ok(malformed.every(value => value === 0));
});
