import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { renderMascotImageSets } from "./lib/mascot-image-sets.mjs";

const repoRoot = process.cwd();
const publicRoot = path.join(repoRoot, "public");
const generatedRoot = path.join(publicRoot, "assets/generated");
const manifestPath = path.join(generatedRoot, "optimized-images-manifest.json");
const tsManifestPath = path.join(repoRoot, "src/data/generated/optimizedImages.ts");

if (process.argv.slice(2).join(" ") === "--manifest-only") {
  const manifest = await readBaselineManifest(manifestPath);
  if (Object.keys(manifest).length === 0) throw new Error("Generate image assets before rebuilding their TypeScript manifests.");
  await writeManifests(manifest);
  console.log(`Rebuilt TypeScript manifests for ${Object.keys(manifest).length} existing images.`);
  process.exit(0);
}

const workArticleSizes =
  "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc(100vw - 64px), 1120px";
const workCardSizes = "(max-width: 760px) min(326px, calc(100vw - 64px)), 326px";
const proofSizes = "(max-width: 760px) calc(100vw - 48px), (max-width: 1240px) calc(100vw - 96px), 821px";
const fullBleedSizes = "100vw";

const presets = {
  photo: {
    avif: { quality: 58, effort: 3 },
    webp: { quality: 82, effort: 4 },
  },
  ui: {
    avif: { quality: 72, effort: 3 },
    webp: { quality: 88, effort: 4 },
  },
  uiProof: {
    avif: { quality: 88, effort: 4 },
    webp: { quality: 94, effort: 5 },
  },
  icon: {
    avif: { quality: 70, effort: 3 },
    webp: { quality: 86, effort: 4 },
  },
  sprite: {
    avif: { quality: 70, effort: 3 },
    webp: { quality: 84, effort: 4 },
  },
};

const agentAssetMap = JSON.parse(await readFile(path.join(repoRoot, "design/visual-integration/oak-agent-assets-v2.json"), "utf8"));
const agentEntries = Object.values(agentAssetMap.assets)
  .flatMap((asset) => [asset, ...(asset.reducedMotionFrame ? [asset.reducedMotionFrame] : [])])
  .map((asset) => ({
    src: asset.publicSrc,
    durableSource: asset.source,
    category: "agent",
    preset: "sprite",
    widths: [192, 384],
    sizes: "112px",
  }));

const manualEntries = [
  ...agentEntries,
  {
    src: "/assets/mascot/oak-agent-states-v1.png",
    category: "agent",
    preset: "sprite",
    widths: [384, 768],
    sizes: "112px",
  },
  {
    src: "/assets/brand/oak-profile.png",
    category: "brand",
    preset: "photo",
    widths: [64, 128, 256, 300],
    sizes: "36px",
    priority: "header",
  },
  {
    src: "/assets/brand/welcome-v2.webp",
    category: "brand",
    preset: "photo",
    widths: [256, 409],
    sizes: "(max-width: 760px) 180px, 260px",
    priority: "high",
  },
  {
    src: "/assets/figma/conclusion-background.webp",
    category: "home",
    preset: "photo",
    widths: [768, 1200, 1817],
    sizes: fullBleedSizes,
  },
  {
    src: "/assets/figma/agentic-ai-systems@2x.webp",
    category: "home",
    preset: "uiProof",
    widths: [480, 821, 1642],
    sizes: proofSizes,
  },
  {
    src: "/assets/figma/design-system@2x.webp",
    category: "home",
    preset: "uiProof",
    widths: [480, 821, 1642],
    sizes: proofSizes,
  },
  {
    src: "/assets/hero/oak-hero-bg.webp",
    category: "hero",
    preset: "photo",
    widths: [768, 1440],
    sizes: fullBleedSizes,
    priority: "high",
  },
  {
    src: "/assets/hero/oak-hero-bg-tablet.webp",
    category: "hero",
    preset: "photo",
    widths: [1024],
    sizes: fullBleedSizes,
    priority: "high",
  },
  {
    src: "/assets/hero/oak-hero-bg-mobile.webp",
    category: "hero",
    preset: "photo",
    widths: [768],
    sizes: fullBleedSizes,
    priority: "high",
  },
];

