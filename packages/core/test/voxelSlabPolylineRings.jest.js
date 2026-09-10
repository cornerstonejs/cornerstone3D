import { collectVoxelsInShape } from '../src/utilities/voxelSlab/iterateVoxelsInShape';
import { buildIndexSpaceSlab } from '../src/utilities/voxelSlab/indexSpaceSlab';
import getVoxelThicknessAlongNormal from '../src/utilities/voxelSlab/getVoxelThicknessAlongNormal';
import { createPolylineShape } from '../src/utilities/voxelSlab/shapes/createPolylineShape';
import { createPlaneBasis } from '../src/utilities/voxelSlab/shapes/shapeGeometry';
import { createSyntheticVolume, obliqueNormal } from './utils/syntheticVolume';
import {
  referenceVoxelsInSlab,
  canonicaliseVoxels,
} from './utils/voxelSlabReference';

const AXIAL = [0, 0, 1];

/**
 * The closed-form runs, the per-voxel predicate through the iterator, and the
 * brute-force reference implementation must all select the same voxels.
 */
function expectShapeConsistency({
  volume,
  planePoint,
  viewPlaneNormal,
  referencePlaneThickness,
  shape,
}) {
  const viaRuns = collectVoxelsInShape({
    volume,
    planePoint,
    viewPlaneNormal,
    referencePlaneThickness,
    getShapeRuns: shape.getRuns,
  });

  const viaPredicate = collectVoxelsInShape({
    volume,
    planePoint,
    viewPlaneNormal,
    referencePlaneThickness,
    isInShape: (center) => shape.containsPoint(center),
  });

  const viaReference = referenceVoxelsInSlab({
    volume,
    planePoint,
    viewPlaneNormal,
    referencePlaneThickness,
    isInShape: (_projected, _ijk, center) => shape.containsPoint(center),
  });

  const canonicalRuns = canonicaliseVoxels(viaRuns);

  expect(canonicalRuns).toEqual(canonicaliseVoxels(viaPredicate));
  expect(canonicalRuns).toEqual(canonicaliseVoxels(viaReference));
  expect(new Set(canonicalRuns).size).toBe(canonicalRuns.length);
  expect(canonicalRuns.length).toBeGreaterThan(0);

  return viaRuns;
}

/** Maps plane coordinates onto an arbitrary plane, for the oblique cases. */
function planeMapper(anchor, viewPlaneNormal) {
  const { u, v } = createPlaneBasis(viewPlaneNormal, [1, 0, 0]);
  return ([x, y]) => [
    anchor[0] + (x - 12) * u[0] + (y - 12) * v[0],
    anchor[1] + (x - 12) * u[1] + (y - 12) * v[1],
    anchor[2] + (x - 12) * u[2] + (y - 12) * v[2],
  ];
}

describe('createPolylineShape - three or more runs per row', () => {
  const volume = createSyntheticVolume({
    dimensions: [24, 24, 4],
    spacing: [1, 1, 1],
  });
  const planePoint = [12, 12, 2];

  // A comb: a bar across the top with three teeth hanging below it. A row
  // through the teeth crosses the outline six times, giving three runs.
  const comb = [
    [2, 18, 2],
    [20, 18, 2],
    [20, 16, 2],
    [17, 16, 2],
    [17, 6, 2],
    [15, 6, 2],
    [15, 16, 2],
    [11, 16, 2],
    [11, 6, 2],
    [9, 6, 2],
    [9, 16, 2],
    [5, 16, 2],
    [5, 6, 2],
    [3, 6, 2],
    [3, 16, 2],
    [2, 16, 2],
  ];

  const combShape = () =>
    createPolylineShape({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      polyline: comb,
    });

  it('emits exactly three runs for a row crossing three teeth', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    // Row j = 10 sits in the teeth, below the bar.
    expect([...combShape().getRuns(2, 10, [0, 23], slab)]).toEqual([
      [3, 5],
      [9, 11],
      [15, 17],
    ]);
  });

  it('emits one run for a row crossing the bar', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    // Row j = 17 is inside the bar, which spans the full width.
    expect([...combShape().getRuns(2, 17, [0, 23], slab)]).toEqual([[2, 20]]);
  });

  it('emits nothing for a row clear of the comb', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    expect([...combShape().getRuns(2, 2, [0, 23], slab)]).toEqual([]);
  });

  it('agrees with the predicate and the reference across the whole comb', () => {
    expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape: combShape(),
    });
  });

  it('agrees obliquely, where runs are not axis aligned', () => {
    const oblique = createSyntheticVolume({
      dimensions: [24, 24, 10],
      spacing: [1, 1, 2],
    });

    [20, 40, 65].forEach((degrees) => {
      const viewPlaneNormal = obliqueNormal(oblique.direction, degrees);
      const anchor = [12, 12, 10];
      const toPlane = planeMapper(anchor, viewPlaneNormal);

      expectShapeConsistency({
        volume: oblique,
        planePoint: anchor,
        viewPlaneNormal,
        referencePlaneThickness: getVoxelThicknessAlongNormal(
          oblique,
          viewPlaneNormal
        ),
        shape: createPolylineShape({
          volume: oblique,
          planePoint: anchor,
          viewPlaneNormal,
          polyline: comb.map(([x, y]) => toPlane([x, y])),
        }),
      });
    });
  });
});

