import { collectVoxelsInShape } from '../src/utilities/voxelSlab/iterateVoxelsInShape';
import {
  createCircleShape,
  createEllipseShape,
} from '../src/utilities/voxelSlab/shapes/createEllipseShape';
import { createRectangleShape } from '../src/utilities/voxelSlab/shapes/createRectangleShape';
import { createUnionShape } from '../src/utilities/voxelSlab/shapes/createUnionShape';
import {
  createSyntheticVolume,
  obliqueNormal,
  rotatedDirection,
} from './utils/syntheticVolume';
import {
  canonicaliseVoxels,
  referenceVoxelsInSlab,
} from './utils/voxelSlabReference';

const AXIAL = [0, 0, 1];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * The contract a union must satisfy, which is the shape contract of
 * `voxelSlabShapes.jest.js` applied to the composed shape:
 *
 * - the closed-form runs, the per-voxel predicate and the brute-force
 *   reference implementation of Rule M all select the same voxels;
 * - no voxel is visited twice, however far the members overlap.
 *
 * @returns the voxels the runs selected, canonicalised.
 */
function expectUnionConsistency({
  volume,
  planePoint,
  viewPlaneNormal,
  referencePlaneThickness,
  shapes,
}) {
  const union = createUnionShape(shapes);
  const iteration = {
    volume,
    planePoint,
    viewPlaneNormal,
    referencePlaneThickness,
  };

  const viaRuns = collectVoxelsInShape({
    ...iteration,
    getShapeRuns: union.getRuns,
  });

  const viaPredicate = collectVoxelsInShape({
    ...iteration,
    isInShape: (center) => union.containsPoint(center),
  });

  const viaReference = referenceVoxelsInSlab({
    ...iteration,
    isInShape: (_projected, _ijk, center) => union.containsPoint(center),
  });

  const canonicalRuns = canonicaliseVoxels(viaRuns);

  expect(canonicalRuns).toEqual(canonicaliseVoxels(viaPredicate));
  expect(canonicalRuns).toEqual(canonicaliseVoxels(viaReference));
  // A run that overlapped another would make this longer than the set.
  expect(new Set(canonicalRuns).size).toBe(canonicalRuns.length);

  return canonicalRuns;
}

/** The canonicalised voxels of one shape on its own. */
function voxelsOf(shape, iteration) {
  return canonicaliseVoxels(
    collectVoxelsInShape({ ...iteration, getShapeRuns: shape.getRuns })
  );
}

/** A row of discs of the given radius, `step` mm apart along the i axis. */
function discRow({ volume, planePoint, viewPlaneNormal, radius, step, count }) {
  const iVector = volume.direction.slice(0, 3);

  return Array.from({ length: count }, (_unused, disc) => {
    const offset = disc * step;
    return createCircleShape({
      volume,
      planePoint,
      viewPlaneNormal,
      centerWorld: [
        planePoint[0] + offset * iVector[0],
        planePoint[1] + offset * iVector[1],
        planePoint[2] + offset * iVector[2],
      ],
      radius,
    });
  });
}