const cardAndListEntries = [
  "/assets/cards/technology-habit.png",
  "/assets/cards/design-childhood.png",
  "/assets/cards/bay-area-energy.png",
  "/assets/list/content-creation.png",
  "/assets/list/meditation.png",
  "/assets/list/networking.png",
  "/assets/list/life-tracking.png",
  "/assets/list/seeking-ideas.png",
  "/assets/list/tech-updates.png",
  "/assets/list/agent-systems.png",
  "/assets/list/listening-founders.png",
  "/assets/list/designing-software.png",
  "/assets/list/open-source.png",
].map((src) => ({
  src,
  category: src.includes("/list/") ? "list" : "cards",
  preset: "icon",
  widths: src.includes("/list/") ? [34, 68, 136, 256] : [56, 112, 256],
  sizes: src.includes("/list/") ? "34px" : "56px",
}));

const workCardEntries = [
  "/assets/work/oakminder-cover.png",
  "/assets/work/context-engineering-cover.png",
  "/assets/work/client-ai-workflows-cover.png",
].map((src) => ({
  src,
  category: "work/cards",
  preset: "photo",
  widths: [480, 900, 1200],
  sizes: workCardSizes,
}));

const omnisocialWorkCoverEntries = [
  "/assets/work/omnisocial/omnisocial-cover.png",
].map((src) => ({
  src,
  category: "work/omnisocial",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: workArticleSizes,
}));

const agenticBrainWorkCoverEntries = [
  "/assets/work/agentic-brain/agentic-brain-cover.png",
  "/assets/work/agentic-brain/agentic-brain-legacy-memory-hallucination-cover.png",
].map((src) => ({
  src,
  category: "work/agentic-brain",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: workArticleSizes,
}));

const legacyFramerWorkCardEntries = [
  "/assets/work/legacy-framer/personal-software-era.png",
  "/assets/work/legacy-framer/matcha-by-maryam.png",
  "/assets/work/legacy-framer/b2b-b2c-growth.png",
  "/assets/work/legacy-framer/ai-automation-cloud.png",
  "/assets/work/legacy-framer/weird-fun-impact.png",
  "/assets/work/legacy-framer/research-to-redesign.png",
].map((src) => ({
  src,
  category: "work/legacy-framer",
  preset: "uiProof",
  widths: [900, 1200, 1600, 2000],
  sizes: workCardSizes,
}));

const careerTimelineEntries = [
  "/assets/work/career-timeline/oak-labs.png",
  "/assets/work/career-timeline/hyperskalers.png",
  "/assets/work/career-timeline/sfbu.png",
  "/assets/work/career-timeline/uhttention.png",
  "/assets/work/career-timeline/global-ed-org.png",
  "/assets/work/career-timeline/pnpp.png",
].map((src) => ({
  src,
  category: "work/career-timeline",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: "(max-width: 760px) calc(100vw - 116px), (max-width: 1120px) calc(100vw - 220px), 812px",
  ...(src.endsWith("/oak-labs.png")
    ? { durableSource: "src/assets/source-media/work/career-timeline/oak-labs.png" }
    : {}),
}));