describe('createPolylineShape - vertices and edges on a voxel row', () => {
  const volume = createSyntheticVolume({
    dimensions: [24, 24, 4],
    spacing: [1, 1, 1],
  });
  const planePoint = [12, 12, 2];

  // A W under a bar. Voxel centres sit on the integers, so this outline puts
  // three degenerate cases on rows of voxel centres at once:
  //
  // - row 4 passes through the three bottom vertices. Each vertex only touches
  //   the row, and both edges of each vertex leave upwards. A side value of
  //   zero counts as negative, so each vertex gives two crossings at the same
  //   place, the count stays even, and the pair closes over the one voxel of
  //   the vertex.
  // - row 12 passes through the two peaks, which touch the row from below.
  // - row 18 holds the whole top edge. Both ends of that edge lie on the row,
  //   so no crossing test can see the edge, and the code contributes the
  //   extent of the edge itself.
  //
  // `containsPoint` calls a point on the outline inside, so the runs must keep
  // these voxels to stay consistent with it. A pairing loop over an odd count
  // of crossings drops a span instead.
  const wUnderBar = [
    [4, 4, 2],
    [8, 12, 2],
    [12, 4, 2],
    [16, 12, 2],
    [20, 4, 2],
    [20, 18, 2],
    [4, 18, 2],
  ];

  const wShape = (viewPlaneNormal = AXIAL, polyline = wUnderBar) =>
    createPolylineShape({
      volume,
      planePoint,
      viewPlaneNormal,
      polyline,
    });

  it('keeps the isolated voxels of a row that only touches vertices', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    // The three bottom vertices, each one voxel wide, and nothing between
    // them: at row 4 the outline of the W has left the row already.
    expect([...wShape().getRuns(2, 4, [0, 23], slab)]).toEqual([
      [4, 4],
      [12, 12],
      [20, 20],
    ]);
  });

  it('spans the row that passes through the two peaks', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    expect([...wShape().getRuns(2, 12, [0, 23], slab)]).toEqual([[4, 20]]);
  });

  it('keeps the row that holds a whole edge', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    expect([...wShape().getRuns(2, 18, [0, 23], slab)]).toEqual([[4, 20]]);
  });

  it('agrees with the predicate and the reference over the whole outline', () => {
    expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape: wShape(),
    });
  });

  // A triangle whose apex touches row 14 from below, where the row holds
  // nothing else. Both edges of the apex leave downwards, and a side value of
  // zero counts as negative, so the crossing test sees no sign change and
  // records no crossing for either edge. The apex is on the outline, so
  // `containsPoint` keeps it, and only the rule for a vertex on the row keeps
  // the run.
  const spike = [
    [6, 4, 2],
    [18, 4, 2],
    [12, 14, 2],
  ];

  it('keeps the one voxel of a vertex that touches a row from below', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    expect([...wShape(AXIAL, spike).getRuns(2, 14, [0, 23], slab)]).toEqual([
      [12, 12],
    ]);
  });

  it('agrees with the predicate and the reference over the spike', () => {
    expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape: wShape(AXIAL, spike),
    });
  });

  it('agrees obliquely, where a vertex lands on a row by chance', () => {
    const oblique = createSyntheticVolume({
      dimensions: [24, 24, 10],
      spacing: [1, 1, 2],
    });

    [20, 40, 65].forEach((degrees) => {
      const viewPlaneNormal = obliqueNormal(oblique.direction, degrees);
      const anchor = [12, 12, 10];
      const toPlane = planeMapper(anchor, viewPlaneNormal);

      expectShapeConsistency({
        volume: oblique,
        planePoint: anchor,
        viewPlaneNormal,
        referencePlaneThickness: getVoxelThicknessAlongNormal(
          oblique,
          viewPlaneNormal
        ),
        shape: createPolylineShape({
          volume: oblique,
          planePoint: anchor,
          viewPlaneNormal,
          polyline: wUnderBar.map(([x, y]) => toPlane([x, y])),
        }),
      });
    });
  });
});

