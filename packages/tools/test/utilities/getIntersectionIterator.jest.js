import { describe, it, expect } from '@jest/globals';
import getIntersectionIterator from '../../src/utilities/math/polyline/getIntersectionIterator';

/**
 * Tests for the `getIntersectionIterator` utility.
 * Verifies polyline/ROI polygon rasterization, coordinate rounding,
 * fractional step sampling, and lazy generator execution.
 */
describe('getIntersectionIterator', () => {
  it('should rasterize a real 3x3 square polygon', () => {
    const realCoordinates = [
      [10, 10],
      [12, 10],
      [12, 12],
      [10, 12],
      [10, 10],
    ];

    const pixels = [...getIntersectionIterator(realCoordinates)];

    expect(pixels).toEqual([
      [10, 10],
      [11, 10],
      [12, 10],
      [10, 11],
      [11, 11],
      [12, 11],
      [10, 12],
      [11, 12],
    ]);
  });

  it('should accurately rasterize an ROI with negative and decimal coordinates', () => {
    const decimalNegativeCoordinates = [
      [-2.4, -2.4],
      [1.6, -2.4],
      [1.6, 1.6],
      [-2.4, 1.6],
      [-2.4, -2.4],
    ];

    const pixels = [...getIntersectionIterator(decimalNegativeCoordinates)];

    expect(pixels).toEqual([
      // Scanline Y = -2
      [-2, -2],
      [-1, -2],
      [0, -2],
      [1, -2],
      // Scanline Y = -1
      [-2, -1],
      [-1, -1],
      [0, -1],
      [1, -1],
      // Scanline Y = 0
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
      // Scanline Y = 1
      [-2, 1],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]);
  });

  it('should return an empty array if given no coordinates', () => {
    const polygon = [];

    const result = Array.from(getIntersectionIterator(polygon));

    expect(result).toEqual([]);
  });

  it('should handle a simple triangle ROI', () => {
    const triangleROI = [
      [10, 10],
      [14, 10],
      [10, 14],
    ];

    const result = Array.from(getIntersectionIterator(triangleROI));

    expect(result.length).toBeGreaterThan(0);

    result.forEach(([cx, cy]) => {
      expect(cx).toBeGreaterThanOrEqual(10);
      expect(cy).toBeGreaterThanOrEqual(10);
    });
  });

  it('should sample narrow fractional spans when canvasStep is fractional', () => {
    const narrowRowCoordinates = [
      [0, 0],
      [10.8, 0],
      [10.8, 0],
      [0, 0],
    ];

    const pixels = [...getIntersectionIterator(narrowRowCoordinates, 1 / 3)];

    expect(pixels.length).toBeGreaterThan(0);
    pixels.forEach(([cx, cy]) => {
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(10.8);
      expect(cy).toBe(0);
    });
  });

  it('should stream results lazily as a true generator', () => {
    const squareROI = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    const iterator = getIntersectionIterator(squareROI);

    const firstPixel = iterator.next();

    expect(firstPixel.done).toBe(false);
    expect(firstPixel.value).toBeDefined();
    expect(firstPixel.value).toHaveLength(2);
  });
});
