import { cp, mkdir, readFile, writeFile, symlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { activeState, initializeLifecycle, immutableJson, lifecycleRoot, readApprovedArchive } from './lifecycle-store.mjs';
import { captureContent, contentProjection, restoreAuthoredAtoms, assertRollbackInput } from './content-owners.mjs';
import { captureSource, digest, readJson, publicSnapshotPath, changedSources } from './release-boundary.mjs';
import { renderRevision, writeJson } from './release.mjs';
import { inspectPortfolioCorpus } from './corpus.mjs';
import { createPublicSnapshot } from './snapshot.mjs';
import { assertPublishableRender, restrictedPublicationText } from './publication.mjs';
import { applyRevocations } from './revocations.mjs';
import { jsonBytes } from './owner-transaction.mjs';

export const isolatedWorkspaceFolders=['src','public','scripts','knowledge','packages','agent-policy'];
export const isolatedWorkspaceFiles=['astro.config.mjs','package.json','package-lock.json','tsconfig.json',
  'design/visual-integration/oak-agent-assets-v2.json',
  'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json',
  'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json'];
export async function makeIsolatedWorkspace(root,workspace) {
  await mkdir(workspace,{recursive:true});
  for(const path of isolatedWorkspaceFolders) {
    try { await cp(join(root,path),join(workspace,path),{recursive:true,mode:constants.COPYFILE_FICLONE,
      filter:source=>!source.includes('/knowledge/.owner-lock')&&!source.includes('/knowledge/transaction.json')&&!source.includes('/knowledge/derived')}); }
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(const path of isolatedWorkspaceFiles) {
    await mkdir(join(workspace,path,'..'),{recursive:true}); await cp(join(root,path),join(workspace,path));
  }
  await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
}
async function inspect(root,receipt) {
  const receiptPath=join(root,`${lifecycleRoot}/render-receipt.json`);
  await writeJson(receiptPath,receipt);
  return inspectPortfolioCorpus({workspaceRoot:root,renderedSiteRoot:join(root,receipt.outputDirectory),receiptPath,ledgerPath:join(root,'knowledge/review.json')});
}
const restorePaths=new Set(['src/pages/index.astro','src/data/legacyWork.ts','artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json','artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json','knowledge/external-candidates.json','src/data/homePage.ts','src/data/careerTimeline.ts','src/data/machineContent.ts',
  'src/data/machineContent.server.ts','src/lib/machineMarkdown.ts','src/pages/apps/kusala-daily/index.astro','src/pages/apps/kusala-daily/support/index.astro','src/pages/apps/kusala-daily/privacy/index.astro']);
export function assertRestoreOwner(path) {
  if(!restorePaths.has(path)&&!/^src\/content\/work\/(agentic-brain|ecosmartloop|linkedin-growth-loop|oakminder|omnisocial)\.mdx$/.test(path)) {
    throw new Error(`Restore needs an explicit owner write allowance: ${path}`);
  }
}
export async function previewCandidate(root,{rollbackRevision,expectedRevision}={}) {
  await initializeLifecycle(root);
  const active=await activeState(root);
  if(expectedRevision&&active.revision!==expectedRevision)throw new Error('Expected active revision changed');
  const before=await captureSource(root),content=await captureContent(root);
  const policy=await readJson(join(root,'knowledge/policy.json')),review=await readJson(join(root,'knowledge/review.json'));
  const workspaceRelative=`${lifecycleRoot}/workspaces/${randomUUID()}`,workspace=join(root,workspaceRelative);
  await makeIsolatedWorkspace(root,workspace);
  const restores=[];
  if(rollbackRevision) {
    const selected=await readApprovedArchive(root,active,rollbackRevision);
    const baseline=await readApprovedArchive(root,active,active.revision);
    assertRollbackInput(content.archive,baseline,selected);
    if(Object.keys(selected).join()!==Object.keys(baseline).join())throw new Error('Structural rollback needs explicit owner edits');
    for(const [path,target] of Object.entries(selected)) {
      const current=await readFile(join(root,path),'utf8');
      const restored=restoreAuthoredAtoms(current,baseline[path],target);
      if(restored!==current) {
        assertRestoreOwner(path);
        await writeFile(join(workspace,path),restored);
        restores.push({path,beforeHash:digest(current),afterHash:digest(restored)});
      }
    }
  }
  // First render discovers the actual authored passages. Only the isolated ledger becomes a proposed review.
  const discoveryReceipt=await renderRevision({root:workspace,preview:true});
  const discovery=await inspect(workspace,discoveryReceipt);
  const proposedReview=structuredClone(review);
  const changedDocuments=[];
  for(const document of discovery.documents.filter(doc=>doc.passages.length)) {
    const previous=proposedReview.documents[document.id];
    if(previous?.sourceFingerprint!==document.sourceFingerprint)changedDocuments.push(document.id);
    proposedReview.documents[document.id]={...(previous??{exceptions:[]}),sourceFingerprint:document.sourceFingerprint,
      sections:discovery.bindings[document.id]??previous?.sections??[]};
  }
  await writeJson(join(workspace,'knowledge/review.json'),proposedReview);
  const reviewRender=await renderRevision({root:workspace,preview:true});
  const inventory=await inspect(workspace,reviewRender);
  const stagedContent=await captureContent(workspace);
  const deniedText=[...restrictedPublicationText(inventory),...active.lifecycle.revocations.text];
  // Raw private bodies must not be made legal by a retrieval-only filter.
  // Revoked source excerpts are removed in the generated candidate before the final render.
  await assertPublishableRender({root:workspace,outputDirectory:reviewRender.outputDirectory,deniedText:restrictedPublicationText(inventory)});
  const unrevoked={...createPublicSnapshot(inventory,stagedContent.contentIdentity),buildIdentity:reviewRender.sourceFingerprint};
  const snapshot=applyRevocations(unrevoked,active.lifecycle.revocations);
  await writeFile(join(workspace,publicSnapshotPath),jsonBytes(snapshot));
  const receipt=await renderRevision({root:workspace,preview:true});
  const publicationCheck=await assertPublishableRender({root:workspace,outputDirectory:receipt.outputDirectory,deniedText});
  const finalInventory=await inspect(workspace,receipt);
  if(digest(applyRevocations({...createPublicSnapshot(finalInventory,stagedContent.contentIdentity),buildIdentity:reviewRender.sourceFingerprint},active.lifecycle.revocations))!==digest(snapshot))throw new Error('Candidate retrieval changed between compilation and final render');
  const after=await captureSource(root);
  if(after.sourceIdentity!==before.sourceIdentity||digest(await activeState(root))!==digest(active))throw new Error('Source or active revision changed during candidate preview');
  const approvedArchive=await readApprovedArchive(root,active,active.revision);
  const approvedProjection=contentProjection(approvedArchive);
  const affectedOwners=Object.keys(stagedContent.contentFiles).filter(path=>stagedContent.contentFiles[path]!==digest(approvedProjection[path]));
  const affectedOutputs=[...new Set(affectedOwners.flatMap(path=>stagedContent.archive[path].owner.outputs.map(output=>output.replace('{slug}',path.split('/').at(-1).replace(/\.mdx$/,''))))),'/api/knowledge.json'];
  const previewFiles=Object.keys(receipt.buildFiles).filter(path=>path.endsWith('.html')||/\.md$|\.txt$|\.json$/.test(path));
  const payload={schema:'oak.owner-candidate.v1',expectedActiveRevision:active.revision,expectedActiveHash:digest(active),
    expectedRendererIdentity:before.sourceIdentity,inputContentIdentity:content.contentIdentity,inputPolicyIdentity:digest(policy),inputReviewIdentity:digest(review),
    contentIdentity:stagedContent.contentIdentity,policyIdentity:snapshot.policyIdentity,reviewIdentity:digest(proposedReview),revocationGeneration:active.lifecycle.revocations.generation,
    rollbackOf:rollbackRevision??null,changedDocuments,restores,workspace:workspaceRelative,
    snapshotHash:digest(jsonBytes(snapshot)),archiveHash:digest(stagedContent.archive),receiptHash:digest(receipt),inventoryHash:digest(finalInventory),
    outputDirectory:`${workspaceRelative}/${receipt.outputDirectory}`,publicationCheck,previewFiles,
    affectedOwners,affectedOutputs,
    surfaces:{human:'Rendered canonical HTML with metadata/schema',machine:'Rendered Markdown and Machine JSON',profile:'profile.json and agent-profile.json',llm:'llms.txt and llms-full.txt',retrieval:'Exact snapshot.json passages'},
    authority:'Candidate only. Review the exact candidate digest before explicit local approval. No external publication.'};
  const id=`candidate-${digest(payload)}`,directory=join(root,'knowledge/candidates',id);
  await immutableJson(join(directory,'manifest.json'),payload);
  await immutableJson(join(directory,'snapshot.json'),snapshot);
  await immutableJson(join(directory,'archive.json'),stagedContent.archive);
  await immutableJson(join(directory,'review.json'),proposedReview);
  await immutableJson(join(directory,'receipt.json'),receipt);
  await immutableJson(join(directory,'inventory.json'),finalInventory);
  await immutableJson(join(root,`${lifecycleRoot}/previews/${id}.json`),{id,...payload});
  return{id,digest:id.slice(10),revision:snapshot.revision,outputDirectory:payload.outputDirectory,changedDocuments,restores,counts:finalInventory.counts,revocationGeneration:payload.revocationGeneration};
}