const workMediaEntries = [
  "/assets/work/ecosmartloop/achievements-loop.webp",
  "/assets/work/ecosmartloop/b2b-career-fair-context.webp",
  "/assets/work/ecosmartloop/california-sb1383-context.webp",
  "/assets/work/ecosmartloop/capstone-pitch-flyer.webp",
  "/assets/work/ecosmartloop/capstone-poster-board.webp",
  "/assets/work/ecosmartloop/challenge-resolution-loop.webp",
  "/assets/work/ecosmartloop/claude-code-switch.webp",
  "/assets/work/ecosmartloop/context-engineering-logs.webp",
  "/assets/work/ecosmartloop/desktop-demo-poster.webp",
  "/assets/work/ecosmartloop/ecosmartloop-cover.png",
  "/assets/work/ecosmartloop/figma-make-ai-slop-workflow.webp",
  "/assets/work/ecosmartloop/leaf-engine-8000-training-context.webp",
  "/assets/work/ecosmartloop/mobile-demo-poster.webp",
  "/assets/work/ecosmartloop/mobile-product-shell.webp",
  "/assets/work/ecosmartloop/motion-plus-animation-polish.avif",
  "/assets/work/ecosmartloop/orbi-cited-guidance.webp",
  "/assets/work/ecosmartloop/orbi-guidance-actions-combined.avif",
  "/assets/work/ecosmartloop/orbi-tool-actions.webp",
  "/assets/work/ecosmartloop/organization-analytics.webp",
  "/assets/work/ecosmartloop/organization-leaderboard.webp",
  "/assets/work/ecosmartloop/personal-history.webp",
  "/assets/work/ecosmartloop/rewards-admin-flow.webp",
  "/assets/work/ecosmartloop/rewards-behavior-loop.webp",
  "/assets/work/ecosmartloop/scanner-result-ui.webp",
  "/assets/work/ecosmartloop/team-capstone-origin.webp",
  "/assets/work/ecosmartloop/team-capstone-questions.webp",
  "/assets/work/ecosmartloop/tech-stack-visual.avif",
  "/assets/work/ecosmartloop/three-bin-hesitation.webp",
].map((src) => ({
  src,
  category: "work/ecosmartloop",
  preset: "ui",
  widths: [480, 900, 1200, 1600, 1800],
  sizes: workArticleSizes,
}));

const linkedInGrowthLoopWorkMediaEntries = [
  "/assets/work/linkedin-growth-loop/linkedin-growth-loop-cover.png",
  "/assets/work/linkedin-growth-loop/linkedin-growth-loop-cover-og.png",
  "/assets/work/linkedin-growth-loop/ai-agent-reality.png",
  "/assets/work/linkedin-growth-loop/linkedin-networking.png",
  "/assets/work/linkedin-growth-loop/relationship-loop-targeting.png",
  "/assets/work/linkedin-growth-loop/relationship-loop-response.png",
  "/assets/work/linkedin-growth-loop/relationship-loop.png",
  "/assets/work/linkedin-growth-loop/openclaw-vs-hermes.png",
  "/assets/work/linkedin-growth-loop/browser-control.png",
  "/assets/work/linkedin-growth-loop/telegram-report-mock.png",
  "/assets/work/linkedin-growth-loop/agent-team-architecture.png",
  "/assets/work/linkedin-growth-loop/duplicate-comment-guardrail.png",
  "/assets/work/linkedin-growth-loop/improvement-loop.png",
].map((src) => ({
  src,
  category: "work/linkedin-growth-loop",
  preset: "ui",
  widths: [480, 900, 1200],
  sizes: workArticleSizes,
}));

const linkedInGrowthLoopTelegramEntries = [
  ["/assets/work/linkedin-growth-loop/telegram-report-1.png", 342],
  ["/assets/work/linkedin-growth-loop/telegram-report-2.png", 489],
  ["/assets/work/linkedin-growth-loop/telegram-report-3.png", 528],
  ["/assets/work/linkedin-growth-loop/telegram-report-4.png", 395],
  ["/assets/work/linkedin-growth-loop/telegram-report-5.png", 521],
  ["/assets/work/linkedin-growth-loop/telegram-report-6.png", 496],
].map(([src, width]) => ({
  src,
  category: "work/linkedin-growth-loop",
  preset: "ui",
  widths: [width],
  sizes: workArticleSizes,
}));

const linkedInGrowthLoopCompactMediaEntries = [
  ["/assets/work/linkedin-growth-loop/self-improving-report.png", [480, 564]],
].map(([src, widths]) => ({
  src,
  category: "work/linkedin-growth-loop",
  preset: "ui",
  widths,
  sizes: workArticleSizes,
}));

