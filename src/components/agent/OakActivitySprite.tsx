import { createContext, useContext, type HTMLAttributes } from "react";
import "./OakActivitySprite.css";

export type OakActivitySpritePose =
  | "idle"
  | "thinking-still"
  | "thinking"
  | "reviewing"
  | "wave"
  | "searching"
  | "tool-done"
  | "reading"
  | "navigating"
  | "drafting"
  | "retry"
  | "waiting"
  | "signing-in"
  | "document"
  | "parsing"
  | "recording"
  | "mailbox"
  | "saved"
  | "delete-review"
  | "larger-window"
  | "asking" | "bookmark" | "carrying" | "chest-locked" | "closed" | "coins" | "comparing" | "doc-docx" | "doc-pdf" | "doc-text"
  | "empty-chest" | "gap" | "gate-closed" | "highlighting" | "hourglass" | "intake" | "lantern" | "listening" | "paused"
  | "planning" | "researching" | "scanner" | "sent" | "session-expired" | "shield" | "source-article" | "source-case-study"
  | "source-profile" | "source-resource" | "swept" | "thumbs-up" | "tool-snag" | "unplugged" | "voice-scroll" | "welcome"
  // Wave 4: the greeting loop and the reasoning steps (read the question, weigh what was found, write, check sources).
  | "greeting" | "understanding" | "weighing" | "composing" | "verifying" | "quoting"
  // This month's sponsored answers are used: the coin pouch rests until next month.
  | "budget-paused"
  // A question only Steve can answer points onward; a visitor's stop gets a quiet bow.
  | "handoff" | "nod"
  // Voice input is switched off: the microphone naps.
  | "voice-off"
  // The model's own thought streams; a step runs long; Oak asked again after a slow reply.
  | "pondering" | "snail-patience" | "rewind"
  // Stopped turns, each its own: the model never picked up, a short pause, the server out of reach.
  | "busy-line" | "short-break" | "far-server"
  // Current public research: the web's globe under a magnifier, apart from Steve's own pages.
  | "web-globe" | "web-globe-off"
  // D117: the brief sealed and ready; documents not added yet; the visitor's own key; how long saved copies are kept.
  | "brief-letter" | "doc-stack" | "own-key" | "keep-calendar"
  // D132: the Sources panel's shelf and the tools menu's toolbox.
  | "bookshelf" | "toolbox"
  // Q10: signed in, choosing a purpose: Oak pins on a name badge, apart from the role reader's clipboard.
  | "purpose";
export type OakActivitySpriteSize = "badge" | "small" | "medium" | "large" | "hero";

/** Small projection from the generated image manifest. Keep the full registry out of the client bundle. */
type OakActivitySpriteImage = {
  src: string;
  width: number;
  height: number;
  avifSrcSet: string;
  webpSrcSet: string;
};

export type OakActivitySpriteAsset = OakActivitySpriteImage & {
  animation?: { frames: 4; columns: 2; rows: 2; reducedMotion: OakActivitySpriteImage };
};

/** v2 art by pose, projected on the server and provided once by the workspace. */
export type OakSprites = Partial<Record<OakActivitySpritePose, OakActivitySpriteAsset>>;
const SpritesContext = createContext<OakSprites>({});
export const OakSpritesProvider = SpritesContext.Provider;
export function useOakSprites() {
  return useContext(SpritesContext);
}

/** The provided art for a pose, or nothing when that pose has no asset. */
export function OakSprite({ pose, size, interactive, label, className }: Omit<Props, "asset">) {
  const asset = useOakSprites()[pose];
  return asset ? <OakActivitySprite asset={asset} pose={pose} size={size} interactive={interactive} label={label} className={className} /> : null;
}

type Props = {
  /** Must describe a real application state supplied by the caller. */
  pose: OakActivitySpritePose;
  asset: OakActivitySpriteAsset;
  size?: OakActivitySpriteSize;
  /** Only use inside a real keyboard-focusable or pointer-interactive parent. */
  interactive?: boolean;
  /** Omit for a decorative image. A supplied label turns the sprite into one image in the accessibility tree. */
  label?: string;
} & Pick<HTMLAttributes<HTMLSpanElement>, "className">;

/** Caller-owned activity cue. It does not infer or announce task progress. */
export function OakActivitySprite({
  pose,
  asset,
  size = "small",
  interactive = false,
  label,
  className,
}: Props) {
  const accessibleLabel = label?.trim();
  const staticFrame = asset.animation?.reducedMotion;

  return (
    <span
      className={["oak-activity-sprite", className].filter(Boolean).join(" ")}
      data-pose={pose}
      data-size={size}
      data-layout={asset.animation ? "animated" : "single"}
      data-interactive={interactive ? "true" : undefined}
      role={accessibleLabel ? "img" : undefined}
      aria-label={accessibleLabel || undefined}
      aria-hidden={accessibleLabel ? undefined : true}
    >
      <span className="oak-activity-sprite__frame" aria-hidden="true">
        <picture className="oak-activity-sprite__sheet">
          {staticFrame ? <>
            <source media="(prefers-reduced-motion: reduce)" type="image/avif" srcSet={staticFrame.avifSrcSet} sizes={sheetSizes[size]} />
            <source media="(prefers-reduced-motion: reduce)" type="image/webp" srcSet={staticFrame.webpSrcSet} sizes={sheetSizes[size]} />
            <source media="(prefers-reduced-motion: reduce)" type="image/png" srcSet={staticFrame.src} />
          </> : null}
          <source type="image/avif" srcSet={asset.avifSrcSet} sizes={sheetSizes[size]} />
          <source type="image/webp" srcSet={asset.webpSrcSet} sizes={sheetSizes[size]} />
          <img
            className="oak-activity-sprite__image"
            src={asset.src}
            width={asset.width}
            height={asset.height}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </picture>
      </span>
    </span>
  );
}

const sheetSizes: Record<OakActivitySpriteSize, string> = {
  badge: "48px",
  small: "80px",
  medium: "96px",
  large: "112px",
  hero: "264px",
};
