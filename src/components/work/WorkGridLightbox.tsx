import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { Icon } from "@/components/ui/Icon";

type LightboxImage = {
  src: string;
  srcSet?: string;
  sizes?: string;
  sources: LightboxSource[];
  alt: string;
  caption: string;
  width?: number;
  height?: number;
  groupLabel: string;
  index: number;
  total: number;
  trigger: HTMLButtonElement | null;
};

type LightboxSource = {
  srcSet: string;
  type?: string;
  media?: string;
  sizes: string;
};

type LightboxGroup = {
  id: string;
  label: string;
  images: LightboxImage[];
};

type ActiveLightbox = {
  group: LightboxGroup;
  imageIndex: number;
  opener: HTMLElement;
};

type MountedTrigger = {
  root: Root;
  container: HTMLElement;
};

type MountedMedia = {
  media: HTMLElement;
  handleClick: (event: globalThis.MouseEvent) => void;
};

function getPreviousHeading(element: HTMLElement) {
  let current = element.previousElementSibling;

  while (current) {
    if (/^H[2-4]$/.test(current.tagName)) {
      return current.textContent?.trim() ?? "";
    }

    current = current.previousElementSibling;
  }

  return "";
}

function getImageSource(image: HTMLImageElement) {
  return image.currentSrc || image.src;
}

function buildImageRecord(
  image: HTMLImageElement,
  figure: HTMLElement,
  groupLabel: string,
  index: number,
  total: number,
): LightboxImage | null {
  const src = getImageSource(image);
  const picture = image.closest("picture");
  const sources = Array.from(picture?.querySelectorAll<HTMLSourceElement>("source") ?? [])
    .map((source) => ({
      srcSet: source.srcset,
      type: source.type || undefined,
      media: source.media || undefined,
      sizes: "100vw",
    }))
    .filter((source) => source.srcSet);
  const hasResponsiveSource = Boolean(image.srcset) || sources.length > 0;

  if (!src) {
    return null;
  }

  const caption = figure.querySelector("figcaption")?.textContent?.trim() ?? "";
  const alt = image.alt.trim();

  return {
    src,
    srcSet: image.srcset || undefined,
    sizes: hasResponsiveSource ? "100vw" : image.sizes || undefined,
    sources,
    alt,
    caption: caption || alt || "Case study screenshot.",
    width: image.naturalWidth || image.width || undefined,
    height: image.naturalHeight || image.height || undefined,
    groupLabel,
    index,
    total,
    trigger: null,
  };
}

