import { createStore } from 'zustand/vanilla';

/**
 * Playback of the voiceover, the editor's clock. One hidden <audio> element
 * (VoiceoverAudio) is attached; the preview transport and the voiceover card
 * drive it. Per editor, like the editor store.
 *
 * `positionMs` updates a few times a second for UI; renderers call `nowMs()`
 * every frame instead, which reads the element directly.
 */

export type PlaybackStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface PlaybackState {
  status: PlaybackStatus;
  playing: boolean;
  positionMs: number;

  attach(audio: HTMLAudioElement | null): void;
  /** Current time, read from the element (for drawing frames). */
  nowMs(): number;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(ms: number): void;
  setError(): void;
}

export function createPlaybackStore() {
  let audio: HTMLAudioElement | null = null;
  let detach: (() => void) | null = null;

  return createStore<PlaybackState>()((set, get) => ({
    status: 'empty',
    playing: false,
    positionMs: 0,

    attach(el) {
      detach?.();
      detach = null;
      audio = el;
      if (!el) {
        set({ status: 'empty', playing: false, positionMs: 0 });
        return;
      }
      const position = () => set({ positionMs: el.currentTime * 1000 });
      const handlers: [keyof HTMLMediaElementEventMap, () => void][] = [
        ['loadedmetadata', () => set({ status: 'ready' })],
        ['canplay', () => set({ status: 'ready' })],
        ['play', () => set({ playing: true })],
        ['pause', () => set({ playing: false, positionMs: el.currentTime * 1000 })],
        ['ended', () => set({ playing: false })],
        ['timeupdate', position],
        ['seeked', position],
      ];
      for (const [type, fn] of handlers) el.addEventListener(type, fn);
      detach = () => {
        for (const [type, fn] of handlers) el.removeEventListener(type, fn);
      };
      set({
        status: el.readyState >= HTMLMediaElement.HAVE_METADATA ? 'ready' : 'loading',
        playing: !el.paused,
        positionMs: el.currentTime * 1000,
      });
    },

    nowMs() {
      return audio ? audio.currentTime * 1000 : get().positionMs;
    },

    play() {
      if (!audio) return;
      // Rejects if the browser blocks playback or the source fails; the pause/error events cover the UI.
      audio.play().catch(() => set({ playing: false }));
    },

    pause() {
      audio?.pause();
    },

    toggle() {
      if (audio?.paused) get().play();
      else get().pause();
    },

    seek(ms) {
      const t = Math.max(0, ms);
      if (audio) audio.currentTime = t / 1000;
      set({ positionMs: t });
    },

    setError() {
      set({ status: 'error', playing: false });
    },
  }));
}

export type PlaybackStore = ReturnType<typeof createPlaybackStore>;
