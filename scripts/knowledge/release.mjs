import { build } from 'astro';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { captureSource, digest, hashTree, parityRoot, publicSnapshotPath, readJson, changedSources } from './release-boundary.mjs';
import { inspectPortfolioCorpus } from './corpus.mjs';
import { createPublicSnapshot } from './snapshot.mjs';
import { assertPublishableRender, restrictedPublicationText } from './publication.mjs';

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
export async function writeJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, jsonBytes(value));
}

export async function renderRevision({ root, preview = false }) {
  const before = await captureSource(root);
  const snapshotHash = digest(await readFile(join(root, publicSnapshotPath)));
  const planId = digest({ sourceIdentity: before.sourceIdentity, snapshotHash });
  const outputDirectory = preview ? `${parityRoot}/previews/${planId}` : `${parityRoot}/public/${(await readJson(join(root, 'knowledge/active.json'))).revision}`;
  const cacheDirectory = `${parityRoot}/caches/${planId}`;
  const planPath = `${parityRoot}/plans/${planId}.json`;
  if (preview) await writeJson(join(root, planPath), { schema: 'oak.isolated-preview.v1',
    sourceIdentity: before.sourceIdentity, snapshotHash, outputDirectory });
  const priorPreview = process.env.OAK_KNOWLEDGE_PREVIEW_PLAN;
  const priorCache = process.env.STEVE_OAK_VITE_CACHE_DIR;
  if (preview) process.env.OAK_KNOWLEDGE_PREVIEW_PLAN = planPath;
  else delete process.env.OAK_KNOWLEDGE_PREVIEW_PLAN;
  process.env.STEVE_OAK_VITE_CACHE_DIR = `${cacheDirectory}/vite`;
  try {
    await build({ root, outDir: outputDirectory, cacheDir: `${cacheDirectory}/astro`,
      vite: { cacheDir: `${cacheDirectory}/vite` } });
    // Match the existing public-assets owner without invoking its fixed root-dist command.
    await rm(join(root, outputDirectory, 'assets/dev/hero-variants'), { recursive: true, force: true });
    const emitted = await hashTree(root, outputDirectory);
    for (const path of Object.keys(emitted)) if (/assets\/mascot\/.*(?:contact-sheet|validation\.json)/.test(path)) {
      await rm(join(root, path), { force: true });
      delete emitted[path];
    }
    const after = await captureSource(root);
    const changes = changedSources(before.sourceFiles, after.sourceFiles);
    if (changes.length) throw new Error(`Source drift: ${changes.join(', ')}`);
    const buildFiles = Object.fromEntries(Object.entries(emitted).map(([path, hash]) => [path.slice(outputDirectory.length + 1), hash]));
    const receipt = { schema: 'oak.source-build-receipt.v1', status: 'passed', exitCode: 0,
      mode: preview ? 'isolated-preview' : 'public', outputDirectory, sourceFiles: before.sourceFiles,
      sourceFingerprint: before.sourceIdentity, buildFiles, buildFingerprint: digest(buildFiles), sourceChangesDuringBuild: changes };
    await writeJson(join(root, `${parityRoot}/receipts/${preview ? 'preview' : 'public'}-${planId}.json`), receipt);
    return receipt;
  } finally {
    if (priorPreview === undefined) delete process.env.OAK_KNOWLEDGE_PREVIEW_PLAN;
    else process.env.OAK_KNOWLEDGE_PREVIEW_PLAN = priorPreview;
    if (priorCache === undefined) delete process.env.STEVE_OAK_VITE_CACHE_DIR;
    else process.env.STEVE_OAK_VITE_CACHE_DIR = priorCache;
  }
}

export async function compileInitialRevision({ root, receiptPath }) {
  // Only bootstrap an empty release store. Later activation belongs to T03.
  try { await access(join(root, 'knowledge/active.json')); throw new Error('Initial release already exists; candidate activation requires the owner lifecycle'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const receipt = await readJson(receiptPath);
  if (receipt.mode !== 'isolated-preview') throw new Error('Compile requires an isolated matching render');
  const emitted = await hashTree(root, receipt.outputDirectory);
  const emittedFiles = Object.fromEntries(Object.entries(emitted).map(([path, hash]) => [path.slice(receipt.outputDirectory.length + 1), hash]));
  if (digest(emittedFiles) !== receipt.buildFingerprint || changedSources(receipt.buildFiles, emittedFiles).length) {
    throw new Error('Rendered outputs changed after their build receipt');
  }
  const inventory = await inspectPortfolioCorpus({ workspaceRoot: root, renderedSiteRoot: join(root, receipt.outputDirectory),
    receiptPath, ledgerPath: join(root, 'knowledge/review.json') });
  const deniedPublicationText = restrictedPublicationText(inventory);
  const publicationCheck = await assertPublishableRender({ root, outputDirectory: receipt.outputDirectory, deniedText: deniedPublicationText });
  const source = await captureSource(root);
  if (source.sourceIdentity !== receipt.sourceFingerprint) throw new Error('Stale render cannot initialize release');
  const snapshot = createPublicSnapshot(inventory, source.sourceIdentity);
  const snapshotBytes = jsonBytes(snapshot);
  const manifest = { schema: 'oak.reviewed-release.v1', revision: snapshot.revision,
    sourceIdentity: source.sourceIdentity, sourceFiles: source.sourceFiles, policyIdentity: snapshot.policyIdentity,
    policyVersion: snapshot.policyVersion, reviewIdentity: inventory.reviewFingerprint,
    snapshotHash: digest(snapshotBytes), gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    deniedPublicationText, publicationCheck,
    authority: 'Approved T02 initial locally reviewed historical revision. T03 activation workflow is not implemented.' };
  const releasePath = join(root, 'knowledge/releases', snapshot.revision);
  await mkdir(releasePath, { recursive: true });
  await writeFile(join(releasePath, 'snapshot.json'), snapshotBytes, { flag: 'wx' });
  await writeFile(join(releasePath, 'manifest.json'), jsonBytes(manifest), { flag: 'wx' });
  await writeFile(join(root, publicSnapshotPath), snapshotBytes);
  await writeFile(join(root, 'knowledge/active.json'), jsonBytes({ schema: 'oak.active-knowledge.v1', revision: snapshot.revision, manifestHash: digest(manifest) }), { flag: 'wx' });
  await writeJson(join(root, `${parityRoot}/compiled-inventory.json`), inventory);
  return { revision: snapshot.revision, sourceIdentity: source.sourceIdentity, counts: inventory.counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, receiptPath] = process.argv.slice(2);
  const root = process.cwd();
  const result = action === 'preview' ? await renderRevision({ root, preview: true }) :
    action === 'public' ? await renderRevision({ root }) :
    action === 'compile-initial' ? await compileInitialRevision({ root, receiptPath: resolve(receiptPath) }) :
    (() => { throw new Error('Usage: release.mjs preview|public|compile-initial <receipt>'); })();
  console.log(JSON.stringify(action === 'compile-initial' ? result : { mode: result.mode, outputDirectory: result.outputDirectory, sourceFingerprint: result.sourceFingerprint }));
}
