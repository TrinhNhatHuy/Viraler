import { CANVAS_HEIGHT, CANVAS_WIDTH, type Project } from '@viraler/shared';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  canEncodeAudio,
  canEncodeVideo,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  type StreamTargetChunk,
} from 'mediabunny';
import { mediaUrls } from '@/lib/media/urls';
import { ensureFont } from '@/lib/render/fonts';
import { RANK_LABEL_STYLE, RANKING_TITLE_STYLE } from '@/lib/render/overlays';
import { Renderer } from '@/lib/render/renderer';
import { projectDurationMs } from '@/lib/timeline/model';
import { EXPORT_SAMPLE_RATE, mixAudio } from './audio';
import { ExportFrames } from './frames';
import { audioPlan, exportChecks, type ExportFps, frameCount, frameTimeMs } from './plan';

/** A readable reason the export can't run here (shown as is). */
export class ExportError extends Error {}

export type ExportPhase = 'preparing' | 'downloading' | 'audio' | 'rendering' | 'finishing';

export interface ExportProgress {
  phase: ExportPhase;
  done: number;
  total: number;
}

export interface ExportResult {
  /** The file, when it was built in memory (no save-to-disk support). */
  blob: Blob | null;
  bytes: number;
  elapsedMs: number;
}

/** Yield to the UI every this many frames. */
const YIELD_EVERY = 8;

/**
 * Renders `project` to an MP4 (H.264 + AAC, 1080×1920) with the same Renderer
 * as the preview. With a file handle (Chrome/Edge save dialog) the file streams
 * straight to disk; otherwise it's built in memory and returned as a Blob.
 */
export async function exportVideo(
  project: Project,
  opts: {
    fps: ExportFps;
    file?: FileSystemFileHandle;
    onProgress: (p: ExportProgress) => void;
    signal: AbortSignal;
  },
): Promise<ExportResult> {
  const started = performance.now();
  const { fps, file, onProgress, signal } = opts;
  onProgress({ phase: 'preparing', done: 0, total: 1 });

  const { errors } = exportChecks(project);
  if (errors.length > 0) throw new ExportError(errors[0]);
  const durationMs = projectDurationMs(project);
  const frames = frameCount(durationMs, fps);
  const audio = audioPlan(project);

  const size = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  if (!(await canEncodeVideo('avc', { ...size, frameRate: fps, bitrate: QUALITY_HIGH }))) {
    throw new ExportError("This browser can't encode H.264 video. Use Chrome, Edge or Safari.");
  }
  if (audio.length > 0) {
    const native = await canEncodeAudio('aac', {
      numberOfChannels: 2,
      sampleRate: EXPORT_SAMPLE_RATE,
    });
    if (!native) {
      // Firefox / Linux Chrome: a WebAssembly AAC encoder, loaded only when needed.
      const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
      registerAacEncoder();
    }
  }
  await Promise.all(
    [project.captions.style, project.hookTitle.style, RANKING_TITLE_STYLE, RANK_LABEL_STYLE].map(
      ensureFont,
    ),
  );

  const source = new ExportFrames(project, fps);
  const writable = file ? await file.createWritable() : null;
  const target = writable
    ? // FileSystemWritableFileStream accepts mediabunny's { type: 'write', data, position } chunks.
      new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true })
    : new BufferTarget();
  const output = new Output({
    // In memory the index can go first (fast start); streamed, it's written at the end.
    format: new Mp4OutputFormat({ fastStart: writable ? false : 'in-memory' }),
    target,
  });

  try {
    await source.load(
      mediaUrls(),
      (done, total) => onProgress({ phase: 'downloading', done, total }),
      signal,
    );

    const canvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new ExportError("Couldn't create a drawing canvas.");
    const video = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: QUALITY_HIGH,
      keyFrameInterval: 2,
    });
    output.addVideoTrack(video, { frameRate: fps });
    const audioSource =
      audio.length > 0 ? new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    // Audio first: it's small, so the muxer buffering it while video catches up is
    // cheap (the other way round would hold encoded video in memory).
    if (audioSource) {
      onProgress({ phase: 'audio', done: 0, total: 1 });
      const mixed = await mixAudio(audio, durationMs / 1000, {
        urls: mediaUrls(),
        frames: source,
        signal,
      });
      if (mixed) await audioSource.add(mixed);
      audioSource.close();
    }

    const renderer = new Renderer();
    for (let i = 0; i < frames; i++) {
      signal.throwIfAborted();
      const t = frameTimeMs(i, fps);
      await source.advance(t);
      renderer.render(ctx, project, t, source);
      await video.add(t / 1000, 1 / fps); // waits when the encoder is busy (backpressure)
      if (i % YIELD_EVERY === 0) {
        onProgress({ phase: 'rendering', done: i, total: frames });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    video.close();

    onProgress({ phase: 'finishing', done: 0, total: 1 });
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    // The save dialog already created the file; don't leave a broken one behind (Chrome).
    const removable = file as (FileSystemFileHandle & { remove?: () => Promise<void> }) | undefined;
    await removable?.remove?.().catch(() => {});
    throw e;
  } finally {
    await source.dispose();
  }

  const elapsedMs = performance.now() - started;
  if (target instanceof BufferTarget) {
    const buffer = target.buffer;
    if (!buffer) throw new ExportError('The export produced no data.');
    return { blob: new Blob([buffer], { type: 'video/mp4' }), bytes: buffer.byteLength, elapsedMs };
  }
  return { blob: null, bytes: (await file!.getFile()).size, elapsedMs };
}
