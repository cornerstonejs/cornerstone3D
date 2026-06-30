import { describe, it, expect } from '@jest/globals';
import { iterateOverPlane } from '../../src/utilities';

const SQRT1_2 = Math.SQRT1_2;

// 11^3 isotropic, axis-aligned volume centered at index [5,5,5] = world [5,5,5].
const volume = {
  dimensions: [11, 11, 11],
  origin: [0, 0, 0],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  spacing: [1, 1, 1],
};

describe('iterateOverPlane', () => {
  describe('planar (zero thickness) oblique plane', () => {
    // An oblique plane through the volume center: x stays the in-plane "right"
    // axis, while "up" is tilted 45 degrees between +y and +z. That makes the
    // plane the surface z = y. With normalExtent = 0 the iterator must produce
    // exactly ONE plane cutting through the whole volume - not a slab, and not
    // the full 3D bounding box.
    const center = [5, 5, 5];
    const viewRight = [1, 0, 0];
    const viewUp = [0, SQRT1_2, SQRT1_2];
    // plane normal = right x up = [0, -SQRT1_2, SQRT1_2]
    const normal = [0, -SQRT1_2, SQRT1_2];

    const points = iterateOverPlane(volume, {
      center,
      viewRight,
      viewUp,
      uExtent: 10,
      vExtent: 10,
      normalExtent: 0,
    });

    it('creates a single plane, not the full 3D box', () => {
      // The full box would be 11^3 = 1331 voxels. The z = y cross-section of an
      // 11^3 cube is exactly 11 (x) * 11 (y, with z determined) = 121 voxels.
      expect(points.length).toBe(121);
      expect(points.length).toBeLessThan(
        volume.dimensions[0] * volume.dimensions[1] * volume.dimensions[2]
      );
    });

    it('is a single-valued surface (one voxel per in-plane location)', () => {
      const ijKeys = new Set(
        points.map((p) => `${p.pointIJK[0]},${p.pointIJK[1]}`)
      );
      // One k per (i, j) => a plane (graph), never a slab with stacked voxels.
      expect(ijKeys.size).toBe(points.length);
    });

    it('lies on exactly the z = y plane through the volume', () => {
      for (const { pointIJK } of points) {
        // Every voxel sits on the z = y plane.
        expect(pointIJK[2]).toBe(pointIJK[1]);
      }
    });

    it('keeps every voxel center on the focal plane (zero perpendicular drift)', () => {
      for (const { pointLPS } of points) {
        const perp =
          (pointLPS[0] - center[0]) * normal[0] +
          (pointLPS[1] - center[1]) * normal[1] +
          (pointLPS[2] - center[2]) * normal[2];
        expect(perp).toBeCloseTo(0, 6);
      }
    });

    it('spans the overall volume in both in-plane directions', () => {
      const iValues = points.map((p) => p.pointIJK[0]);
      const jValues = points.map((p) => p.pointIJK[1]);

      expect(Math.min(...iValues)).toBe(0);
      expect(Math.max(...iValues)).toBe(10);
      expect(new Set(iValues).size).toBe(11);

      expect(Math.min(...jValues)).toBe(0);
      expect(Math.max(...jValues)).toBe(10);
      expect(new Set(jValues).size).toBe(11);
    });

    it('emits each voxel exactly once', () => {
      const indices = new Set(points.map((p) => p.index));
      expect(indices.size).toBe(points.length);
    });
  });
});
