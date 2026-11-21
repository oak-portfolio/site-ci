import { voiceLocalCapMaxMicroUsd, type ServiceStatus } from "../../packages/oak-agent-contracts/src/service-status";
import { markOakTurnstilePassed, oakTurnstileHeaders, resetOakTurnstile } from "./oakTurnstile";

export const voiceClipSeconds = 30;
export const voiceCaptureBytes = 2 * 1024 * 1024;
export const voiceSampleRate = 16_000;
export const voiceWavBytes = 44 + voiceClipSeconds * voiceSampleRate * 2;
export const voiceTranscriptCharacters = 4000;
const settingsFreshnessMs = 5 * 60_000;
const usageFreshnessMs = 60_000;
const transcriptionDeadlineMs = 30_000;
const mimeTypes = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

export type VoiceFailure = "unsupported" | "permission" | "device" | "capture" | "empty" | "bytes" | "duration" | "deadline" | "daily" | "check" | "service" | "transcription";
export class VoiceCaptureError extends Error {
  constructor(public readonly category: VoiceFailure) { super(category); }
}
export const voiceFailureText: Record<VoiceFailure, string> = {
  unsupported: "This browser cannot record this audio format. You can keep typing.",
  permission: "Microphone permission was not granted. You can keep typing.",
  device: "A microphone is not available. You can keep typing.",
  capture: "Recording was interrupted. Your typed message has not changed.",
  empty: "No speech text was returned. Your typed message has not changed.",
  bytes: "The clip is too large. Try a shorter recording; your typed message has not changed.",
  duration: "Keep the clip within 30 seconds. Your typed message has not changed.",
  deadline: "Voice input took too long. Try again explicitly or keep typing.",
  daily: "You have used today's voice clips. They come back at midnight UTC; you can keep typing.",
  check: "Finish the quick check below the message box, then try the clip again. Your typed message has not changed.",
  service: "Voice input is unavailable. You can keep typing.",
  transcription: "The clip could not be transcribed. Try again explicitly or keep typing.",
};
export type VoiceHttpConfiguration = Readonly<{
  enabled: boolean;
  status: ServiceStatus | null;
  fetch?: typeof fetch;
  /** The first status read is still in flight, so the panel must not claim dictation is off yet. */
  checking?: boolean;
}>;
export const disabledVoiceConfiguration: VoiceHttpConfiguration = Object.freeze({ enabled: false, status: null });
export const checkingVoiceConfiguration: VoiceHttpConfiguration = Object.freeze({ enabled: false, status: null, checking: true });

/** Server admission evidence is independent of browser microphone permission. */
export function voiceServiceAvailable(configuration = disabledVoiceConfiguration, now = Date.now()) {
  const status = configuration.status;
  const fresh = (value: number | null, age: number) => value !== null && Number.isFinite(value) && value <= now && now - value <= age;
  if (!configuration.enabled || status?.service !== "transcription" || !status.enabled || status.admission !== "available" ||
    status.failure !== "none" || status.evidence.settings !== "verified" || status.evidence.localReservations !== "verified" ||
    status.allowance.unit !== "micro-usd") return false;
  // A local-cap record is attested once when its key joins (ADR 0003) and the server keeps it verified until its credit
  // expires (workers/oak-agent/src/voice/evidence.ts), so only provider-observed settings must be minutes old.
  if (status.admissionBasis === "local-cap") {
    const budget = status.localBudget;
    return Boolean(budget && [budget.limit, budget.reserved, budget.remainingBound].every(value => value !== null && Number.isSafeInteger(value) && value >= 0) &&
      budget.limit !== null && budget.reserved !== null && budget.remainingBound !== null && budget.limit <= voiceLocalCapMaxMicroUsd &&
      budget.remainingBound === Math.max(0, budget.limit - budget.reserved) && budget.remainingBound > 0 &&
      status.evidence.providerUsage === "unknown" && status.allowance.limit === null && status.allowance.providerObserved === null &&
      status.allowance.conservativeUsed === null && status.allowance.remainingBound === null &&
      fresh(status.health.lastCheckAt, usageFreshnessMs));
  }
  if (status.admissionBasis !== undefined && status.admissionBasis !== "verified-provider") return false;
  if (!fresh(status.health.settingsObservedAt, settingsFreshnessMs)) return false;
  return status.evidence.providerUsage === "verified" && status.allowance.remainingBound !== null &&
    Number.isSafeInteger(status.allowance.remainingBound) && status.allowance.remainingBound > 0 && fresh(status.health.usageObservedAt, usageFreshnessMs);
}

