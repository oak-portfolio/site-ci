export type OakSize = Readonly<{ width: number; height: number }>;
export type OakViewport = Readonly<{
  width: number;
  height: number;
  left: number;
  top: number;
  layoutWidth: number;
  safeTop: number;
  safeRight: number;
  safeBottom: number;
  safeLeft: number;
}>;
export type OakSizeBounds = Readonly<{
  top: number;
  right: number;
  maxHeight: number;
  availableWidth: number;
}>;

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, value) : fallback;

/** Bounds use visible CSS pixels, including scrollbar, keyboard and safe areas. */
export function oakSizeBounds(viewport: OakViewport): OakSizeBounds {
  const width = finite(viewport.width, 1);
  const height = finite(viewport.height, 1);
  // A keyboard can leave a narrow visible strip in landscape even when its width
  // looks like desktop. Use the compact safe gutter for that short axis too.
  const gutter = width <= 640 || height <= 480 ? 8 : 24;
  const topInset = Math.max(gutter, finite(viewport.safeTop));
  const rightInset = Math.max(gutter, finite(viewport.safeRight));
  const leftInset = Math.max(gutter, finite(viewport.safeLeft));
  const bottomInset = Math.max(gutter, finite(viewport.safeBottom));
  const availableWidth = Math.max(1, width - leftInset - rightInset);
  const maxHeight = Math.max(1, height - topInset - bottomInset);
  return {
    top: finite(viewport.top) + topInset,
    right: Math.max(0, viewport.layoutWidth - finite(viewport.left) - width) + rightInset,
    maxHeight,
    availableWidth,
  };
}
