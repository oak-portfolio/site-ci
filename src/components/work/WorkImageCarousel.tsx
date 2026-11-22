import { Carousel, useCarousel } from "@motionplus/core/react";
import { animate, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";

type CarouselImagePayload = {
  src: string;
  alt: string;
  label?: string;
  width: number;
  height: number;
  aspectRatio: number;
  sizes: string;
  fallbackSrc: string;
  sources: {
    avif: string;
    webp: string;
  };
};

type WorkImageCarouselProps = {
  images: CarouselImagePayload[];
  autoplaySeconds?: number;
};

const CAROUSEL_PAGE_TRANSITION = {
  type: "spring",
  stiffness: 150,
  damping: 28,
  mass: 0.9,
} as const;

const CAROUSEL_SAFE_MARGIN = 900;

function getCarouselStep(root: HTMLElement | null) {
  const item = root?.querySelector<HTMLElement>(".work-image-carousel__item");
  const list = root?.querySelector<HTMLElement>(".work-image-carousel__viewport ul");
  if (!item) return 0;

  const listStyles = list ? window.getComputedStyle(list) : null;
  const gapValue = listStyles?.columnGap || listStyles?.gap || "0";
  const gap = Number.parseFloat(gapValue);

  return item.getBoundingClientRect().width + (Number.isFinite(gap) ? gap : 0);
}

function getActiveCenterDelta(root: HTMLElement | null, activePage: number) {
  const viewport = root?.querySelector<HTMLElement>(".work-image-carousel__viewport");
  if (!root || !viewport) return 0;

  const viewportBounds = viewport.getBoundingClientRect();
  const viewportCenter = viewportBounds.left + viewportBounds.width / 2;
  const activeItems = Array.from(root.querySelectorAll<HTMLElement>(`.work-image-carousel__item[data-carousel-index="${activePage}"]`));
  let closestDelta = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const item of activeItems) {
    const bounds = item.getBoundingClientRect();
    if (bounds.right < 0 || bounds.left > window.innerWidth) continue;

    const delta = bounds.left + bounds.width / 2 - viewportCenter;
    const distance = Math.abs(delta);
    if (distance < closestDistance) {
      closestDelta = delta;
      closestDistance = distance;
    }
  }

  return closestDelta;
}

function animateCarouselByPages(
  carouselRef: RefObject<HTMLDivElement | null>,
  targetOffset: MotionValue<number>,
  pageDelta: number,
  activePage: number,
) {
  const carousel = carouselRef.current;
  const step = getCarouselStep(carousel);
  if (!step || !Number.isFinite(step)) return;

  const centerDelta = getActiveCenterDelta(carousel, activePage);
  targetOffset.stop();
  animate(targetOffset, targetOffset.get() - pageDelta * step - centerDelta, CAROUSEL_PAGE_TRANSITION);
}

function AutoplayProgress({
  carouselRef,
  duration,
  paused,
}: {
  carouselRef: RefObject<HTMLDivElement | null>;
  duration: number;
  paused: boolean;
}) {
  const { currentPage, targetOffset } = useCarousel();
  const progress = useMotionValue(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    progress.set(0);

    if (paused || shouldReduceMotion || duration <= 0) {
      return;
    }

    const animation = animate(progress, [0, 1], {
      duration,
      ease: "linear",
      onComplete: () => animateCarouselByPages(carouselRef, targetOffset, 1, currentPage),
    });

    return () => animation.stop();
  }, [carouselRef, currentPage, duration, paused, progress, shouldReduceMotion, targetOffset]);

  return null;
}

