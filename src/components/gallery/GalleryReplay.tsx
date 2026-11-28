import * as React from "react";
import { OakArrangedAnswer } from "@/components/agent/OakOpenUIAnswer";
import type { OakCitationLabels } from "@/lib/oakCitationLabels";
import { galleryAnswerOf, galleryReplayFrames, type GalleryReplay } from "@/data/galleryReplays";
import "@/styles/openui/index.css";

const STEP_MS = 420;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Replays a reference answer: its stored program streams one line at a time into the shipped answer component, then settles. */
export function GalleryReplayAnswer({ replay, run, citationLabels }: { replay: GalleryReplay; run: number; citationLabels?: OakCitationLabels }) {
  const frames = React.useMemo(() => replay.program ? galleryReplayFrames(replay.program) : [], [replay]);
  const last = Math.max(frames.length - 1, 0);
  const [at, setAt] = React.useState(() => reducedMotion() ? last : 0);
  React.useEffect(() => {
    const start = reducedMotion() ? last : 0;
    setAt(start);
    if (start >= last) return;
    const timer = window.setInterval(() => setAt(index => {
      if (index + 1 >= last) window.clearInterval(timer);
      return Math.min(index + 1, last);
    }), STEP_MS);
    return () => window.clearInterval(timer);
  }, [last, run]);
  const answer = React.useMemo(() => galleryAnswerOf(replay, citationLabels?.knowledgeRevision), [replay, citationLabels]);
  const frame = frames[at];
  const ui = frame ? { requestId: `00000000-0000-4000-8000-${String(run).padStart(12, "0")}`, ...frame } : null;
  // `home-chat__thread` carries the answer tokens outside the workspace, as the chat-first home's thread does.
  return <div className="home-chat__thread gallery-replay__answer" data-replay={!frame || frame.status === "done" ? "done" : "playing"}>
    <OakArrangedAnswer key={run} id={`gallery-${replay.id}`} answer={answer} ui={ui} question={replay.question} citationLabels={citationLabels}
      latest={false} live={false} />
  </div>;
}
