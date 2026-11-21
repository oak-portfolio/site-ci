import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { inspectPortfolioCorpus, fingerprint } from './corpus.mjs';

const [renderedSiteRoot, receiptPath] = process.argv.slice(2);
if (!renderedSiteRoot || !receiptPath) throw new Error('Usage: node scripts/knowledge/audit.mjs <dist> <build-receipt>');
const input = { workspaceRoot: process.cwd(), renderedSiteRoot, receiptPath, ledgerPath: 'knowledge/review.json' };
const inventory = await inspectPortfolioCorpus(input);
const rerun = await inspectPortfolioCorpus(input);
assert.equal(fingerprint(inventory), fingerprint(rerun), 'Inventory must be deterministic.');
assert.equal(inventory.counts.currentWork, 5);
assert.equal(inventory.counts.timeline, 6);
assert.equal(inventory.counts.legacy, 6);
const all = inventory.eligibleDocuments;
const byId = new Map(all.map((document) => [document.id, document]));
const expectedLessons = { 'work:oakminder': 'What I Would Build Again', 'work:ecosmartloop': 'What I took with me',
  'work:linkedin-growth-loop': 'What Moved Out Of My Head' };
for (const [id, heading] of Object.entries(expectedLessons)) {
  const document = byId.get(id);
  assert.ok(document, `Missing ${id}`);
  assert.ok(document.passages.some((passage) => passage.headingPath.includes(heading)), `Missing authored lessons ${id}`);
  assert.ok(document.passages.length > 40, `Article body reduced to a summary ${id}`);
}
for (const source of inventory.documents.filter((document) => document.kind === 'legacy' && !document.id.includes('agentic-brain'))) {
  assert.ok(source.passages.length > 0, `Missing legacy body ${source.id}`);
  assert.ok(byId.has(source.id), `Safe historical design passages missing ${source.id}`);
  assert.ok(source.passages.every((passage) => passage.citationUrl === source.canonicalUrl), 'Do not invent legacy fragments.');
  assert.notEqual(source.dates.published.slice(0, 10), source.externalCandidate.cardPublished.slice(0, 10), 'Preserve date conflict.');
}
const output = JSON.stringify(all);
assert.doesNotMatch(output, /\$100M MRR|900% revenue increase|900% revenue growth|Complex Prize winner|\+65% trust/);
const agentic = byId.get('legacy:agentic-brain');
assert.ok(agentic, 'Linked original Agentic Brain body must be accounted for.');
assert.equal(agentic.dates.published, '2026-01-30');
assert.ok(agentic.passages.some((passage) => passage.headingPath.includes("What I'd do differently")), 'Original Agentic Brain lessons must remain eligible.');
assert.ok(agentic.passages.every((passage) => passage.citationUrl === agentic.canonicalUrl));
assert.doesNotMatch(JSON.stringify(agentic), /24%|67-95%|13\.89%|arXiv:2506\.08184/);
assert.match(byId.get('experience:hyperskalers').passages.map((passage) => passage.text).join('\n'), /Worked with the team/);
assert.match(byId.get('experience:sanfranciscobayuniversity').passages.map((passage) => passage.text).join('\n'), /team prototype/);
assert.match(byId.get('resource:kusala-daily').passages.map((passage) => passage.text).join('\n'), /release preparation and is not yet available/);
const ids = all.flatMap((document) => document.passages.map((passage) => passage.id));
assert.equal(ids.length, new Set(ids).size, 'Passage identities resolve uniquely.');
const policy = JSON.parse(await readFile('knowledge/policy.json', 'utf8'));
const { contactOnlyTopics } = await import('../../src/lib/knowledge/eligibility.ts');
assert.deepEqual(policy.contactOnlyOwnerTopics, [...contactOnlyTopics]);
const ledger = JSON.parse(await readFile('knowledge/review.json', 'utf8'));
const intake = JSON.parse(await readFile('knowledge/external-candidates.json', 'utf8'));
const excludedMembers = ledger.retrievalExclusions.cohorts.flatMap(cohort => cohort.members);
assert.equal(excludedMembers.length, 77, 'Only the reviewed 77-row intake boundary is excluded.');
assert.equal(new Set(excludedMembers.map(member => member.id)).size, excludedMembers.length, 'Retrieval exclusions are disjoint.');
for (const member of excludedMembers) {
  const document = inventory.documents.find(item => item.id === member.id);
  assert.ok(document, `Exact excluded intake row is represented: ${member.id}`);
  assert.equal(document.sourceFingerprint, member.sourceFingerprint, `Exact excluded source fingerprint: ${member.id}`);
  assert.equal(document.decision.state, 'excluded', `Exact retrieval-only exclusion applied: ${member.id}`);
  assert.deepEqual(document.passages, [], `Excluded remote/account source has no retrieval passages: ${member.id}`);
}
const ownerReviewedCredentials = intake.filter(candidate => candidate.kind === 'credential' &&
  candidate.profileRecord?.review?.state === 'owner-reviewed' &&
  ledger.documents[candidate.id]?.sourceFingerprint === fingerprint(candidate));
assert.equal(ownerReviewedCredentials.length, 3, 'Exact current credential reviews remain source-bound.');
for (const candidate of ownerReviewedCredentials) {
  const document = inventory.documents.find(item => item.id === candidate.id);
  assert.equal(document?.decision.state, 'historical-baseline', `Reviewed credential compiles: ${candidate.id}`);
  assert.ok(all.some(item => item.id === candidate.id), `Reviewed credential is eligible: ${candidate.id}`);
  assert.equal(document.passages.length, candidate.profileRecord.statements.length);
}
assert.deepEqual(inventory.missingContent, ledger.missingContent, 'T01 source gaps stay explicit.');
const report = { schema: 'oak.knowledge-audit.v1', status: 'passed', counts: inventory.counts,
  retrievalExcludedDocuments: excludedMembers.length, reviewedCredentialDocuments: ownerReviewedCredentials.length,
  missingContent: inventory.missingContent,
  deterministicInventoryFingerprint: fingerprint(inventory), policyFingerprint: inventory.policyFingerprint,
  checks: ['Full current Work bodies and lessons', 'All timeline records and real emitted hash anchors',
    'All six legacy-card bodies plus the original linked Agentic Brain body with historical dates and canonical citations',
    'Conflicting revenue/growth and unverified award/outcome blocks excluded',
    'Exact owner-reviewed credentials remain source-bound and eligible',
    '77 exact fingerprint-bound retrieval exclusions have no passages; public links remain in authored pages',
    'T01 source gaps remain explicit', 'Product availability qualifier preserved',
    'Unique resolvable document/passage identities', 'Repeat-run determinism', 'Policy contact-topic parity'] };
await writeFile('artifacts/oak-ai-agent-2026-10-03/knowledge-build/audit.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
