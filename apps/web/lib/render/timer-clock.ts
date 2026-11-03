/**
 * A pausable clock in ms, for playback when no audio element drives time (no
 * voiceover, or past its end). `now` is injectable for tests.
 */
export class TimerClock {
  private base = 0;
  private startedAt = 0;
  private running = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(fromMs: number): void {
    this.base = fromMs;
    this.startedAt = this.now();
    this.running = true;
  }

  /** Stops and returns the time it stopped at. */
  stop(): number {
    this.base = this.time();
    this.running = false;
    return this.base;
  }

  set(ms: number): void {
    this.base = ms;
    this.startedAt = this.now();
  }

  time(): number {
    return this.running ? this.base + (this.now() - this.startedAt) : this.base;
  }
}
