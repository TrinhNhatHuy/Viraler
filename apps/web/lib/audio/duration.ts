/** Exact duration by decoding the audio. Rejects if the browser can't decode it. */
export async function getAudioDurationMs(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return Math.round(buffer.duration * 1000);
  } finally {
    void ctx.close();
  }
}
