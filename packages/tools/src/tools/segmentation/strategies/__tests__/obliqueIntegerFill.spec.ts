import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  createCircleObliqueIntegerFill,
  createRectangleObliqueIntegerFill,
  createSphereObliqueIntegerFill,
  forEachObliqueIntegerFillVoxel,
} from '../utils/obliqueIntegerFill';

const { obliqueIntegerIterator: oii, VoxelManager } = csUtils;
const { uvwFromIJK } = oii;

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function makeMockImageData(
  dimensions: Types.Point3,
  spacing: Types.Point3 = [1, 1, 1]
) {
  return {
    getDimensions: () => dimensions,
    getSpacing: () => spacing,
    getDirection: () => identityDirection,
    getOrigin: () => [0, 0, 0],
    indexToWorld: (ijk: Types.Point3) => ijk,
    worldToIndex: (world: Types.Point3) =>
      world.map((v) => Math.round(v)) as Types.Point3,
  } as unknown as import('@kitware/vtk.js/Common/DataModel/ImageData').default;
}

function collectFillVoxels(
  descriptor: ReturnType<typeof createCircleObliqueIntegerFill>,
  imageData: ReturnType<typeof makeMockImageData>
) {
  const dims = imageData.getDimensions() as Types.Point3;
  const voxelManager = VoxelManager.createScalarVolumeVoxelManager({
    dimensions: dims,
    scalarData: new Uint8Array(dims[0] * dims[1] * dims[2]),
  });
  const visited: Types.Point3[] = [];
  forEachObliqueIntegerFillVoxel(
    descriptor,
    voxelManager,
    ({ pointIJK }) => {
      visited.push([...pointIJK] as Types.Point3);
    },
    imageData
  );
  return visited;
}

describe('obliqueIntegerFill integration', () => {
  const viewUp: Types.Point3 = [0, 1, 0];
  const obliqueNormal: Types.Point3 = [0, 1 / Math.SQRT2, 1 / Math.SQRT2];

  it('planar circle fill does not duplicate voxels between adjacent w planes', () => {
    const dims: Types.Point3 = [21, 21, 21];
    const imageData = makeMockImageData(dims);
    const centerIJK: Types.Point3 = [10, 10, 10];

    const descriptor = createCircleObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      xRadius: 4,
      yRadius: 4,
    });

    const visited = collectFillVoxels(descriptor, imageData);
    const byW = new Map<number, Set<string>>();

    for (const ijk of visited) {
      const w = uvwFromIJK(ijk, descriptor.basis)[2];
      if (!byW.has(w)) {
        byW.set(w, new Set());
      }
      byW.get(w)!.add(`${ijk[0]},${ijk[1]},${ijk[2]}`);
    }

    // Each voxel appears on exactly one integer w plane.
    const allKeys = new Set(visited.map((p) => `${p[0]},${p[1]},${p[2]}`));
    expect(allKeys.size).toBe(visited.length);

    // Adjacent w planes are disjoint.
    const planes = [...byW.values()];
    for (let a = 0; a < planes.length; a++) {
      for (let b = a + 1; b < planes.length; b++) {
        for (const key of planes[a]) {
          expect(planes[b].has(key)).toBe(false);
        }
      }
    }

    // Oblique planar fill should stay much smaller than the full bounding box.
    expect(visited.length).toBeLessThan(dims[0] * dims[1] * dims[2]);
    expect(visited.length).toBeGreaterThan(0);
  });

  it('sphere fill is stable for an oblique viewport', () => {
    const dims: Types.Point3 = [25, 25, 25];
    const imageData = makeMockImageData(dims);
    const centerIJK: Types.Point3 = [12, 12, 12];
    const radiusWorld = 5;

    const descriptor = createSphereObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      radiusWorld,
    });

    const visited = collectFillVoxels(descriptor, imageData);
    const keys = new Set(visited.map((p) => `${p[0]},${p[1]},${p[2]}`));

    expect(keys.size).toBe(visited.length);
    expect(visited.length).toBeGreaterThan(0);

    // Rebuilding the descriptor with the same inputs is deterministic.
    const descriptor2 = createSphereObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      radiusWorld,
    });
    expect(descriptor2.basis).toEqual(descriptor.basis);
  });

  it('rectangle fill is deterministic for a rotated view', () => {
    const dims: Types.Point3 = [30, 30, 30];
    const imageData = makeMockImageData(dims);

    const right = [1, 1, 0].map((v) => v / Math.sqrt(2)) as Types.Point3;
    const up = [-1, 1, 1].map((v) => v / Math.sqrt(3)) as Types.Point3;
    const origin: Types.Point3 = [15, 15, 15];
    const corner = (u: number, v: number): Types.Point3 =>
      [
        origin[0] + right[0] * u + up[0] * v,
        origin[1] + right[1] * u + up[1] * v,
        origin[2] + right[2] * u + up[2] * v,
      ] as Types.Point3;

    const corners = [
      corner(-6, 4),
      corner(6, 4),
      corner(6, -4),
      corner(-6, -4),
    ];
    const centerIJK: Types.Point3 = [15, 15, 15];
    const viewPlaneNormal = [
      right[1] * up[2] - right[2] * up[1],
      right[2] * up[0] - right[0] * up[2],
      right[0] * up[1] - right[1] * up[0],
    ] as Types.Point3;
    const len = Math.hypot(...viewPlaneNormal);
    for (let i = 0; i < 3; i++) {
      viewPlaneNormal[i] /= len;
    }

    const build = () =>
      createRectangleObliqueIntegerFill({
        viewUp: up,
        viewPlaneNormal,
        centerIJK,
        segmentationImageData: imageData,
        cornersWorld: corners,
      });

    const a = build();
    const b = build();
    expect(a.basis).toEqual(b.basis);

    const visitedA = collectFillVoxels(a, imageData);
    const visitedB = collectFillVoxels(b, imageData);
    expect(visitedB.map((p) => p.join(','))).toEqual(
      visitedA.map((p) => p.join(','))
    );
    expect(visitedA.length).toBeGreaterThan(0);
  });
});
