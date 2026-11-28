import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { identityCommitment } from './canonical-native-identity.mjs';

const hostedConfig = 'workers/oak-agent/wrangler.hosted.jsonc';
const configs = ['workers/oak-agent/wrangler.jsonc', hostedConfig, 'workers/oak-agent/test/wrangler.jsonc'];
const fixturePath = 'workers/oak-agent/tests/support/current-release.ts';
export const publicFacetReviewPath = 'workers/oak-agent/src/knowledge/reviewedPublicFacetIdentity.ts';
export const publicFacetMapPath = 'workers/oak-agent/src/knowledge/roleFitPublicFacets.ts';

function initializer(ast, name) {
  let found;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      if (found) throw new Error('Duplicate public facet declaration');
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!found) throw new Error(`Missing public facet declaration: ${name}`);
  return found;
}

export function parsePublicFacetReview(reviewText, facetText) {
  const reviewAst = ts.createSourceFile(publicFacetReviewPath, reviewText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const init = initializer(reviewAst, 'reviewedPublicFacetIdentity');
  if (!ts.isCallExpression(init) || init.expression.getText(reviewAst) !== 'Object.freeze' || init.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(init.arguments[0])) throw new Error('Public facet identity must be one frozen literal');
  const reviewedIdentity = {};
  for (const property of init.arguments[0].properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || Object.hasOwn(reviewedIdentity, property.name.text) ||
      (!ts.isStringLiteral(property.initializer) && !ts.isNumericLiteral(property.initializer))) throw new Error('Public facet identity is not a closed literal');
    reviewedIdentity[property.name.text] = ts.isNumericLiteral(property.initializer) ? Number(property.initializer.text) : property.initializer.text;
  }
  if (Object.keys(reviewedIdentity).sort().join(',') !== 'knowledgeRevision,publicDocumentsSha256,queryMapSha256,revocationGeneration,schema' ||
    reviewedIdentity.schema !== 'oak.public-facet-review.v1' || !/^oak-[a-f0-9]{64}$/.test(reviewedIdentity.knowledgeRevision) ||
    !Number.isSafeInteger(reviewedIdentity.revocationGeneration) || reviewedIdentity.revocationGeneration < 0 ||
    ![reviewedIdentity.publicDocumentsSha256, reviewedIdentity.queryMapSha256].every(value => /^[a-f0-9]{64}$/.test(value))) {
    throw new Error('Public facet identity has an invalid tuple');
  }
  const facetAst = ts.createSourceFile(publicFacetMapPath, facetText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const array = initializer(facetAst, 'facets');
  if (!ts.isArrayLiteralExpression(array) || array.elements.length !== 14) throw new Error('Public facet map must contain the fourteen reviewed rows');
  const facetMap = array.elements.map(row => {
    if (!ts.isObjectLiteralExpression(row) || row.properties.length !== 4) throw new Error('Invalid public facet map row');
    const result = {};
    for (const property of row.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) ||
        !['id', 'passageId', 'query', 'match'].includes(property.name.text) || Object.hasOwn(result, property.name.text)) throw new Error('Invalid public facet map field');
      const key = property.name.text, value = property.initializer;
      if (key === 'match') {
        if (value.kind !== ts.SyntaxKind.RegularExpressionLiteral) throw new Error('Public facet match must be a literal regular expression');
        const text = value.getText(facetAst), end = text.lastIndexOf('/');
        result.match = { source: text.slice(1, end), flags: text.slice(end + 1) };
      } else {
        if (!ts.isStringLiteral(value)) throw new Error('Public facet text must be a literal');
        result[key] = value.text;
      }
    }
    return result;
  });
  return { reviewedIdentity, facetMap };
}

export async function readPublicFacetReview(root = process.cwd()) {
  return parsePublicFacetReview(await readFile(resolve(root, publicFacetReviewPath), 'utf8'),
    await readFile(resolve(root, publicFacetMapPath), 'utf8'));
}

export function checkReviewedPublicFacets({ snapshot, reviewedIdentity, facetMap }) {
  const findings = [];
  if (reviewedIdentity.knowledgeRevision !== snapshot.revision || reviewedIdentity.revocationGeneration !== snapshot.revocationGeneration) findings.push('Public facet review has a stale revision/generation tuple');
  if (reviewedIdentity.publicDocumentsSha256 !== identityCommitment(snapshot.documents)) findings.push('Public facet review has changed document commitments');
  if (reviewedIdentity.queryMapSha256 !== identityCommitment(facetMap)) findings.push('Public facet review has changed query-map commitments');
  if (new Set(facetMap.map(row => row.id)).size !== facetMap.length || facetMap.some(row =>
    !snapshot.documents.some(document => document.passages.some(passage => passage.id === row.passageId && passage.text.includes(row.query))))) findings.push('Public facet query has no exact current public passage');
  return findings;
}

// "" (or blank) is the cleared value: the Worker reads it as unset (ADR 0008).
const names = supersedes => supersedes !== undefined && !(typeof supersedes === 'string' && !supersedes.trim());