export default function WorkGridLightbox() {
  const [active, setActive] = useState<ActiveLightbox | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef<ActiveLightbox | null>(null);
  const captionId = useId();

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const closeLightbox = useCallback(() => {
    const opener = activeRef.current?.opener;
    const dialog = dialogRef.current;
    activeRef.current = null;

    if (dialog?.open) {
      dialog.close();
    }

    setActive(null);

    if (opener?.isConnected) {
      window.requestAnimationFrame(() => {
        opener.focus({ preventScroll: true });
      });
    }
  }, []);

  const move = useCallback((direction: -1 | 1) => {
    setActive((current) => {
      if (!current) {
        return current;
      }

      const total = current.group.images.length;

      if (total <= 1) {
        return current;
      }

      const imageIndex = (current.imageIndex + direction + total) % total;
      return { ...current, imageIndex };
    });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (active) {
      if (!dialog.open) {
        dialog.showModal();
      }

      window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  }, [active]);

  useEffect(() => {
    const mountedTriggers: MountedTrigger[] = [];
    const mountedMedia: MountedMedia[] = [];
    const grids = Array.from(document.querySelectorAll<HTMLElement>(".work-mdx-image-grid"));

    grids.forEach((grid, gridIndex) => {
      const figures = Array.from(grid.querySelectorAll<HTMLElement>("figure"));
      const entries = figures
        .map((figure) => {
          const media = figure.querySelector<HTMLElement>(".work-mdx-image-grid__media");
          const image = media?.querySelector<HTMLImageElement>("img");

          if (!media || !image) {
            return null;
          }

          return { figure, media, image };
        })
        .filter((entry): entry is { figure: HTMLElement; media: HTMLElement; image: HTMLImageElement } => Boolean(entry));
      const groupLabel =
        grid.getAttribute("aria-label")?.trim() || getPreviousHeading(grid) || `Image grid ${gridIndex + 1}`;
      const group: LightboxGroup = {
        id: `work-grid-lightbox-group-${gridIndex + 1}`,
        label: groupLabel,
        images: [],
      };

      entries.forEach(({ figure, image }, imageIndex) => {
        const imageRecord = buildImageRecord(image, figure, groupLabel, imageIndex, entries.length);

        if (imageRecord) {
          group.images.push(imageRecord);
        }
      });

      entries.forEach(({ media }, imageIndex) => {
        const imageRecord = group.images[imageIndex];

        if (!imageRecord) {
          return;
        }

        media.querySelectorAll(".work-grid-lightbox-trigger-root").forEach((element) => {
          element.remove();
        });

        const openLightbox = (opener: HTMLElement) => {
          setActive({ group, imageIndex: imageRecord.index, opener });
        };
        const handleMediaClick = (event: globalThis.MouseEvent) => {
          if (event.target instanceof Element && event.target.closest(".work-grid-lightbox-trigger")) {
            return;
          }

          openLightbox(imageRecord.trigger ?? media);
        };

        media.classList.add("work-mdx-image-grid__media--interactive");
        media.addEventListener("click", handleMediaClick);
        mountedMedia.push({ media, handleClick: handleMediaClick });

        const container = document.createElement("span");
        container.className = "work-grid-lightbox-trigger-root";
        container.setAttribute("data-work-grid-lightbox-group", group.id);
        media.append(container);

        const root = createRoot(container);
        root.render(
          <button
            ref={(node) => {
              imageRecord.trigger = node;
            }}
            type="button"
            className="work-grid-lightbox-trigger"
            aria-label={`Open image ${imageRecord.index + 1} of ${imageRecord.total} in fullscreen`}
            onClick={(event) => {
              event.stopPropagation();
              openLightbox(event.currentTarget);
            }}
          >
            <Icon name="fullscreen" size={18} />
          </button>,
        );

        mountedTriggers.push({ root, container });
      });
    });

    return () => {
      mountedMedia.forEach(({ media, handleClick }) => {
        media.removeEventListener("click", handleClick);
        media.classList.remove("work-mdx-image-grid__media--interactive");
      });
      mountedTriggers.forEach(({ root, container }) => {
        root.unmount();
        container.remove();
      });
    };
  }, []);

  const activeImage = active?.group.images[active.imageIndex] ?? null;
  const hasMultipleImages = (active?.group.images.length ?? 0) > 1;

  const handleDialogCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement, Event>) => {
      event.preventDefault();
      closeLightbox();
    },
    [closeLightbox],
  );

  const handleDialogClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) {
        closeLightbox();
      }
    },
    [closeLightbox],
  );

  const handleDialogClose = useCallback(() => {
    if (activeRef.current) {
      const opener = activeRef.current.opener;
      activeRef.current = null;
      setActive(null);

      if (opener.isConnected) {
        window.requestAnimationFrame(() => {
          opener.focus({ preventScroll: true });
        });
      }
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDialogElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
    },
    [move],
  );

  return (
    <dialog
      ref={dialogRef}
      className="work-grid-lightbox"
      aria-label={active?.group.label ?? "Case study screenshots"}
      aria-describedby={captionId}
      onCancel={handleDialogCancel}
      onClick={handleDialogClick}
      onClose={handleDialogClose}
      onKeyDown={handleKeyDown}
    >
      <div className="work-grid-lightbox__shell">
        <header className="work-grid-lightbox__header">
          <div className="work-grid-lightbox__heading">
            <p className="work-grid-lightbox__counter" aria-live="polite">
              {activeImage ? `${activeImage.index + 1} / ${activeImage.total}` : "0 / 0"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="work-grid-lightbox__button work-grid-lightbox__button--close"
            aria-label="Close lightbox"
            onClick={closeLightbox}
          >
            <Icon name="cancel" size={20} />
          </button>
        </header>

        <div className="work-grid-lightbox__stage">
          <button
            type="button"
            className="work-grid-lightbox__button work-grid-lightbox__button--previous"
            aria-label="Show previous image"
            disabled={!hasMultipleImages}
            onClick={() => move(-1)}
          >
            <Icon name="arrowLeft" size={22} />
          </button>

          {activeImage && (
            <picture
              key={`${activeImage.groupLabel}-${activeImage.index}-${activeImage.src}`}
              className="work-grid-lightbox__picture"
            >
              {activeImage.sources.map((source) => (
                <source
                  key={`${source.type ?? "source"}-${source.srcSet}`}
                  type={source.type}
                  media={source.media}
                  srcSet={source.srcSet}
                  sizes={source.sizes}
                />
              ))}
              <img
                className="work-grid-lightbox__image"
                src={activeImage.src}
                srcSet={activeImage.srcSet}
                sizes={activeImage.sizes}
                alt={activeImage.alt}
                width={activeImage.width}
                height={activeImage.height}
                decoding="async"
              />
            </picture>
          )}

          <button
            type="button"
            className="work-grid-lightbox__button work-grid-lightbox__button--next"
            aria-label="Show next image"
            disabled={!hasMultipleImages}
            onClick={() => move(1)}
          >
            <Icon name="arrowRight" size={22} />
          </button>
        </div>

        <p id={captionId} className="work-grid-lightbox__caption">
          {activeImage?.caption ?? "Case study screenshot."}
        </p>
      </div>
    </dialog>
  );
}
