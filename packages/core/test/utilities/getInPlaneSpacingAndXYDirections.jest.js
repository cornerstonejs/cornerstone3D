import { describe, it, expect } from '@jest/globals';
import { getInPlaneSpacingAndXYDirections } from '../../src/utilities';

const SQRT1_2 = Math.SQRT1_2;

// direction is laid out as [ix,iy,iz, jx,jy,jz, kx,ky,kz]
const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('getInPlaneSpacingAndXYDirections', () => {
  describe('orthogonal fast path', () => {
    it('returns the exact axis spacing/direction when the view aligns with an axis-aligned volume', () => {
      const { spacing, xDir, yDir } = getInPlaneSpacingAndXYDirections(
        { direction: identityDirection, spacing: [0.5, 0.75, 2] },
        [1, 0, 0],
        [0, 1, 0]
      );

      expect(spacing[0]).toBeCloseTo(0.5);
      expect(spacing[1]).toBeCloseTo(0.75);
      expect(xDir).toEqual([1, 0, 0]);
      expect(yDir).toEqual([0, 1, 0]);
    });

    it('matches anti-parallel in-plane axes and returns the volume-axis direction', () => {
      const { spacing, xDir } = getInPlaneSpacingAndXYDirections(
        { direction: identityDirection, spacing: [0.5, 0.75, 2] },
        [-1, 0, 0],
        [0, 1, 0]
      );

      expect(spacing[0]).toBeCloseTo(0.5);
      expect(xDir).toEqual([1, 0, 0]);
    });
  });

  describe('planar oblique, canvas-oriented volume', () => {
    // The volume is rotated 30 degrees about Z (oblique in world space), but the
    // view is aligned to the volume's own axes (canvas-oriented). The fast path
    // must still apply because alignment is tested against the volume axes, not
    // world axes - so exact spacing is returned despite the oblique volume.
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const rotatedDirection = [cos, sin, 0, -sin, cos, 0, 0, 0, 1];
    const iVec = [cos, sin, 0];
    const jVec = [-sin, cos, 0];

    it('uses exact volume-axis spacing when the view aligns to the oblique volume', () => {
      const { spacing, xDir, yDir } = getInPlaneSpacingAndXYDirections(
        { direction: rotatedDirection, spacing: [0.5, 0.75, 2] },
        iVec,
        jVec
      );

      expect(spacing[0]).toBeCloseTo(0.5);
      expect(spacing[1]).toBeCloseTo(0.75);
      expect(xDir[0]).toBeCloseTo(cos);
      expect(xDir[1]).toBeCloseTo(sin);
      expect(yDir[0]).toBeCloseTo(-sin);
      expect(yDir[1]).toBeCloseTo(cos);
    });
  });

  describe('oblique view', () => {
    it('projects the volume spacing onto a 45-degree in-plane rotation', () => {
      const viewRight = [SQRT1_2, SQRT1_2, 0];
      const viewUp = [-SQRT1_2, SQRT1_2, 0];

      const { spacing, xDir, yDir } = getInPlaneSpacingAndXYDirections(
        { direction: identityDirection, spacing: [1, 3, 1] },
        viewRight,
        viewUp
      );

      // sqrt((1/2)*1^2 + (1/2)*3^2) = sqrt(5)
      expect(spacing[0]).toBeCloseTo(Math.sqrt(5));
      expect(spacing[1]).toBeCloseTo(Math.sqrt(5));
      // The returned direction is the (normalized) in-plane axis itself.
      expect(xDir[0]).toBeCloseTo(SQRT1_2);
      expect(xDir[1]).toBeCloseTo(SQRT1_2);
      expect(yDir[0]).toBeCloseTo(-SQRT1_2);
      expect(yDir[1]).toBeCloseTo(SQRT1_2);
    });

    it('handles a mixed case: oblique x axis, axis-aligned y axis', () => {
      const a = Math.cos(Math.PI / 6); // x component
      const b = Math.sin(Math.PI / 6); // y component
      const viewRight = [a, b, 0];
      const viewUp = [0, 0, 1]; // aligned to k -> fast path

      const { spacing } = getInPlaneSpacingAndXYDirections(
        { direction: identityDirection, spacing: [1, 3, 1] },
        viewRight,
        viewUp
      );

      // x: sqrt((a*1)^2 + (b*3)^2); y: exact k-axis spacing
      expect(spacing[0]).toBeCloseTo(Math.sqrt(a * a + b * 3 * (b * 3)));
      expect(spacing[1]).toBeCloseTo(1);
    });
  });
});