/** The fixed PCM format makes actual frames, rather than a client timer, measurable. */
export function mono16kWav(channels: readonly Float32Array[], sourceRate: number): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  if (!Number.isInteger(sourceRate) || sourceRate < 8000 || sourceRate > 192_000 || channels.length < 1 || channels.length > 2 ||
      channels.some(channel => channel.length !== frames)) throw new VoiceCaptureError("capture");
  if (!frames) throw new VoiceCaptureError("empty");
  if (frames > sourceRate * voiceClipSeconds) throw new VoiceCaptureError("duration");
  if (channels.some(channel => channel.some(value => !Number.isFinite(value)))) throw new VoiceCaptureError("capture");
  const outputFrames = Math.floor(frames * voiceSampleRate / sourceRate);
  if (!outputFrames) throw new VoiceCaptureError("empty");
  const bytes = new Uint8Array(44 + outputFrames * 2), view = new DataView(bytes.buffer);
  const label = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  label(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); label(8, "WAVE"); label(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, voiceSampleRate, true); view.setUint32(28, voiceSampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, "data"); view.setUint32(40, outputFrames * 2, true);
  for (let index = 0; index < outputFrames; index++) {
    const position = index * sourceRate / voiceSampleRate, left = Math.floor(position), right = Math.min(left + 1, frames - 1), fraction = position - left;
    const sample = channels.reduce((sum, channel) => sum + channel[left]! * (1 - fraction) + channel[right]! * fraction, 0) / channels.length;
    const bounded = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(bounded * (bounded < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

async function responseText(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceCaptureError("transcription");
  const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const part = await reader.read();
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      if (part.done) break;
      size += part.value.byteLength;
      if (size > voiceTranscriptCharacters * 4 + 256) { await reader.cancel(); throw new VoiceCaptureError("transcription"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException("Stopped", "AbortError"));
    if (signal.aborted) { work.catch(() => {}); cancel(); return; }
    signal.addEventListener("abort", cancel, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** One same-origin upload. Neither this adapter nor the widget sends a chat turn. */
export async function transcribeVoiceClip(clip: Blob, requestId: string, signal: AbortSignal, configuration = disabledVoiceConfiguration): Promise<string> {
  if (!voiceServiceAvailable(configuration)) throw new VoiceCaptureError("service");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
      clip.type !== "audio/wav" || clip.size <= 44 || clip.size > voiceWavBytes) throw new VoiceCaptureError("capture");
  const controller = new AbortController(); let deadline = false;
  const cancel = () => controller.abort(); signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(() => { deadline = true; controller.abort(); }, transcriptionDeadlineMs);
  try {
    if (controller.signal.aborted) throw new DOMException("Stopped", "AbortError");
    const response = await untilAborted((configuration.fetch ?? fetch)("/api/oak/transcription", {
      method: "POST", credentials: "same-origin", redirect: "error", signal: controller.signal,
      // Same one-time human check as chat; the Worker refuses clips from a guest that has not passed it.
      headers: { "Content-Type": "audio/wav", "X-Oak-Request-ID": requestId, ...oakTurnstileHeaders() }, body: clip,
    }), controller.signal);
    if (!response.ok) {
      // A 429 or 403 names its reason in a tiny JSON body; the daily limit and the human check get their own messages.
      const reason = response.status === 429 || response.status === 403 ?
        await responseText(response, controller.signal).then(body => body.length < 256 ? body : "", () => "") : "";
      if (!reason) await response.body?.cancel().catch(() => {});
      if (reason.includes('"turnstile-required"')) { resetOakTurnstile(); throw new VoiceCaptureError("check"); }
      throw new VoiceCaptureError(reason.includes('"transcription-daily-limit"') ? "daily" : response.status === 429 || response.status === 503 ? "service" : "transcription");
    }
    markOakTurnstilePassed();
    const value: unknown = JSON.parse(await responseText(response, controller.signal));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 ||
        !("requestId" in value) || value.requestId !== requestId || !("text" in value) ||
        typeof value.text !== "string" || value.text.length > voiceTranscriptCharacters) throw new VoiceCaptureError("transcription");
    return value.text;
  } catch (error) {
    if (deadline) throw new VoiceCaptureError("deadline");
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    throw error instanceof VoiceCaptureError ? error : new VoiceCaptureError("transcription");
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}

export type VoiceCaptureState = Readonly<{
  phase: "idle" | "permission" | "recording" | "stopping" | "clip-ready" | "transcribing" | "review" | "failed";
  seconds: number;
  transcript: string;
  failure: VoiceFailure | null;
}>;
export type VoiceCaptureEnvironment = {
  microphone: () => Promise<MediaStream>;
  supports: (mime: string) => boolean;
  recorder: (stream: MediaStream, mime: string) => MediaRecorder;
  decode: (clip: Blob, signal: AbortSignal) => Promise<{ channels: readonly Float32Array[]; sampleRate: number }>;
  /** Live input level (0..1) read from the recording stream itself. Optional so tests and old callers stay valid. */
  meter?: (stream: MediaStream) => VoiceLevelMeter;
};
export type VoiceLevelMeter = { read: () => number; close: () => void };

/** RMS of the analyser's time-domain window, scaled so normal speech reaches roughly 0.5-0.9. */
function analyserMeter(stream: MediaStream): VoiceLevelMeter {
  if (typeof AudioContext === "undefined") return { read: () => 0, close() {} };
  const context = new AudioContext(), analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  // A source can refuse the stream (for example a sample-rate mismatch); never leave the context running.
  try { context.createMediaStreamSource(stream).connect(analyser); } catch (error) { void context.close().catch(() => {}); throw error; }
  const samples = new Float32Array(analyser.fftSize);
  return {
    read: () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      return Math.min(1, rms * 4);
    },
    close: () => { void context.close().catch(() => {}); },
  };
}
function browserEnvironment(): VoiceCaptureEnvironment {
  return {
    microphone: async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new VoiceCaptureError("unsupported");
      return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
    },
    supports: mime => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime),
    recorder: (stream, mime) => new MediaRecorder(stream, { mimeType: mime }),
    meter: analyserMeter,
    decode: async (clip, signal) => {
      if (typeof AudioContext === "undefined") throw new VoiceCaptureError("unsupported");
      const context = new AudioContext();
      const stop = () => { void context.close().catch(() => {}); };
      signal.addEventListener("abort", stop, { once: true });
      try {
        if (signal.aborted) throw new DOMException("Stopped", "AbortError");
        const buffer = await context.decodeAudioData(await clip.arrayBuffer());
        if (signal.aborted) throw new DOMException("Stopped", "AbortError");
        return { channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)), sampleRate: buffer.sampleRate };
      } finally { signal.removeEventListener("abort", stop); if (context.state !== "closed") await context.close(); }
    },
  };
}
function failureCategory(error: unknown): VoiceFailure {
  if (error instanceof VoiceCaptureError) return error.category;
  const name = error instanceof Error ? error.name : "";
  return name === "NotSupportedError" || name === "EncodingError" ? "unsupported" : name === "NotAllowedError" || name === "SecurityError" ? "permission" :
    name === "NotFoundError" || name === "NotReadableError" ? "device" : "capture";
}

