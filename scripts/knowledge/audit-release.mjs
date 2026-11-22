import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHtmlDocument, findOutputFile, attribute, textContent } from '../quality/html.mjs';
import { digest, hashTree, parityRoot, readJson, verifyRelease } from './release-boundary.mjs';
import { createPublicSnapshot } from './snapshot.mjs';
import { writeJson } from './release.mjs';
import { applyRevocations } from './revocations.mjs';

export const publicationCanaries = ['T02_PRIVATE_BODY_CANARY', 'T02_CONTACT_BODY_CANARY', 'T02_INTERNAL_REVIEW_METADATA_CANARY',
  'Public collaborator and tool attribution is not yet finalized.',
  'Named techniques describe workflow categories, not tool sponsorship, endorsement, or official integration claims.',
  'Public collaborator and client attribution is not yet approved.',
  'Platform logos in the cover identify publishing surfaces, not sponsorship, partnership, endorsement, or platform approval.'];

export async function auditPublicRevision({ root, receiptPath, inventoryPath }) {
  const receipt = await readJson(receiptPath), output = join(root, receipt.outputDirectory);
  const verified = await verifyRelease({ root, outputDirectory: output });
  const snapshot = await readJson(join(root, 'src/data/generated/knowledgeSnapshot.json'));
  const active = await readJson(join(root, 'knowledge/active.json'));
  const manifest = await readJson(join(root, `knowledge/releases/${active.revision}/manifest.json`));
  const inventory = await readJson(inventoryPath ?? join(root, manifest.inventoryPath ?? `${parityRoot}/compiled-inventory.json`));
  let reproduced = createPublicSnapshot(inventory, snapshot.sourceIdentity);
  if (snapshot.buildIdentity) reproduced = {...reproduced, buildIdentity: snapshot.buildIdentity};
  if (snapshot.revocationGeneration !== undefined) reproduced = applyRevocations(reproduced, active.lifecycle.revocations);
  assert.equal(digest(reproduced), digest(snapshot), 'Snapshot must reproduce from matching reviewed inventory.');
  assert.equal(snapshot.schema, 'oak.public-knowledge.v2', 'Current public snapshot requires the v2 attribution contract.');
  const snapshotText = JSON.stringify(snapshot);
  assert.doesNotMatch(snapshotText, /"(?:inspected|factualReview|decision|gaps|sourceFiles|sectionReferences|deniedReferences)"|\/Users\/|historical-baseline|source packet/i);
  const surfaces = new Map(), htmlPages = new Map();
  const readSurface = async (href) => {
    if (!surfaces.has(href)) surfaces.set(href, await readFile(findOutputFile(output, href), 'utf8'));
    return surfaces.get(href);
  };
  const article = readHtmlDocument(await readSurface('/work/ecosmartloop/'));
  const human = article.nodes.filter(node => attribute(node, 'class').split(' ').includes('work-article-body')).map(textContent).join('\n');
  assert.match(human, /team-built prototype/);
  assert.match(article.meta('description'), /team-built/);
  const schemas = article.schemas.flatMap(value => JSON.parse(value)['@graph'] ?? []);
  const articleSchema = schemas.find(node => [node['@type']].flat().includes('TechArticle'));
  assert.match(articleSchema.description, /team-built/);
  assert.equal(articleSchema.datePublished.slice(0, 10), '2025-12-15');
  assert.equal(article.meta('knowledge-revision'), snapshot.revision);
  const markdown = await readSurface('/api/md/work/ecosmartloop');
  assert.match(markdown, /team-built/);
  assert.match(markdown, /Steve Oak's authored source excerpts/);
  assert.ok(markdown.includes(snapshot.revision));
  const machine = JSON.parse(await readSurface('/api/machine/ecosmartloop.json'));
  assert.match(machine.summary, /team-built/);
  assert.equal(machine.knowledgeRevision, snapshot.revision);
  assert.deepEqual(machine.sourceDocumentIds, ['work:ecosmartloop']);
  const profile = JSON.parse(await readSurface('/profile.json'));
  assert.equal(profile.version, snapshot.revision);
  assert.match(profile.subjectOf.find(item => item.name === 'EcoSmartLoop').description, /team-built/);
  const agentProfile = JSON.parse(await readSurface('/.well-known/agent-profile.json'));
  assert.equal(agentProfile.knowledge_revision, snapshot.revision);
  assert.match(agentProfile.pages.find(item => item.id === 'ecosmartloop').description, /team-built/);
  const llms = await readSurface('/llms-full.txt');
  assert.match(llms, /team-built/);
  assert.ok(llms.includes(snapshot.revision));
  const candidateRecords = await readJson(join(root, 'knowledge/external-candidates.json'));
  const reviewLedger = await readJson(join(root, 'knowledge/review.json'));
  const { projectPublicCredentialStatements } = await import(pathToFileURL(join(root, 'src/lib/knowledge/publicCredentialStatements.server.ts')));
  const { renderPublicCredentialSection } = await import(pathToFileURL(join(root, 'src/lib/knowledge/publicCredentialText.ts')));
  const credentials = projectPublicCredentialStatements({ candidates: candidateRecords, reviewLedger, activeSnapshot: snapshot });
  const credentialSection = renderPublicCredentialSection(credentials);
  assert.equal(llms.split('## Public credentials').length - 1, credentialSection ? 1 : 0,
    'Full LLM context has one generated credential section only when active reviewed records exist.');
  if (credentialSection) {
    assert.ok(llms.includes(credentialSection), 'Full LLM context contains the exact shared credential projection.');
    for (const credential of credentials) for (const statement of credential.statements) {
      assert.ok(llms.includes(statement.text), `Exact reviewed credential statement is public: ${credential.title}`);
      assert.ok(llms.includes(`[Issuer source](${statement.citationUrl})`), `Exact issuer citation is public: ${credential.title}`);
    }
    assert.doesNotMatch(credentialSection, /(?:Issuer:|Expiry:|Displayed name:|Source fingerprint|sourceFiles|Observed \d{4}-|verification verified|Owner review authority|Internal review)/i,
      'Credential section excludes projection and review metadata.');
  }
  const publicApi = JSON.parse(await readSurface('/api/knowledge.json'));
  assert.deepEqual(publicApi, snapshot);
  const { resolveKnowledgePassage } = await import(pathToFileURL(join(root, 'src/lib/knowledge/snapshot.ts')));
  let anchorCount = 0, externalPageCount = 0;
  for (const document of snapshot.documents) for (const passage of document.passages) {
    assert.equal(resolveKnowledgePassage(passage.id)?.revision, snapshot.revision);
    assert.equal(resolveKnowledgePassage(passage.id)?.passage.text, passage.text);
    const citation = new URL(passage.citationUrl);
    if (citation.origin === 'https://steveoak.com') {
      if (!htmlPages.has(citation.pathname)) htmlPages.set(citation.pathname, readHtmlDocument(await readSurface(citation.pathname)));
      const page = htmlPages.get(citation.pathname);
      if (citation.hash) assert.ok(page.nodes.some(node => attribute(node, 'id') === decodeURIComponent(citation.hash.slice(1))), `Actual source anchor: ${passage.id}`);
      anchorCount++;
    } else {
      assert.equal(passage.citationUrl, document.canonicalUrl, 'External citation must not invent fragments.');
      externalPageCount++;
    }
  }
  const eco = snapshot.documents.find(document => document.id === 'work:ecosmartloop');
  const eligibleById = new Map(inventory.eligibleDocuments.map(document => [document.id, document]));
  for (const document of snapshot.documents) {
    const source = eligibleById.get(document.id);
    assert.ok(source, `Snapshot document comes from the reviewed eligible inventory: ${document.id}`);
    assert.equal(document.attribution.subject, source.ownership.subject, `Public subject is source-aligned: ${document.id}`);
    assert.deepEqual(document.attribution.collaborators, source.ownership.publicCollaborators, `Curated collaborators are source-aligned: ${document.id}`);
    assert.deepEqual(document.attribution.qualifiers, source.ownership.publicQualifiers, `Curated qualifiers are source-aligned: ${document.id}`);
    assert.equal(Object.hasOwn(document, 'ownership'), false, `Internal ownership record is not projected: ${document.id}`);
  }
  assert.ok(eco.passages.some(passage => /team-built prototype/.test(passage.text)));
  assert.ok(eco.passages.some(passage => passage.headingPath.some(heading => /learn|again|took with me/i.test(heading))), 'Authored lessons are retrieval evidence.');
  assert.ok(eco.attribution.collaborators.some(value => /Frank Baah/.test(value)));
  const emitted = await hashTree(root, receipt.outputDirectory);
  assert.equal(digest(Object.fromEntries(Object.entries(emitted).map(([path, hash]) => [path.slice(receipt.outputDirectory.length + 1), hash]))), receipt.buildFingerprint);
  for (const path of Object.keys(emitted)) {
    const bytes = await readFile(join(root, path));
    for (const canary of publicationCanaries) assert.equal(bytes.includes(Buffer.from(canary)), false, `Public leak: ${path}`);
    if (path.endsWith('.html')) {
      const page = readHtmlDocument(bytes.toString());
      if (page.isDocument) assert.equal(page.meta('knowledge-revision'), snapshot.revision);
    }
  }
  const report = { schema: 'oak.public-revision-audit.v1', status: 'passed', revision: snapshot.revision,
    sourceIdentity: snapshot.sourceIdentity, policyIdentity: snapshot.policyIdentity, documentCount: snapshot.documents.length,
    passageCount: snapshot.documents.reduce((count, document) => count + document.passages.length, 0),
    inspectedPublicFiles: Object.keys(emitted).length, checkedLocalCitations: anchorCount, checkedExternalCitations: externalPageCount,
    checks: ['v2 public subject, curated collaborators and curated qualifiers match the reviewed eligible inventory; raw ownership records stay private',
      'Full LLM credential section is generated only from exact reviewed statements and passages matching the active snapshot',
      'Meaningful team-built qualifier agrees across Human, description/schema, Machine Markdown/JSON, profile/agent-profile, LLM and actual retrieval',
      'Published date and named classifier collaborators preserved', 'Full authored body and lessons resolve to actual public anchors',
      'Safe allowlist omits review metadata and local paths', 'Snapshot reproduction, source/policy/revision binding and complete emitted-file canary scan'] };
  await writeJson(join(root, `${parityRoot}/parity-audit.json`), report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await auditPublicRevision({ root: process.cwd(), receiptPath: resolve(process.argv[2]), inventoryPath: process.argv[3] ? resolve(process.argv[3]) : undefined })));
}
