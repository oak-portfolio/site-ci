import ts from 'typescript';
import { identityCommitment } from './canonical-native-identity.mjs';
import { parsePublicFacetReview, checkReviewedPublicFacets, publicFacetReviewPath } from './audit-runtime.mjs';
import { publicSnapshotPath } from './release-boundary.mjs';
import { jsonBytes } from './owner-transaction.mjs';

export const canonicalIdentityPinPaths = Object.freeze([publicSnapshotPath, publicFacetReviewPath,
  'workers/oak-agent/wrangler.jsonc', 'workers/oak-agent/wrangler.hosted.jsonc', 'workers/oak-agent/test/wrangler.jsonc',
  'workers/oak-agent/tests/support/current-release.ts']);
const need = (value, code) => { if (!value) throw new Error(code); };

function replaceLiteralProperties(text, path, replacements) {
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith('.jsonc') ? ts.ScriptKind.JSON : ts.ScriptKind.TS), edits = [], found = new Set();
  const visit = node => {
    if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name)) && Object.hasOwn(replacements, node.name.text)) {
      const [before, after] = replacements[node.name.text], value = node.initializer;
      need(!found.has(node.name.text) && (ts.isStringLiteral(value) || ts.isNumericLiteral(value)) &&
        (ts.isNumericLiteral(value) ? Number(value.text) : value.text) === before, 'canonical-pin-prior-literal-mismatch');
      found.add(node.name.text);
      edits.push({ start: value.getStart(ast), end: value.end, text: JSON.stringify(after) });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  need(found.size === Object.keys(replacements).length, 'canonical-pin-literal-required');
  return edits.sort((a, b) => b.start - a.start).reduce((result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end), text);
}

export function canonicalIdentityPinWrites(beforeFiles, baseSnapshot, snapshot, reviewedIdentity, facetText) {
  need(Object.keys(beforeFiles).sort().join(',') === [...canonicalIdentityPinPaths].sort().join(','), 'exact-canonical-pin-files-required');
  const prior = parsePublicFacetReview(beforeFiles[publicFacetReviewPath], facetText);
  need(checkReviewedPublicFacets({ snapshot: baseSnapshot, ...prior }).length === 0 &&
    identityCommitment(reviewedIdentity) === identityCommitment({ ...prior.reviewedIdentity,
      knowledgeRevision: snapshot.revision, revocationGeneration: snapshot.revocationGeneration }) &&
    checkReviewedPublicFacets({ snapshot, reviewedIdentity, facetMap: prior.facetMap }).length === 0, 'exact-reviewed-canonical-facet-tuple-required');
  need(identityCommitment(JSON.parse(beforeFiles[publicSnapshotPath])) === identityCommitment(baseSnapshot), 'exact-canonical-pin-snapshot-required');
  return canonicalIdentityPinPaths.map(path => {
    const before = beforeFiles[path];
    let after;
    if (path === publicSnapshotPath) after = jsonBytes(snapshot);
    else if (path === publicFacetReviewPath) after = replaceLiteralProperties(before, path, {
      knowledgeRevision: [baseSnapshot.revision, snapshot.revision], revocationGeneration: [baseSnapshot.revocationGeneration, snapshot.revocationGeneration] });
    else if (path.endsWith('.jsonc')) after = replaceLiteralProperties(before, path, {
      KNOWLEDGE_REVISION: [baseSnapshot.revision, snapshot.revision], KNOWLEDGE_GENERATION: [String(baseSnapshot.revocationGeneration), String(snapshot.revocationGeneration)] });
    else {
      const ast = ts.createSourceFile(path, before, ts.ScriptTarget.Latest, true), edits = [];
      for (const statement of ast.statements) {
        if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const value = statement.moduleSpecifier, names = ['inventory.json', 'snapshot.json'];
        const name = names.find(item => value.text === `../../../../knowledge/releases/${baseSnapshot.revision}/${item}`);
        need(name, 'exact-current-release-import-required');
        edits.push({ start: value.getStart(ast), end: value.end, text: JSON.stringify(`../../../../knowledge/releases/${snapshot.revision}/${name}`), name });
      }
      need(edits.length === 2 && new Set(edits.map(edit => edit.name)).size === 2, 'both-current-release-imports-required');
      after = edits.sort((a, b) => b.start - a.start).reduce((result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end), before);
    }
    return { path, before, after };
  });
}
