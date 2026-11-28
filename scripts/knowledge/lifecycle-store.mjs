import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, readJson, publicSnapshotPath } from './release-boundary.mjs';
import { atomicWrite, jsonBytes, withOwnerLock, clearAbandonedLock } from './owner-transaction.mjs';
import { captureContent } from './content-owners.mjs';
import { emptyRevocations, knowledgeCacheIdentity } from './revocations.mjs';
import { retireLocalOutputs } from './local-outputs.mjs';

export const bootstrapRevision = 'oak-7de137a393006ca5e8f1e3e100cb775bb201e3f5ba013a0bf863f3872ef0718f';
export const lifecycleRoot = 'artifacts/oak-ai-agent-2026-10-03/knowledge-lifecycle';
export const activeState = root => readJson(join(root,'knowledge/active.json'));
export async function initializeLifecycle(root) {
  return withOwnerLock(root,async()=>{
    const active=await activeState(root);
    if(active.lifecycle) return active;
    if(active.revision!==bootstrapRevision) throw new Error('Only the independently accepted T02 bootstrap may seed approvals');
    const manifest=await readJson(join(root,`knowledge/releases/${active.revision}/manifest.json`));
    const bytes=await readFile(join(root,publicSnapshotPath));
    if(active.schema!=='oak.active-knowledge.v1'||manifest.schema!=='oak.reviewed-release.v1'||
    (active.lifecycle&&!active.lifecycle.approved[active.revision])||active.manifestHash!==digest(manifest)||manifest.snapshotHash!==digest(bytes)) throw new Error('Accepted bootstrap hash mismatch');
    const content=await captureContent(root);
    for(const [path,value] of Object.entries(content.archive)) if(digest(value.text)!==manifest.sourceFiles[path]) throw new Error(`Bootstrap authored owner changed: ${path}`);
    const review=await readJson(join(root,'knowledge/review.json'));
    if(digest(review)!==manifest.reviewIdentity||digest(await readJson(join(root,'knowledge/policy.json')))!==manifest.policyIdentity) throw new Error('Bootstrap review or policy changed');
    const archivePath=`knowledge/archives/${active.revision}.json`;
    await immutableJson(join(root,archivePath),content.archive);
    const lifecycle={schema:'oak.owner-lifecycle.v1',contentIdentity:content.contentIdentity,reviewIdentity:digest(review),
      revocations:emptyRevocations(),approved:{[active.revision]:{archivePath,archiveHash:digest(content.archive),authority:'Root independently accepted T02 bootstrap',contentIdentity:content.contentIdentity}},sequence:0};
    const next={...active,lifecycle};
    await atomicWrite(join(root,'knowledge/active.json'),jsonBytes(next));
    return next;
  });
}
export async function immutableJson(path,value) {
  await mkdir(join(path,'..'),{recursive:true});
  try { await writeFile(path,jsonBytes(value),{flag:'wx'}); }
  catch(error) { if(error.code!=='EEXIST'||digest(await readJson(path))!==digest(value)) throw error; }
}
export async function readApprovedArchive(root,state,revision) {
  const approved=state.lifecycle?.approved[revision];
  if(!approved) throw new Error('Rollback requires a recorded approved revision; release-folder existence is insufficient');
  const archive=await readJson(join(root,approved.archivePath));
  if(digest(archive)!==approved.archiveHash) throw new Error('Approved content archive changed');
  return archive;
}
export async function readActiveProjection(root,{cacheKey}={}) {
  const active=await activeState(root);
  const generation=active.lifecycle?.revocations.generation??0;
  const key=knowledgeCacheIdentity(active.revision,generation);
  if(cacheKey&&cacheKey!==key) throw new Error('Retired derived cache identity');
  const snapshot=await readJson(join(root,`knowledge/releases/${active.revision}/snapshot.json`));
  const manifest=await readJson(join(root,`knowledge/releases/${active.revision}/manifest.json`));
  if(active.schema!=='oak.active-knowledge.v1'||manifest.schema!=='oak.reviewed-release.v1'||
    (active.lifecycle&&!active.lifecycle.approved[active.revision])||active.manifestHash!==digest(manifest)||manifest.snapshotHash!==digest(jsonBytes(snapshot))||snapshot.revision!==active.revision) throw new Error('Active projection integrity failure');
  if((snapshot.revocationGeneration??0)!==generation) throw new Error('Retired projection generation');
  if(active.lifecycle) {
    const retired=active.lifecycle.revocations;
    if(snapshot.documents.some(doc=>retired.documents.includes(doc.id)||doc.passages.some(p=>retired.passages.includes(p.id)||retired.text.some(text=>p.text.replace(/\s+/g,' ').includes(text.replace(/\s+/g,' ')))))) throw new Error('Revoked evidence in active projection');
  }
  if(digest(await activeState(root))!==digest(active)) throw new Error('Active projection changed during read; retry with current cache identity');
  return {snapshot,cacheKey:key};
}
export async function invalidateDerived(root) {
  await rm(join(root,'knowledge/derived'),{recursive:true,force:true});
  return retireLocalOutputs(root);
}
export async function recoverTransaction(root) {
  await clearAbandonedLock(root);
  return withOwnerLock(root,async()=>{
    const path=join(root,'knowledge/transaction.json');
    let journal;
    try {journal=await readJson(path);}catch(error){if(error.code==='ENOENT')return{status:'clean'};throw error;}
    const active=await activeState(root);
    const committed=digest(active)===journal.afterActiveHash;
    if(!committed&&digest(active)!==journal.beforeActiveHash) throw new Error('Recovery active pointer changed; preserve journal for owner inspection');
    for(const item of journal.writes) {
      if(item.path!==publicSnapshotPath && item.path!=='knowledge/review.json' && !/^src\/content\/work\/(agentic-brain|ecosmartloop|linkedin-growth-loop|oakminder|omnisocial)\.mdx$/.test(item.path) && !['src/pages/index.astro','src/data/legacyWork.ts','artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json','artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json','knowledge/external-candidates.json','src/data/homePage.ts','src/data/careerTimeline.ts','src/data/machineContent.ts','src/data/machineContent.server.ts','src/lib/machineMarkdown.ts','src/pages/apps/kusala-daily/index.astro','src/pages/apps/kusala-daily/support/index.astro','src/pages/apps/kusala-daily/privacy/index.astro','workers/oak-agent/src/knowledge/reviewedPublicFacetIdentity.ts','workers/oak-agent/wrangler.jsonc','workers/oak-agent/test/wrangler.jsonc','workers/oak-agent/tests/support/current-release.ts'].includes(item.path)) throw new Error('Recovery source outside authorized owner scope');
      const current=digest(await readFile(join(root,item.path)));
      if(current!==digest(item.before)&&current!==digest(item.after)) throw new Error(`Recovery preserves unrelated edit: ${item.path}`);
    }
    if(committed) await invalidateDerived(root);
    for(const item of journal.writes) await atomicWrite(join(root,item.path),committed?item.after:item.before);
    await immutableJson(join(root,`${lifecycleRoot}/recovery-${journal.id}.json`),{journalId:journal.id,status:committed?'finished-committed-transaction':'restored-pre-transaction',revision:active.revision});
    await rm(path);
    return{status:committed?'committed':'restored',revision:active.revision};
  });
}
