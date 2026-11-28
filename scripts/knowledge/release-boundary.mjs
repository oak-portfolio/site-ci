import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { assertNoOwnerTransaction } from './owner-transaction.mjs';

export const digest = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const publicSnapshotPath = 'src/data/generated/knowledgeSnapshot.json';
export const parityRoot = 'artifacts/oak-ai-agent-2026-10-03/knowledge-parity';
export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export async function hashTree(root, directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const result = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, await hashTree(root, path));
    else if (entry.isFile()) result[path] = digest(await readFile(join(root, path)));
    else throw new Error(`Symlink or unsupported release input: ${path}`);
  }
  return result;
}

export async function captureSource(root) {
  const inputs = {};
  for (const directory of ['src', 'public', 'scripts']) Object.assign(inputs, await hashTree(root, directory));
  delete inputs[publicSnapshotPath];
  for (const path of Object.keys(inputs)) if (/^scripts\/knowledge\/(?:audit[^/]*|prove-[^/]*)\.mjs$/.test(path)) delete inputs[path];
  for (const directory of ['packages', 'agent-policy']) {
    try { Object.assign(inputs, await hashTree(root, directory)); } catch(error) { if(error.code !== 'ENOENT') throw error; }
  }
  for (const path of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json',
    'knowledge/policy.json', 'knowledge/review.json', 'knowledge/external-candidates.json',
    'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/LEGACY-EXTRACTS.json',
    'artifacts/oak-ai-agent-2026-10-03/knowledge-inventory/AGENTIC-BRAIN-EXTRACT.json']) {
    inputs[path] = digest(await readFile(join(root, path)));
  }
  try { inputs['knowledge/owners.json'] = digest(await readFile(join(root,'knowledge/owners.json'))); } catch(error) { if(error.code !== 'ENOENT') throw error; }
  const sourceFiles = Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)));
  return { sourceFiles, sourceIdentity: digest(sourceFiles) };
}

export function changedSources(expected, actual) {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter(path => expected[path] !== actual[path]);
}

async function assertInside(root, path, directory) {
  const resolved = resolve(root, path), base = resolve(root, directory);
  if (!resolved.startsWith(`${base}${sep}`)) throw new Error(`Output must be isolated under ${directory}`);
  let cursor = resolve(root);
  for (const part of relative(root, resolved).split(sep)) {
    cursor = join(cursor, part);
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Isolated preview cannot traverse a symlink'); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  return relative(root, resolved);
}

export async function verifyRelease({ root, outputDirectory, previewPlanPath }) {
  const source = await captureSource(root);
  const snapshotBytes = await readFile(join(root, publicSnapshotPath));
  const snapshot = JSON.parse(snapshotBytes);
  if (previewPlanPath) {
    const planPath = await assertInside(root, previewPlanPath, `${parityRoot}/plans`);
    const plan = await readJson(join(root, planPath));
    const output = await assertInside(root, outputDirectory, `${parityRoot}/previews`);
    if (plan.schema !== 'oak.isolated-preview.v1' || output !== plan.outputDirectory ||
        plan.sourceIdentity !== source.sourceIdentity || plan.snapshotHash !== digest(snapshotBytes)) {
      throw new Error('Isolated preview plan does not match source, snapshot or destination');
    }
    return { ...source, mode: 'preview', revision: snapshot.revision, snapshotHash: digest(snapshotBytes) };
  }
  await assertNoOwnerTransaction(root);
  const active = await readJson(join(root, 'knowledge/active.json'));
  if (!/^oak-[a-f0-9]{64}$/.test(active.revision)) throw new Error('Invalid active knowledge revision');
  const releaseRoot = join(root, 'knowledge/releases', active.revision);
  const manifest = await readJson(join(releaseRoot, 'manifest.json'));
  const immutableBytes = await readFile(join(releaseRoot, 'snapshot.json'));
  const { revision, ...content } = snapshot;
  if (active.lifecycle) {
    const { captureContent } = await import('./content-owners.mjs');
    const content = await captureContent(root);
    if (active.schema !== 'oak.active-knowledge.v1' || active.lifecycle.schema !== 'oak.owner-lifecycle.v1' ||
        manifest.schema !== 'oak.reviewed-release.v1' || manifest.revision !== active.revision ||
        !active.lifecycle.approved[active.revision] ||
        active.lifecycle.approved[active.revision].contentIdentity !== active.lifecycle.contentIdentity ||
        snapshot.policyIdentity !== manifest.policyIdentity ||
        content.contentIdentity !== active.lifecycle.contentIdentity ||
        active.lifecycle.reviewIdentity !== digest(await readJson(join(root,'knowledge/review.json'))) ||
        manifest.policyIdentity !== digest(await readJson(join(root,'knowledge/policy.json'))) ||
        active.manifestHash !== digest(manifest) || manifest.snapshotHash !== digest(snapshotBytes) ||
        !immutableBytes.equals(snapshotBytes) || snapshot.revision !== active.revision ||
        revision !== `oak-${digest(contentWithoutRevision(snapshot))}` ||
        (snapshot.revocationGeneration ?? 0) !== active.lifecycle.revocations.generation) {
      throw new Error('Public build rejected: authored content, disclosure or snapshot is not approved');
    }
    return {...source, mode:'public', revision:active.revision, snapshotHash:digest(snapshotBytes),
      deniedPublicationText:[...(manifest.deniedPublicationText ?? []),...active.lifecycle.revocations.text]};
  }
  if (active.schema !== 'oak.active-knowledge.v1' || active.manifestHash !== digest(manifest) ||
      manifest.schema !== 'oak.reviewed-release.v1' || manifest.revision !== active.revision ||
      manifest.sourceIdentity !== source.sourceIdentity || snapshot.sourceIdentity !== source.sourceIdentity ||
      manifest.policyIdentity !== digest(await readJson(join(root, 'knowledge/policy.json'))) ||
      snapshot.policyIdentity !== manifest.policyIdentity || snapshot.revision !== active.revision ||
      revision !== `oak-${digest(content)}` || manifest.snapshotHash !== digest(snapshotBytes) ||
      !immutableBytes.equals(snapshotBytes) || changedSources(manifest.sourceFiles, source.sourceFiles).length) {
    throw new Error('Public build rejected: source, policy or snapshot is not the reviewed active release');
  }
  return { ...source, mode: 'public', revision: active.revision, snapshotHash: digest(snapshotBytes),
    deniedPublicationText: manifest.deniedPublicationText ?? [] };
}

export async function verifyBuildStable(root, initial) {
  const current = await captureSource(root);
  const changes = changedSources(initial.sourceFiles, current.sourceFiles);
  if (changes.length || digest(await readFile(join(root, publicSnapshotPath))) !== initial.snapshotHash) {
    throw new Error(`Source or snapshot changed during render: ${changes.join(', ')}`);
  }
  return current;
}

function contentWithoutRevision(snapshot) { const {revision,...content}=snapshot; return content; }
