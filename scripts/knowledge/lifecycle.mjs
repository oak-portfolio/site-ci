import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson } from './release-boundary.mjs';
import { previewCandidate } from './lifecycle-preview.mjs';
import { approveCandidate, revokeEvidence } from './lifecycle-activation.mjs';
import { initializeLifecycle, activeState, readActiveProjection, recoverTransaction } from './lifecycle-store.mjs';
import { siteLibraryItem } from '../../src/data/siteLibrary.ts';

export const help = `Usage: node scripts/knowledge/lifecycle.mjs <command> [arguments]
  owners                            Show real source owners, their status and channels, and affected outputs.
  init                              Seed only independently accepted T02 bootstrap.
  status                            Show active revision and monotonic revocation generation.
  preview                           Render immutable owner-only candidate; never activates.
  approve <candidate> --digest <sha256> --expect <active> --authority <text>
                                    Explicit local approval of that exact rendered candidate.
  rollback <approved-revision> --expect <active>
                                    Preview owned-content restore under current renderer.
                                    Then approve its returned exact digest to restore and activate.
  revoke document|passage <id> --expect <active> --authority <text>
                                    Monotonically retire evidence and invalidate derived copies.
  read [passage-id] [--cache <key>]   Read active retrieval; reject stale cache identities.
  recover                           Finish committed or undo uncommitted journal safely.
  --help                            Show this verified CLI. No command deploys or publishes.`;
const option = (args,name) => {const index=args.indexOf(`--${name}`); return index<0?undefined:args[index+1];};
export function validateSiteLibraryFields(registry) {
  for(const owner of registry.owners)siteLibraryItem(owner);
  return registry;
}
export async function runLifecycle(root,args) {
  const [action,id,...rest]=args;
  const options={expectedRevision:option(args,'expect'),approvedDigest:option(args,'digest'),authority:option(args,'authority')};
  if(action==='--help'||!action)return help;
  if(action==='owners')return validateSiteLibraryFields(await readJson(join(root,'knowledge/owners.json')));
  if(action==='init')return initializeLifecycle(root);
  if(action==='status') {
    const active=await activeState(root);return{revision:active.revision,contentIdentity:active.lifecycle?.contentIdentity,
      approvedRevisions:Object.keys(active.lifecycle?.approved??{}),revocationGeneration:active.lifecycle?.revocations.generation??0};
  }
  if(action==='preview')return previewCandidate(root);
  if(action==='rollback')return previewCandidate(root,{rollbackRevision:id,expectedRevision:options.expectedRevision});
  if(action==='approve')return approveCandidate(root,id,options);
  if(action==='revoke')return revokeEvidence(root,id,rest[0],options);
  if(action==='recover')return recoverTransaction(root);
  if(action==='read') {
    const {snapshot,cacheKey}=await readActiveProjection(root,{cacheKey:option(args,'cache')});
    const passage=id&&!id.startsWith('--')?snapshot.documents.flatMap(doc=>doc.passages).find(p=>p.id===id):undefined;
    return{revision:snapshot.revision,cacheKey,...(id&&!id.startsWith('--')?{passage:passage??null}:{snapshot})};
  }
  throw new Error(help);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {const result=await runLifecycle(process.cwd(),process.argv.slice(2));console.log(typeof result==='string'?result:JSON.stringify(result));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
