import { digest } from './release-boundary.mjs';

const need = (value, code) => { if (!value) throw new Error(code); };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object'
  ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  : JSON.stringify(value);
export const identityCommitment = value => digest(canonical(value));

export function canonicalIdentityOwnedDocumentIds(scopeId) {
  need(/^[a-z][a-z0-9-]{0,39}$/.test(scopeId), 'owned-synthetic-scope-invalid');
  return ['edit', 'delete', 'restrict', 'retain-a', 'retain-b'].map(role => `work:owner-synthetic:${scopeId}-${role}`);
}

function checkedRegistry(value) {
  need(value && Object.keys(value).sort().join(',') === 'documents,generation,passages,text' &&
    Number.isSafeInteger(value.generation) && value.generation >= 0, 'canonical-identity-registry-invalid');
  for (const key of ['documents', 'passages', 'text']) {
    need(Array.isArray(value[key]) && value[key].every(item => typeof item === 'string' && item.trim() && item === item.trim()) &&
      new Set(value[key]).size === value[key].length && identityCommitment(value[key]) === identityCommitment([...value[key]].sort()),
    'canonical-identity-registry-invalid');
  }
  return value;
}

/** This is the canonical release digest, whose property order is significant.
 * Native source/plan commitments use identityCommitment instead. */
export function canonicalSnapshotRevision(snapshot) {
  const { revision: _revision, ...content } = snapshot;
  return `oak-${digest(content)}`;
}

export function deriveCanonicalOriginalIdentity(baseSnapshot, baseRegistry, actualRegistry, scopeId) {
  const before = checkedRegistry(baseRegistry), after = checkedRegistry(actualRegistry);
  const owned = canonicalIdentityOwnedDocumentIds(scopeId);
  need(baseSnapshot && baseSnapshot.schema === 'oak.public-knowledge.v2' && Array.isArray(baseSnapshot.documents) &&
    baseSnapshot.revision === canonicalSnapshotRevision(baseSnapshot) &&
    baseSnapshot.revocationGeneration === before.generation, 'approved-canonical-original-required');
  const publicIds = new Set(baseSnapshot.documents.flatMap(document => [document.id, ...document.passages.map(passage => passage.id)]));
  need(baseSnapshot.documents.every(document => !document.id.startsWith('work:owner-synthetic:')) &&
    owned.every(id => !publicIds.has(id) && !before.documents.includes(id)), 'private-owned-identity-only-required');
  need(after.generation === before.generation + 1 &&
    identityCommitment(after.documents) === identityCommitment([...before.documents, ...owned].sort()) &&
    identityCommitment(after.passages) === identityCommitment(before.passages) &&
    identityCommitment(after.text) === identityCommitment(before.text), 'only-exact-owned-document-revocations-required');
  const snapshot = structuredClone(baseSnapshot);
  snapshot.revocationGeneration = after.generation;
  snapshot.revision = canonicalSnapshotRevision(snapshot);
  return snapshot;
}
