import { serviceStatusSchema } from '../../packages/oak-agent-contracts/src/service-status-schema';
import { createVoiceCapture, disabledVoiceConfiguration, type VoiceCaptureController, type VoiceHttpConfiguration } from './oakVoiceCapture';

let configuration = disabledVoiceConfiguration;
let capture: VoiceCaptureController | null = null;

/** Persistent text only. Temporary microphone/audio work is cancelled by the workspace owner. */
export function getOakVoiceController() {
  return capture ??= createVoiceCapture(() => configuration);
}
export function configureOakVoice(next: VoiceHttpConfiguration) { configuration = next; }
export function cancelOakVoice(clear = false) {
  if (clear) capture?.clear(); else capture?.cancel();
  configuration = disabledVoiceConfiguration;
}
async function beforeAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => {}); throw new DOMException('Stopped', 'AbortError'); }
  let cancel = () => {};
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(new DOMException('Stopped', 'AbortError'));
    signal.addEventListener('abort', cancel, { once: true });
  });
  try { return await Promise.race([work, aborted]); }
  finally { signal.removeEventListener('abort', cancel); }
}

/** Explicit voice entry reads public capacity once. It cannot prompt for a microphone or upload audio. */
export async function readOakVoiceConfiguration(signal: AbortSignal): Promise<VoiceHttpConfiguration> {
  const pending = fetch('/api/oak/transcription/status', { credentials: 'same-origin', redirect: 'error', signal });
  void pending.then(late => { if (signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
  const response = await beforeAbort(pending, signal);
  if (!response.ok || !response.body) { void response.body?.cancel().catch(() => {}); return disabledVoiceConfiguration; }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      const part = await beforeAbort(reader.read(), signal);
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) throw new Error('voice-status-unavailable');
      text += decoder.decode(part.value, { stream: true });
    }
    const parsed = serviceStatusSchema.safeParse(JSON.parse(text + decoder.decode()));
    return parsed.success && parsed.data.service === 'transcription' ? { enabled: parsed.data.enabled, status: parsed.data } : disabledVoiceConfiguration;
  } catch {
    void reader.cancel().catch(() => {});
    return disabledVoiceConfiguration;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
