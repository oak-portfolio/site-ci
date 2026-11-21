import { getOptimizedImage } from "@/data/generated/optimizedImages";

export const workArticleImageSizes =
  "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc(100vw - 64px), 1120px";

export const workCardImageSizes =
  "(max-width: 760px) calc(100vw - 64px), (max-width: 1120px) calc((100vw - 88px) / 2), 384px";

export const workGridImageSizes =
  "(max-width: 760px) calc(100vw - 32px), (max-width: 1240px) calc((100vw - 82px) / 2), 532px";

export function getResponsiveImageSrcSet(src: string) {
  return getOptimizedImage(src)?.sources.webp;
}
