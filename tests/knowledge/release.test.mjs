import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { captureSource, digest, parityRoot, publicSnapshotPath, verifyRelease, verifyBuildStable } from '../../scripts/knowledge/release-boundary.mjs';
import { createPublicSnapshot } from '../../scripts/knowledge/snapshot.mjs';
import { selectEligibleDocuments } from '../../src/lib/knowledge/eligibility.ts';
import { assertPublishableRender } from '../../scripts/knowledge/publication.mjs';

test('safe snapshot projects reviewed evidence and cannot publish nested review or denied attribution copies', () => {
  const passage = { id: 'fixture:passage-001', sectionId: 'fixture:section-001', kind: 'narrative',
    text: 'I contributed to the team prototype.', headingPath: ['Prototype'], citationUrl: 'https://steveoak.com/work/fixture#prototype', disclosure: 'public', conflict: null };
  const doc = { id: 'fixture', kind: 'work', title: 'Fixture', canonicalUrl: 'https://steveoak.com/work/fixture', sourceFingerprint: 'exact',
    disclosure: 'public', decision: { state: 'historical-baseline', sourceFingerprint: 'exact', basis: 'INTERNAL_REVIEW_CANARY' },
    dates: { published: '2025-12-15', updated: null, period: 'September to December 2025', inspected: 'INTERNAL_INSPECTION_CANARY', factualReview: 'INTERNAL_REVIEW_CANARY' },
    ownership: { author: 'Steve Oak', subject: 'Steve Oak / Okkar Kyaw', role: 'Product contributor',
      collaborators: ['Internal approval guidance CANARY'], publicCollaborators: ['Reviewed classifier collaborator'],
      contributions: [passage.text], qualifiers: ['INTERNAL_QUALIFIER_CANARY'], publicQualifiers: ['Team-built prototype; no adoption outcome is claimed.'] }, passages: [passage],
    sourceFiles: ['/Users/internal-source'], gaps: ['INTERNAL_GAP_CANARY'] };
  const contaminated = { ...doc, id: 'contaminated', ownership: { ...doc.ownership, role: 'PRIVATE_CANARY' },
    passages: [...doc.passages, { ...passage, id: 'private', disclosure: 'private', text: 'PRIVATE_CANARY' }] };
  const snapshot = createPublicSnapshot({ eligibleDocuments: selectEligibleDocuments([doc, contaminated]), policyFingerprint: 'policy-hash', policyVersion: 'policy-v1' }, 'source-hash');
  assert.equal(snapshot.documents.length, 1);
  assert.deepEqual(snapshot.documents[0].attribution.contributionPassageIds, [passage.id]);
  assert.equal(snapshot.schema, 'oak.public-knowledge.v2');
  assert.equal(snapshot.documents[0].attribution.subject, 'Steve Oak / Okkar Kyaw');
  assert.deepEqual(snapshot.documents[0].attribution.qualifiers, ['Team-built prototype; no adoption outcome is claimed.']);
  assert.equal(snapshot.documents[0].dates.published, '2025-12-15');
  assert.deepEqual(snapshot.documents[0].attribution.collaborators, ['Reviewed classifier collaborator']);
  assert.doesNotMatch(JSON.stringify(snapshot), /CANARY|Classifier team|\/Users\/|inspected|factualReview|sourceFiles|decision|gaps/);
});

