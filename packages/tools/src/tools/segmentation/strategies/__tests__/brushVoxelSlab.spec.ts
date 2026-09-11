import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import {
  createCircleBrushFill,
  createRectangleBrushFill,
  createSphereBrushFill,
  forEachBrushFillVoxel,
} from '../utils/brushVoxelSlab';

const { VoxelManager } = csUtils;
const { isVoxelCenterInSlab, getVoxelThicknessAlongNormal } = csUtils.voxelSlab;

const IDENTITY_DIRECTION = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Just enough of a labelmap's vtkImageData for the fill builders, which read
 * the four geometry getters and `worldToIndex`.
 */
function makeImageData(
  dimensions: Types.Point3,
  {
    spacing = [1, 1, 1] as Types.Point3,
    direction = IDENTITY_DIRECTION,
    origin = [0, 0, 0] as Types.Point3,
  } = {}
) {
  const iVector = direction.slice(0, 3);
  const jVector = direction.slice(3, 6);
  const kVector = direction.slice(6, 9);

  return {
    getDimensions: () => dimensions,
    getSpacing: () => spacing,
    getDirection: () => direction,
    getOrigin: () => origin,
    // The direction rows are orthonormal, so the inverse is the transpose
    // divided by the spacing.
    worldToIndex: (world: Types.Point3) => {
      const offset = [
        world[0] - origin[0],
        world[1] - origin[1],
        world[2] - origin[2],
      ];
      return [iVector, jVector, kVector].map(
        (axisVector, axis) =>
          (offset[0] * axisVector[0] +
            offset[1] * axisVector[1] +
            offset[2] * axisVector[2]) /
          spacing[axis]
      ) as Types.Point3;
    },
  } as unknown as import('@kitware/vtk.js/Common/DataModel/ImageData').default;
}

type Visited = { pointIJK: Types.Point3; pointLPS: Types.Point3 };

/** Every voxel a fill paints, in visit order. */
function collect(
  fill: ReturnType<typeof createCircleBrushFill>,
  dimensions: Types.Point3
): Visited[] {
  const voxelManager = VoxelManager.createScalarVolumeVoxelManager({
    dimensions,
    scalarData: new Uint8Array(dimensions[0] * dimensions[1] * dimensions[2]),
  });

  const visited: Visited[] = [];

  forEachBrushFillVoxel(fill, voxelManager, ({ pointIJK, pointLPS }) => {
    visited.push({ pointIJK, pointLPS });
  });

  return visited;
}

/** A key per voxel, so duplicates and set equality are both visible. */
const keys = (visited: Visited[]) =>
  visited.map(({ pointIJK }) => pointIJK.join(','));

/** The distinct index values along one axis, sorted. */
const axisLayers = (visited: Visited[], axis: 0 | 1 | 2) =>
  [...new Set(visited.map(({ pointIJK }) => pointIJK[axis]))].sort(
    (a, b) => a - b
  );

/** A unit normal `degrees` away from the k axis, rotated towards i. */
function obliqueNormal(degrees: number): Types.Point3 {
  const radians = (degrees * Math.PI) / 180;
  return [Math.sin(radians), 0, Math.cos(radians)];
}

