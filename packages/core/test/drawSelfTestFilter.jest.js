import { describe, it, expect } from '@jest/globals';
import {
  compareGreyLevels,
  getExpectedGreyLevel,
  getFilteredValue,
  getNearestValue,
  getPromisedFilter,
} from '../src/utilities/drawSelfTest';

const ZOOM = 32;

/** The RGBA pixels of one row of a draw of the pair, from grey levels. */
function rowOf(greyAt) {
  const pixels = new Uint8Array(2 * ZOOM * 4);

  for (let column = 0; column < 2 * ZOOM; column++) {
    pixels.fill(Math.round(greyAt(column)), column * 4, column * 4 + 3);
    pixels[column * 4 + 3] = 255;
  }

  return pixels;
}

describe('the promise of the filter check', () => {
  it('promises nearest only for R32F on a device that cannot filter float textures', () => {
    expect(getPromisedFilter('R32F', { floatLinear: false })).toBe('nearest');
    expect(getPromisedFilter('R32F', { floatLinear: true })).toBe('linear');

    ['R16F', 'R16_SNORM', 'R16', 'unknown'].forEach((format) => {
      expect(getPromisedFilter(format, { floatLinear: false })).toBe('linear');
    });
  });

  it('gives the first value over the first texel and the second over the second', () => {
    expect(getNearestValue(3000, 3002.55, 0, ZOOM)).toBe(3000);
    expect(getNearestValue(3000, 3002.55, ZOOM - 1, ZOOM)).toBe(3000);
    expect(getNearestValue(3000, 3002.55, ZOOM, ZOOM)).toBe(3002.55);
    expect(getNearestValue(3000, 3002.55, 2 * ZOOM - 1, ZOOM)).toBe(3002.55);
  });

  it('passes a nearest draw judged as nearest and fails it judged as linear', () => {
    const voiRange = { lower: 3000, upper: 3002.55 };
    const nearest = (column) =>
      getExpectedGreyLevel(
        getNearestValue(3000, 3002.55, column, ZOOM),
        voiRange
      );
    const linear = (column) =>
      getExpectedGreyLevel(
        getFilteredValue(3000, 3002.55, column, ZOOM),
        voiRange
      );
    const drawn = rowOf(nearest);

    expect(compareGreyLevels(drawn, nearest, 2 * ZOOM, 1, 1).pixelsOff).toBe(0);
    expect(
      compareGreyLevels(drawn, linear, 2 * ZOOM, 1, 1).pixelsOff
    ).toBeGreaterThan(0);
  });

  it('fails a nearest draw with a wrong value', () => {
    const voiRange = { lower: 3000, upper: 3002.55 };
    const nearest = (column) =>
      getExpectedGreyLevel(
        getNearestValue(3000, 3002.55, column, ZOOM),
        voiRange
      );
    const drawn = rowOf((column) => (column < ZOOM ? 0 : 128));

    expect(compareGreyLevels(drawn, nearest, 2 * ZOOM, 1, 1).pixelsOff).toBe(
      ZOOM
    );
  });
});
