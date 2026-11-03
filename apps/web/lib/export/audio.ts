import { AudioBufferSink } from 'mediabunny';
import type { MediaUrlResolver } from '@/lib/media/urls';
import type { ExportFrames } from './frames';
import type { AudioSegment } from './plan';

export const EXPORT_SAMPLE_RATE = 48_000;

/**
 * Mixes the voiceover and unmuted clip audio into one stereo buffer covering
 * the whole video (OfflineAudioContext). Returns null when there's no audio.
 */
export async function mixAudio(
  segments: AudioSegment[],
  durationSec: number,
  deps: { urls: MediaUrlResolver; frames: ExportFrames; signal: AbortSignal },
): Promise<AudioBuffer | null> {
  if (segments.length === 0) return null;
  const length = Math.max(1, Math.ceil(durationSec * EXPORT_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, EXPORT_SAMPLE_RATE);

  const play = (
    buffer: AudioBuffer,
    gain: number,
    when: number,
    offset: number,
    duration: number,
  ) => {
    if (duration <= 0 || when >= durationSec) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    source.connect(g).connect(ctx.destination);
    source.start(Math.max(0, when), offset, duration);
  };

  for (const seg of segments) {
    deps.signal.throwIfAborted();
    if (seg.kind === 'voiceover') {
      const url = await deps.urls.resolve(seg.src);
      if (!url) throw new Error("Couldn't load the voiceover.");
      const res = await fetch(url, { signal: deps.signal });
      if (!res.ok) throw new Error(`Couldn't download the voiceover (${res.status}).`);
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      play(
        buffer,
        seg.gain,
        seg.startSec,
        seg.offsetSec,
        Math.min(seg.durationSec, buffer.duration),
      );
      continue;
    }

    // Clip audio: decode only the clip's range from the already-downloaded file.
    const input = seg.mediaId ? deps.frames.input(seg.mediaId) : null;
    const track = await input?.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) continue; // no audio track: silent
    const end = seg.offsetSec + seg.durationSec;
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(
      seg.offsetSec,
      end,
    )) {
      const skip = Math.max(0, seg.offsetSec - timestamp); // part of the buffer before the trim
      const from = Math.max(timestamp, seg.offsetSec);
      const playFor = Math.min(buffer.duration - skip, end - from);
      play(buffer, seg.gain, seg.startSec + (from - seg.offsetSec), skip, playFor);
    }
  }
  return ctx.startRendering();
}
