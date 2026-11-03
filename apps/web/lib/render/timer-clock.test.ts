import { describe, expect, it } from 'vitest';
import { TimerClock } from './timer-clock';

describe('TimerClock', () => {
  it('runs from a start time and stops where it was', () => {
    let now = 1000;
    const clock = new TimerClock(() => now);
    expect(clock.time()).toBe(0);
    clock.start(500);
    now += 250;
    expect(clock.time()).toBe(750);
    expect(clock.stop()).toBe(750);
    now += 1000;
    expect(clock.time()).toBe(750);
    expect(clock.isRunning).toBe(false);
  });

  it('jumps when set, while running or not', () => {
    let now = 0;
    const clock = new TimerClock(() => now);
    clock.set(2000);
    expect(clock.time()).toBe(2000);
    clock.start(2000);
    now += 100;
    clock.set(5000);
    now += 100;
    expect(clock.time()).toBe(5100);
  });
});
