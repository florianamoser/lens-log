import { describe, expect, it } from 'vitest';
import { frameRangeContains } from './App';
import type { Entry } from './types';

function entry(frameNumber: string): Entry {
  return {
    id: frameNumber, frameNumber, lensId: 'lens', lensName: 'Lens', lensShort: '35', aperture: '11',
    shiftX: 0, shiftY: 0, shiftProfile: 'pico', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', deleted: false,
  };
}

describe('frame range search', () => {
  it('matches every frame inside an inferred composition range', () => {
    const first = entry('9933');
    const next = entry('9958');
    expect(frameRangeContains(first, next, '9933')).toBe(true);
    expect(frameRangeContains(first, next, '9950')).toBe(true);
    expect(frameRangeContains(first, next, '9957')).toBe(true);
    expect(frameRangeContains(first, next, '9958')).toBe(false);
  });

  it('matches ranges that wrap from 9999 to 0000', () => {
    const first = entry('9998');
    const next = entry('0003');
    expect(frameRangeContains(first, next, '9999')).toBe(true);
    expect(frameRangeContains(first, next, '0000')).toBe(true);
    expect(frameRangeContains(first, next, '0002')).toBe(true);
    expect(frameRangeContains(first, next, '0003')).toBe(false);
  });

  it('does not infer implausibly long or open-ended ranges', () => {
    expect(frameRangeContains(entry('1000'), entry('1026'), '1025')).toBe(false);
    expect(frameRangeContains(entry('1000'), undefined, '1001')).toBe(false);
  });

  it('accepts a range of exactly 25 frames', () => {
    expect(frameRangeContains(entry('1000'), entry('1025'), '1024')).toBe(true);
    expect(frameRangeContains(entry('1000'), entry('1025'), '1025')).toBe(false);
  });

  it('keeps partial searches limited to the recorded first frame', () => {
    expect(frameRangeContains(entry('9933'), entry('9958'), '993')).toBe(true);
    expect(frameRangeContains(entry('9933'), entry('9958'), '950')).toBe(false);
  });
});