const oakminderAppCarouselEntries = Array.from({ length: 9 }, (_, index) => {
  const imageNumber = String(index + 1).padStart(2, "0");
  return {
    src: `/assets/work/oakminder/app-carousel/oakminder-app-${imageNumber}.jpg`,
    category: "work/oakminder/app-carousel",
    preset: "uiProof",
    widths: [360, 480, 720, 900, 1242],
    sizes: "(max-width: 760px) min(78vw, 320px), (max-width: 1080px) min(42vw, 320px), 300px",
  };
});

const oakminderOnboardingGridEntries = [
  "/assets/work/oakminder/onboarding-grid/intro.png",
  "/assets/work/oakminder/onboarding-grid/proof.png",
  "/assets/work/oakminder/onboarding-grid/qa.png",
  "/assets/work/oakminder/onboarding-grid/ui-onboarding.png",
  "/assets/work/oakminder/onboarding-grid/personalization.png",
  "/assets/work/oakminder/onboarding-grid/permission-paywall.png",
].map((src) => ({
  src,
  category: "work/oakminder/onboarding-grid",
  preset: "uiProof",
  widths: [340],
  sizes: "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc((100vw - 82px) / 2), 340px",
}));

const oakminderDistributionStudioEntries = [
  "/assets/work/oakminder/distribution-studio/tiktok-playbook.png",
].map((src) => ({
  src,
  category: "work/oakminder/distribution-studio",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: workArticleSizes,
}));

const oakminderDistributionOverviewEntries = [
  "/assets/work/oakminder/distribution-overview/tiktok-playbook.png",
  "/assets/work/oakminder/distribution-overview/video-editor.png",
  "/assets/work/oakminder/distribution-overview/product-context.png",
  "/assets/work/oakminder/distribution-overview/inspirations.png",
].map((src) => ({
  src,
  category: "work/oakminder/distribution-overview",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600],
  sizes: "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc((100vw - 82px) / 2), 545px",
}));

const oakminderVisualExtractionEntries = [
  "/assets/work/oakminder/visual-extraction/detail-extraction.png",
  "/assets/work/oakminder/visual-extraction/model-overall-analysis.png",
  "/assets/work/oakminder/visual-extraction/ocr.png",
  "/assets/work/oakminder/visual-extraction/slide-frame-analysis-detail.png",
].map((src) => ({
  src,
  category: "work/oakminder/visual-extraction",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600],
  sizes: "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc((100vw - 82px) / 2), 545px",
}));

const oakminderCreativeStudioEntries = [
  "/assets/work/oakminder/creative-studio/slideshow-editor.png",
  "/assets/work/oakminder/creative-studio/slideshow-assets.png",
].map((src) => ({
  src,
  category: "work/oakminder/creative-studio",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600],
  sizes: "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc((100vw - 82px) / 2), 545px",
}));

const oakminderUgcDraftEntries = [
  "/assets/work/oakminder/ugc-drafts/draft-flow-telegram.png",
  "/assets/work/oakminder/ugc-drafts/draft-flow-management.png",
].map((src) => ({
  src,
  category: "work/oakminder/ugc-drafts",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600],
  sizes: "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc((100vw - 82px) / 2), 545px",
}));

const oakminderPublishingFeedbackEntries = [
  "/assets/work/oakminder/publishing-feedback/publishing-processing.png",
].map((src) => ({
  src,
  category: "work/oakminder/publishing-feedback",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600],
  sizes: workArticleSizes,
}));

const oakminderDocsEntries = [
  "/assets/work/oakminder/docs/mintlify-docs-page.png",
].map((src) => ({
  src,
  category: "work/oakminder/docs",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: workArticleSizes,
}));

const oakminderAppStoreEntries = [
  "/assets/work/oakminder/app-store/oakminder-app-store-page.png",
].map((src) => ({
  src,
  category: "work/oakminder/app-store",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: workArticleSizes,
}));

const oakminderLearningSourceEntries = [
  "/assets/work/oakminder/learning-sources/superwall-youtube-channel.png",
].map((src) => ({
  src,
  category: "work/oakminder/learning-sources",
  preset: "uiProof",
  widths: [480, 900, 1200, 1600, 2000],
  sizes: workArticleSizes,
}));