export function checkRuntimePins({ revision, generation, bindings, fixtureImports, baseRevision }) {
  const findings = [];
  for (const { path, vars } of bindings) {
    if (vars?.KNOWLEDGE_REVISION !== revision) findings.push(`${path}: stale knowledge revision`);
    if (vars?.KNOWLEDGE_GENERATION !== String(generation)) findings.push(`${path}: stale revocation generation`);
    // keep_vars: true keeps a var the config stops listing, so production clears only through an explicit "".
    if (path === hostedConfig && vars?.KNOWLEDGE_SUPERSEDES === undefined) {
      findings.push(`${path}: KNOWLEDGE_SUPERSEDES is missing; clear it with "" (keep_vars keeps a deleted var live in production)`);
    }
    // ADR 0008: a supersedes must name what main deploys, and only while this branch moves the revision off it.
    if (!names(vars?.KNOWLEDGE_SUPERSEDES)) continue;
    if (vars.KNOWLEDGE_REVISION === baseRevision) findings.push(`${path}: stale knowledge supersedes, clear it (the revision is unchanged from the merge base)`);
    else if (vars.KNOWLEDGE_SUPERSEDES !== baseRevision) findings.push(`${path}: stale knowledge supersedes, clear it (the merge base deploys ${baseRevision})`);
  }
  const expected = ['inventory.json', 'snapshot.json'].map(name => `knowledge/releases/${revision}/${name}`).sort();
  if (JSON.stringify([...fixtureImports].sort()) !== JSON.stringify(expected)) findings.push(`${fixturePath}: stale current fixture release`);
  return findings;
}

// The hosted revision main deploys, read from the merge base so a release names exactly the revision it replaces.
export function hostedRevisionOnMergeBase(root = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
  // A Snapshot is one parentless commit whose main is itself, so git cannot name the source merge base;
  // snapshot.mjs writes it down (ticket 273). With history, git stays the only authority.
  try {
    git('rev-parse', '--verify', '-q', 'HEAD^');
  } catch {
    try {
      const { hostedKnowledgeRevision } = JSON.parse(readFileSync(resolve(root, '.circleci/mirror/source-base.json'), 'utf8'));
      if (typeof hostedKnowledgeRevision === 'string') return hostedKnowledgeRevision;
    } catch { /* no file: fall through to git, which fails closed */ }
  }
  try {
    // Always fetch: CircleCI's checkout may lack origin/main, and a local origin/main may predate a release this branch holds.
    git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main');
    const base = git('merge-base', 'HEAD', 'refs/remotes/origin/main');
    const parsed = ts.parseConfigFileTextToJson(hostedConfig, git('show', `${base}:${hostedConfig}`));
    const revision = parsed.config?.vars?.KNOWLEDGE_REVISION;
    if (parsed.error || typeof revision !== 'string') throw new Error('no hosted revision');
    return revision;
  } catch {
    throw new Error('KNOWLEDGE_SUPERSEDES is set but the audit cannot read the merge base with origin/main ' +
      '(it fetches main first: offline, no credentials, or a shallow clone?). Fix the fetch (git fetch origin main) and rerun.');
  }
}

export async function auditRuntimePins(root = process.cwd()) {
  const active = JSON.parse(await readFile(resolve(root, 'knowledge/active.json'), 'utf8'));
  const generated = await readFile(resolve(root, 'src/data/generated/knowledgeSnapshot.json'));
  const snapshot = JSON.parse(generated);
  if (snapshot.revision !== active.revision || !generated.equals(await readFile(resolve(root, `knowledge/releases/${active.revision}/snapshot.json`)))) {
    throw new Error('Active, immutable and generated knowledge snapshots differ');
  }
  const bindings = [];
  for (const path of configs) {
    const parsed = ts.parseConfigFileTextToJson(path, await readFile(resolve(root, path), 'utf8'));
    if (parsed.error) throw new Error(`${path}: invalid JSONC`);
    bindings.push({ path, vars: parsed.config.vars });
  }
  const fixture = ts.createSourceFile(fixturePath, await readFile(resolve(root, fixturePath), 'utf8'), ts.ScriptTarget.Latest, true);
  const fixtureImports = fixture.statements.filter(ts.isExportDeclaration).map(statement => {
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) return '';
    return resolve(root, dirname(fixturePath), specifier.text).slice(resolve(root).length + 1);
  });
  const facetReview = await readPublicFacetReview(root);
  const baseRevision = bindings.some(({ vars }) => names(vars?.KNOWLEDGE_SUPERSEDES)) ? hostedRevisionOnMergeBase(root) : undefined;
  const findings = [...checkRuntimePins({ revision: snapshot.revision, generation: snapshot.revocationGeneration ?? 0, bindings, fixtureImports, baseRevision }),
    ...checkReviewedPublicFacets({ snapshot, ...facetReview })];
  if (findings.length) throw new Error(findings.join('\n'));
  return { schema: 'oak.knowledge-runtime-pin-audit.v1', status: 'passed', revision: snapshot.revision,
    revocationGeneration: snapshot.revocationGeneration ?? 0, checkedConfigs: configs, checkedFixture: fixturePath,
    checkedPublicFacetReview: publicFacetReviewPath, publicDocumentsSha256: facetReview.reviewedIdentity.publicDocumentsSha256,
    queryMapSha256: facetReview.reviewedIdentity.queryMapSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await auditRuntimePins()));
}