describe('brushVoxelSlab', () => {
  describe('createCircleBrushFill', () => {
    const dimensions: Types.Point3 = [24, 24, 24];
    const center: Types.Point3 = [12, 12, 12];

    it('paints one axis-aligned layer for a thin view', () => {
      const fill = createCircleBrushFill({
        segmentationImageData: makeImageData(dimensions),
        viewUp: [0, 1, 0],
        viewPlaneNormal: [0, 0, 1],
        centerWorld: center,
        xRadius: 4,
        yRadius: 4,
      });

      const visited = collect(fill, dimensions);

      expect(visited.length).toBeGreaterThan(0);
      expect(axisLayers(visited, 2)).toEqual([12]);
      expect(new Set(keys(visited)).size).toBe(visited.length);
    });

    it('paints only voxels inside the disc', () => {
      const xRadius = 5;
      const yRadius = 3;
      const fill = createCircleBrushFill({
        segmentationImageData: makeImageData(dimensions),
        viewUp: [0, 1, 0],
        viewPlaneNormal: [0, 0, 1],
        centerWorld: center,
        xRadius,
        yRadius,
      });

      for (const { pointLPS } of collect(fill, dimensions)) {
        const dx = (pointLPS[0] - center[0]) / xRadius;
        const dy = (pointLPS[1] - center[1]) / yRadius;

        // The shape widens its outline by a relative epsilon so a centre
        // exactly on it counts as inside.
        expect(dx * dx + dy * dy).toBeLessThanOrEqual(1 + 1e-4);
      }
    });

    it('reports the voxel centre as pointLPS', () => {
      const imageData = makeImageData(dimensions, {
        spacing: [0.5, 0.75, 2] as Types.Point3,
        origin: [-3, 2, 7] as Types.Point3,
      });
      const fill = createCircleBrushFill({
        segmentationImageData: imageData,
        viewUp: [0, 1, 0],
        viewPlaneNormal: [0, 0, 1],
        centerWorld: [2, 6, 15],
        xRadius: 2,
        yRadius: 2,
      });

      const visited = collect(fill, dimensions);
      expect(visited.length).toBeGreaterThan(0);

      for (const { pointIJK, pointLPS } of visited) {
        expect(pointLPS).toEqual([
          -3 + pointIJK[0] * 0.5,
          2 + pointIJK[1] * 0.75,
          7 + pointIJK[2] * 2,
        ]);
      }
    });

    it('keeps every voxel centre within the slab on an oblique plane', () => {
      const imageData = makeImageData(dimensions);
      const volume = {
        dimensions,
        direction: IDENTITY_DIRECTION,
        spacing: [1, 1, 1] as Types.Point3,
        origin: [0, 0, 0] as Types.Point3,
      };

      for (const degrees of [17, 35, 45, 62, 80]) {
        const viewPlaneNormal = obliqueNormal(degrees);
        const fill = createCircleBrushFill({
          segmentationImageData: imageData,
          viewUp: [0, 1, 0],
          viewPlaneNormal,
          centerWorld: center,
          xRadius: 5,
          yRadius: 5,
        });

        const visited = collect(fill, dimensions);
        const voxelThickness = getVoxelThicknessAlongNormal(
          volume,
          viewPlaneNormal
        );

        expect(visited.length).toBeGreaterThan(0);
        // No duplicate writes: a voxel painted twice records two undo entries.
        expect(new Set(keys(visited)).size).toBe(visited.length);

        // This is the bleed the axis-aligned box walk produced. Every painted
        // voxel must satisfy Rule M's depth test against the drawn plane.
        for (const { pointLPS } of visited) {
          expect(
            isVoxelCenterInSlab(
              pointLPS,
              center,
              viewPlaneNormal,
              voxelThickness,
              voxelThickness
            )
          ).toBe(true);
        }
      }
    });

    it('paints every layer through a thick slab', () => {
      const imageData = makeImageData(dimensions);
      const common = {
        segmentationImageData: imageData,
        viewUp: [0, 1, 0] as Types.Point3,
        viewPlaneNormal: [0, 0, 1] as Types.Point3,
        centerWorld: center,
        xRadius: 4,
        yRadius: 4,
      };

      const thin = collect(createCircleBrushFill(common), dimensions);
      const thick = collect(
        createCircleBrushFill({ ...common, viewThicknessWorld: 6 }),
        dimensions
      );

      // Rule F takes the half width as `max(depth, T_v) / 2`, so a 6 mm view
      // over 1 mm voxels reaches 3 mm each side of the plane at layer 12.
      expect(axisLayers(thin, 2)).toEqual([12]);
      expect(axisLayers(thick, 2)).toEqual([10, 11, 12, 13, 14]);
      expect(thick.length).toBeGreaterThan(thin.length);
    });

    it('paints a continuous swept disc for a stroke', () => {
      const imageData = makeImageData(dimensions);
      const common = {
        segmentationImageData: imageData,
        viewUp: [0, 1, 0] as Types.Point3,
        viewPlaneNormal: [0, 0, 1] as Types.Point3,
        centerWorld: [16, 12, 12] as Types.Point3,
        xRadius: 2,
        yRadius: 2,
      };

      const single = collect(createCircleBrushFill(common), dimensions);
      const stroke = collect(
        createCircleBrushFill({
          ...common,
          // Far enough apart that discs at the samples alone would not touch.
          strokeCentersWorld: [
            [6, 12, 12],
            [16, 12, 12],
          ] as Types.Point3[],
        }),
        dimensions
      );

      expect(stroke.length).toBeGreaterThan(single.length);
      expect(new Set(keys(stroke)).size).toBe(stroke.length);
      // The densification fills the gaps, so the row through the centre is one
      // unbroken span from the first sample to the last.
      const spine = stroke
        .filter(({ pointIJK }) => pointIJK[1] === 12 && pointIJK[2] === 12)
        .map(({ pointIJK }) => pointIJK[0])
        .sort((a, b) => a - b);

      expect(spine[0]).toBeLessThanOrEqual(6);
      expect(spine[spine.length - 1]).toBeGreaterThanOrEqual(16);
      expect(spine).toEqual(
        Array.from({ length: spine.length }, (_unused, i) => spine[0] + i)
      );
    });

    it('builds no fill for a degenerate brush', () => {
      const common = {
        segmentationImageData: makeImageData(dimensions),
        viewUp: [0, 1, 0] as Types.Point3,
        viewPlaneNormal: [0, 0, 1] as Types.Point3,
        centerWorld: center,
      };

      expect(
        createCircleBrushFill({ ...common, xRadius: 0, yRadius: 4 })
      ).toBeNull();
      expect(
        createCircleBrushFill({ ...common, xRadius: 4, yRadius: 0 })
      ).toBeNull();
    });
  });

  describe('createSphereBrushFill', () => {
    const dimensions: Types.Point3 = [24, 24, 24];
    const center: Types.Point3 = [12, 12, 12];

    it('paints a solid sphere, and ignores the view slab', () => {
      const radiusWorld = 4;
      const fill = createSphereBrushFill({
        segmentationImageData: makeImageData(dimensions),
        viewPlaneNormal: [0, 0, 1],
        centerWorld: center,
        radiusWorld,
      });

      const visited = collect(fill, dimensions);

      expect(visited.length).toBeGreaterThan(0);
      expect(new Set(keys(visited)).size).toBe(visited.length);
      // Reaches out of the plane on both sides, unlike the circle brush.
      expect(axisLayers(visited, 2).length).toBeGreaterThan(1);

      for (const { pointLPS } of visited) {
        // Half a voxel of slack, which is what the shape adds along the normal.
        expect(vec3.distance(pointLPS, center)).toBeLessThanOrEqual(
          radiusWorld + 0.5 + 1e-4
        );
      }
    });

    it('stays a solid sphere at every orientation', () => {
      const radiusWorld = 4;
      const volume = {
        dimensions,
        direction: IDENTITY_DIRECTION,
        spacing: [1, 1, 1] as Types.Point3,
        origin: [0, 0, 0] as Types.Point3,
      };

      // Every voxel strictly inside the sphere, which is the set the fill must
      // cover whatever the camera is doing.
      const interior = new Set<string>();
      for (let k = 0; k < dimensions[2]; k++) {
        for (let j = 0; j < dimensions[1]; j++) {
          for (let i = 0; i < dimensions[0]; i++) {
            if (vec3.distance([i, j, k], center) <= radiusWorld) {
              interior.add(`${i},${j},${k}`);
            }
          }
        }
      }

      for (const degrees of [0, 23, 45, 67, 90]) {
        const viewPlaneNormal = obliqueNormal(degrees);
        const visited = collect(
          createSphereBrushFill({
            segmentationImageData: makeImageData(dimensions),
            viewPlaneNormal,
            centerWorld: center,
            radiusWorld,
          }),
          dimensions
        );
        const painted = new Set(keys(visited));

        expect(painted.size).toBe(visited.length);

        // Complete: no holes. This is the watertightness the box walk lost.
        for (const voxel of interior) {
          expect(painted.has(voxel)).toBe(true);
        }

        // Contained: the shape widens only along the normal, and only by half
        // a voxel measured there, so nothing further out is ever painted.
        const slack =
          getVoxelThicknessAlongNormal(volume, viewPlaneNormal) / 2 + 1e-4;

        for (const { pointLPS } of visited) {
          expect(vec3.distance(pointLPS, center)).toBeLessThanOrEqual(
            radiusWorld + slack
          );
        }
      }
    });

    it('builds no fill for a zero radius', () => {
      expect(
        createSphereBrushFill({
          segmentationImageData: makeImageData(dimensions),
          viewPlaneNormal: [0, 0, 1],
          centerWorld: center,
          radiusWorld: 0,
        })
      ).toBeNull();
    });
  });

  describe('createRectangleBrushFill', () => {
    const dimensions: Types.Point3 = [24, 24, 24];

    /** Four corners in winding order, in the plane k = 12. */
    const corners: Types.Point3[] = [
      [8, 9, 12],
      [16, 9, 12],
      [16, 15, 12],
      [8, 15, 12],
    ];

    it('paints one layer, and only voxels inside the rectangle', () => {
      const fill = createRectangleBrushFill({
        segmentationImageData: makeImageData(dimensions),
        cornersWorld: corners,
      });

      const visited = collect(fill, dimensions);

      expect(visited.length).toBeGreaterThan(0);
      expect(axisLayers(visited, 2)).toEqual([12]);
      expect(axisLayers(visited, 0)).toEqual([
        8, 9, 10, 11, 12, 13, 14, 15, 16,
      ]);
      expect(axisLayers(visited, 1)).toEqual([9, 10, 11, 12, 13, 14, 15]);
      expect(new Set(keys(visited)).size).toBe(visited.length);
    });

    it('does not depend on which corner starts the winding', () => {
      const imageData = makeImageData(dimensions);
      const baseline = keys(
        collect(
          createRectangleBrushFill({
            segmentationImageData: imageData,
            cornersWorld: corners,
          }),
          dimensions
        )
      ).sort();

      for (let rotation = 1; rotation < 4; rotation++) {
        const rotated = [
          ...corners.slice(rotation),
          ...corners.slice(0, rotation),
        ];

        expect(
          keys(
            collect(
              createRectangleBrushFill({
                segmentationImageData: imageData,
                cornersWorld: rotated,
              }),
              dimensions
            )
          ).sort()
        ).toEqual(baseline);
      }
    });

    it('takes its plane from the corners on an oblique view', () => {
      const degrees = 40;
      const radians = (degrees * Math.PI) / 180;
      const center: Types.Point3 = [12, 12, 12];
      // An in-plane axis tilted about j, so the rectangle is oblique.
      const along: Types.Point3 = [Math.cos(radians), 0, -Math.sin(radians)];
      const viewPlaneNormal = obliqueNormal(degrees);

      const obliqueCorners = [
        [-4, -3],
        [4, -3],
        [4, 3],
        [-4, 3],
      ].map(
        ([u, v]) =>
          [
            center[0] + u * along[0],
            center[1] + v,
            center[2] + u * along[2],
          ] as Types.Point3
      );

      const visited = collect(
        createRectangleBrushFill({
          segmentationImageData: makeImageData(dimensions),
          cornersWorld: obliqueCorners,
        }),
        dimensions
      );

      const volume = {
        dimensions,
        direction: IDENTITY_DIRECTION,
        spacing: [1, 1, 1] as Types.Point3,
        origin: [0, 0, 0] as Types.Point3,
      };
      const voxelThickness = getVoxelThicknessAlongNormal(
        volume,
        viewPlaneNormal
      );

      expect(visited.length).toBeGreaterThan(0);
      expect(new Set(keys(visited)).size).toBe(visited.length);
      // The oblique rectangle spans several k layers, and every voxel it paints
      // still sits on the plane the corners define.
      expect(axisLayers(visited, 2).length).toBeGreaterThan(1);

      for (const { pointLPS } of visited) {
        expect(
          isVoxelCenterInSlab(
            pointLPS,
            center,
            viewPlaneNormal,
            voxelThickness,
            voxelThickness
          )
        ).toBe(true);
      }
    });

    it('builds no fill for a degenerate rectangle', () => {
      const imageData = makeImageData(dimensions);

      expect(
        createRectangleBrushFill({
          segmentationImageData: imageData,
          cornersWorld: corners.slice(0, 3),
        })
      ).toBeNull();

      // Zero width: two pairs of coincident corners.
      expect(
        createRectangleBrushFill({
          segmentationImageData: imageData,
          cornersWorld: [
            [8, 9, 12],
            [8, 9, 12],
            [8, 15, 12],
            [8, 15, 12],
          ],
        })
      ).toBeNull();
    });
  });
});