const entries = [
  ...manualEntries,
  ...cardAndListEntries,
  ...workCardEntries,
  ...omnisocialWorkCoverEntries,
  ...agenticBrainWorkCoverEntries,
  ...legacyFramerWorkCardEntries,
  ...careerTimelineEntries,
  ...workMediaEntries,
  ...linkedInGrowthLoopWorkMediaEntries,
  ...linkedInGrowthLoopTelegramEntries,
  ...linkedInGrowthLoopCompactMediaEntries,
  ...oakminderAppCarouselEntries,
  ...oakminderOnboardingGridEntries,
  ...oakminderDistributionStudioEntries,
  ...oakminderDistributionOverviewEntries,
  ...oakminderVisualExtractionEntries,
  ...oakminderCreativeStudioEntries,
  ...oakminderUgcDraftEntries,
  ...oakminderPublishingFeedbackEntries,
  ...oakminderDocsEntries,
  ...oakminderAppStoreEntries,
  ...oakminderLearningSourceEntries,
];

for (const entry of await mascotEntries()) {
  entries.push(entry);
}

const selection = selectEntries(entries, process.argv.slice(2));
const selectedEntries = selection.entries;
const baselineManifest = selection.isSelective ? await readBaselineManifest(manifestPath) : {};
await validateSources(selectedEntries, selection.isSelective);
const generatedEntries = {};

await mkdir(generatedRoot, { recursive: true });

for (const entry of selectedEntries) {
  const sourcePath = entrySourcePath(entry);
  const sourceStat = await stat(sourcePath);
  const info = await sharp(sourcePath).metadata();
  await syncFallback(entry, sourcePath);
  const widths = normalizeWidths(entry.widths, info.width);
  const formats = {};

  for (const format of ["avif", "webp"]) {
    formats[format] = [];
    for (const width of widths) {
      const height = Math.round((width / info.width) * info.height);
      const output = outputPath(entry, width, format);
      await mkdir(path.dirname(output.file), { recursive: true });

      if (await needsGeneration(output.file, sourceStat.mtimeMs)) {
        await sharp(sourcePath)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          [format](presets[entry.preset][format])
          .toFile(output.file);
      }

      const outputInfo = await stat(output.file);
      formats[format].push({
        src: output.publicSrc,
        width,
        height,
        bytes: outputInfo.size,
      });
    }
  }

  generatedEntries[entry.src] = {
    src: entry.src,
    width: info.width,
    height: info.height,
    aspectRatio: Number((info.width / info.height).toFixed(4)),
    fallbackFormat: fallbackFormat(entry.src),
    preset: entry.preset,
    category: entry.category,
    sizes: entry.sizes,
    priority: entry.priority ?? "normal",
    sources: {
      avif: formats.avif.map(toSrcSet).join(", "),
      webp: formats.webp.map(toSrcSet).join(", "),
    },
    imageSet: {
      avif: formats.avif.at(-1)?.src,
      webp: formats.webp.at(-1)?.src,
    },
    variants: formats,
  };
}

const manifest = selection.isSelective ? mergeManifest(baselineManifest, generatedEntries) : generatedEntries;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeManifests(manifest);

console.log(`Generated ${selectedEntries.length} optimized image manifest entries.`);

async function writeManifests(manifest) {
  await mkdir(path.dirname(tsManifestPath), { recursive: true });
  await writeFile(tsManifestPath, renderTypeScriptManifest(manifest));
  await writeFile(path.join(path.dirname(tsManifestPath), "mascotImageSets.ts"), renderMascotImageSets(manifest));
}

function selectEntries(allEntries, args) {
  if (args.length === 0) return { entries: allEntries, isSelective: false };
  if (args.length !== 2 || args[0] !== "--only") {
    throw new Error("Usage: node scripts/generate-responsive-images.mjs [--only <registered-source-path> | --manifest-only]");
  }

  const [src] = args.slice(1);
  if (!src.startsWith("/assets/")) {
    throw new Error(`--only must name an exact registered source path: ${src}`);
  }

  const matches = allEntries.filter((entry) => entry.src === src);
  if (matches.length !== 1) {
    throw new Error(`Unknown or duplicate registered source path: ${src}`);
  }

  return { entries: matches, isSelective: true };
}

