import {
  updateOpacity,
  updateThreshold,
  updateOpacityMapping,
  getOpacityState,
} from '../../src/utilities/colormap';

/**
 * Minimal fake volume actor: captures the scalar-opacity vtkPiecewiseFunction that the colormap
 * utilities write, and exposes a voxel manager range (used by the no-mapping/threshold path).
 */
function createActor(range = [0, 1]) {
  let scalarOpacity = null;
  return {
    getProperty: () => ({
      setScalarOpacity: (_component, ofun) => {
        scalarOpacity = ofun;
      },
      getScalarOpacity: () => scalarOpacity,
    }),
    getMapper: () => ({
      getInputData: () => ({
        get: (key) =>
          key === 'voxelManager'
            ? { voxelManager: { getRange: () => range } }
            : undefined,
      }),
    }),
  };
}

// Read the applied opacity function back as [x0, y0, x1, y1, ...].
function points(actor) {
  return Array.from(
    actor.getProperty().getScalarOpacity(0)?.getDataPointer() ?? []
  );
}

// Opacity at value 0 = the y of the point at x === 0 (or the first point's y).
function opacityAtZero(actor) {
  const pts = points(actor);
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] === 0) {
      return pts[i + 1];
    }
  }
  return pts[1];
}

const HP_MAPPING = [
  { value: 0, opacity: 0 },
  { value: 0.1, opacity: 0.8 },
  { value: 1, opacity: 0.9 },
];

describe('opacity spec (overall x mapping, threshold cutoff)', () => {
  it('applies the per-value mapping at overall=1 by default', () => {
    const actor = createActor();
    updateOpacityMapping(actor, HP_MAPPING);

    expect(points(actor)).toEqual([0, 0, 0.1, 0.8, 1, 0.9]);
    const state = getOpacityState(actor);
    expect(state.opacity).toBe(1);
    expect(state.opacityMapping).toEqual(HP_MAPPING);
  });

  it('scales the mapping by the overall level on a slider change, preserving value-0 transparency', () => {
    const actor = createActor();
    updateOpacityMapping(actor, HP_MAPPING);

    updateOpacity(actor, 0.5);

    expect(points(actor)).toEqual([0, 0, 0.1, 0.4, 1, 0.45]);
    expect(opacityAtZero(actor)).toBe(0); // background stays transparent
    // the mapping itself is preserved (not flattened) and the scalar is reported as a number
    const state = getOpacityState(actor);
    expect(state.opacity).toBe(0.5);
    expect(state.opacityMapping).toEqual(HP_MAPPING);
  });

  it('sets overall and mapping together (e.g. an applied/synced colormap)', () => {
    const actor = createActor();
    updateOpacityMapping(actor, HP_MAPPING, 0.5);

    expect(points(actor)).toEqual([0, 0, 0.1, 0.4, 1, 0.45]);
  });

  it('keeps the mapping when the threshold changes (does not flatten to a scalar)', () => {
    const actor = createActor();
    updateOpacityMapping(actor, HP_MAPPING, 0.5);

    updateThreshold(actor, 0.1);

    // mapping shape (scaled by overall) is preserved for values >= threshold; value 0 stays 0
    expect(opacityAtZero(actor)).toBe(0);
    const pts = points(actor);
    expect(pts).toContain(0.4); // 0.8 * 0.5 at value 0.1
    expect(pts).toContain(0.45); // 0.9 * 0.5 at value 1
    const state = getOpacityState(actor);
    expect(state.opacityMapping).toEqual(HP_MAPPING);
    expect(state.threshold).toBe(0.1);
  });

  it('value-0 stays transparent across repeated slider changes', () => {
    const actor = createActor();
    updateOpacityMapping(actor, HP_MAPPING);

    [0.9, 0.3, 0.0, 1.0].forEach((level) => {
      updateOpacity(actor, level);
      expect(opacityAtZero(actor)).toBe(0);
    });
  });

  it('with no mapping, applies a uniform overall opacity', () => {
    const actor = createActor([0, 100]);
    updateOpacity(actor, 0.7);

    expect(points(actor)).toEqual([0, 0.7, 100, 0.7]);
    const state = getOpacityState(actor);
    expect(state.opacity).toBe(0.7);
    expect(state.opacityMapping).toBeUndefined();
  });

  it('falls back to actor-derived values for an actor with no stored spec', () => {
    const actor = createActor();
    const state = getOpacityState(actor);
    expect(state.opacity).toBe(1.0); // getMaxOpacity default
    expect(state.opacityMapping).toBeUndefined();
    expect(state.threshold).toBeNull();
  });
});
