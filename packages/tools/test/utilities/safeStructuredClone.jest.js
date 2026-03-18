import { safeStructuredClone } from '../../src/utilities/safeStructuredClone';
import { describe, it, expect } from '@jest/globals';

describe('safeStructuredClone', () => {
  it('returns null and undefined as-is', () => {
    expect(safeStructuredClone(null)).toBe(null);
    expect(safeStructuredClone(undefined)).toBe(undefined);
  });

  it('returns primitives as-is', () => {
    expect(safeStructuredClone(42)).toBe(42);
    expect(safeStructuredClone('hello')).toBe('hello');
    expect(safeStructuredClone(true)).toBe(true);
    expect(safeStructuredClone(false)).toBe(false);
  });

  it('omits pointsInVolume key', () => {
    const input = { pointsInVolume: [[1, 2, 3]], other: 'kept' };
    const result = safeStructuredClone(input);
    expect(result).not.toHaveProperty('pointsInVolume');
    expect(result.other).toBe('kept');
  });

  it('omits projectionPoints key', () => {
    const input = { projectionPoints: [[[1, 2, 3]]], foo: 1 };
    const result = safeStructuredClone(input);
    expect(result).not.toHaveProperty('projectionPoints');
    expect(result.foo).toBe(1);
  });

  it('omits spline key', () => {
    const input = { spline: { someRef: {} }, bar: 2 };
    const result = safeStructuredClone(input);
    expect(result).not.toHaveProperty('spline');
    expect(result.bar).toBe(2);
  });

  it('transforms contour key: polyline becomes pointsManager, polyline set to null', () => {
    const polyline = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ];
    const input = { contour: { polyline, otherProp: 'keep' } };
    const result = safeStructuredClone(input);
    expect(result.contour).toBeDefined();
    expect(result.contour.polyline).toBe(null);
    expect(result.contour.otherProp).toBe('keep');
    expect(result.contour.pointsManager).toBeDefined();
    expect(result.contour.pointsManager.length).toBe(3);
    // pointsManager is a PointsManager-like instance (has .length from core PointsManager.create3)
    expect(typeof result.contour.pointsManager.length).toBe('number');
  });

  it('leaves contour unchanged when value has no polyline', () => {
    const input = { contour: { notPolyline: 1 } };
    const result = safeStructuredClone(input);
    expect(result.contour).toEqual({ notPolyline: 1 });
  });

  it('recursively processes nested objects', () => {
    const input = {
      level1: {
        pointsInVolume: [[1, 2, 3]],
        level2: { projectionPoints: [], nested: 'value' },
      },
    };
    const result = safeStructuredClone(input);
    expect(result.level1).not.toHaveProperty('pointsInVolume');
    expect(result.level1.level2).not.toHaveProperty('projectionPoints');
    expect(result.level1.level2.nested).toBe('value');
  });

  it('recursively processes arrays of objects', () => {
    const input = {
      items: [
        { pointsInVolume: [1], id: 'a' },
        { spline: {}, id: 'b' },
      ],
    };
    const result = safeStructuredClone(input);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).not.toHaveProperty('pointsInVolume');
    expect(result.items[0].id).toBe('a');
    expect(result.items[1]).not.toHaveProperty('spline');
    expect(result.items[1].id).toBe('b');
  });

  it('preserves normal keys and primitive values', () => {
    const input = {
      id: 'anno-1',
      metadata: { toolName: 'Length' },
      data: { handles: { points: [[0, 0, 0]] }, cachedStats: {} },
    };
    const result = safeStructuredClone(input);
    expect(result.id).toBe('anno-1');
    expect(result.metadata).toEqual({ toolName: 'Length' });
    expect(result.data.handles.points).toEqual([[0, 0, 0]]);
    expect(result.data.cachedStats).toEqual({});
  });
});