async function readBaselineManifest(file) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid baseline manifest at ${file}: ${error.message}`);
  }

  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error(`Invalid baseline manifest at ${file}: expected an object`);
  }

  for (const [src, entry] of Object.entries(data)) {
    validateBaselineEntry(src, entry);
  }

  return data;
}

function validateBaselineEntry(src, entry) {
  if (!entry || Array.isArray(entry) || typeof entry !== "object") {
    throw new Error(`Invalid baseline manifest entry for ${src}: expected an object`);
  }
  if (entry.src !== src) throw new Error(`Invalid baseline manifest entry for ${src}: src must match its key`);
  for (const field of ["width", "height", "aspectRatio"]) {
    if (typeof entry[field] !== "number" || !Number.isFinite(entry[field]) || entry[field] <= 0) {
      throw new Error(`Invalid baseline manifest entry for ${src}: ${field} must be a positive number`);
    }
  }
  for (const field of ["fallbackFormat", "preset", "category", "sizes", "priority"]) {
    if (typeof entry[field] !== "string") {
      throw new Error(`Invalid baseline manifest entry for ${src}: ${field} must be a string`);
    }
  }
  if (!entry.sources || Array.isArray(entry.sources) || typeof entry.sources !== "object") {
    throw new Error(`Invalid baseline manifest entry for ${src}: sources must be an object`);
  }
  for (const format of ["avif", "webp"]) {
    if (typeof entry.sources[format] !== "string") {
      throw new Error(`Invalid baseline manifest entry for ${src}: sources.${format} must be a string`);
    }
    if (!Array.isArray(entry.variants?.[format])) {
      throw new Error(`Invalid baseline manifest entry for ${src}: variants.${format} must be an array`);
    }
    for (const variant of entry.variants[format]) {
      if (!variant || Array.isArray(variant) || typeof variant !== "object") {
        throw new Error(`Invalid baseline manifest entry for ${src}: variant must be an object`);
      }
      if (typeof variant.src !== "string") {
        throw new Error(`Invalid baseline manifest entry for ${src}: variant src must be a string`);
      }
      for (const field of ["width", "height", "bytes"]) {
        if (typeof variant[field] !== "number" || !Number.isFinite(variant[field]) || variant[field] <= 0) {
          throw new Error(`Invalid baseline manifest entry for ${src}: variant ${field} must be a positive number`);
        }
      }
    }
  }
  if (!entry.imageSet || Array.isArray(entry.imageSet) || typeof entry.imageSet !== "object") {
    throw new Error(`Invalid baseline manifest entry for ${src}: imageSet must be an object`);
  }
  for (const format of ["avif", "webp"]) {
    if (typeof entry.imageSet[format] !== "string") {
      throw new Error(`Invalid baseline manifest entry for ${src}: imageSet.${format} must be a string`);
    }
  }
}

async function validateSources(entriesToValidate, requireFullDecode) {
  for (const entry of entriesToValidate) {
    const sourcePath = entrySourcePath(entry);
    try {
      const metadata = await sharp(sourcePath).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("missing image dimensions");
      }
      if (requireFullDecode) await sharp(sourcePath).stats();
    } catch (error) {
      throw new Error(`Unreadable registered source for ${entry.src}: ${sourcePath}. ${error.message}`);
    }
  }
}

function entrySourcePath(entry) {
  return entry.durableSource ? path.join(repoRoot, entry.durableSource) : publicPath(entry.src);
}

async function syncFallback(entry, sourcePath) {
  if (!entry.durableSource) return;
  const fallbackPath = publicPath(entry.src);
  const source = await readFile(sourcePath);
  let fallbackMatchesSource = false;
  try {
    fallbackMatchesSource = (await readFile(fallbackPath)).equals(source);
  } catch {}
  if (fallbackMatchesSource) return;
  await mkdir(path.dirname(fallbackPath), { recursive: true });
  await copyFile(sourcePath, fallbackPath);
}

function mergeManifest(baseline, generated) {
  const merged = {};
  for (const [src, entry] of Object.entries(baseline)) {
    merged[src] = generated[src] ?? entry;
  }
  for (const [src, entry] of Object.entries(generated)) {
    if (!(src in baseline)) merged[src] = entry;
  }
  return merged;
}

function publicPath(src) {
  return path.join(publicRoot, src.replace(/^\//, "").replace(/^public\//, ""));
}

function outputPath(entry, width, format) {
  const parsed = path.parse(entry.src);
  const fileName = `${sanitize(parsed.name)}-${width}.${format}`;
  const category = entry.category.replace(/^\/+|\/+$/g, "");
  return {
    file: path.join(generatedRoot, category, fileName),
    publicSrc: `/assets/generated/${category}/${fileName}`,
  };
}

function normalizeWidths(widths, sourceWidth) {
  return [...new Set(widths.filter((width) => width <= sourceWidth))]
    .sort((a, b) => a - b)
    .concat(widths.some((width) => width >= sourceWidth) ? [] : [sourceWidth]);
}

function fallbackFormat(src) {
  const ext = path.extname(src).slice(1).toLowerCase();
  if (ext === "jpg") return "jpeg";
  return ext;
}

function toSrcSet(variant) {
  return `${variant.src} ${variant.width}w`;
}

async function needsGeneration(file, sourceMtimeMs) {
  try {
    const outputStat = await stat(file);
    return outputStat.mtimeMs < sourceMtimeMs;
  } catch {
    return true;
  }
}

function sanitize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function mascotEntries() {
  const mascotDir = path.join(publicRoot, "assets/mascot");
  const files = await readdir(mascotDir);

  return files
    .filter((file) => file.endsWith(".webp"))
    .filter((file) => !file.includes("contact-sheet"))
    .map((file) => ({
      src: `/assets/mascot/${file}`,
      category: "mascot",
      preset: "sprite",
      // The shared sheet also ships a 1024 step: phones and tablets render it at 0.26 to 0.47 scale.
      widths: file === "oak-web-spritesheet.webp" ? [384, 768, 1024, 1536] : [384, 768, 1536],
      sizes: file === "oak-web-spritesheet.webp" ? "384px" : "192px",
    }));
}

function renderTypeScriptManifest(data) {
  return `// Generated by scripts/generate-responsive-images.mjs. Do not edit by hand.
