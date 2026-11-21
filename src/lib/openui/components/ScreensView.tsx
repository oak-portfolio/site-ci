import * as React from "react";
import { Carousel, useCarousel } from "@motionplus/core/react";
import { useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui/Icon";
import { useOakRecordFacts } from "@/lib/oakRecordFacts";
import { usePending } from "../cards";
import { OakFigure } from "../figure/OakFigure";
import { oakLazyView } from "../figure/oakLazyView";
import { Claim, useScope } from "../scope";
import { ScreensGhost, ScreensOff, type ScreensProps } from "./Screens";

export type Shot = Readonly<{ label: string; src: string; alt: string; ratio?: number }>;
export type ViewerProps = { shots: readonly Shot[]; index: number; opener: React.RefObject<HTMLElement | null>; onClose: () => void; onIndex: (index: number) => void };

function ViewerFailed({ shots, index }: ViewerProps) {
  const { renderLink } = useScope();
  const text = `Open ${shots[index]!.label}`;
  return <span className="oak-screens__fallback">{renderLink ? renderLink(shots[index]!.src, text) : text}</span>;
}
const Viewer = oakLazyView<ViewerProps>(() => import("./ScreensViewer"), null, ViewerFailed);

/** DESIGN.md:632 AVIF first, WebP fallback: generate:images writes each generated WebP's AVIF beside it (guarded in screens.test.mjs); originals stay plain. */
function ShotPicture({ src, alt, className, backdrop, ratio }: { src: string; alt: string; className?: string; backdrop?: true; ratio?: number }) {
  const tag = <img className={className} src={src} alt={alt} aria-hidden={backdrop} loading="lazy" decoding="async"
    width={ratio ? Math.round(ratio * 100) : undefined} height={ratio ? 100 : undefined} />;
  return src.startsWith("/assets/generated/") && src.endsWith(".webp")
    ? <picture><source type="image/avif" srcSet={src.replace(/\.webp$/, ".avif")} />{tag}</picture> : tag;
}

/** The image whole on a blurred copy of itself (the Source media backdrop), so an off-ratio screen is never cropped. */
export function ShotMedia({ shot, className = "oak-screens__media" }: { shot: Shot; className?: string }) {
  return <span className={`${className} oak-media-tile`}>
    <ShotPicture className="oak-screens__backdrop" src={shot.src} alt="" backdrop />
    <ShotPicture className="oak-screens__image" src={shot.src} alt={shot.alt} />
  </span>;
}

function Slide({ shot, index, total, onOpen }: { shot: Shot; index: number; total: number; onOpen: (index: number, button: HTMLButtonElement) => void }) {
  const many = total > 1;
  return <div className="oak-screens__slide" role={many ? "group" : undefined} aria-roledescription={many ? "slide" : undefined}
    aria-label={many ? `${shot.label}, ${index + 1} of ${total}` : undefined}>
    <button type="button" className="oak-screens__open" onClick={event => onOpen(index, event.currentTarget)}>
      <span className="sr-only">Open </span><ShotMedia shot={shot} />
    </button>
  </div>;
}

function Controls({ shots }: { shots: readonly Shot[] }) {
  const { currentPage, prevPage, nextPage, gotoPage, isPrevActive, isNextActive } = useCarousel();
  const reduced = useReducedMotion();
  const strip = React.useRef<HTMLUListElement>(null);
  const paged = React.useRef(false);
  const reveal = (thumb: Element | null | undefined) =>
    thumb?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "instant" : "smooth" });
  React.useEffect(() => {
    if (paged.current) reveal(strip.current?.children[currentPage]?.firstElementChild);
    paged.current = true;
  }, [currentPage]);
  return <div className="oak-screens__controls">
    <div className="oak-screens__nav">
      <button type="button" className="oak-screens__arrow" aria-label="Previous screen" aria-disabled={!isPrevActive} onClick={() => isPrevActive && prevPage()}><Icon name="arrowLeft" size={16} /></button>
      <span className="oak-screens__count">{currentPage + 1} of {shots.length}</span>
      <button type="button" className="oak-screens__arrow" aria-label="Next screen" aria-disabled={!isNextActive} onClick={() => isNextActive && nextPage()}><Icon name="arrowRight" size={16} /></button>
    </div>
    <ul className="oak-screens__strip" ref={strip}>{shots.map((shot, index) => <li key={shot.src + index}>
      <button type="button" className="oak-screens__thumb" aria-label={`Show ${shot.label}`} aria-current={index === currentPage ? "true" : undefined}
        onClick={() => gotoPage(index)} onFocus={event => reveal(event.currentTarget)}><ShotPicture src={shot.src} alt="" ratio={shot.ratio} /></button>
    </li>)}</ul>
  </div>;
}

export default function ScreensView({ claim: id }: ScreensProps) {
  const { claims, cardOf, knowledgeRevision = "" } = useScope();
  const claim = claims.get(id);
  const documentId = claim?.citations[0]?.documentId ?? "";
  const state = useOakRecordFacts(documentId, knowledgeRevision);
  const waiting = usePending([id]);
  const reduced = useReducedMotion();
  const [open, setOpen] = React.useState<number | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  if (waiting || (documentId && state.status === "pending")) return <ScreensGhost />;
  const shots: Shot[] = state.status === "loaded" && state.facts.kind === "work"
    ? state.facts.artifacts.flatMap(artifact => artifact.image ? [{ label: artifact.label, ...artifact.image }] : []) : [];
  if (!claim || !shots.length) return <ScreensOff claim={id} />;
  const title = cardOf?.(claim)?.card?.title ?? cardOf?.(claim)?.title.split(":")[0]!.trim() ?? "";
  const onOpen = (index: number, button: HTMLButtonElement) => { opener.current = button; setOpen(index); };
  const slides = shots.map((shot, index) => <Slide key={shot.src + index} shot={shot} index={index} total={shots.length} onOpen={onOpen} />);
  return <div className="oak-screens">
    <OakFigure caption={title ? `${title} screens` : "Screens"} items={[]}>
      <div className="oak-screens__stage" hidden={open !== null}>
        {shots.length > 1 ? <div className="oak-screens__rail" role="region" aria-roledescription="carousel" aria-label={title ? `${title} screens` : "Screens"}>
          <Carousel axis="x" className="oak-screens__viewport" gap={12} itemSize="fill" overflow snap="page" loop={false}
            transition={reduced ? { duration: 0 } : undefined} items={slides}>
            <Controls shots={shots} />
          </Carousel>
        </div> : slides[0]}
      </div>
      {open !== null ? <Viewer shots={shots} index={open} opener={opener} onClose={() => setOpen(null)} onIndex={setOpen} /> : null}
    </OakFigure>
    <p className="oak-screens__claim"><Claim id={id} /></p>
  </div>;
}
