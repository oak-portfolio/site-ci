import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicationCanaries } from './audit-release.mjs';
import { renderRevision, writeJson } from './release.mjs';
import { digest, hashTree, parityRoot, publicSnapshotPath, verifyRelease } from './release-boundary.mjs';
import { assertPublishableRender } from './publication.mjs';

const root = process.cwd(), ownerPath = 'src/content/work/ecosmartloop.mdx';
const ownerBytes = await readFile(join(root, ownerPath));
const activeBytes = await readFile(join(root, 'knowledge/active.json'));
const snapshotBytes = await readFile(join(root, publicSnapshotPath));
const active = JSON.parse(activeBytes);
const publicOutput = `${parityRoot}/public/${active.revision}`;
const beforeFiles = await hashTree(root, publicOutput);
const fixture = ownerBytes.toString().replace('How Steve Oak contributed to a team-built',
  `${publicationCanaries[2]} ${publicationCanaries[0]} How Steve Oak contributed to a team-built`) +
  `\n\n<p data-knowledge-disclosure="private">${publicationCanaries[0]}</p>\n\n<p data-knowledge-disclosure="contact-only">${publicationCanaries[1]}</p>\n`;
await writeJson(join(root, `${parityRoot}/fixtures/publication-candidate.json`), {
  schema: 'oak.synthetic-publication-fixture.v1', ownerPath, canaries: publicationCanaries,
  reviewedOwnerHash: digest(ownerBytes), unreviewedOwnerHash: digest(fixture),
  copiedReviewMetadata: { inspected: publicationCanaries[2], ownership: { contributions: [publicationCanaries[0]] } } });
let guardError, previewReceipt;
try {
  await writeFile(join(root, ownerPath), fixture);
  await assert.rejects(async () => {
    try { await renderRevision({ root }); }
    catch (error) { guardError = error.message; throw error; }
  }, /Public build rejected/);
  assert.equal(digest(await readFile(join(root, 'knowledge/active.json'))), digest(activeBytes));
  assert.equal(digest(await readFile(join(root, publicSnapshotPath))), digest(snapshotBytes));
  assert.deepEqual(await hashTree(root, publicOutput), beforeFiles, 'Rejected draft cannot replace active output.');
  previewReceipt = await renderRevision({ root, preview: true });
  assert.ok(previewReceipt.outputDirectory.startsWith(`${parityRoot}/previews/`));
  const previewHtml = await readFile(join(root, previewReceipt.outputDirectory, 'work/ecosmartloop/index.html'), 'utf8');
  for (const canary of publicationCanaries) assert.ok(previewHtml.includes(canary), 'Raw candidate is contained in owner preview only.');
  await assert.rejects(assertPublishableRender({ root, outputDirectory: previewReceipt.outputDirectory,
    deniedText: publicationCanaries }), /Activation rejected/);
  assert.deepEqual(await hashTree(root, publicOutput), beforeFiles, 'Isolated preview cannot replace active output.');
} finally {
  await writeFile(join(root, ownerPath), ownerBytes);
}
await verifyRelease({ root, outputDirectory: join(root, publicOutput) });
assert.equal(digest(await readFile(join(root, ownerPath))), digest(ownerBytes));
assert.equal(digest(await readFile(join(root, 'knowledge/active.json'))), digest(activeBytes));
assert.equal(digest(await readFile(join(root, publicSnapshotPath))), digest(snapshotBytes));
for (const file of Object.keys(beforeFiles)) {
  const bytes = await readFile(join(root, file));
  for (const canary of publicationCanaries) assert.equal(bytes.includes(Buffer.from(canary)), false, `Public leak: ${file}`);
}
const report = { schema: 'oak.publication-boundary-proof.v1', status: 'passed', activeRevision: active.revision,
  canaries: publicationCanaries, rejectedPublicBuild: guardError, isolatedCandidateOutput: previewReceipt.outputDirectory,
  activeOutputFingerprint: digest(beforeFiles), scannedPublicFiles: Object.keys(beforeFiles).length,
  ownerRestoredExactly: true, activePointerUnchanged: true, activeSnapshotUnchanged: true,
  checks: ['Actual Astro public build rejects unreviewed private/contact-only bodies and copied metadata before emission',
    'Actual Astro candidate build contains fixture only under isolated preview and cannot pass activation disclosure validation', 'No public output or active pointer changes',
    'All emitted HTML/assets/API/generated/retrieval copies scanned for negative canaries'] };
await writeJson(join(root, `${parityRoot}/publication-boundary.json`), report);
console.log(JSON.stringify(report));