function CarouselControls({
  carouselRef,
  autoplayPaused,
  onNavigate,
  onToggleAutoplay,
}: {
  carouselRef: RefObject<HTMLDivElement | null>;
  autoplayPaused: boolean;
  onNavigate: () => void;
  onToggleAutoplay: () => void;
}) {
  const { currentPage, totalPages, targetOffset } = useCarousel();
  const itemIndexes = Array.from({ length: totalPages }, (_, index) => index);

  const navigateByPages = useCallback(
    (pageDelta: number) => {
      onNavigate();
      animateCarouselByPages(carouselRef, targetOffset, pageDelta, currentPage);
    },
    [carouselRef, currentPage, onNavigate, targetOffset],
  );

  const navigateToPage = useCallback(
    (itemIndex: number) => {
      if (itemIndex === currentPage || totalPages <= 0) return;

      let pageDelta = itemIndex - currentPage;
      const halfPageCount = totalPages / 2;
      if (pageDelta > halfPageCount) pageDelta -= totalPages;
      if (pageDelta < -halfPageCount) pageDelta += totalPages;

      navigateByPages(pageDelta);
    },
    [currentPage, navigateByPages, totalPages],
  );

  return (
    <div className="work-image-carousel__controls" aria-label="Oakminder screenshot carousel controls">
      <button
        className="work-image-carousel__button"
        type="button"
        onClick={() => navigateByPages(-1)}
        aria-label="Show previous screenshot"
      >
        <Icon name="arrowDown" className="work-image-carousel__button-icon work-image-carousel__button-icon--prev" size={17} />
      </button>

      <div className="work-image-carousel__dots" role="tablist" aria-label="Choose screenshot">
        {itemIndexes.map((itemIndex) => (
          <button
            key={itemIndex}
            className="work-image-carousel__dot"
            type="button"
            role="tab"
            aria-selected={itemIndex === currentPage}
            aria-current={itemIndex === currentPage ? "true" : undefined}
            aria-label={`Show screenshot ${itemIndex + 1}`}
            onClick={() => navigateToPage(itemIndex)}
          />
        ))}
      </div>

      <button
        className="work-image-carousel__button work-image-carousel__button--pause"
        type="button"
        onClick={onToggleAutoplay}
        aria-pressed={autoplayPaused}
        aria-label={autoplayPaused ? "Resume automatic screenshot rotation" : "Pause automatic screenshot rotation"}
        title={autoplayPaused ? "Resume rotation" : "Pause rotation"}
      >
        <Icon name={autoplayPaused ? "play" : "pause"} className="work-image-carousel__button-icon" size={17} />
      </button>

      <button
        className="work-image-carousel__button"
        type="button"
        onClick={() => navigateByPages(1)}
        aria-label="Show next screenshot"
      >
        <Icon name="arrowDown" className="work-image-carousel__button-icon work-image-carousel__button-icon--next" size={17} />
      </button>
    </div>
  );
}

export default function WorkImageCarousel({ images, autoplaySeconds = 3.5 }: WorkImageCarouselProps) {
  const [isAutoplayPaused, setIsAutoplayPaused] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const resumeTimeoutRef = useRef<number | null>(null);

  const clearResumeTimer = () => {
    if (resumeTimeoutRef.current === null) return;
    window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = null;
  };

  const pauseBriefly = () => {
    setIsUserPaused(true);
    clearResumeTimer();
    resumeTimeoutRef.current = window.setTimeout(() => {
      setIsUserPaused(false);
      resumeTimeoutRef.current = null;
    }, 6000);
  };

  const toggleAutoplay = () => {
    clearResumeTimer();
    setIsUserPaused(false);
    setIsAutoplayPaused((value) => !value);
  };

  useEffect(() => {
    return () => clearResumeTimer();
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.28 },
    );

    observer.observe(carousel);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={carouselRef}
      className="work-image-carousel"
      onMouseEnter={() => {
        clearResumeTimer();
        setIsUserPaused(true);
      }}
      onMouseLeave={() => setIsUserPaused(false)}
      onFocusCapture={() => {
        clearResumeTimer();
        setIsUserPaused(true);
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        setIsUserPaused(false);
      }}
      onPointerDown={() => {
        clearResumeTimer();
        setIsUserPaused(true);
      }}
      onPointerUp={pauseBriefly}
    >
      <Carousel
        axis="x"
        className="work-image-carousel__viewport"
        gap={18}
        align="center"
        loop
        overflow
        safeMargin={CAROUSEL_SAFE_MARGIN}
        snap="page"
        transition={CAROUSEL_PAGE_TRANSITION}
        items={images.map((image, index) => (
          <div
            className="work-image-carousel__item"
            data-carousel-index={index}
            key={image.src}
            role="group"
            aria-label={`Screenshot ${index + 1} of ${images.length}${image.label ? `: ${image.label}` : ""}`}
          >
            <div className="work-image-carousel__phone" style={{ aspectRatio: image.aspectRatio }}>
              <picture>
                <source type="image/avif" srcSet={image.sources.avif} sizes={image.sizes} />
                <source type="image/webp" srcSet={image.sources.webp} sizes={image.sizes} />
                <img
                  src={image.fallbackSrc}
                  alt={image.alt}
                  width={image.width}
                  height={image.height}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                />
              </picture>
            </div>
          </div>
        ))}
      >
        <AutoplayProgress carouselRef={carouselRef} duration={autoplaySeconds} paused={isAutoplayPaused || isUserPaused || !isInView} />
        <CarouselControls
          carouselRef={carouselRef}
          autoplayPaused={isAutoplayPaused}
          onNavigate={pauseBriefly}
          onToggleAutoplay={toggleAutoplay}
        />
      </Carousel>
    </div>
  );
}
