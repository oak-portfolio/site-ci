import { hashJson } from '../../workers/oak-agent/src/knowledge/embedding-plan.ts';
import { digest } from './release-boundary.mjs';
import { prepareEmbeddingPlan } from './embedding-plan.mjs';

/** Trusted owner-script seam. Constructed by the reviewed source pipeline,
 * never a CLI JSON flag or visitor payload. Native transport is absent unless
 * a separately authorized server assembly supplies it. */
export async function stageReviewedPublication({ source, tokenizer, actor, expectedPointer }) {
  if (!actor || typeof actor.stagePublication !== 'function' || !source?.authorityReceiptSha256 ||
    !source?.releaseReceiptSha256) throw new Error('retrieval-publication-unavailable');
  const plan = await prepareEmbeddingPlan({ ...source, tokenizer });
  return actor.stagePublication(plan, { sequence: expectedPointer.sequence, generationId: expectedPointer.generationId });
}

/** Exact script release to hosted ready candidate, with honest separate commits.
 * Source/pointer mismatch stays unavailable until explicit recovery. */
export function reviewedPublicationReleasePort(actor, { candidateId, expectedPointer, prepareRevocationSource }) {
  let releaseReceiptHash;
  return {
    async revokeReviewedRelease({ snapshot, revocations, authority }) {
      // This callable belongs to the reviewed owner pipeline. It updates/loads
      // the actor supplier before source commit; it is never a JSON approval flag.
      if (typeof prepareRevocationSource !== 'function' || !authority?.trim() ||
        snapshot.revocationGeneration !== revocations.generation) throw new Error('retrieval-revocation-source-unavailable');
      const source = await prepareRevocationSource({ snapshot, revocations, authority });
      if (!source || hashJson(source.snapshot) !== hashJson(snapshot) || hashJson(source.revocations) !== hashJson(revocations) ||
        !/^[a-f0-9]{64}$/.test(source.authorityReceiptSha256) || source.approval?.knowledgeRevision !== snapshot.revision ||
        source.approval?.revocationGeneration !== revocations.generation) throw new Error('retrieval-revocation-source-mismatch');
      const pointer = await actor.revokePublication({ snapshotHash: hashJson(snapshot), revocationsHash: hashJson(revocations),
        authorityReceiptHash: source.authorityReceiptSha256 });
      if (!pointer?.blocked || pointer.knowledgeRevision !== snapshot.revision || pointer.currentRevocationGeneration !== revocations.generation)
        throw new Error('retrieval-revocation-pointer-mismatch');
      return pointer;
    },
    async beforeRelease({ snapshot, inventory, manifest }) {
      const candidate = await actor.publicationCandidate(candidateId);
      releaseReceiptHash = digest(manifest);
      if (!candidate || candidate.state !== 'ready' || candidate.snapshotRevision !== snapshot.revision ||
        candidate.revocationGeneration !== snapshot.revocationGeneration || candidate.inventoryHash !== hashJson(inventory) ||
        candidate.releaseReceiptHash !== releaseReceiptHash || candidate.expectedActiveSequence !== expectedPointer.sequence ||
        candidate.expectedActiveGenerationId !== expectedPointer.generationId)
        throw new Error('retrieval-publication-release-mismatch');
    },
    async afterRelease() {
      if (!releaseReceiptHash) throw new Error('retrieval-publication-release-missing');
      return actor.activatePublication({ candidateId, approvedDigest: candidateId,
        expectedSequence: expectedPointer.sequence, expectedGenerationId: expectedPointer.generationId, releaseReceiptHash });
    },
  };
}
