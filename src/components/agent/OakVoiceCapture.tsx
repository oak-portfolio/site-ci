import * as React from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, FieldControl, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createVoiceCapture, disabledVoiceConfiguration, voiceClipSeconds, voiceFailureText, voiceServiceAvailable,
  voiceTranscriptCharacters, type VoiceHttpConfiguration, type VoiceCaptureEnvironment, type VoiceCaptureController } from "@/lib/oakVoiceCapture";

export type OakVoiceCaptureProps = {
  configuration?: VoiceHttpConfiguration;
  onUseTranscript: (text: string) => void;
  environment?: VoiceCaptureEnvironment;
  controller?: VoiceCaptureController;
};

const meterBars = 32;
const meterSampleMs = 90;
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Recent input levels as bars, oldest first. Levels are 0..1 and render as nine CSS steps, so no inline styles. */
const unit = (value: number) => Math.min(1, Math.max(0, value));
export function OakVoiceLevel({ levels }: { levels: readonly number[] }) {
  const latest = Math.round(unit(levels.at(-1) ?? 0) * 100);
  return <div className="oak-voice__meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={latest}>
    {levels.map((level, index) => <span key={index} data-level={Math.round(unit(level) * 8)} />)}
  </div>;
}

/** Samples the controller's live level while recording. Holds the last bars when recording stops. */
function useVoiceLevels(capture: VoiceCaptureController, recording: boolean) {
  const [levels, setLevels] = React.useState<number[]>(() => Array<number>(meterBars).fill(0));
  React.useEffect(() => {
    if (!recording) return;
    setLevels(Array.from({ length: meterBars }, () => capture.level()));
    const timer = setInterval(() => setLevels(previous => [...previous.slice(1), capture.level()]), meterSampleMs);
    return () => clearInterval(timer);
  }, [capture, recording]);
  return levels;
}

/** Capture and transcription are separate from the existing explicit chat Send. The WorkflowPanel owns the title. */
export function OakVoiceCapture({ configuration = disabledVoiceConfiguration, onUseTranscript, environment, controller }: OakVoiceCaptureProps) {
  const config = React.useRef(configuration); config.current = configuration;
  const [capture] = React.useState(() => controller ?? createVoiceCapture(() => config.current, environment));
  const state = React.useSyncExternalStore(capture.subscribe, capture.getSnapshot, capture.getSnapshot);
  const id = React.useId();
  const transcript = React.useRef<HTMLTextAreaElement | null>(null);
  const available = voiceServiceAvailable(configuration);
  const levels = useVoiceLevels(capture, state.phase === "recording");
  React.useEffect(() => () => capture.cancel(), [capture]);
  React.useEffect(() => { if (!available) capture.cancel(); }, [available, capture]);
  React.useEffect(() => { if (state.phase === "review") transcript.current?.focus(); }, [state.phase]);
  const active = ["permission", "recording", "stopping", "transcribing"].includes(state.phase);
  const reviewing = state.phase === "review" || Boolean(state.transcript);
  const over = state.transcript.length > voiceTranscriptCharacters;
  const canUse = !active && Boolean(state.transcript.trim()) && !over;
  const status = !available ? voiceFailureText.service : {
    idle: "Ready to record", permission: "Waiting for microphone permission", recording: "Recording",
    stopping: "Finishing the clip", "clip-ready": "Clip ready to transcribe", transcribing: "Transcribing your clip",
    review: "Review your words, then use them", failed: "Voice input did not finish" }[state.phase];
  const record = <Button type="button" variant={reviewing ? "ghost" : "primary"} size="sm" disabled={!available || active}
    onClick={() => { void capture.record(); }}><Icon name="microphone" />{reviewing || state.phase === "clip-ready" ? "Record again" : "Record"}</Button>;
  const cancel = <Button type="button" variant="ghost" size="sm" onClick={capture.cancel}><Icon name="cancel" />Cancel voice input</Button>;
  return <div className="oak-voice" data-phase={state.phase}>
    <p className="sr-only" role="status">{status}</p>
    {!reviewing || active ? <div className="oak-voice__stage" data-phase={state.phase}>
      <div className="oak-voice__readout">
        {state.phase === "transcribing" ? null : <span className="oak-voice__dot" aria-hidden="true" />}
        {state.phase === "transcribing" ? <><Spinner aria-hidden="true" /><span>{status}</span></> :
          <span className="oak-voice__timer" aria-label={`${state.seconds} of ${voiceClipSeconds} seconds`}>
            {clock(state.seconds)}<span aria-hidden="true"> / {clock(voiceClipSeconds)}</span>
          </span>}
        <span className="oak-voice__state" aria-hidden="true">{state.phase === "transcribing" ? null : status}</span>
      </div>
      {state.phase === "transcribing" ? null : <OakVoiceLevel levels={levels} />}
      <div className="oak-voice__controls">
        {state.phase === "recording" ? <Button type="button" size="sm" onClick={capture.stop}><Icon name="stop" />Stop recording</Button> : null}
        {state.phase === "clip-ready" ? <Button type="button" size="sm" disabled={!available} onClick={() => { void capture.transcribe(); }}><Icon name="edit" />Transcribe clip</Button> : null}
        {!active ? record : null}
        {active || state.phase === "clip-ready" ? cancel : null}
      </div>
    </div> : null}
    {/* A spent daily allowance is a pause, not an error: calm style and a clock, still announced. */}
    {state.failure ? <Callout variant={state.failure === "daily" ? "default" : "destructive"} icon={state.failure === "daily" ? "clock" : "alert"} role="alert">
      {voiceFailureText[state.failure]}</Callout> : null}
    {reviewing ? <div className="oak-voice__review">
      <Field>
        <FieldLabel htmlFor={`${id}-text`}>Your editable transcript</FieldLabel>
        <FieldControl ref={transcript} render={<Textarea rows={4} />} id={`${id}-text`} value={state.transcript} disabled={active}
          aria-describedby={`${id}-limit`} aria-invalid={over || undefined} onChange={event => capture.edit(event.target.value)} />
      </Field>
      <div className="oak-voice__review-footer">
        <span id={`${id}-limit`} className="oak-voice__count" data-over={over || undefined}>
          {state.transcript.length} / {voiceTranscriptCharacters}{over ? ". Shorten the text before using it; your words stay intact." : ""}
        </span>
        <div className="oak-voice__controls">
          {!active ? record : null}
          <Button type="button" variant="ghost" size="sm" disabled={active} onClick={capture.clear}>Clear transcript</Button>
          <Button type="button" size="sm" disabled={!canUse} onClick={() => { if (canUse) onUseTranscript(state.transcript); }}>Use transcript</Button>
        </div>
      </div>
    </div> : null}
    {/* The processor disclosure belongs to recording; with voice off there is nothing to disclose. */}
  </div>;
}
