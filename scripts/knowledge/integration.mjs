import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { verifyRelease, verifyBuildStable } from './release-boundary.mjs';
import { assertPublishableRender } from './publication.mjs';
import { registerLocalOutput } from './local-outputs.mjs';
import { readJson } from './release-boundary.mjs';
import { join } from 'node:path';

export default function knowledgeReleaseGuard() {
  let command, root, output, initial;
  return { name: 'reviewed-knowledge-release', hooks: {
    'astro:config:setup': (options) => { command = options.command; },
    'astro:config:done': async ({ config }) => {
      if (command !== 'build') return;
      root = fileURLToPath(config.root);
      output = fileURLToPath(config.outDir);
      initial = await verifyRelease({ root, outputDirectory: output, previewPlanPath: process.env.OAK_KNOWLEDGE_PREVIEW_PLAN });
    },
    'astro:build:done': async () => {
      try {
        await verifyBuildStable(root, initial);
        if (initial.mode === 'public') await assertPublishableRender({ root, outputDirectory: output,
          deniedText: initial.deniedPublicationText });
        if(initial.mode === 'public') {
          const active = await readJson(join(root,'knowledge/active.json'));
          if(active.revision !== initial.revision) throw new Error('Active revision changed during public render');
          await registerLocalOutput(root,output,initial.revision,active.lifecycle?.revocations.generation ?? 0);
        }
      }
      catch (error) {
        await rm(output, { recursive: true, force: true });
        throw error;
      }
    },
  } };
}
