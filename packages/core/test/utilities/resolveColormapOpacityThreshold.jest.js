import { resolveColormapOpacityThreshold } from '../../src/utilities/colormap';

/**
 * Builds a fake VTK volume actor whose scalar opacity function returns the given
 * data pointer array. getMaxOpacity / getThresholdValue read from this array:
 *   - getMaxOpacity -> max of the y values (odd indices)
 *   - getThresholdValue -> the x of the first 0 -> non-zero opacity transition
 *     (null when the array has 4 or fewer entries, i.e. a simple opacity function)
 */
function createActor(dataPointer) {
  return {
    getProperty: () => ({
      getScalarOpacity: () => {
        if (!dataPointer) {
          return null;
        }
        return {
          getDataPointer: () => dataPointer,
        };
      },
    }),
  };
}

// A thresholded opacity function: opacity stays 0 until x = 0.31, peaking at 0.9.
const THRESHOLDED = [0, 0, 0.3, 0, 0.31, 0.8, 1, 0.9];
const ACTOR_MAX_OPACITY = 0.9;
const ACTOR_THRESHOLD = 0.31;

describe('resolveColormapOpacityThreshold', () => {
  it('falls back to actor values when there is no stored colormap', () => {
    const result = resolveColormapOpacityThreshold(
      { name: 'hsv' },
      undefined,
      createActor(THRESHOLDED)
    );

    expect(result.name).toBe('hsv');
    expect(result.opacity).toBe(ACTOR_MAX_OPACITY);
    expect(result.threshold).toBe(ACTOR_THRESHOLD);
  });

  it('always populates opacity and threshold when stored colormap has neither (name-only)', () => {
    // Regression guard: applying a colormap by name used to lose opacity/threshold.
    const result = resolveColormapOpacityThreshold(
      {},
      { name: 'hsv' },
      createActor(THRESHOLDED)
    );

    expect(result.opacity).toBe(ACTOR_MAX_OPACITY);
    expect(result.threshold).toBe(ACTOR_THRESHOLD);
  });

  it('reads the live actor opacity when stored opacity is a number (slider case)', () => {
    const result = resolveColormapOpacityThreshold(
      {},
      { opacity: 0.5 },
      createActor(THRESHOLDED)
    );

    expect(result.opacity).toBe(ACTOR_MAX_OPACITY);
  });

  it('preserves a stored opacity mapping array (hanging-protocol case)', () => {
    const storedOpacity = [
      { value: 0, opacity: 0 },
      { value: 0.1, opacity: 0.8 },
      { value: 1, opacity: 0.9 },
    ];

    const result = resolveColormapOpacityThreshold(
      {},
      { opacity: storedOpacity },
      createActor(THRESHOLDED)
    );

    expect(result.opacity).toEqual(storedOpacity);
  });

  it('deep-clones the preserved opacity array so callers cannot mutate stored values', () => {
    const storedColormap = {
      opacity: [
        { value: 0, opacity: 0 },
        { value: 1, opacity: 0.9 },
      ],
    };

    const result = resolveColormapOpacityThreshold(
      {},
      storedColormap,
      createActor(THRESHOLDED)
    );

    expect(result.opacity).not.toBe(storedColormap.opacity);
    expect(result.opacity[0]).not.toBe(storedColormap.opacity[0]);

    result.opacity[0].opacity = 1;
    expect(storedColormap.opacity[0].opacity).toBe(0);
  });

  it('reads the live actor threshold when stored threshold is a number (slider case)', () => {
    const result = resolveColormapOpacityThreshold(
      {},
      { threshold: 0.2 },
      createActor(THRESHOLDED)
    );

    expect(result.threshold).toBe(ACTOR_THRESHOLD);
  });

  it('preserves an explicitly stored null threshold (clears thresholding)', () => {
    const result = resolveColormapOpacityThreshold(
      {},
      { threshold: null },
      createActor(THRESHOLDED)
    );

    expect(result.threshold).toBeNull();
  });

  it('falls back to the actor threshold (null) for a simple opacity function', () => {
    // Simple, non-thresholded opacity function (4 entries) -> getThresholdValue returns null.
    const result = resolveColormapOpacityThreshold(
      {},
      { name: 'hsv' },
      createActor([0, 0.5, 1, 0.5])
    );

    expect(result.opacity).toBe(0.5);
    expect(result.threshold).toBeNull();
  });

  it('returns the same matchedColormap object it was given', () => {
    const matchedColormap = { name: 'hsv' };
    const result = resolveColormapOpacityThreshold(
      matchedColormap,
      undefined,
      createActor(THRESHOLDED)
    );

    expect(result).toBe(matchedColormap);
  });
});
