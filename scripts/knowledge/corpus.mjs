import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { extractAuthoredMarkdown } from './markdown.mjs';
import { extractRenderedDocument, attribute, findNodes } from './rendered.mjs';
import { parse as parseHtml } from 'parse5';
import { projectProfileRecord } from '../../src/lib/knowledge/profile-records.ts';
import { applyPassageExceptions, selectEligibleDocuments } from '../../src/lib/knowledge/eligibility.ts';

export const fingerprint = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const emptyOwnership = (role = '', qualifiers = []) => ({ author: 'Steve Oak', subject: 'Steve Oak / Okkar Kyaw', role,
  contributions: [], collaborators: [], publicCollaborators: [], qualifiers, publicQualifiers: [] });
const dates = (published = null, updated = null, period = null) => ({ published, updated, period, inspected: '2026-10-03', factualReview: null });

function selectorMatches(candidate, selector) {
  if (Array.isArray(selector?.ids)) return selector.ids.includes(candidate.id);
  return candidate.kind === selector?.kind && candidate.reason === selector?.reason;
}

export function resolveCandidateRetrievalExclusions(candidates, policy) {
  const decisions = new Map();
  if (policy === undefined) return decisions;
  if (policy?.schema !== 'oak.knowledge-retrieval-exclusions.v1' ||
      policy.fingerprintAlgorithm !== 'sha256(JSON.stringify(sorted [[id, sourceFingerprint], ...]))' ||
      !Array.isArray(policy.cohorts)) {
    throw new Error('Invalid retrieval-exclusion ledger');
  }
  const candidateIds = new Set();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) throw new Error(`Duplicate external candidate identity: ${candidate.id}`);
    candidateIds.add(candidate.id);
  }
  const cohortIds = new Set();
  for (const cohort of policy.cohorts) {
    const selector = cohort?.selector;
    const selectorByIds = Array.isArray(selector?.ids) && Object.keys(selector).length === 1 &&
      selector.ids.length > 0 && selector.ids.every(id => typeof id === 'string' && id.length > 0) &&
      new Set(selector.ids).size === selector.ids.length;
    const selectorByReason = typeof selector?.kind === 'string' && selector.kind.length > 0 &&
      typeof selector?.reason === 'string' && selector.reason.length > 0 && Object.keys(selector).length === 2;
    if (cohort?.state !== 'excluded' || cohort.scope !== 'retrieval-only' || typeof cohort.id !== 'string' ||
        !cohort.id.trim() || cohortIds.has(cohort.id) ||
        typeof cohort.reason !== 'string' || !cohort.reason.trim() || !Array.isArray(cohort.members) ||
        !Number.isInteger(cohort.memberCount) || cohort.memberCount < 1 || cohort.memberCount !== cohort.members.length ||
        !/^[a-f0-9]{64}$/.test(cohort.memberSetFingerprint) ||
        !(selectorByIds || selectorByReason)) {
      throw new Error(`Invalid retrieval-exclusion cohort: ${cohort?.id ?? 'unknown'}`);
    }
    cohortIds.add(cohort.id);
    const expectedMembers = cohort.members.map(({ id, sourceFingerprint }) => ({ id, sourceFingerprint }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (expectedMembers.some(member => typeof member.id !== 'string' || !/^[a-f0-9]{64}$/.test(member.sourceFingerprint)) ||
        new Set(expectedMembers.map(member => member.id)).size !== expectedMembers.length ||
        fingerprint(expectedMembers.map(member => [member.id, member.sourceFingerprint])) !== cohort.memberSetFingerprint) {
      throw new Error(`Invalid retrieval-exclusion member fingerprint: ${cohort.id}`);
    }
    const actualMembers = candidates.filter(candidate => selectorMatches(candidate, cohort.selector))
      .map(candidate => ({ id: candidate.id, sourceFingerprint: fingerprint(candidate) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const exactMatch = actualMembers.length === cohort.memberCount &&
      JSON.stringify(actualMembers) === JSON.stringify(expectedMembers);
    if (!exactMatch) continue;
    for (const member of expectedMembers) {
      if (decisions.has(member.id)) throw new Error(`Overlapping retrieval-exclusion cohorts: ${member.id}`);
      decisions.set(member.id, cohort.reason);
    }
  }
  return decisions;
}

function workMetadata(source) {
  const lines = source.split('\n');
  if (lines[0].trim() !== '---') throw new Error('Missing Work frontmatter');
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) throw new Error('Unclosed Work frontmatter');
  const metadata = parseYaml(lines.slice(1, end).join('\n'));
  if (!metadata || typeof metadata.title !== 'string') throw new Error('Invalid Work metadata');
  return metadata;
}

export async function inspectPortfolioCorpus({ workspaceRoot, renderedSiteRoot, receiptPath, ledgerPath }) {
  const receipt = await readJson(receiptPath), ledger = await readJson(ledgerPath);
  const policy = await readJson(join(workspaceRoot, 'knowledge/policy.json'));
  if (ledger.schema !== 'oak.knowledge-review.v1' || policy.schema !== 'oak.knowledge-policy.v1' || policy.version !== ledger.policyVersion) throw new Error('Invalid or mismatched policy/review ledger');
  for (const [id, rule] of Object.entries(ledger.documents)) {
    if (!/^[a-f0-9]{64}$/.test(rule.sourceFingerprint)) throw new Error(`Invalid source fingerprint: ${id}`);
    for (const exception of rule.exceptions ?? []) {
      if (exception.disclosure && !['public', 'contact-only', 'private'].includes(exception.disclosure)) throw new Error(`Invalid disclosure: ${id}`);
      if (!exception.sectionId && !exception.passageId && !exception.textIncludes) throw new Error(`Unbound exception: ${id}`);
    }
  }
  if (receipt.status !== 'passed' && receipt.status !== 'complete') throw new Error(`Build did not pass: ${receipt.status}`);
  if (receipt.exitCode !== 0 || receipt.sourceChangesDuringBuild?.length) throw new Error('Build/source changed');
  const verifiedSources = new Map(), verifiedPages = new Map();
  for (const [path, expected] of Object.entries(receipt.sourceFiles)) {
    if (path === 'package.json' || path === 'package-lock.json') continue;
    const actual = fingerprint(await readFile(join(workspaceRoot, path)));
    if (actual !== expected) throw new Error(`Source/build mismatch: ${path}`);
  }
  async function source(path) {
    const bytes = await readFile(join(workspaceRoot, path));
    const hash = fingerprint(bytes.toString());
    if (receipt.sourceFiles[path] !== hash) throw new Error(`Source/build mismatch: ${path}`);
    verifiedSources.set(path, hash);
    return bytes.toString();
  }
  async function rendered(path) {
    const bytes = await readFile(join(renderedSiteRoot, path));
    const hash = fingerprint(bytes.toString());
    if (receipt.buildFiles[path] !== hash) throw new Error(`Rendered/build mismatch: ${path}`);
    verifiedPages.set(path, hash);
    return bytes.toString();
  }
  const documents = [], bindings = {}, linkedCandidates = new Map();
  function register(input) {
    const rule = ledger.documents[input.id];
    const decision = rule && rule.sourceFingerprint === input.sourceFingerprint
      ? { state: 'historical-baseline', sourceFingerprint: rule.sourceFingerprint, basis: ledger.authority }
      : { state: 'pending', reason: rule ? 'Source changed since baseline review.' : 'New source requires scoped review.' };
    const passages = input.passages.map((passage) => applyPassageExceptions(passage, rule?.exceptions ?? []));
    const deniedText = passages.filter((passage) => passage.conflict || passage.disclosure !== 'public').map((passage) => passage.text);
    const publicQualifiers = rule?.publicQualifiers ?? [];
    if (!Array.isArray(publicQualifiers) || publicQualifiers.some((value) => typeof value !== 'string' || !value.trim())) {
      throw new Error(`Invalid curated public qualifiers: ${input.id}`);
    }
    const publicCollaborators = rule?.publicCollaborators ?? [];
    if (!Array.isArray(publicCollaborators) || publicCollaborators.some((value) => typeof value !== 'string' || !value.trim())) {
      throw new Error(`Invalid curated public collaborators: ${input.id}`);
    }
    documents.push({ ...input, ownership: { ...input.ownership,
      contributions: input.ownership.contributions.filter((text) => !deniedText.includes(text)),
      publicCollaborators: [...publicCollaborators],
      publicQualifiers: [...publicQualifiers] }, decision, passages });
  }
  await source('src/pages/work/[...slug].astro');
  const workFiles = (await readdir(join(workspaceRoot, 'src/content/work'))).filter((file) => file.endsWith('.mdx')).sort();
  for (const file of workFiles) {
    const slug = file.slice(0, -4), id = `work:${slug}`, owner = `src/content/work/${file}`;
    const text = await source(owner), metadata = workMetadata(text);
    const extracted = extractRenderedDocument({ html: await rendered(`work/${slug}/index.html`),
      scopeClasses: ['work-article-body'], documentId: id, bindings: ledger.documents[id]?.sections,
      figureProjections: ledger.documents[id]?.figureProjections, sourceFingerprint: fingerprint(text),
      published: metadata.datePublished });
    bindings[id] = extracted.sections;
    for (const link of [...(metadata.sources ?? []), ...(metadata.artifacts ?? []).filter((item) => item.href)]) {
      if (!link.href?.startsWith('https://')) continue;
      const canonicalUrl = link.href;
      if (!linkedCandidates.has(canonicalUrl)) linkedCandidates.set(canonicalUrl, { id: `linked-resource:${fingerprint(canonicalUrl).slice(0, 16)}`,
        kind: 'resource', title: link.label ?? canonicalUrl, canonicalUrl, reason: 'Source-linked public resource. Remote body and claim scope require separate review.',
        gaps: ['Linked URL is accounted for. Remote body is not independently imported.'] });
    }
    register({ id, kind: 'work', title: metadata.title, canonicalUrl: extracted.canonicalUrl,
      sourceFingerprint: fingerprint(text), sourceFiles: [owner],
      representations: [extracted.canonicalUrl, `https://steveoak.com/work/${slug}.md`,
        `https://steveoak.com/api/md/work/${slug}`, `https://steveoak.com/api/machine/work/${slug}.json`],
      dates: dates(metadata.datePublished, metadata.dateUpdated, metadata.timeline ?? null),
      ownership: { ...emptyOwnership(metadata.role), contributions: metadata.ownership?.oak ?? [],
        collaborators: metadata.ownership?.collaborators ?? [],
        qualifiers: metadata.evidenceStatus?.summary ? [metadata.evidenceStatus.summary] : [] },
      disclosure: 'public', gaps: [...extracted.gaps,
        ...(metadata.articleStatus === 'in-progress-stub' ? ['Full article is intentionally absent. Existing authored stub body is covered.'] : []),
        ...(metadata.artifacts ?? []).filter((item) => item.status === 'needs-oak' || item.status === 'do-not-publish')
          .map((item) => `${item.label}: ${item.status}.`)], passages: extracted.passages, ...(extracted.deniedReferences ? { deniedReferences: extracted.deniedReferences } : {}) });
  }
  await source('src/data/careerTimeline.ts');
  const { careerTimelineItems } = await import(pathToFileURL(join(workspaceRoot, 'src/data/careerTimeline.ts')));
  for (const item of careerTimelineItems) {
    const id = `experience:${item.id}`, canonicalUrl = `https://steveoak.com/work#${item.id}`;
    const passages = [item.summary, ...item.highlights.flatMap((group) => group.items),
      ...item.stack.map((group) => `${group.label}: ${group.items.join(', ')}`)].map((text, index) => ({
        id: `${id}:passage-${String(index + 1).padStart(3, '0')}`, sectionId: id,
        kind: 'narrative', text, headingPath: [item.place, item.title], citationUrl: canonicalUrl, disclosure: 'public', conflict: null }));
    register({ id, kind: 'experience', title: item.place, canonicalUrl,
      sourceFingerprint: fingerprint(item), sourceFiles: ['src/data/careerTimeline.ts'],
      representations: [canonicalUrl, 'https://steveoak.com/work.md', 'https://steveoak.com/api/md/work'],
      dates: dates(null, null, item.date), ownership: { ...emptyOwnership(item.contexts.map((context) =>
        `${context.title} (${context.engagement ?? context.status})`).join('; '),
        ['Employer/team outcomes retain the authored contribution qualifiers. Present means the source period, not verified current status.']),
        contributions: item.highlights.flatMap((group) => group.items) }, disclosure: 'public', gaps: [], passages });
  }
  const timelineTree = parseHtml(await rendered('work/index.html'));
  const timelineAnchors = new Set(findNodes(timelineTree, (node) => attribute(node, 'id')).map((node) => attribute(node, 'id')));
  for (const item of careerTimelineItems) if (!timelineAnchors.has(item.id)) throw new Error(`Missing timeline anchor: ${item.id}`);
  const profileSources = ['src/data/homePage.ts', 'src/data/machineContent.ts', 'src/pages/index.astro'];
  const profileInput = [];
  for (const file of profileSources) profileInput.push(await source(file));
  const profile = extractRenderedDocument({ html: await rendered('index.html'), documentId: 'profile:steve-oak',
    scopeClasses: ['hero-stage', 'proof-block', 'workspace-block'], bindings: ledger.documents['profile:steve-oak']?.sections });
  bindings['profile:steve-oak'] = profile.sections;
  register({ id: 'profile:steve-oak', kind: 'profile', title: 'Steve Oak / Okkar Kyaw', canonicalUrl: profile.canonicalUrl,
    sourceFingerprint: fingerprint(profileInput), sourceFiles: profileSources,
    representations: ['https://steveoak.com/', 'https://steveoak.com/profile.json', 'https://steveoak.com/.well-known/agent-profile.json',
      'https://steveoak.com/index.md', 'https://steveoak.com/api/md', 'https://steveoak.com/llms-full.txt', 'https://steveoak.com/skill.md'],
    dates: dates(), ownership: emptyOwnership('Applied AI and design engineering', ['Profile wording is an authored source statement, not current-role or precise-location verification.']),
    disclosure: 'public', gaps: [], passages: profile.passages, ...(profile.deniedReferences ? { deniedReferences: profile.deniedReferences } : {}) });
  for (const suffix of ['', '/support', '/privacy']) {
    const id = `resource:kusala-daily${suffix.replace('/', ':')}`, owner = `src/pages/apps/kusala-daily${suffix}/index.astro`;
    const text = await source(owner);
    const extracted = extractRenderedDocument({ html: await rendered(`apps/kusala-daily${suffix}/index.html`),
      scopeClasses: ['kusala-content'], documentId: id, bindings: ledger.documents[id]?.sections });
    bindings[id] = extracted.sections;
    register({ id, kind: 'resource', title: `Kusala Daily ${suffix.slice(1) || 'overview'}`, canonicalUrl: extracted.canonicalUrl,
      sourceFingerprint: fingerprint(text), sourceFiles: [owner], representations: [extracted.canonicalUrl,
        `https://steveoak.com/apps/kusala-daily${suffix}.md`], dates: dates(null, suffix === '/privacy' ? '2026-07-29' : null),
      ownership: emptyOwnership('Product documentation', ['Product scope only. Release preparation is not downloadable availability or a promised date.']),
      disclosure: 'public', gaps: [], passages: extracted.passages, ...(extracted.deniedReferences ? { deniedReferences: extracted.deniedReferences } : {}) });
  }
  await source('src/layouts/KusalaDailyAppLayout.astro');
  await source('src/data/legacyWork.ts');
  const { legacyFramerCaseStudies } = await import(pathToFileURL(join(workspaceRoot, 'src/data/legacyWork.ts')));
  // Existing selected public intake is owner-archived and bound to this exact build.
  const candidateRecords = JSON.parse(await source('knowledge/external-candidates.json'));
  const profileRecordIds = candidateRecords.filter((entry) => entry.profileRecord).map((entry) => entry.id);
  if (profileRecordIds.some((id) => candidateRecords.filter((entry) => entry.id === id).length !== 1)) {
    throw new Error('Duplicate profile intake identity');
  }
  const external = [...candidateRecords, ...linkedCandidates.values()].filter((entry, index, all) =>
    entry.profileRecord || all.findIndex((other) => other.canonicalUrl === entry.canonicalUrl) === index);
  const retrievalExclusions = resolveCandidateRetrievalExclusions(external, ledger.retrievalExclusions);
  const extracts = await readJson(join(workspaceRoot, 'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json'));
  for (const item of legacyFramerCaseStudies) {
    const candidate = external.find((entry) => entry.canonicalUrl === item.href);
    const id = candidate?.id ?? `legacy:${new URL(item.href).pathname.split('/').at(-1)}`;
    const original = extracts.sources.find((entry) => entry.primary_url === item.href);
    const extracted = original ? extractAuthoredMarkdown({ markdown: original.body_markdown_exact,
      documentId: id, canonicalUrl: item.href, bindings: ledger.documents[id]?.sections }) : { passages: [], sections: [], gaps: ['Original authored body unavailable.'] };
    bindings[id] = extracted.sections;
    register({ id, kind: 'legacy', title: original?.page_title ?? item.title, canonicalUrl: item.href,
      sourceFingerprint: original ? fingerprint(original.body_markdown_exact) : fingerprint(item),
      sourceFiles: ['src/data/legacyWork.ts', 'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json'],
      representations: [item.href], dates: dates(original?.date_visible ?? item.datePublished),
      ownership: emptyOwnership('Authored legacy retrospective', ['Authored first-person and team language retained. Unnamed collaborator scope does not establish sole ownership.',
        'Source-visible publication date differs from portfolio card metadata. Work period is not inferred from either date.']),
      disclosure: 'public', gaps: extracted.gaps, passages: extracted.passages,
      ...(candidate ? { externalCandidate: candidate } : {}) });
  }
  const agenticBrain = await readJson(join(workspaceRoot, 'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json'));
  const agenticCandidate = external.find((entry) => entry.canonicalUrl === agenticBrain.source_url);
  const agenticId = agenticCandidate.id;
  const agenticExtracted = extractAuthoredMarkdown({ markdown: agenticBrain.body_markdown_exact, documentId: agenticId,
    canonicalUrl: agenticBrain.source_url, bindings: ledger.documents[agenticId]?.sections });
  bindings[agenticId] = agenticExtracted.sections;
  register({ id: agenticId, kind: 'legacy', title: agenticBrain.source_page_title, canonicalUrl: agenticBrain.source_url,
    sourceFingerprint: fingerprint(agenticBrain.body_markdown_exact),
    sourceFiles: ['src/content/work/agentic-brain.mdx', 'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json'],
    representations: [agenticBrain.source_url], dates: dates(agenticBrain.visible_date_iso),
    ownership: emptyOwnership('Historical self-authored ML and context-system retrospective', [
      'Steve Oak / Okkar Kyaw byline. January 2026 self-published narrative, not independently verified metrics or a validated scientific result.',
      'SOKK/UOCE design and lessons are historical self-described work. Job-search context and tool descriptions do not establish current status.']),
    disclosure: 'public', gaps: agenticExtracted.gaps, passages: agenticExtracted.passages, externalCandidate: agenticCandidate });
  for (const candidate of external.filter((entry) => entry.profileRecord || !documents.some((doc) => doc.canonicalUrl === entry.canonicalUrl))) {
    if (candidate.profileRecord) {
      if (documents.some((document) => document.id === candidate.id)) throw new Error(`Duplicate profile record identity: ${candidate.id}`);
      const projected = projectProfileRecord(candidate, ledger.documents[candidate.id], ledger.authority);
      const exclusionReason = retrievalExclusions.get(candidate.id);
      documents.push(exclusionReason ? { ...projected, decision: { state: 'excluded', reason: exclusionReason } } : projected);
      continue;
    }
    const exclusionReason = retrievalExclusions.get(candidate.id);
    documents.push({ id: candidate.id, kind: candidate.kind, title: candidate.title,
      canonicalUrl: candidate.canonicalUrl, sourceFingerprint: fingerprint(candidate), sourceFiles: [],
      representations: [candidate.canonicalUrl], dates: dates(candidate.published ?? null),
      ownership: emptyOwnership('Candidate', candidate.qualifiers ?? []), disclosure: 'public',
      decision: exclusionReason ? { state: 'excluded', reason: exclusionReason } : { state: 'pending', reason: candidate.reason },
      gaps: candidate.gaps ?? [], passages: [], externalCandidate: candidate });
  }
  const eligibleDocuments = selectEligibleDocuments(documents);
  for (const document of eligibleDocuments) {
    if (!Array.isArray(ledger.documents[document.id]?.publicCollaborators)) {
      throw new Error(`Eligible source lacks explicit curated public collaborators: ${document.id}`);
    }
    if (!Array.isArray(ledger.documents[document.id]?.publicQualifiers)) {
      throw new Error(`Eligible source lacks explicit curated public qualifiers: ${document.id}`);
    }
  }
  return { schema: 'oak.knowledge-inventory.v1', policyVersion: ledger.policyVersion,
    authority: ledger.authority, policyFingerprint: fingerprint(policy), reviewFingerprint: fingerprint(ledger), sourceBuild: { sourceFingerprint: receipt.sourceFingerprint,
      buildFingerprint: receipt.buildFingerprint, importedAuthoredBodiesFingerprint: fingerprint({ legacy: extracts, agenticBrain }), verifiedSources: Object.fromEntries(verifiedSources), verifiedPages: Object.fromEntries(verifiedPages),
      compilerManifestFingerprint: fingerprint(await readFile(join(workspaceRoot, 'package.json'))),
      receiptManifestHashesPrecedeBuildToolOnlyDependencies: ['yaml@2.8.4', 'unified@11.0.5', 'remark-parse@11.0.0'] },
    documents, bindings, eligibleDocuments, conflicts: ledger.conflicts,
    counts: { logicalDocuments: documents.length, eligibleDocuments: eligibleDocuments.length,
      eligiblePassages: eligibleDocuments.reduce((count, doc) => count + doc.passages.length, 0),
      currentWork: workFiles.length, timeline: careerTimelineItems.length, legacy: legacyFramerCaseStudies.length },
    sourceFamilies: { ownerProfileRecords: documents.filter((document) => document.sourceFamily === 'owner-profile-record')
      .map((document) => ({ id: document.id, kind: document.kind, decision: document.decision.state,
        sourceFingerprint: document.sourceFingerprint, provenance: document.provenance, gaps: document.gaps })) },
    missingContent: ledger.missingContent };
}

export async function writeInventory(input) {
  const inventory = await inspectPortfolioCorpus(input);
  const directory = resolve(input.outputDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  await writeFile(join(directory, 'eligible-preview.json'), `${JSON.stringify({ schema: 'oak.eligible-preview.v1',
    policyVersion: inventory.policyVersion, documents: inventory.eligibleDocuments }, null, 2)}\n`);
  return inventory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [renderedSiteRoot, receiptPath] = process.argv.slice(2);
  if (!renderedSiteRoot || !receiptPath) throw new Error('Usage: node scripts/knowledge/corpus.mjs <dist> <build-receipt>');
  const result = await writeInventory({ workspaceRoot: process.cwd(), renderedSiteRoot, receiptPath,
    ledgerPath: 'knowledge/review.json', outputDirectory: 'artifacts/oak-ai-agent-2026-10-03/knowledge-build' });
  process.stdout.write(`${JSON.stringify(result.counts)}\n`);
}
