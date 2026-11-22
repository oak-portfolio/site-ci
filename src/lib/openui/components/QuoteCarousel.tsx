import * as React from "react";
import { Carousel, useCarousel } from "@motionplus/core/react";
import { Icon } from "@/components/ui/Icon";
import { announceOakBlock } from "../a11y/oakBlockAnnounce";
import { OakOpenUIScopeContext } from "../scope";
import { QuoteSlideView, type QuoteSlide } from "./QuoteSlide";

function Controls({ slides }: { slides: readonly QuoteSlide[] }) {
  const { currentPage, prevPage, nextPage, gotoPage, isPrevActive, isNextActive } = useCarousel();
  const block = `${React.useContext(OakOpenUIScopeContext)?.id ?? ""}:${React.useId()}`;
  const shown = React.useRef(currentPage);
  // Only a page move is said: slides streaming in change the count but must stay quiet.
  React.useEffect(() => {
    if (shown.current === currentPage) return;
    shown.current = currentPage;
    announceOakBlock(block, `Quote ${currentPage + 1} of ${slides.length}.`, { repeat: true });
  }, [currentPage]);
  return <div className="oak-quote__controls">
    <button type="button" className="oak-quote__button" aria-label="Previous quote" disabled={!isPrevActive} onClick={prevPage}><Icon name="arrowLeft" size={16} /></button>
    <div className="oak-quote__dots">{slides.map((slide, index) =>
      <button key={slide.key} type="button" className="oak-quote__dot" aria-label={`Show quote ${index + 1} of ${slides.length}`}
        aria-current={index === currentPage ? "true" : undefined} onClick={() => gotoPage(index)} />)}</div>
    <button type="button" className="oak-quote__button" aria-label="Next quote" disabled={!isNextActive} onClick={nextPage}><Icon name="arrowRight" size={16} /></button>
    <span className="oak-quote__count">{currentPage + 1} of {slides.length}</span>
  </div>;
}

/** No autoplay at all, so reduced motion has nothing to turn off: the carousel only moves when the visitor asks it to. */
export default function QuoteCarousel({ slides }: { slides: readonly QuoteSlide[] }) {
  return <div className="oak-quote__rail" role="region" aria-roledescription="carousel" aria-label="Quotes from Steve's case studies">
    <Carousel axis="x" className="oak-quote__viewport" gap={12} align="start" overflow snap="page"
      items={slides.map((slide, index) => <QuoteSlideView key={slide.key} slide={slide} index={index} total={slides.length} />)}>
      <Controls slides={slides} />
    </Carousel>
  </div>;
}
