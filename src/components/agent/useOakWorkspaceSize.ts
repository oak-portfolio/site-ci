import * as React from "react";
import { oakSizeBounds, type OakSize, type OakViewport } from "@/lib/oakWorkspaceSize";

const initialViewport: OakViewport = {
  width: 588, height: 900, left: 0, top: 0, layoutWidth: 588,
  safeTop: 0, safeRight: 0, safeBottom: 0, safeLeft: 0,
};

/** The workspace is always full screen: this measures the visible viewport and returns the frame that fills it. */
export function useOakWorkspaceSize(
  open: boolean,
  safeArea: React.RefObject<HTMLDivElement | null>,
) {
  const [viewport, setViewport] = React.useState(initialViewport);
  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const visible = window.visualViewport;
      // Base UI can freeze html/body to the pre-lock width while clientWidth grows.
      const layoutWidth = document.documentElement.getBoundingClientRect().width;
      const style = safeArea.current ? getComputedStyle(safeArea.current) : null;
      const inset = (value: string | undefined) => Number.parseFloat(value ?? "0") || 0;
      const next: OakViewport = {
        width: Math.min(visible?.width ?? layoutWidth, layoutWidth),
        height: visible?.height ?? window.innerHeight,
        left: visible?.offsetLeft ?? 0,
        top: visible?.offsetTop ?? 0,
        layoutWidth,
        safeTop: inset(style?.paddingTop), safeRight: inset(style?.paddingRight),
        // A shortened visual viewport already ends above the keyboard/home area.
        safeBottom: visible && visible.height < window.innerHeight ? 0 : inset(style?.paddingBottom),
        safeLeft: inset(style?.paddingLeft),
      };
      setViewport(previous => Object.keys(next).every(key => previous[key as keyof OakViewport] === next[key as keyof OakViewport]) ? previous : next);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, safeArea]);
  const bounds = oakSizeBounds(viewport);
  const inlineControls = bounds.maxHeight < 120 && bounds.availableWidth >= 540;
  // Oak, review v5: Full is the whole visible screen, edge to edge, not a floating window with a gutter.
  const fullScreen = !inlineControls;
  const fittedSize: OakSize = fullScreen ? { width: Math.max(1, viewport.width), height: Math.max(1, viewport.height) }
    : { width: bounds.availableWidth, height: bounds.maxHeight };
  // Landscape browser accessories can leave room for only one control row.
  const size = inlineControls ? { ...fittedSize, width: Math.max(540, fittedSize.width), height: Math.min(60, fittedSize.height) } : fittedSize;
  return {
    bounds, size, inlineControls, fullScreen,
    frame: fullScreen ? { top: viewport.top, left: "auto" as const, right: Math.max(0, viewport.layoutWidth - viewport.left - viewport.width) }
      : { top: bounds.top, left: "auto" as const, right: bounds.right },
    geometryKey: `${size.width}:${size.height}`,
  };
}

export type OakWorkspaceSizing = ReturnType<typeof useOakWorkspaceSize>;
