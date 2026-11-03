import { describe, expect, it } from 'vitest';
import { fitRect } from './fit';

describe('fitRect', () => {
  it('fill: a landscape video covers the portrait frame, cropped at the sides', () => {
    const r = fitRect(1920, 1080, 1080, 1920, 'fill');
    expect(r.h).toBe(1920);
    expect(r.w).toBeCloseTo(3413.33, 1);
    expect(r.x).toBeCloseTo(-1166.67, 1);
    expect(r.y).toBe(0);
  });

  it('fit: a landscape video is letterboxed top and bottom', () => {
    expect(fitRect(1920, 1080, 1080, 1920, 'fit')).toEqual({ x: 0, y: 656.25, w: 1080, h: 607.5 });
  });

  it('a 9:16 source fills the frame exactly in both modes', () => {
    const exact = { x: 0, y: 0, w: 1080, h: 1920 };
    expect(fitRect(720, 1280, 1080, 1920, 'fill')).toEqual(exact);
    expect(fitRect(720, 1280, 1080, 1920, 'fit')).toEqual(exact);
  });

  it('survives unknown source sizes', () => {
    expect(fitRect(0, 0, 1080, 1920, 'fill')).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
  });
});
