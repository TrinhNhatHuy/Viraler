import { createStore } from 'zustand/vanilla';
import { TimerClock } from '@/lib/render/timer-clock';

/**
 * The editor's playback clock. Per editor, like the editor store.
 *
 * Time runs from 0 to the project length (`durationMs`: voiceover or clips,
 * whichever is longer). While the voiceover is playing, its <audio> element
 * (attached by VoiceoverAudio) is the clock, so audio and picture can't drift;
 * past its end, or with no voiceover, a timer clock takes over.
 *
 * `positionMs` updates ~10×/s for UI. Renderers call `nowMs()` every frame.
 */

export type PlaybackStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface PlaybackState {
  /** State of the voiceover audio ('empty' = no voiceover). */
  status: PlaybackStatus;
  playing: boolean;
  positionMs: number;
  /** Project length. */
  durationMs: number;
  /** Voiceover length: the audio drives the clock up to here. */
  voiceoverMs: number;

  attach(audio: HTMLAudioElement | null): void;
  setDurations(durationMs: number, voiceoverMs: number): void;
  nowMs(): number;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(ms: number): void;
  setError(): void;
}

const TICK_MS = 100;
/** Treat positions this close to an end as the end. */
const END_EPSILON_MS = 30;

export function createPlaybackStore() {
  let audio: HTMLAudioElement | null = null;
  let detach: (() => void) | null = null;
  let mode: 'audio' | 'timer' | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  // Our own audio.pause() calls (switching to the timer) aren't user pauses.
  let internalPause = false;
  const clock = new TimerClock();

  return createStore<PlaybackState>()((set, get) => {
    const audioUsable = () => audio !== null && get().status !== 'error' && get().voiceoverMs > 0;

    const pauseAudio = () => {
      if (audio && !audio.paused) {
        internalPause = true;
        audio.pause();
      }
    };

    const stopTicker = () => {
      if (ticker) clearInterval(ticker);
      ticker = null;
    };

    const startTimer = (fromMs: number) => {
      pauseAudio();
      mode = 'timer';
      clock.start(fromMs);
    };

    const startAudio = (fromMs: number) => {
      clock.stop();
      mode = 'audio';
      audio!.currentTime = fromMs / 1000;
      audio!.play().catch(() => {
        // Blocked or failed: keep going on the timer rather than stalling.
        if (mode === 'audio' && get().playing) startTimer(get().nowMs());
      });
    };

    const stopAt = (ms: number) => {
      stopTicker();
      pauseAudio();
      clock.stop();
      clock.set(ms);
      mode = null;
      set({ playing: false, positionMs: ms });
    };

    const tick = () => {
      const { durationMs, voiceoverMs } = get();
      const t = get().nowMs();
      if (t >= durationMs - END_EPSILON_MS) return stopAt(durationMs);
      if (mode === 'audio' && t >= voiceoverMs - END_EPSILON_MS) startTimer(voiceoverMs);
      set({ positionMs: t });
    };

    return {
      status: 'empty',
      playing: false,
      positionMs: 0,
      durationMs: 0,
      voiceoverMs: 0,

      attach(el) {
        detach?.();
        detach = null;
        if (mode === 'audio') get().pause();
        audio = el;
        if (!el) {
          set({ status: 'empty' });
          return;
        }
        const handlers: [keyof HTMLMediaElementEventMap, () => void][] = [
          ['loadedmetadata', () => set({ status: 'ready' })],
          ['canplay', () => set({ status: 'ready' })],
          [
            'ended',
            () => {
              if (mode !== 'audio') return;
              const { durationMs, voiceoverMs } = get();
              if (durationMs > voiceoverMs + END_EPSILON_MS) startTimer(voiceoverMs);
              else stopAt(durationMs);
            },
          ],
          [
            'pause',
            () => {
              if (internalPause) {
                internalPause = false;
                return;
              }
              // Paused from outside (e.g. a media key) while the audio was the clock.
              if (mode === 'audio' && !el.ended) get().pause();
            },
          ],
        ];
        for (const [type, fn] of handlers) el.addEventListener(type, fn);
        detach = () => {
          for (const [type, fn] of handlers) el.removeEventListener(type, fn);
        };
        el.currentTime = Math.min(get().positionMs, get().voiceoverMs) / 1000;
        set({ status: el.readyState >= HTMLMediaElement.HAVE_METADATA ? 'ready' : 'loading' });
      },

      setDurations(durationMs, voiceoverMs) {
        const s = get();
        if (s.durationMs === durationMs && s.voiceoverMs === voiceoverMs) return;
        set({ durationMs, voiceoverMs });
        if (s.positionMs > durationMs) get().seek(durationMs);
      },

      nowMs() {
        if (mode === 'audio' && audio) return audio.currentTime * 1000;
        if (mode === 'timer') return clock.time();
        return get().positionMs;
      },

      play() {
        const { playing, durationMs, voiceoverMs } = get();
        if (playing || durationMs <= 0) return;
        let t = get().positionMs;
        if (t >= durationMs - END_EPSILON_MS) t = 0; // at the end: start over
        if (audioUsable() && t < voiceoverMs - END_EPSILON_MS) startAudio(t);
        else startTimer(t);
        set({ playing: true, positionMs: t });
        stopTicker();
        ticker = setInterval(tick, TICK_MS);
      },

      pause() {
        if (!get().playing) return;
        stopAt(get().nowMs());
      },

      toggle() {
        if (get().playing) get().pause();
        else get().play();
      },

      seek(ms) {
        const { durationMs, voiceoverMs, playing } = get();
        const t = Math.max(0, Math.min(ms, durationMs));
        if (playing) {
          const wantAudio = audioUsable() && t < voiceoverMs - END_EPSILON_MS;
          if (wantAudio && mode === 'audio') audio!.currentTime = t / 1000;
          else if (wantAudio) startAudio(t);
          else if (mode === 'timer') clock.set(t);
          else startTimer(t);
        } else {
          clock.set(t);
          if (audio) audio.currentTime = Math.min(t, voiceoverMs) / 1000;
        }
        set({ positionMs: t });
      },

      setError() {
        if (mode === 'audio') startTimer(get().nowMs());
        set({ status: 'error' });
      },
    };
  });
}

export type PlaybackStore = ReturnType<typeof createPlaybackStore>;
