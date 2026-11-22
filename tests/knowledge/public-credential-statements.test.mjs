import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectProfileRecord } from '../../src/lib/knowledge/profile-records.ts';
import { selectEligibleDocuments } from '../../src/lib/knowledge/eligibility.ts';
import { projectPublicCredentialStatements } from '../../src/lib/knowledge/publicCredentialStatements.server.ts';
import { renderPublicCredentialSection } from '../../src/lib/knowledge/publicCredentialText.ts';
import { createPublicSnapshot } from '../../scripts/knowledge/snapshot.mjs';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));

test('full-resource credential projection contains only reviewed statements matching the active snapshot', async () => {
  const candidates = await readJson('../../knowledge/external-candidates.json');
  const reviewLedger = await readJson('../../knowledge/review.json');
  const activeSnapshot = await readJson('../../src/data/generated/knowledgeSnapshot.json');
  const credentials = projectPublicCredentialStatements({ candidates, reviewLedger, activeSnapshot });
  const activeCredentialDocs = activeSnapshot.documents.filter(document => document.kind === 'credential');

  assert.equal(credentials.length, activeCredentialDocs.length);
  for (const credential of credentials) {
    const candidate = candidates.find(item => item.kind === 'credential' && item.title === credential.title);
    assert.deepEqual(credential.statements.map(item => item.text), candidate.profileRecord.statements.map(item => item.text));
    assert.deepEqual(credential.statements.map(item => item.citationUrl), candidate.profileRecord.statements.map(() => candidate.canonicalUrl));
    assert.deepEqual(credential.publicQualifiers, reviewLedger.documents[candidate.id].publicQualifiers);
    assert.deepEqual(Object.keys(credential).sort(), ['publicQualifiers', 'statements', 'title']);
  }

  const section = renderPublicCredentialSection(credentials);
  assert.match(section, /^## Public credentials/);
  for (const credential of credentials) {
    assert.ok(section.includes(`### ${credential.title}`));
    for (const statement of credential.statements) {
      assert.ok(section.includes(statement.text));
      assert.ok(section.includes(`[Issuer source](${statement.citationUrl})`));
    }
    for (const qualifier of credential.publicQualifiers) assert.ok(section.includes(`- ${qualifier}`));
  }
  assert.doesNotMatch(section, /credential:|Issuer:|Expiry:|Displayed name:|Source fingerprint|sourceFiles|Observed \d{4}-|verification verified|Owner review authority|Internal review/i);
  assert.equal(renderPublicCredentialSection([]), '');
});

test('preview-only, source-mismatched, and snapshot-mismatched credentials stay out of the resource', async () => {
  const candidates = await readJson('../../knowledge/external-candidates.json');
  const reviewLedger = await readJson('../../knowledge/review.json');
  const activeSnapshot = await readJson('../../src/data/generated/knowledgeSnapshot.json');
  const google = candidates.find(item => item.id === 'credential:google-ux');
  const previewOnlySnapshot = structuredClone(activeSnapshot);
  previewOnlySnapshot.documents = previewOnlySnapshot.documents.filter(document => document.id !== google.id);
  assert.equal(previewOnlySnapshot.documents.some(document => document.id === google.id), false);
  assert.equal(projectPublicCredentialStatements({ candidates, reviewLedger, activeSnapshot: previewOnlySnapshot })
    .some(item => item.title === google.title), false);

  const changedCandidates = structuredClone(candidates);
  const changed = changedCandidates.find(item => item.id === 'credential:hifi-ui-2');
  changed.profileRecord.statements[0].text += ' Changed after review.';
  assert.equal(projectPublicCredentialStatements({ candidates: changedCandidates, reviewLedger, activeSnapshot: previewOnlySnapshot })
    .some(item => item.title === changed.title), false);

  const changedSnapshot = structuredClone(previewOnlySnapshot);
  changedSnapshot.documents.find(document => document.id === 'credential:mobile-ui-1').passages[0].text += ' Changed snapshot.';
  assert.equal(projectPublicCredentialStatements({ candidates, reviewLedger, activeSnapshot: changedSnapshot })
    .some(item => item.title === 'Mobile App UI Design 1'), false);
});

test('an exactly reviewed Google credential appears only when its exact projected passage is active', async () => {
  const candidates = await readJson('../../knowledge/external-candidates.json');
  const reviewLedger = await readJson('../../knowledge/review.json');
  const activeSnapshot = await readJson('../../src/data/generated/knowledgeSnapshot.json');
  const candidate = candidates.find(item => item.id === 'credential:google-ux');
  const projected = projectProfileRecord(candidate, reviewLedger.documents[candidate.id], reviewLedger.authority);
  const googleDocument = createPublicSnapshot({ eligibleDocuments: selectEligibleDocuments([projected]),
    policyFingerprint: 'test-policy', policyVersion: reviewLedger.policyVersion }, 'test-source').documents[0];
  const futureActiveSnapshot = structuredClone(activeSnapshot);
  const existingIndex = futureActiveSnapshot.documents.findIndex(document => document.id === googleDocument.id);
  if (existingIndex >= 0) futureActiveSnapshot.documents[existingIndex] = googleDocument;
  else futureActiveSnapshot.documents.push(googleDocument);
  assert.equal(futureActiveSnapshot.documents.filter(document => document.id === googleDocument.id).length, 1);
  const credentials = projectPublicCredentialStatements({ candidates, reviewLedger, activeSnapshot: futureActiveSnapshot });
  const google = credentials.find(item => item.title === candidate.title);
  assert.ok(google, 'Google appears once its exact projected passage is active.');
  assert.deepEqual(google.statements, candidate.profileRecord.statements.map(statement => ({
    text: statement.text, citationUrl: candidate.canonicalUrl,
  })));
});
