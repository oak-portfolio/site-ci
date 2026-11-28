import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, resolveCandidateRetrievalExclusions } from '../../scripts/knowledge/corpus.mjs';

const candidate = (id, reason = 'Reference only. Remote body is not reviewed.') => ({
  id, kind: 'resource', title: id, canonicalUrl: `https://example.com/${id}`, reason,
});

function policyFor(candidates) {
  const members = candidates.map(item => ({ id: item.id, sourceFingerprint: fingerprint(item) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { schema: 'oak.knowledge-retrieval-exclusions.v1',
    fingerprintAlgorithm: 'sha256(JSON.stringify(sorted [[id, sourceFingerprint], ...]))',
    cohorts: [{ id: 'reference-only', state: 'excluded', scope: 'retrieval-only',
      reason: 'Reference links stay public. Their remote bodies are not retrieval evidence.',
      selector: { kind: candidates[0].kind, reason: candidates[0].reason }, memberCount: members.length,
      memberSetFingerprint: fingerprint(members.map(member => [member.id, member.sourceFingerprint])), members }],
  };
}

test('exact cohort and fingerprints exclude only the selected current rows', () => {
  const rows = [candidate('linked-resource:one'), candidate('linked-resource:two')];
  const excluded = resolveCandidateRetrievalExclusions(rows, policyFor(rows));
  assert.deepEqual([...excluded.keys()].sort(), rows.map(item => item.id).sort());
});

test('changed, added, or differently classified rows stay pending by default', () => {
  const rows = [candidate('linked-resource:one'), candidate('linked-resource:two')];
  const policy = policyFor(rows);
  const changed = structuredClone(rows);
  changed[1].title = 'Changed after fingerprint review';
  assert.equal(resolveCandidateRetrievalExclusions(changed, policy).size, 0);
  assert.equal(resolveCandidateRetrievalExclusions([...rows, candidate('linked-resource:new')], policy).size, 0);
  assert.equal(resolveCandidateRetrievalExclusions([...rows, candidate('linked-resource:new', 'A different reason.')], policy).size, 2);
});

test('malformed cohort fingerprints fail closed', () => {
  const rows = [candidate('linked-resource:one')];
  const policy = policyFor(rows);
  policy.cohorts[0].memberSetFingerprint = '0'.repeat(64);
  assert.throws(() => resolveCandidateRetrievalExclusions(rows, policy), /member fingerprint/);
});
