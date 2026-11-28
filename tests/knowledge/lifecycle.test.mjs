import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { preview as astroPreview } from 'astro';
import { spawn } from 'node:child_process';
import { makeIsolatedWorkspace } from '../../scripts/knowledge/lifecycle-preview.mjs';
import { lifecycleRoot, bootstrapRevision } from '../../scripts/knowledge/lifecycle-store.mjs';
import { digest, readJson, publicSnapshotPath, verifyRelease } from '../../scripts/knowledge/release-boundary.mjs';
import { captureContent } from '../../scripts/knowledge/content-owners.mjs';

// One real CLI round trip over the published portfolio, in a copied owner-only fixture workspace.
// It exercises the same Astro/compiler/transaction seams that the owner uses, not a fake lifecycle.
test('real owner commands preview, CAS approve, restore only authored content, and keep revocations monotonic', {timeout:300000}, async()=>{
  const root=process.cwd(),directory=join(root,lifecycleRoot),runId=randomUUID(),workspace=join(directory,'workflow-runs',runId,'workspace');
  await makeIsolatedWorkspace(root,workspace);
  const logs=join(directory,'workflow-runs',runId,'logs');await mkdir(logs,{recursive:true});
  let sequence=0;
  const cli=(args,{fail=false,script='scripts/knowledge/lifecycle.mjs'}={})=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script,...args],{cwd:workspace,env:{...process.env},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    const number=++sequence;
    child.on('error',reject);child.on('close',async(code)=>{
      try{await writeFile(join(logs,`${String(number).padStart(2,'0')}-${args[0]}.log`),stdout+stderr);
        if(fail){assert.notEqual(code,0);return resolve({code,stdout,stderr});}
        assert.equal(code,0,stderr+'\n'+stdout.slice(-3000));
        const last=stdout.trim().split('\n').at(-1);resolve(JSON.parse(last));
      }catch(error){reject(error);}
    });
  });
  const initialized=await cli(['init']);const baselineRevision=initialized.revision;
  const invalid=await cli(['rollback','oak-0669ab287fef6327c3b175590d396cec1661b50c43b6414d7ed9cce3e459d8d3','--expect',baselineRevision],{fail:true});
  assert.match(invalid.stderr,/recorded approved revision/);
  const owner='src/content/work/ecosmartloop.mdx',original=await readFile(join(workspace,owner),'utf8');
  const old='The model mattered. Orbi made the answer usable.';
  const replacement='The model mattered. Orbi made the answer usable. I learned to treat that interface as part of the AI product.';
  assert.ok(original.includes(old));
  const snapshotBefore=digest(await readFile(join(workspace,publicSnapshotPath)));
  await writeFile(join(workspace,owner),original.replace(old,replacement));
  const candidate=await cli(['preview']);
  const candidateManifest=await readJson(join(workspace,'knowledge/candidates',candidate.id,'manifest.json'));
  assert.deepEqual(candidateManifest.affectedOwners,[owner]);
  assert.equal(digest(await readFile(join(workspace,publicSnapshotPath))),snapshotBefore,'A preview cannot replace active generated retrieval');
  assert.equal((await cli(['status'])).revision,baselineRevision);
  const preview=join(workspace,candidate.outputDirectory);
  for(const path of ['work/ecosmartloop/index.html','api/md/work/ecosmartloop','llms-full.txt','api/knowledge.json']) {
    assert.ok((await readFile(join(preview,path),'utf8')).includes('I learned to treat that interface as part of the AI product.'),`Missing changed fact in ${path}`);
  }
  const pkgPath=join(workspace,'package.json'),packageBefore=await readFile(pkgPath,'utf8');
  await writeFile(pkgPath,packageBefore+'\n');
  const stale=await cli(['approve',candidate.id,'--digest',candidate.digest,'--expect',baselineRevision,'--authority','Local workflow boundary proof'],{fail:true});
  assert.match(stale.stderr,/stale promotion rejected/);assert.equal((await cli(['status'])).revision,baselineRevision);
  await writeFile(pkgPath,packageBefore);
  const attempts=await Promise.all([cli(['approve',candidate.id,'--digest',candidate.digest,'--expect',baselineRevision,'--authority','Local workflow boundary proof']).then(value=>({ok:true,value})).catch(error=>({ok:false,error})),
    cli(['approve',candidate.id,'--digest',candidate.digest,'--expect',baselineRevision,'--authority','Local workflow boundary proof']).then(value=>({ok:true,value})).catch(error=>({ok:false,error}))]);
  assert.equal(attempts.filter(item=>item.ok).length,1,'Exclusive compare-and-switch permits one winner');
  const promoted=attempts.find(item=>item.ok).value;
  assert.equal((await cli(['status'])).revision,promoted.revision);
  const duplicate=await cli(['approve',candidate.id,'--digest',candidate.digest,'--expect',baselineRevision,'--authority','Local workflow boundary proof'],{fail:true});
  assert.match(duplicate.stderr,/Expected active revision changed/);
  const mixedGuardPath=join(workspace,'src/data/machineContent.ts'),beforeMixedGuard=await readFile(mixedGuardPath,'utf8');
  await writeFile(mixedGuardPath,beforeMixedGuard.replace('Steve Oak is Okkar Kyaw, a Bay Area AI/design engineer focused on applied AI systems','UNSUPPORTED_MACHINE_FACT_CANARY'));
  const rejectedFact=await cli(['public'],{script:'scripts/knowledge/release.mjs',fail:true});assert.match(rejectedFact.stderr,/authored content/);
  await writeFile(mixedGuardPath,beforeMixedGuard);
  const pendingBody=await readFile(join(workspace,owner),'utf8');
  await writeFile(join(workspace,owner),pendingBody+'\nPending unpublished owner words.\n');
  const refusedRollback=await cli(['rollback',baselineRevision,'--expect',promoted.revision],{fail:true});assert.match(refusedRollback.stderr,/unpublished authored edits/);
  assert.ok((await readFile(join(workspace,owner),'utf8')).includes('Pending unpublished owner words.'));await writeFile(join(workspace,owner),pendingBody);
  assert.equal((await cli(['recover'])).status,'clean');
  const projection=await cli(['read']);const originalCache=projection.cacheKey;
  await mkdir(join(workspace,'knowledge/derived',originalCache),{recursive:true});
  await writeFile(join(workspace,'knowledge/derived',originalCache,'retrieval.json'),JSON.stringify(projection.snapshot));
  // Changes to renderer, package and proof code are intentionally not content rollback inputs.
  const feature='export const OWNER_WORKFLOW_FEATURE_CANARY = true;\n';
  await writeFile(join(workspace,'src/lib/owner-workflow-feature.ts'),feature);
  const mixed='src/data/machineContent.ts',mixedBefore=await readFile(join(workspace,mixed),'utf8');
  await writeFile(join(workspace,mixed),mixedBefore+'\nexport const OWNER_MIXED_FEATURE_CANARY = true;\n');
  await writeFile(pkgPath,packageBefore+'\n');
  const auditPath=join(workspace,'scripts/knowledge/audit-release.mjs'),auditBefore=await readFile(auditPath,'utf8');
  await writeFile(auditPath,auditBefore+'\n// OWNER_PROOF_ONLY_CANARY\n');
  await verifyRelease({root:workspace,outputDirectory:join(workspace,'dist')});
  const rollback=await cli(['rollback',baselineRevision,'--expect',promoted.revision]);
  assert.equal(rollback.restores.length,1);assert.equal(rollback.restores[0].path,owner);
  const restored=await cli(['approve',rollback.id,'--digest',rollback.digest,'--expect',promoted.revision,'--authority','Local approved-content rollback proof']);
  assert.equal(await readFile(join(workspace,owner),'utf8'),original,'Authored MDX and first-person voice restored exactly');
  assert.equal(await readFile(join(workspace,'src/lib/owner-workflow-feature.ts'),'utf8'),feature);
  assert.ok((await readFile(join(workspace,mixed),'utf8')).endsWith('export const OWNER_MIXED_FEATURE_CANARY = true;\n'));
  assert.equal(await readFile(pkgPath,'utf8'),packageBefore+'\n');
  assert.ok((await readFile(auditPath,'utf8')).includes('OWNER_PROOF_ONLY_CANARY'));
  const active=await cli(['read']);
  const retired=active.snapshot.documents.find(doc=>doc.id==='legacy-personal-software-era').passages.find(p=>p.text.length>150);
  assert.ok(retired);
  const revoked=await cli(['revoke','passage',retired.id,'--expect',restored.revision,'--authority','Local synthetic retirement proof']);
  assert.equal(revoked.revocationGeneration,1);
  assert.equal((await cli(['read',retired.id])).passage,null);
  const retiredRead=await cli(['read',retired.id,'--cache',originalCache],{fail:true});assert.match(retiredRead.stderr,/Retired derived cache identity/);
  await assert.rejects(readdir(join(workspace,'knowledge/derived')),/ENOENT/);
  const afterRevokeRollback=await cli(['rollback',promoted.revision,'--expect',revoked.revision]);
  const restoredWithRevocation=await cli(['approve',afterRevokeRollback.id,'--digest',afterRevokeRollback.digest,'--expect',revoked.revision,'--authority','Local monotonic rollback proof']);
  assert.equal(restoredWithRevocation.revocationGeneration,1);
  assert.equal((await cli(['read',retired.id])).passage,null);
  const finalPreview=join(workspace,afterRevokeRollback.outputDirectory);
  assert.ok(!(await readFile(join(finalPreview,'api/knowledge.json'),'utf8')).includes(retired.text));
  assert.ok((await readFile(join(finalPreview,'work/ecosmartloop/index.html'),'utf8')).includes('I learned to treat that interface as part of the AI product.'));
  // A canonical Work retirement also retires already-built endpoints and a running Astro preview.
  const publicRender=await cli(['public'],{script:'scripts/knowledge/release.mjs'});
  const server=await astroPreview({root:workspace,outDir:publicRender.outputDirectory,cacheDir:`${lifecycleRoot}/http-cache/astro`,
    server:{host:'localhost',port:0},vite:{cacheDir:`${lifecycleRoot}/http-cache/vite`}});
  let httpRetirement=false,canonicalRenderRejected=false,privatePreviewRejected=false;
  try {
    const origin=`http://localhost:${server.port}`;
    const oldAPI=await fetch(`${origin}/api/knowledge.json`);assert.equal(oldAPI.status,200);
    const beforeRetirement=await oldAPI.json();
    const canonicalPassage=beforeRetirement.documents.find(doc=>doc.id==='work:ecosmartloop').passages.find(p=>p.text.includes('The model mattered. Orbi made the answer usable.'));
    assert.ok(canonicalPassage);
    const activeBeforeCanonical=await cli(['status']);
    await cli(['revoke','passage',canonicalPassage.id,'--expect',activeBeforeCanonical.revision,'--authority','Local canonical Work retirement proof']);
    assert.equal((await cli(['read',canonicalPassage.id])).passage,null);
    for(const route of ['/api/knowledge.json','/api/md/work/ecosmartloop','/llms-full.txt','/profile.json','/api/machine/ecosmartloop.json']) {
      const response=await fetch(`${origin}${route}`,{headers:{'Cache-Control':'no-cache'}});assert.notEqual(response.status,200,`Old emitted endpoint still served: ${route}`);
    }
    httpRetirement=true;
    const refused=await cli(['public'],{script:'scripts/knowledge/release.mjs',fail:true});
    assert.match(refused.stderr,/Activation rejected/);canonicalRenderRejected=true;
    const factBeforePrivate=await readFile(join(workspace,owner),'utf8');
    await writeFile(join(workspace,owner),factBeforePrivate+'\n<p data-knowledge-disclosure="private">T03_PRIVATE_CLI_CANARY</p>\n<p data-knowledge-disclosure="contact-only">T03_CONTACT_CLI_CANARY</p>\n');
    const activeBeforePrivate=await cli(['status']);
    const refusedPreview=await cli(['preview'],{fail:true});assert.match(refusedPreview.stderr,/Activation rejected/);
    assert.equal((await cli(['status'])).revision,activeBeforePrivate.revision);
    privatePreviewRejected=true;await writeFile(join(workspace,owner),factBeforePrivate);
  } finally {await server.stop();}
  const report={schema:'oak.lifecycle-proof.v1',passed:true,fixtureWorkspace:workspace,
    acceptedBootstrap:bootstrapRevision,startingApprovedRevision:baselineRevision,candidate,promoted,staleRejected:true,unsupportedMachineFactRejected:true,unpublishedOwnerEditPreserved:true,cleanRecoveryVerified:true,oneConcurrentCASWinner:true,duplicateRejected:true,
    rollback,restored,authoredVoicePreserved:true,unrelatedFeaturePackageProofEditsPreserved:true,
    retiredPassageId:retired.id,revoked,oldDerivedCacheRejected:true,derivedCopiesInvalidated:true,
    afterRevokeRollback,restoredWithRevocation,monotonicReadback:true,publicAPIRevocationReadback:true,httpRetirement,canonicalRenderRejected,privatePreviewRejected,
    finalContentIdentity:(await captureContent(workspace)).contentIdentity,commands:sequence};
  await writeFile(join(directory,'workflow-proof.json'),JSON.stringify(report,null,2)+'\n');
});
