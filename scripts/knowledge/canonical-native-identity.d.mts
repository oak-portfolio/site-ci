import type { PublicEmbeddingSnapshot } from '../../workers/oak-agent/src/knowledge/embeddingManifest.ts';
import type { RevocationRegistry } from '../../workers/oak-agent/src/knowledge/embedding-plan.ts';

export function identityCommitment(value: unknown): string;
export function canonicalIdentityOwnedDocumentIds(scopeId: string): string[];
export function canonicalSnapshotRevision(snapshot: PublicEmbeddingSnapshot): string;
export function deriveCanonicalOriginalIdentity<S extends PublicEmbeddingSnapshot>(baseSnapshot: S,
  baseRegistry: RevocationRegistry, actualRegistry: RevocationRegistry, scopeId: string): S;