describe('createUnionShape', () => {
  it('returns the single member unchanged', () => {
    const volume = createSyntheticVolume({ dimensions: [16, 16, 16] });
    const shape = createCircleShape({
      volume,
      planePoint: [8, 8, 8],
      viewPlaneNormal: AXIAL,
      centerWorld: [8, 8, 8],
      radius: 3,
    });

    expect(createUnionShape([shape])).toBe(shape);
  });

  it('contains nothing when it has no members', () => {
    const volume = createSyntheticVolume({ dimensions: [8, 8, 8] });
    const union = createUnionShape([]);

    expect(union.containsPoint([4, 4, 4])).toBe(false);
    expect(union.getRequiredThickness()).toBe(0);
    expect(
      collectVoxelsInShape({
        volume,
        planePoint: [4, 4, 4],
        viewPlaneNormal: AXIAL,
        getShapeRuns: union.getRuns,
      })
    ).toEqual([]);
  });

  it('selects exactly the set union of two disjoint discs', () => {
    const volume = createSyntheticVolume({ dimensions: [40, 24, 8] });
    const planePoint = [12, 12, 4];
    const iteration = { volume, planePoint, viewPlaneNormal: AXIAL };

    // 16 mm apart with a radius of 3, so the discs cannot touch.
    const shapes = discRow({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      radius: 3,
      step: 16,
      count: 2,
    });

    const union = expectUnionConsistency({ ...iteration, shapes });
    const members = shapes.flatMap((shape) => voxelsOf(shape, iteration));

    expect(union).toEqual([...members].sort());
    expect(union.length).toBeGreaterThan(0);
  });

  it('selects the set union of overlapping discs, and visits each voxel once', () => {
    const volume = createSyntheticVolume({ dimensions: [40, 24, 8] });
    const planePoint = [12, 12, 4];
    const iteration = { volume, planePoint, viewPlaneNormal: AXIAL };

    // A stroke: radius 4 stepped by 2, so every disc overlaps its neighbour
    // and the run merge has real work to do.
    const shapes = discRow({
      volume,
      planePoint,
      viewPlaneNormal: AXIAL,
      radius: 4,
      step: 2,
      count: 6,
    });

    const union = expectUnionConsistency({ ...iteration, shapes });
    const expected = [
      ...new Set(shapes.flatMap((shape) => voxelsOf(shape, iteration))),
    ].sort();

    expect(union).toEqual(expected);
    // The merge must actually have merged: six overlapping discs of radius 4
    // cover far fewer voxels than six separate discs would.
    expect(union.length).toBeLessThan(
      shapes.reduce(
        (total, shape) => total + voxelsOf(shape, iteration).length,
        0
      )
    );
  });

  it('merges runs that only touch', () => {
    const volume = createSyntheticVolume({ dimensions: [24, 8, 8] });
    const planePoint = [12, 4, 4];
    const viewPlaneNormal = AXIAL;

    // Two rectangles meeting at i = 12: [8, 12] and [12, 16] in world mm.
    const halves = [10, 14].map((centerI) =>
      createRectangleShape({
        volume,
        planePoint,
        viewPlaneNormal,
        centerWorld: [centerI, 4, 4],
        majorAxis: [1, 0, 0],
        majorHalfLength: 2,
        minorHalfLength: 2,
      })
    );

    const union = createUnionShape(halves);
    const slab = {
      g: [0, 0, 1],
      c0: -4,
      voxelThickness: 1,
      referencePlaneThickness: 1,
      halfWidth: 1,
      outerAxis: 2,
      rowAxis: 0,
      columnAxis: 0,
    };

    // Row j = 4 crosses both rectangles, so the two runs abut and must come
    // back as one.
    const runs = [...union.getRuns(4, 4, [0, 23], { ...slab, rowAxis: 1 })];

    expect(runs).toEqual([[8, 16]]);
  });

  it('reports the deepest member as the required thickness', () => {
    const volume = createSyntheticVolume({ dimensions: [16, 16, 16] });
    const common = { volume, planePoint: [8, 8, 8], viewPlaneNormal: AXIAL };

    const flat = createCircleShape({
      ...common,
      centerWorld: [8, 8, 8],
      radius: 3,
    });
    const shallow = createCircleShape({
      ...common,
      centerWorld: [8, 8, 8],
      radius: 3,
      depthRadius: 1,
    });
    const deep = createCircleShape({
      ...common,
      centerWorld: [8, 8, 8],
      radius: 3,
      depthRadius: 4,
    });

    expect(createUnionShape([flat, flat]).getRequiredThickness()).toBe(0);
    expect(createUnionShape([flat, shallow, deep]).getRequiredThickness()).toBe(
      deep.getRequiredThickness()
    );
  });

  it('holds for a mix of shape kinds', () => {
    const volume = createSyntheticVolume({
      dimensions: [32, 32, 12],
      spacing: [0.8, 0.8, 2.5],
    });
    const planePoint = [12, 12, 15];
    const viewPlaneNormal = AXIAL;

    expectUnionConsistency({
      volume,
      planePoint,
      viewPlaneNormal,
      shapes: [
        createEllipseShape({
          volume,
          planePoint,
          viewPlaneNormal,
          centerWorld: [12, 12, 15],
          majorAxis: [1, 0, 0],
          majorRadius: 5,
          minorRadius: 2,
        }),
        createRectangleShape({
          volume,
          planePoint,
          viewPlaneNormal,
          centerWorld: [16, 14, 15],
          majorAxis: [1, 1, 0],
          majorHalfLength: 3,
          minorHalfLength: 2,
        }),
      ],
    });
  });

  describe('at oblique angles', () => {
    // The angles the shape tests use, which is where a run merge is most
    // likely to disagree with the per-voxel predicate: the column axis is not
    // the i axis, and the depth varies along it.
    for (const degrees of [1, 17, 45, 73, 89]) {
      it(`holds for a stroke ${degrees} degrees off the acquisition plane`, () => {
        const volume = createSyntheticVolume({
          dimensions: [36, 36, 36],
          spacing: [1, 1.5, 2],
          direction: rotatedDirection(20, 'y'),
          origin: [-4, -3, -2],
        });
        const viewPlaneNormal = obliqueNormal(volume.direction, degrees);
        const planePoint = [16, 16, 16];

        const union = expectUnionConsistency({
          volume,
          planePoint,
          viewPlaneNormal,
          shapes: discRow({
            volume,
            planePoint,
            viewPlaneNormal,
            radius: 4,
            step: 3,
            count: 4,
          }),
        });

        expect(union.length).toBeGreaterThan(0);
      });
    }

    it('holds for a thick slab of spheres, which reach out of the plane', () => {
      const volume = createSyntheticVolume({
        dimensions: [32, 32, 32],
        spacing: [1, 1, 1],
        direction: IDENTITY,
      });
      const viewPlaneNormal = obliqueNormal(IDENTITY, 37);
      const planePoint = [16, 16, 16];

      const spheres = discRow({
        volume,
        planePoint,
        viewPlaneNormal,
        radius: 4,
        step: 3,
        count: 3,
      }).map((_unused, sphere) =>
        createCircleShape({
          volume,
          planePoint,
          viewPlaneNormal,
          centerWorld: [16 + sphere * 3, 16, 16],
          radius: 4,
          depthRadius: 4,
        })
      );

      expectUnionConsistency({
        volume,
        planePoint,
        viewPlaneNormal,
        // A solid member sets the thickness, exactly as the brush fill does.
        referencePlaneThickness:
          createUnionShape(spheres).getRequiredThickness(),
        shapes: spheres,
      });
    });
  });
});