/** Audio lives only in private temporary fields; subscribers receive text/status only. */
export function createVoiceCapture(configuration: () => VoiceHttpConfiguration = () => disabledVoiceConfiguration, environment = browserEnvironment()) {
  let state: VoiceCaptureState = { phase: "idle", seconds: 0, transcript: "", failure: null };
  const listeners = new Set<() => void>(), stoppedTracks = new WeakSet<MediaStreamTrack>();
  let epoch = 0, stream: MediaStream | null = null, recorder: MediaRecorder | null = null, clip: Blob | null = null;
  let chunks: Blob[] = [], size = 0, request: AbortController | null = null;
  let trackListeners: Array<{ track: MediaStreamTrack; ended: () => void }> = [];
  let deadline: ReturnType<typeof setTimeout> | null = null, ticker: ReturnType<typeof setInterval> | null = null;
  let meter: VoiceLevelMeter | null = null, fixtureLevels: readonly number[] = [], fixtureRead = 0;
  const update = (next: Partial<VoiceCaptureState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  const timers = () => { if (deadline !== null) clearTimeout(deadline); if (ticker !== null) clearInterval(ticker); deadline = null; ticker = null; };
  const stopTracks = (value: MediaStream | null) => value?.getTracks().forEach(track => {
    if (!stoppedTracks.has(track)) { stoppedTracks.add(track); track.stop(); }
  });
  const removeTrackListeners = () => { trackListeners.forEach(({ track, ended }) => track.removeEventListener("ended", ended)); trackListeners = []; };
  const release = () => {
    timers(); meter?.close(); meter = null;
    if (recorder) { recorder.ondataavailable = null; recorder.onerror = null; recorder.onstop = null; if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* Track release still owns microphone cleanup. */ } } }
    removeTrackListeners(); stopTracks(stream); stream = null; recorder = null; chunks = []; size = 0; clip = null;
    request?.abort(); request = null;
  };
  const fail = (category: VoiceFailure) => { epoch++; release(); update({ phase: "failed", failure: category }); };
  const cancel = () => { epoch++; release(); update({ phase: "idle", seconds: 0, failure: null }); };
  const stop = () => {
    if (state.phase !== "recording" || !recorder) return;
    timers(); update({ phase: "stopping" });
    deadline = setTimeout(() => fail("capture"), 2000);
    try { recorder.stop(); stopTracks(stream); }
    catch { fail("capture"); }
  };
  const record = async () => {
    if (["permission", "recording", "stopping", "transcribing"].includes(state.phase)) return;
    if (!voiceServiceAvailable(configuration())) { fail("service"); return; }
    cancel(); const run = epoch; update({ phase: "permission" });
    deadline = setTimeout(() => fail("deadline"), 20_000);
    try {
      const mime = mimeTypes.find(value => environment.supports(value)); if (!mime) throw new VoiceCaptureError("unsupported");
      const acquired = await environment.microphone();
      if (run !== epoch) { stopTracks(acquired); return; }
      stream = acquired; recorder = environment.recorder(acquired, mime); timers();
      recorder.ondataavailable = event => {
        if (run !== epoch) return;
        size += event.data.size; if (size > voiceCaptureBytes) { fail("bytes"); return; }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => { if (run === epoch) fail("capture"); };
      recorder.onstop = () => {
        if (run !== epoch) return;
        timers(); removeTrackListeners(); stopTracks(stream); stream = null; meter?.close(); meter = null;
        if (recorder) { recorder.ondataavailable = null; recorder.onerror = null; recorder.onstop = null; }
        recorder = null;
        clip = new Blob(chunks, { type: mime }); chunks = []; size = 0;
        if (!clip.size) { fail("empty"); return; }
        update({ phase: "clip-ready" });
      };
      acquired.getTracks().forEach(track => {
        const ended = () => { if (run === epoch && state.phase === "recording") fail("capture"); };
        trackListeners.push({ track, ended }); track.addEventListener("ended", ended, { once: true });
      });
      recorder.start(250); if (run !== epoch) return;
      try { meter = environment.meter?.(acquired) ?? null; } catch { meter = null; /* A missing meter never blocks recording. */ }
      const started = Date.now(); update({ phase: "recording", seconds: 0 });
      ticker = setInterval(() => { if (run === epoch) update({ seconds: Math.min(voiceClipSeconds, Math.floor((Date.now() - started) / 1000)) }); }, 1000);
      deadline = setTimeout(stop, voiceClipSeconds * 1000);
    } catch (error) { if (run === epoch) fail(failureCategory(error)); }
  };
  const transcribe = async () => {
    if (state.phase !== "clip-ready" || !clip) return;
    if (!voiceServiceAvailable(configuration())) { fail("service"); return; }
    const run = epoch, captured = clip; clip = null; request = new AbortController(); const signal = request.signal;
    update({ phase: "transcribing", failure: null });
    deadline = setTimeout(() => fail("deadline"), transcriptionDeadlineMs);
    try {
      const decoded = await untilAborted(environment.decode(captured, signal), signal);
      if (run !== epoch || signal.aborted) return;
      const bytes = mono16kWav(decoded.channels, decoded.sampleRate);
      const text = await transcribeVoiceClip(new Blob([bytes as BlobPart], { type: "audio/wav" }), crypto.randomUUID(), signal, configuration());
      if (run !== epoch || signal.aborted) return;
      request = null; timers();
      update({ phase: text.trim() ? "review" : "failed", transcript: text, failure: text.trim() ? null : "empty" });
    } catch (error) { if (run === epoch) fail(failureCategory(error)); }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Dev state gallery only: show a fixture phase without touching the microphone. */
    setFixture: ({ levels, ...next }: Partial<VoiceCaptureState> & { levels?: readonly number[] }) => {
      fixtureLevels = levels ?? []; fixtureRead = 0; update(next);
    },
    /** Current input level 0..1 while recording; 0 otherwise. Read on demand so the store never re-renders per audio frame. */
    level: () => {
      if (state.phase !== "recording") return 0;
      if (fixtureLevels.length) return fixtureLevels[fixtureRead++ % fixtureLevels.length]!;
      try { return meter?.read() ?? 0; } catch { return 0; }
    },
    record, stop, cancel, transcribe,
    edit: (transcript: string) => update({ transcript }),
    clear: () => { cancel(); update({ transcript: "" }); },
    dispose: () => { cancel(); listeners.clear(); },
  };
}
export type VoiceCaptureController = ReturnType<typeof createVoiceCapture>;