describe('createPolylineShape - internal holes', () => {
  const volume = createSyntheticVolume({
    dimensions: [26, 26, 4],
    spacing: [1, 1, 1],
  });
  const planePoint = [12, 12, 2];

  const ring = (minimum, maximum, z = 2) => [
    [minimum, minimum, z],
    [maximum, minimum, z],
    [maximum, maximum, z],
    [minimum, maximum, z],
  ];

  const annulus = () =>
    createPolylineShape({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      polyline: [ring(4, 20), ring(9, 15)],
    });

  it('rejects a ring with fewer than three points', () => {
    expect(() =>
      createPolylineShape({
        volume,
        planePoint,
        viewPlaneNormal: AXIAL,
        polyline: [
          ring(4, 20),
          [
            [9, 9, 2],
            [15, 9, 2],
          ],
        ],
      })
    ).toThrow(/at least three points/);
  });

  it('still accepts a single ring passed directly', () => {
    expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape: createPolylineShape({
        volume,
        planePoint,
        viewPlaneNormal: AXIAL,
        polyline: ring(4, 20),
      }),
    });
  });

  it('excludes the interior of a hole ring', () => {
    const shape = annulus();

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape,
    });

    // The outer ring covers centres 4..20 on both axes, 17 x 17. The hole
    // removes the centres strictly inside it, 10..14 on both axes, 5 x 5.
    // Centres on the hole's own outline stay in, by the same
    // boundary-inclusive rule the outer outline follows.
    expect(voxels).toHaveLength(17 * 17 - 5 * 5);

    expect(shape.containsPoint([12, 12, 2])).toBe(false);
    expect(shape.containsPoint([9, 12, 2])).toBe(true);
    expect(shape.containsPoint([6, 12, 2])).toBe(true);
    expect(shape.containsPoint([2, 12, 2])).toBe(false);
  });

  it('emits two runs for a row crossing the hole', () => {
    const slab = buildIndexSpaceSlab(volume, planePoint, AXIAL, 1);

    expect([...annulus().getRuns(2, 12, [0, 25], slab)]).toEqual([
      [4, 9],
      [15, 20],
    ]);
    // A row above the hole is a single run.
    expect([...annulus().getRuns(2, 18, [0, 25], slab)]).toEqual([[4, 20]]);
  });

  it('treats a ring inside a hole as solid again', () => {
    const shape = createPolylineShape({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      polyline: [ring(2, 22), ring(6, 18), ring(10, 14)],
    });

    expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape,
    });

    expect(shape.containsPoint([3, 12, 2])).toBe(true); // outermost band
    expect(shape.containsPoint([8, 12, 2])).toBe(false); // the hole
    expect(shape.containsPoint([12, 12, 2])).toBe(true); // island in the hole
  });

  it('supports disjoint rings as separate regions', () => {
    const shape = createPolylineShape({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      polyline: [ring(2, 8), ring(16, 22)],
    });

    const voxels = expectShapeConsistency({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
      shape,
    });

    expect(voxels).toHaveLength(7 * 7 * 2);
    expect(shape.containsPoint([5, 5, 2])).toBe(true);
    expect(shape.containsPoint([19, 19, 2])).toBe(true);
    expect(shape.containsPoint([12, 12, 2])).toBe(false);
  });

  it('holds for a hole viewed obliquely', () => {
    const oblique = createSyntheticVolume({
      dimensions: [26, 26, 10],
      spacing: [1, 1, 2.2],
    });

    [25, 50].forEach((degrees) => {
      const viewPlaneNormal = obliqueNormal(oblique.direction, degrees);
      const anchor = [12, 12, 11];
      const toPlane = planeMapper(anchor, viewPlaneNormal);

      expectShapeConsistency({
        volume: oblique,
        planePoint: anchor,
        viewPlaneNormal,
        referencePlaneThickness: getVoxelThicknessAlongNormal(
          oblique,
          viewPlaneNormal
        ),
        shape: createPolylineShape({
          volume: oblique,
          planePoint: anchor,
          viewPlaneNormal,
          polyline: [
            ring(4, 20).map(([x, y]) => toPlane([x, y])),
            ring(9, 15).map(([x, y]) => toPlane([x, y])),
          ],
        }),
      });
    });
  });

  it('is not the same as flattening the rings into one array', () => {
    // Flattening inserts an edge from the end of one ring to the start of the
    // next. It does not error - it quietly measures a different shape - which
    // is why rings must be passed separately.
    const options = {
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      referencePlaneThickness: 1,
    };

    const withRings = collectVoxelsInShape({
      ...options,
      getShapeRuns: annulus().getRuns,
    });

    const flattened = collectVoxelsInShape({
      ...options,
      getShapeRuns: createPolylineShape({
        volume,
        planePoint,
        viewPlaneNormal: AXIAL,
        polyline: [...ring(4, 20), ...ring(9, 15)],
      }).getRuns,
    });

    expect(withRings).toHaveLength(17 * 17 - 5 * 5);
    expect(flattened.length).not.toBe(withRings.length);
  });
});
