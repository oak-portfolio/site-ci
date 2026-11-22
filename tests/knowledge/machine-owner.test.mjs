import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { makeIsolatedWorkspace } from '../../scripts/knowledge/lifecycle-preview.mjs';
import { lifecycleRoot, bootstrapRevision } from '../../scripts/knowledge/lifecycle-store.mjs';

test('real CLI restores approved Machine copy by bounded AST spans under the current renderer', {timeout:240000}, async()=>{
  const root=process.cwd(),runId=randomUUID(),directory=join(root,lifecycleRoot,'machine-runs',runId),workspace=join(directory,'workspace');
  await makeIsolatedWorkspace(root,workspace);await mkdir(join(directory,'logs'),{recursive:true});let sequence=0;
  const cli=args=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['scripts/knowledge/lifecycle.mjs',...args],{cwd:workspace,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);const step=++sequence;
    child.on('error',reject);child.on('close',async code=>{try{await writeFile(join(directory,'logs',`${step}-${args[0]}.log`),out+err);assert.equal(code,0,err+out.slice(-1000));resolve(JSON.parse(out.trim().split('\n').at(-1)));}catch(error){reject(error);}});
  });
  const baselineRevision=(await cli(['init'])).revision;
  const path='src/data/machineContent.ts',original=await readFile(join(workspace,path),'utf8');
  const before='Steve Oak is Okkar Kyaw, a Bay Area AI/design engineer focused on applied AI systems';
  const after='The portfolio describes Steve Oak as Okkar Kyaw, a Bay Area AI/design engineer focused on applied AI systems';
  assert.ok(original.includes(before));await writeFile(join(workspace,path),original.replace(before,after));
  const candidate=await cli(['preview']);
  const approved=await cli(['approve',candidate.id,'--digest',candidate.digest,'--expect',baselineRevision,'--authority','Local reviewed Machine wording qualification proof']);
  const feature='\nexport const MACHINE_CURRENT_RENDERER_FEATURE = true;\n';await writeFile(join(workspace,path),(await readFile(join(workspace,path),'utf8'))+feature);
  const rollback=await cli(['rollback',baselineRevision,'--expect',approved.revision]);
  assert.deepEqual(rollback.restores.map(item=>item.path),[path]);
  const restored=await cli(['approve',rollback.id,'--digest',rollback.digest,'--expect',approved.revision,'--authority','Local bounded Machine rollback proof']);
  assert.equal(await readFile(join(workspace,path),'utf8'),original+feature);
  const actual=await readFile(join(workspace,rollback.outputDirectory,'api/md/index.html'),'utf8');assert.ok(actual.includes(before));assert.ok(!actual.includes(after));
  // An operator may manually restore exactly the other selected approved value.
  // The command recognizes it without treating unrelated renderer code as a draft.
  await writeFile(join(workspace,path),original.replace(before,after)+feature);
  const manual=await cli(['rollback',approved.revision,'--expect',restored.revision]);assert.equal(manual.restores.length,0);
  const manualApproved=await cli(['approve',manual.id,'--digest',manual.digest,'--expect',restored.revision,'--authority','Local exact-selected-value recognition proof']);
  assert.equal(await readFile(join(workspace,path),'utf8'),original.replace(before,after)+feature);
  const report={schema:'oak.machine-owner-rollback-proof.v1',passed:true,workspace,candidate,approved,rollback,restored,
    machineSummaryRestored:true,boundedMixedSourceRestore:true,currentRendererFeaturePreserved:true,manual,manualApproved,
    exactSelectedValueRecognized:true,commands:sequence};
  await writeFile(join(root,lifecycleRoot,'machine-owner-proof.json'),JSON.stringify(report,null,2)+'\n');
});