export type OptimizedImageEntry = {
  src: string;
  width: number;
  height: number;
  aspectRatio: number;
  fallbackFormat: string;
  preset: string;
  category: string;
  sizes: string;
  priority: string;
  sources: {
    avif: string;
    webp: string;
  };
  imageSet: {
    avif?: string;
    webp?: string;
  };
  variants: Record<string, Array<{ src: string; width: number; height: number; bytes: number }>>;
};

export const optimizedImages = ${JSON.stringify(data, null, 2)} as const satisfies Record<string, OptimizedImageEntry>;

export type OptimizedImageSource = keyof typeof optimizedImages;

export function getOptimizedImage(src: string): OptimizedImageEntry | undefined {
  return optimizedImages[src as OptimizedImageSource];
}

export function buildImageSet(src: string): string {
  const entry = getOptimizedImage(src);
  if (!entry?.imageSet.avif || !entry?.imageSet.webp) {
    return \`url("\${src}")\`;
  }

  return [
    \`image-set(\`,
    \`url("\${entry.imageSet.avif}") type("image/avif"),\`,
    \`url("\${entry.imageSet.webp}") type("image/webp"),\`,
    \`url("\${entry.src}") type("\${mimeForFormat(entry.fallbackFormat)}")\`,
    \`)\`,
  ].join(" ");
}

function mimeForFormat(format: string): string {
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "avif") return "image/avif";
  return \`image/\${format}\`;
}
`;
}
