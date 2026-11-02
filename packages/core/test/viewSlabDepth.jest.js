import getViewSlabDepth from '../src/utilities/getViewSlabDepth';
import { RENDERING_DEFAULTS } from '../src/constants';

const MINIMUM = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;

describe('getViewSlabDepth', () => {
  it('passes a real depth through', () => {
    expect(getViewSlabDepth(10)).toBe(10);
    expect(getViewSlabDepth(1)).toBe(1);
  });

  it('reports no slab for the rendering minimum', () => {
    // A volume viewport with no slab returns `MINIMUM` as a half thickness, so
    // the caller passes `MINIMUM * 2` as the depth. That stands for "no slab of
    // its own", and a fill then falls back to one voxel along the normal.
    expect(getViewSlabDepth(MINIMUM * 2)).toBeUndefined();
    expect(getViewSlabDepth(MINIMUM)).toBeUndefined();
  });

  it('reports no slab for a missing or invalid value', () => {
    // A stack viewport has no slab API at all.
    expect(getViewSlabDepth(undefined)).toBeUndefined();
    expect(getViewSlabDepth(null)).toBeUndefined();
    expect(getViewSlabDepth(NaN)).toBeUndefined();
    expect(getViewSlabDepth(Infinity)).toBeUndefined();
    expect(getViewSlabDepth(-1)).toBeUndefined();
  });

  it('keeps a slab that is just above the minimum', () => {
    expect(getViewSlabDepth(MINIMUM * 2 + 1e-6)).toBeCloseTo(
      MINIMUM * 2 + 1e-6,
      12
    );
  });
});
