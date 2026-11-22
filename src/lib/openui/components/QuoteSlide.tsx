import type * as React from "react";
import { OakArt } from "../cards";

export type QuoteSlide = Readonly<{ key: string; words: string; name: React.ReactNode; image?: Readonly<{ src: string; alt: string; ratio?: number }> }>;

export function QuoteSlideView({ slide, index, total }: { slide: QuoteSlide; index: number; total: number }) {
  return <figure className="oak-quote__slide" role="group" aria-roledescription="slide" aria-label={`Quote ${index + 1} of ${total}`}>
    {slide.image ? <OakArt className="oak-quote__art" src={slide.image.src} alt={slide.image.alt} ratio={slide.image.ratio} /> : null}
    <blockquote className="oak-quote__words"><p>{slide.words}</p></blockquote>
    <figcaption className="oak-quote__name">{slide.name}</figcaption>
  </figure>;
}
