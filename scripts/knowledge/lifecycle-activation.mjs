import { readFile, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { captureSource, digest, readJson, hashTree, publicSnapshotPath, changedSources } from './release-boundary.mjs';
import { captureContent } from './content-owners.mjs';
import { activeState, immutableJson, lifecycleRoot, readActiveProjection, readApprovedArchive, invalidateDerived } from './lifecycle-store.mjs';
import { assertRestoreOwner } from './lifecycle-preview.mjs';
import { atomicWrite, jsonBytes, withOwnerLock } from './owner-transaction.mjs';
import { nextRevocations, applyRevocations } from './revocations.mjs';
import { assertPublishableRender, restrictedPublicationText } from './publication.mjs';
import { deriveCanonicalOriginalIdentity, identityCommitment } from './canonical-native-identity.mjs';
import { canonicalIdentityPinPaths, canonicalIdentityPinWrites } from './canonical-identity-pins.mjs';
import { publicFacetMapPath } from './audit-runtime.mjs';

async function commit(root,active,next,writes,receipt,expectedPostSource) {
  const id=randomUUID(),journal={schema:'oak.owner-transaction.v1',id,beforeActiveHash:digest(active),afterActiveHash:digest(next),writes};
  const journalPath=join(root,'knowledge/transaction.json');
  try {await access(journalPath);throw new Error('Incomplete owner transaction; recover it before a new change');}catch(error){if(error.code!=='ENOENT')throw error;}
  await atomicWrite(journalPath,jsonBytes(journal));
  try {
    for(const item of writes) {
      if(digest(await readFile(join(root,item.path)))!==digest(item.before))throw new Error(`Current source CAS failed: ${item.path}`);
      await atomicWrite(join(root,item.path),item.after);
    }
    if(expectedPostSource && (await captureSource(root)).sourceIdentity !== expectedPostSource) throw new Error('Source changed inside owner transaction');
    // Recheck the pointer inside the same exclusive transaction immediately before atomic switch.
    if(digest(await activeState(root))!==digest(active))throw new Error('Active compare-and-swap failed');
    await atomicWrite(join(root,'knowledge/active.json'),jsonBytes(next));
    const retiredOutputs = await invalidateDerived(root);
    await immutableJson(join(root,`${lifecycleRoot}/transactions/${id}.json`),{...receipt,id,retiredOutputs,revision:next.revision,activeHash:digest(next),externalPublication:false});
    await rm(join(root,'knowledge/transaction.json'));
    return{id,revision:next.revision,revocationGeneration:next.lifecycle.revocations.generation,externalPublication:false};
  }catch(error){throw new Error(`${error.message}. Recovery journal retained; run lifecycle recover.`);}
}

/** Only the five fixed identity pins may enter this owner transaction. */
export async function commitCanonicalIdentityTransaction(root, { active, next, writes, receipt, expectedPostSource }) {
  return withOwnerLock(root, async () => {
    if (receipt?.schema !== 'oak.canonical-native-identity-approval.v1' || !receipt.authority?.trim() ||
      !/^candidate-[a-f0-9]{64}$/.test(receipt.candidate) || receipt.approvedDigest !== receipt.candidate.slice(10) ||
      !Array.isArray(writes) || writes.length !== canonicalIdentityPinPaths.length ||
      new Set(writes.map(write => write.path)).size !== writes.length ||
      writes.some(write => Object.keys(write).sort().join(',') !== 'after,before,path' ||
        !canonicalIdentityPinPaths.includes(write.path) || typeof write.before !== 'string' || typeof write.after !== 'string')) {
      throw new Error('Canonical identity transaction requires exact reviewed fixed writes');
    }
    const candidate = await readJson(join(root, `knowledge/candidates/${receipt.candidate}/manifest.json`));
    if (candidate.schema !== 'oak.canonical-native-identity-candidate.v1' || digest(candidate) !== receipt.approvedDigest ||
      digest(candidate.writes) !== digest(writes) || candidate.base.activeHash !== digest(active) ||
      candidate.base.sourceIdentity !== receipt.expectedSourceIdentity || candidate.scopeId !== receipt.scopeId ||
      identityCommitment(candidate.reviewedIdentity) !== identityCommitment(receipt.reviewedIdentity) ||
      !Array.isArray(candidate.pins) || candidate.pins.length === 0 || candidate.pins.length > 2048 ||
      new Set(candidate.pins.map(pin => pin.path)).size !== candidate.pins.length) {
      throw new Error('Canonical identity approval does not match the exact staged candidate');
    }
    for (const pin of candidate.pins) {
      if (typeof pin.path !== 'string' || pin.path.startsWith('/') || pin.path.split('/').includes('..') ||
        !Number.isSafeInteger(pin.bytes) || pin.bytes <= 0 || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error('Invalid canonical candidate evidence pin');
      const bytes = await readFile(join(root, pin.path));
      if (bytes.length !== pin.bytes || digest(bytes) !== pin.sha256) throw new Error('Canonical candidate source or native evidence changed');
    }
    const beforeFiles = Object.fromEntries(writes.map(write => [write.path, write.before]));
    const before = JSON.parse(beforeFiles[publicSnapshotPath]);
    const snapshot = deriveCanonicalOriginalIdentity(before, active.lifecycle.revocations, next.lifecycle.revocations, receipt.scopeId);
    const approved = { archivePath: `knowledge/archives/${snapshot.revision}.json`,
      archiveHash: active.lifecycle.approved[active.revision].archiveHash, authority: receipt.authority, candidate: receipt.candidate,
      contentIdentity: active.lifecycle.contentIdentity, derivedNativeRereleaseOf: active.revision };
    if (before.revision !== active.revision || next.revision !== snapshot.revision ||
      identityCommitment(next.lifecycle.revocations) !== identityCommitment(candidate.registry) ||
      identityCommitment(next) !== identityCommitment({ ...active, revision: snapshot.revision, manifestHash: next.manifestHash,
        lifecycle: { ...active.lifecycle, revocations: next.lifecycle.revocations, sequence: active.lifecycle.sequence + 1,
          approved: { ...active.lifecycle.approved, [snapshot.revision]: approved } } })) {
      throw new Error('Canonical identity transaction changed unrelated owner state');
    }
    const expectedWrites = canonicalIdentityPinWrites(beforeFiles, before, snapshot, receipt.reviewedIdentity,
      await readFile(join(root, publicFacetMapPath), 'utf8'));
    if (digest(writes) !== digest(expectedWrites) || digest(await activeState(root)) !== digest(active) ||
      (await captureSource(root)).sourceIdentity !== receipt.expectedSourceIdentity) {
      throw new Error('Canonical identity candidate or active evidence changed before commit');
    }
    const release = `knowledge/releases/${snapshot.revision}`;
    const priorManifest = await readJson(join(root, `knowledge/releases/${active.revision}/manifest.json`));
    const manifest = await readJson(join(root, release, 'manifest.json'));
    if (digest(manifest) !== next.manifestHash || digest(manifest) !== digest({ ...priorManifest,
      revision: snapshot.revision, snapshotHash: digest(jsonBytes(snapshot)), inventoryPath: `${release}/inventory.json`,
      authority: receipt.authority, approvedCandidate: receipt.candidate, derivedNativeRereleaseOf: active.revision,
      revocationGeneration: snapshot.revocationGeneration }) ||
      await readFile(join(root, release, 'snapshot.json'), 'utf8') !== jsonBytes(snapshot) ||
      digest(await readJson(join(root, release, 'inventory.json'))) !== candidate.base.inventoryHash ||
      digest(await readApprovedArchive(root, next, next.revision)) !== approved.archiveHash) {
      throw new Error('Canonical immutable release or approval changed before commit');
    }
    if (expectedPostSource !== receipt.expectedSourceIdentity) throw new Error('Canonical identity expected source changed');
    return commit(root, active, next, writes, receipt, expectedPostSource);
  });
}
export async function approveCandidate(root,id,{expectedRevision,approvedDigest,authority,retrievalPublication}) {
  if(!/^candidate-[a-f0-9]{64}$/.test(id)||approvedDigest!==id.slice(10)||!expectedRevision||!authority?.trim())throw new Error('Approval requires exact candidate digest, expected active revision and explicit local authority');
  return withOwnerLock(root,async()=>{
    const directory=join(root,'knowledge/candidates',id),candidate=await readJson(join(directory,'manifest.json'));
    if(`candidate-${digest(candidate)}`!==id)throw new Error('Candidate manifest changed');
    const active=await activeState(root),source=await captureSource(root),content=await captureContent(root);
    if(active.revision!==expectedRevision||active.revision!==candidate.expectedActiveRevision||digest(active)!==candidate.expectedActiveHash)throw new Error('Expected active revision changed; stale promotion rejected');
    if(source.sourceIdentity!==candidate.expectedRendererIdentity||content.contentIdentity!==candidate.inputContentIdentity||
      digest(await readJson(join(root,'knowledge/policy.json')))!==candidate.inputPolicyIdentity||
      digest(await readJson(join(root,'knowledge/review.json')))!==candidate.inputReviewIdentity||
      active.lifecycle.revocations.generation!==candidate.revocationGeneration)throw new Error('Source, policy, renderer or revocations changed; stale promotion rejected');
    const snapshot=await readJson(join(directory,'snapshot.json')),archive=await readJson(join(directory,'archive.json')),
      review=await readJson(join(directory,'review.json')),receipt=await readJson(join(directory,'receipt.json')),inventory=await readJson(join(directory,'inventory.json'));
    if(candidate.snapshotHash!==digest(jsonBytes(snapshot))||candidate.archiveHash!==digest(archive)||candidate.reviewIdentity!==digest(review)||candidate.receiptHash!==digest(receipt)||candidate.inventoryHash!==digest(inventory))throw new Error('Candidate evidence changed');
    const workspace=join(root,candidate.workspace),rendered=await hashTree(workspace,receipt.outputDirectory);
    const files=Object.fromEntries(Object.entries(rendered).map(([path,hash])=>[path.slice(receipt.outputDirectory.length+1),hash]));
    if(digest(files)!==receipt.buildFingerprint||changedSources(receipt.buildFiles,files).length)throw new Error('Preview output changed');
    const stagedSource=await captureSource(workspace);
    if(stagedSource.sourceIdentity!==receipt.sourceFingerprint)throw new Error('Preview renderer or content changed');
    const deniedPublicationText=[...restrictedPublicationText(inventory),...active.lifecycle.revocations.text];
    await assertPublishableRender({root:workspace,outputDirectory:receipt.outputDirectory,deniedText:deniedPublicationText});
    const manifest={schema:'oak.reviewed-release.v1',revision:snapshot.revision,sourceIdentity:receipt.sourceFingerprint,sourceFiles:receipt.sourceFiles,
      contentIdentity:candidate.contentIdentity,rendererIdentity:receipt.sourceFingerprint,policyIdentity:candidate.policyIdentity,policyVersion:snapshot.policyVersion,
      reviewIdentity:digest(review),inventoryPath:`knowledge/releases/${snapshot.revision}/inventory.json`,inventoryHash:digest(inventory),snapshotHash:candidate.snapshotHash,deniedPublicationText,previewBuildFingerprint:receipt.buildFingerprint,
      authority,approvedCandidate:id,derivedRollbackOf:candidate.rollbackOf,revocationGeneration:candidate.revocationGeneration};
    if(retrievalPublication)await retrievalPublication.beforeRelease({snapshot,inventory,manifest});
    const release=join(root,'knowledge/releases',snapshot.revision);
    await immutableJson(join(release,'snapshot.json'),snapshot);
    await immutableJson(join(release,'manifest.json'),manifest);
    await immutableJson(join(release,'inventory.json'),inventory);
    const archivePath=`knowledge/archives/${snapshot.revision}.json`;
    await immutableJson(join(root,archivePath),archive);
    const approved={...active.lifecycle.approved,[snapshot.revision]:{archivePath,archiveHash:digest(archive),authority,candidate:id,contentIdentity:candidate.contentIdentity}};
    const next={schema:'oak.active-knowledge.v1',revision:snapshot.revision,manifestHash:digest(manifest),lifecycle:{...active.lifecycle,
      contentIdentity:candidate.contentIdentity,reviewIdentity:digest(review),approved,sequence:active.lifecycle.sequence+1}};
    const writes=[];
    for(const restore of candidate.restores) {
      assertRestoreOwner(restore.path);
      const before=await readFile(join(root,restore.path),'utf8'),after=await readFile(join(workspace,restore.path),'utf8');
      if(digest(before)!==restore.beforeHash||digest(after)!==restore.afterHash)throw new Error('Rollback source CAS changed');
      writes.push({path:restore.path,before,after});
    }
    writes.push({path:'knowledge/review.json',before:await readFile(join(root,'knowledge/review.json'),'utf8'),after:jsonBytes(review)},
      {path:publicSnapshotPath,before:await readFile(join(root,publicSnapshotPath),'utf8'),after:jsonBytes(snapshot)});
    // Last source check is under the owner lock. Files outside the lock can still be edited,
    // so each written owner has its own byte CAS and subsequent builds verify content again.
    if((await captureSource(root)).sourceIdentity!==source.sourceIdentity)throw new Error('Source changed before transaction');
    const committed=await commit(root,active,next,writes,{operation:candidate.rollbackOf?'derived-rollback':'approve',candidate:id,authority,
      selectedApprovedRevision:candidate.rollbackOf,previewBuildFingerprint:receipt.buildFingerprint,restores:candidate.restores},receipt.sourceFingerprint);
    if(retrievalPublication) {
      try{return {...committed,retrievalPointer:await retrievalPublication.afterRelease()};}
      catch(error){throw new Error(`Source release committed; retrieval activation pending: ${error.message}`);}
    }
    return committed;
  });
}
export async function revokeEvidence(root,kind,id,{expectedRevision,authority,retrievalPublication}) {
  if(!expectedRevision||!authority?.trim())throw new Error('Revocation requires expected active revision and explicit local authority');
  return withOwnerLock(root,async()=>{
    const active=await activeState(root);
    if(active.revision!==expectedRevision)throw new Error('Expected active revision changed');
    if(!active.lifecycle)throw new Error('Initialize owner lifecycle first');
    const {snapshot}=await readActiveProjection(root);
    const revocations=nextRevocations(active.lifecycle.revocations,snapshot,kind,id);
    const nextSnapshot=applyRevocations(snapshot,revocations);
    // Block hosted evidence before the source commit. Physical cleanup follows separately.
    if(retrievalPublication)await retrievalPublication.revokeReviewedRelease({snapshot:nextSnapshot,revocations,authority});
    const priorManifest=await readJson(join(root,`knowledge/releases/${active.revision}/manifest.json`));
    const manifest={...priorManifest,revision:nextSnapshot.revision,snapshotHash:digest(jsonBytes(nextSnapshot)),
      authority,derivedRevocationOf:active.revision,revocationGeneration:revocations.generation,deniedPublicationText:[...(priorManifest.deniedPublicationText??[]),...revocations.text]};
    await immutableJson(join(root,`knowledge/releases/${nextSnapshot.revision}/snapshot.json`),nextSnapshot);
    await immutableJson(join(root,`knowledge/releases/${nextSnapshot.revision}/manifest.json`),manifest);
    const next={...active,revision:nextSnapshot.revision,manifestHash:digest(manifest),lifecycle:{...active.lifecycle,revocations,
      sequence:active.lifecycle.sequence+1,approved:{...active.lifecycle.approved,[nextSnapshot.revision]:{...active.lifecycle.approved[active.revision],authority,derivedRevocationOf:active.revision}}}};
    return commit(root,active,next,[{path:publicSnapshotPath,before:await readFile(join(root,publicSnapshotPath),'utf8'),after:jsonBytes(nextSnapshot)}],
      {operation:'revoke',kind,evidenceId:id,authority,cacheGeneration:revocations.generation,
        publication:'Derived retrieval invalidated immediately. Public renders fail closed if canonical pages still contain retired text; edit that owner then preview and approve.'});
  });
}