test('release guard pins source, policy and immutable snapshot and confines unreviewed previews', async () => {
  const fixtures = join(process.cwd(), parityRoot, 'fixtures');
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(join(fixtures, 'guard-'));
  const save = async (path, bytes) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), bytes);
  };
  const saveJson = (path, value) => save(path, `${JSON.stringify(value, null, 2)}\n`);
  try {
    for (const path of ['src/source.mdx', 'public/asset.txt', 'scripts/compiler.mjs', 'astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json',
      'knowledge/review.json', 'knowledge/external-candidates.json', 'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json',
      'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json']) await save(path, '{}');
    const policy = { version: 'fixture-policy' };
    await saveJson('knowledge/policy.json', policy);
    const source = await captureSource(root);
    const content = { schema: 'oak.public-knowledge.v1', sourceIdentity: source.sourceIdentity, policyIdentity: digest(policy), policyVersion: policy.version, documents: [] };
    const snapshot = { ...content, revision: `oak-${digest(content)}` };
    const bytes = `${JSON.stringify(snapshot, null, 2)}\n`;
    await save(publicSnapshotPath, bytes);
    const manifest = { schema: 'oak.reviewed-release.v1', revision: snapshot.revision, ...source, policyIdentity: digest(policy), snapshotHash: digest(bytes) };
    await saveJson(`knowledge/releases/${snapshot.revision}/manifest.json`, manifest);
    await save(`knowledge/releases/${snapshot.revision}/snapshot.json`, bytes);
    await saveJson('knowledge/active.json', { schema: 'oak.active-knowledge.v1', revision: snapshot.revision, manifestHash: digest(manifest) });
    const verified = await verifyRelease({ root, outputDirectory: join(root, 'dist') });
    await save('src/new.mdx', 'PRIVATE_CONTACT_METADATA_CANARY');
    await assert.rejects(verifyRelease({ root, outputDirectory: join(root, 'dist') }), /Public build rejected/);
    await assert.rejects(verifyBuildStable(root, verified), /changed during render/);
    const changed = await captureSource(root), previewPlanPath = `${parityRoot}/plans/fixture.json`, outputDirectory = `${parityRoot}/previews/fixture`;
    await saveJson(previewPlanPath, { schema: 'oak.isolated-preview.v1', sourceIdentity: changed.sourceIdentity, snapshotHash: digest(bytes), outputDirectory });
    assert.equal((await verifyRelease({ root, outputDirectory, previewPlanPath })).mode, 'preview');
    await assert.rejects(verifyRelease({ root, outputDirectory: 'dist', previewPlanPath }), /isolated/);
    await mkdir(join(root, 'dist'));
    await save('dist/index.html', '<html><p data-knowledge-disclosure="private">PRIVATE_CONTACT_METADATA_CANARY</p></html>');
    await assert.rejects(assertPublishableRender({ root, outputDirectory: 'dist' }), /Activation rejected/);
    await assert.rejects(assertPublishableRender({ root, outputDirectory: join(root, 'dist') }), /Activation rejected/);
    await assert.rejects(assertPublishableRender({ root, outputDirectory: join(root, '..', 'outside') }), /inside the workspace/);
    await save('dist/index.html', '<html><p>Public text.</p><meta content="PRIVATE_CONTACT_METADATA_CANARY"></html>');
    await assert.rejects(assertPublishableRender({ root, outputDirectory: 'dist', deniedText: ['PRIVATE_CONTACT_METADATA_CANARY'] }), /Activation rejected/);
    await mkdir(join(root, parityRoot, 'previews'), { recursive: true });
    await symlink(join(root, 'dist'), join(root, outputDirectory));
    await assert.rejects(verifyRelease({ root, outputDirectory, previewPlanPath }), /symlink/);
    await rm(join(root, 'src/new.mdx'));
    await save(publicSnapshotPath, bytes.replace('fixture-policy', 'altered-policy'));
    await assert.rejects(verifyRelease({ root, outputDirectory: 'dist' }), /Public build rejected/);
    await save(publicSnapshotPath, bytes);
    await saveJson('knowledge/policy.json', { version: 'altered-policy' });
    await assert.rejects(verifyRelease({ root, outputDirectory: 'dist' }), /Public build rejected/);
    assert.equal(JSON.parse(await readFile(join(root, 'knowledge/active.json'))).revision, snapshot.revision);
  } finally { await rm(root, { recursive: true, force: true }); }
});
