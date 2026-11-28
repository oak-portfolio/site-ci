import * as React from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { requestOakWorkspace, setOakDraft } from "@/lib/oakWorkspace";
import { galleryPreviewOf, galleryReplays, type GalleryPreview, type GalleryReplay } from "@/data/galleryReplays";
import { GalleryReplayAnswer } from "./GalleryReplay";
import "./gallery.css";

/** "Ask it live" opens the Oak AI Agent with the tile's question in the message box; the visitor sends it. */
function askLive(replay: GalleryReplay, opener: HTMLElement | null) {
  if (!requestOakWorkspace(opener)) return;
  setOakDraft(replay.question);
  requestAnimationFrame(() => document.getElementById("oak-composer-input")?.focus());
}

export function GalleryPreviewArt({ preview }: { preview: GalleryPreview }) {
  const { shape, items } = preview;
  const some = (min: number) => Array.from({ length: Math.max(items.length, min) }, (_, index) => index);
  return <div className="gallery-art" data-shape={shape} aria-hidden="true">
    {shape === "numbers" || shape === "metric" ? items.map(value => <span key={value} className="gallery-art__number">{value}</span>) : null}
    {shape === "timeline" ? <><span className="gallery-art__rail" />{items.map(date => <span key={date} className="gallery-art__stop"><i />{date}</span>)}</> : null}
    {shape === "compare" ? items.map(label => <span key={label} className="gallery-art__pair"><b>{label}</b><i /><i /></span>) : null}
    {shape === "steps" ? items.map(step => <span key={step} className="gallery-art__step">{step}</span>) : null}
    {shape === "points" ? items.map(point => <span key={point} className="gallery-art__point"><i /></span>) : null}
    {shape === "callout" ? <><span className="gallery-art__mark">!</span><span className="gallery-art__line" /><span className="gallery-art__line" /></> : null}
    {shape === "gap" ? <span className="gallery-art__gap">{items[0]}</span> : null}
    {shape === "diagram" ? [0, 1, 2, 3].map(index => <span key={index} className="gallery-art__node" />) : null}
    {shape === "table" ? <><span className="gallery-art__head" />{some(3).map(index => <span key={index} className="gallery-art__row" />)}</> : null}
    {shape === "board" ? [3, 2].map(cards => <span key={cards} className="gallery-art__column">
      {Array.from({ length: cards }, (_, index) => <i key={index} />)}</span>) : null}
    {shape === "wall" ? some(3).slice(0, 3).map(index => <span key={index} className="gallery-art__cover" />) : null}
    {shape === "stack" ? [0, 1, 2, 3, 4].map(index => <span key={index} className="gallery-art__chip" />) : null}
    {shape === "screens" ? <><span className="gallery-art__frame" /><span className="gallery-art__strip">{[0, 1, 2, 3].map(index => <i key={index} />)}</span></> : null}
    {shape === "profile" ? <><span className="gallery-art__portrait" /><span className="gallery-art__line" /><span className="gallery-art__line" /></> : null}
    {shape === "pages" ? items.map(page => <span key={page} className="gallery-art__page"><i /><b /></span>) : null}
  </div>;
}

/** The public gallery: one candy tile per kind of answer, each drawing a hand-built reference answer with no model call. */
export function GalleryPage({ citationLabels }: { citationLabels?: OakCitationLabels }) {
  const [open, setOpen] = React.useState<GalleryReplay | null>(null);
  const [run, setRun] = React.useState(0);
  const play = React.useCallback((replay: GalleryReplay) => { setOpen(replay); setRun(count => count + 1); }, []);
  React.useEffect(() => {
    const fromHash = () => {
      const replay = galleryReplays.find(item => item.id === location.hash.slice(1));
      if (replay) play(replay);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [play]);
  const close = () => {
    setOpen(null);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  };
  return <>
    <ul className="gallery-grid" aria-label="Reference answers">
      {galleryReplays.map(replay => <li key={replay.id} id={replay.id} className="gallery-tile" data-candy-tile data-tone={replay.tone}>
        <p className="gallery-tile__kind">{replay.label}</p>
        <h2 className="gallery-tile__question">{replay.question}</h2>
        <GalleryPreviewArt preview={galleryPreviewOf(replay)} />
        <div className="gallery-tile__foot">
          <button type="button" className="gallery-tile__ask" onClick={event => askLive(replay, event.currentTarget)}>
            Ask it live<Icon name="arrowRight" size={16} />
          </button>
          <button type="button" className="gallery-tile__play" aria-label={`Play: ${replay.question}`} title="Play" onClick={() => play(replay)}>
            <Icon name="play" size={20} />
          </button>
        </div>
      </li>)}
    </ul>
    <Dialog open={open !== null} onOpenChange={next => { if (!next) close(); }}>
      <DialogContent open={open !== null} className="gallery-replay">
        {open ? <>
          <header className="gallery-replay__head">
            <p className="gallery-replay__kind" data-tone={open.tone}>{open.label}</p>
            <DialogClose className="gallery-replay__icon" aria-label="Close" title="Close"><Icon name="cancel" size={18} /></DialogClose>
          </header>
          <DialogTitle className="gallery-replay__question">{open.question}</DialogTitle>
          <GalleryReplayAnswer replay={open} run={run} citationLabels={citationLabels} />
          <footer className="gallery-replay__foot">
            <button type="button" className="gallery-replay__icon" aria-label="Play again" title="Play again" onClick={() => setRun(count => count + 1)}>
              <Icon name="play" size={18} />
            </button>
            <button type="button" className="gallery-replay__ask" onClick={event => { const replay = open; close(); askLive(replay, event.currentTarget); }}>
              Ask it live<Icon name="arrowRight" size={16} />
            </button>
          </footer>
        </> : null}
      </DialogContent>
    </Dialog>
  </>;
}
