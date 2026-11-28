import { getOptimizedImage } from "@/data/generated/optimizedImages";
import type { OakActivitySpriteAsset, OakActivitySpritePose } from "@/components/agent/OakActivitySprite";
import assetMap from "../../design/visual-integration/oak-agent-assets-v2.json";

function image(src: string) {
  const entry = getOptimizedImage(src);
  return entry && { src: entry.src, width: entry.width, height: entry.height, avifSrcSet: entry.sources.avif, webpSrcSet: entry.sources.webp };
}

/** Server projection of the v2 art by pose, so the client never bundles the full image registry. */
export function oakAgentSprites() {
  const sprites: Partial<Record<OakActivitySpritePose, OakActivitySpriteAsset>> = {};
  for (const asset of Object.values(assetMap.assets) as { pose: OakActivitySpritePose; publicSrc: string; animated?: boolean; reducedMotionFrame?: { publicSrc: string } }[]) {
    const base = image(asset.publicSrc);
    if (!base) continue;
    const still = asset.animated && asset.reducedMotionFrame ? image(asset.reducedMotionFrame.publicSrc) : undefined;
    sprites[asset.pose] = still ? { ...base, animation: { frames: 4, columns: 2, rows: 2, reducedMotion: still } } : base;
  }
  return sprites;
}
