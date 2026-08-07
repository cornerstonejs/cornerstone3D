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

function groupByRow(voxels: Types.Point3[]): Types.Point3[][] {
  const byRow = new Map<string, Types.Point3[]>();
  for (const p of voxels) {
    const key = `${p[1]},${p[2]}`;
    if (!byRow.has(key)) {
      byRow.set(key, []);
    }
    byRow.get(key)!.push(p);
  }
  return [...byRow.values()];
}

/**
 * Asserts the fill is watertight (no holes / stripes) as seen along `dominant`
 * (0=i, 1=j, 2=k): collapsing that axis, every scan-line along each of the other
 * two axes must be a single contiguous run. Vertical-line / holey fills fail this.
 */
function expectSolidProjection(voxels: Types.Point3[], dominant: 0 | 1 | 2) {
  const [axisA, axisB] = [0, 1, 2].filter((a) => a !== dominant);
  const collapse = (fixedAxis: number, runAxis: number) => {
    const runs = new Map<number, number[]>();
    const seen = new Set<string>();
    for (const p of voxels) {
      const key = `${p[axisA]},${p[axisB]}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const f = p[fixedAxis];
      if (!runs.has(f)) {
        runs.set(f, []);
      }
      runs.get(f)!.push(p[runAxis]);
    }
    for (const cols of runs.values()) {
      const sorted = [...new Set(cols)].sort((a, b) => a - b);
      const span = sorted[sorted.length - 1] - sorted[0] + 1;
      expect(sorted.length).toBe(span);
    }
  };
  collapse(axisA, axisB);
  collapse(axisB, axisA);
}

/** Dominant lattice axis (0=i, 1=j, 2=k) of a world normal for an identity
 * direction volume - the axis the view is mostly looking along. */
function dominantAxis(normal: Types.Point3): 0 | 1 | 2 {
  const abs = normal.map((v) => Math.abs(v));
  return abs.indexOf(Math.max(...abs)) as 0 | 1 | 2;
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

  it('circle fill on an anisotropic (stretched) rotated view is a solid disc', () => {
    // Reproduces the "axis based image stretching" case: anisotropic voxels with
    // a slightly rotated view. A diagonal (u, v, w) metric collapses the disc to
    // spaced vertical lines here; the index-space quadratic keeps it solid.
    const dims: Types.Point3 = [31, 31, 31];
    const spacing: Types.Point3 = [0.4, 0.4, 2];
    const imageData = makeMockImageData(dims, spacing);
    const centerIJK: Types.Point3 = [15, 15, 15];

    const angle = 0.2;
    const rotatedUp: Types.Point3 = [0, Math.cos(angle), Math.sin(angle)];
    const rotatedNormal: Types.Point3 = [0, -Math.sin(angle), Math.cos(angle)];

    const descriptor = createCircleObliqueIntegerFill({
      viewUp: rotatedUp,
      viewPlaneNormal: rotatedNormal,
      centerIJK,
      segmentationImageData: imageData,
      xRadius: 4,
      yRadius: 4,
    });

    const visited = collectFillVoxels(descriptor, imageData);
    expect(visited.length).toBeGreaterThan(100);

    // Viewed along the plane normal the disc is solid - every scan-line is a
    // single contiguous run with no interior gaps. The vertical-line regression
    // (a diagonal metric / too-thin slab) leaves spaced gaps here.
    expectSolidProjection(visited, dominantAxis(rotatedNormal));

    // The disc stays thin: only a few slices along the dominant normal axis.
    const dominant = dominantAxis(rotatedNormal);
    const planes = new Set(visited.map((p) => p[dominant]));
    expect(planes.size).toBeLessThanOrEqual(4);
  });

  it('circle fill is centered on the drawn plane (no half-voxel straddle)', () => {
    // Identity spacing so indexToWorld(ijk) === ijk === the rendered voxel
    // center. Membership must be tested at that same point; a half-voxel sampling
    // bias shifts the slab off the plane and the oblique disc straddles two
    // frames (the "alternate filling across two frames" regression).
    const dims: Types.Point3 = [31, 31, 31];
    const imageData = makeMockImageData(dims);
    const centerIJK: Types.Point3 = [15, 15, 15];
    const centerWorld: Types.Point3 = [15, 15, 15];

    const descriptor = createCircleObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      xRadius: 6,
      yRadius: 6,
      strokeCentersWorld: [centerWorld],
    });

    const visited = collectFillVoxels(descriptor, imageData);
    expect(visited.length).toBeGreaterThan(0);

    // Signed distance of every rendered voxel center to the drawn plane.
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (const p of visited) {
      const np =
        (p[0] - centerWorld[0]) * obliqueNormal[0] +
        (p[1] - centerWorld[1]) * obliqueNormal[1] +
        (p[2] - centerWorld[2]) * obliqueNormal[2];
      lo = Math.min(lo, np);
      hi = Math.max(hi, np);
      sum += np;
    }
    const mean = sum / visited.length;
    // Watertight slab half-width = half the voxel city-block projection on the
    // normal (identity spacing).
    const slabHalf =
      0.5 *
      (Math.abs(obliqueNormal[0]) +
        Math.abs(obliqueNormal[1]) +
        Math.abs(obliqueNormal[2]));

    // Symmetric around 0 (centered), and no voxel center sits beyond the slab.
    expect(Math.abs(mean)).toBeLessThan(0.25);
    expect(lo).toBeGreaterThanOrEqual(-slabHalf - 1e-6);
    expect(hi).toBeLessThanOrEqual(slabHalf + 1e-6);
  });

  it('drag-stroke circle fill stays confined to the oblique slab', () => {
    const dims: Types.Point3 = [31, 31, 31];
    const imageData = makeMockImageData(dims);
    const centerIJK: Types.Point3 = [15, 15, 15];

    // Two stroke centers offset along the in-plane view-right axis so the drag
    // sweeps a capsule across the oblique plane.
    const strokeCentersWorld: Types.Point3[] = [
      [11, 15, 15],
      [19, 15, 15],
    ];

    const descriptor = createCircleObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      xRadius: 3,
      yRadius: 3,
      strokeCentersWorld,
    });

    const visited = collectFillVoxels(descriptor, imageData);
    const keys = new Set(visited.map((p) => `${p[0]},${p[1]},${p[2]}`));

    // No voxel is visited twice and the stroke actually paints something.
    expect(keys.size).toBe(visited.length);
    expect(visited.length).toBeGreaterThan(0);

    // Every voxel belongs to the thin lattice-w slab of the oblique plane; the
    // capsule must not bleed onto far-away parallel planes.
    const wValues = new Set(
      visited.map((p) => uvwFromIJK(p, descriptor.basis)[2])
    );
    expect(wValues.size).toBeLessThanOrEqual(4);

    // Both stroke endpoints (and the midpoint between them) are covered.
    expect(keys.has('11,15,15')).toBe(true);
    expect(keys.has('19,15,15')).toBe(true);
    expect(keys.has('15,15,15')).toBe(true);

    // A voxel well outside the brush radius on the same row is not filled.
    expect(keys.has('26,15,15')).toBe(false);
  });

  it('full-thickness circle fill spans multiple oblique planes', () => {
    const dims: Types.Point3 = [31, 31, 31];
    const imageData = makeMockImageData(dims);
    const centerIJK: Types.Point3 = [15, 15, 15];

    const thin = createCircleObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      xRadius: 5,
      yRadius: 5,
    });
    const thick = createCircleObliqueIntegerFill({
      viewUp,
      viewPlaneNormal: obliqueNormal,
      centerIJK,
      segmentationImageData: imageData,
      xRadius: 5,
      yRadius: 5,
      slabThicknessWorld: 8,
    });

    const thinVoxels = collectFillVoxels(thin, imageData);
    const thickVoxels = collectFillVoxels(thick, imageData);

    // World extent measured along the plane normal (identity spacing -> world
    // equals index). A thin view is ~one voxel thick; a full-thickness view is a
    // deep slab, so it both extends further along the normal and fills more.
    const normalExtent = (voxels: Types.Point3[]) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of voxels) {
        const np =
          (p[0] + 0.5) * obliqueNormal[0] +
          (p[1] + 0.5) * obliqueNormal[1] +
          (p[2] + 0.5) * obliqueNormal[2];
        lo = Math.min(lo, np);
        hi = Math.max(hi, np);
      }
      return hi - lo;
    };
    expect(normalExtent(thickVoxels)).toBeGreaterThan(
      normalExtent(thinVoxels) + 2
    );
    expect(thickVoxels.length).toBeGreaterThan(thinVoxels.length);

    // No voxel is visited twice even across the thick slab.
    const keys = new Set(thickVoxels.map((p) => `${p[0]},${p[1]},${p[2]}`));
    expect(keys.size).toBe(thickVoxels.length);
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
