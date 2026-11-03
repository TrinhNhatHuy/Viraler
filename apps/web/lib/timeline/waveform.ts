/** Voiceover waveform for the timeline: peak amplitude per bucket. */

export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(Math.max(0, buckets));
  if (samples.length === 0 || buckets <= 0) return out;
  const size = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((b + 1) * size)));
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(samples[i]!);
      if (v > peak) peak = v;
    }
    out[b] = Math.min(1, peak);
  }
  return out;
}

const PEAK_BUCKETS = 4000;
const cache = new Map<string, Promise<Float32Array | null>>();

/** Decodes the audio at `url` once per `key` (the Storage path; signed URLs change). */
export function loadPeaks(key: string, url: string): Promise<Float32Array | null> {
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ctx = new OfflineAudioContext(1, 1, 44_100);
        const audio = await ctx.decodeAudioData(await res.arrayBuffer());
        return computePeaks(audio.getChannelData(0), PEAK_BUCKETS);
      } catch {
        return null;
      }
    })();
    cache.set(key, pending);
    // Failed decodes may succeed later (e.g. an expired URL): don't cache them.
    void pending.then((peaks) => {
      if (!peaks) cache.delete(key);
    });
  }
  return pending;
}
