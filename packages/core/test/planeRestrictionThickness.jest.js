import { isPlaneDepthViewable } from '../src/utilities/voxelSlab/isPlaneDepthViewable';
import { updatePlaneRestriction } from '../src/utilities/updatePlaneRestriction';

const AXIAL = [0, 0, 1];
const FOR = '1.2.3.4';

describe('isPlaneDepthViewable - Rule D', () => {
  describe('with no recorded thickness', () => {
    it('keeps the historical exact-plane behaviour', () => {
      expect(isPlaneDepthViewable([0, 0, 3], [0, 0, 3], AXIAL)).toBe(true);
      expect(isPlaneDepthViewable([0, 0, 4], [0, 0, 3], AXIAL)).toBe(false);
      // In-plane movement never matters.
      expect(isPlaneDepthViewable([70, -9, 3], [0, 0, 3], AXIAL)).toBe(true);
    });

    it('does not widen visibility, so existing annotations are unaffected', () => {
      // A pre-thickness annotation must not suddenly appear on nearby slices
      // just because a viewport has a thick slab.
      expect(
        isPlaneDepthViewable([0, 0, 4], [0, 0, 3], AXIAL, undefined, 10)
      ).toBe(false);
    });
  });

  describe('with a recorded thickness', () => {
    it('shows the annotations created on a slice and not those created off it', () => {
      // 1 mm frames: an annotation created on a stack viewport records
      // T = T_v = 1, and the viewport has no slab so t = 0.
      const T = 1;

      expect(isPlaneDepthViewable([0, 0, 3], [0, 0, 3], AXIAL, T, 0)).toBe(
        true
      );
      // Half a frame away is still within T / 2 = 0.5? No - strictly outside.
      expect(isPlaneDepthViewable([0, 0, 3.5], [0, 0, 3], AXIAL, T, 0)).toBe(
        false
      );
      expect(isPlaneDepthViewable([0, 0, 4], [0, 0, 3], AXIAL, T, 0)).toBe(
        false
      );
    });

    it('widens with the viewport slab', () => {
      const T = 1;
      // t = 2 gives a half width of 1.5, so the immediate neighbours show.
      expect(isPlaneDepthViewable([0, 0, 4], [0, 0, 3], AXIAL, T, 2)).toBe(
        true
      );
      expect(isPlaneDepthViewable([0, 0, 2], [0, 0, 3], AXIAL, T, 2)).toBe(
        true
      );
      expect(isPlaneDepthViewable([0, 0, 5], [0, 0, 3], AXIAL, T, 2)).toBe(
        false
      );
    });

    it('excludes a plane sitting exactly on the boundary', () => {
      // t = 1, T = 1 gives a half width of exactly 1, and the neighbour at
      // distance 1 must be excluded or a viewport would show both its own
      // annotations and the next slice's.
      expect(isPlaneDepthViewable([0, 0, 4], [0, 0, 3], AXIAL, 1, 1)).toBe(
        false
      );
      expect(isPlaneDepthViewable([0, 0, 3], [0, 0, 3], AXIAL, 1, 1)).toBe(
        true
      );
    });

    it('is stable against floating point noise in the plane position', () => {
      [0, 1e-15, -1e-15, 1e-13, -1e-13].forEach((noise) => {
        expect(
          isPlaneDepthViewable([0, 0, 4 + noise], [0, 0, 3], AXIAL, 1, 1)
        ).toBe(false);
      });
    });

    it('supports the cross-modality cases the thickness exists for', () => {
      // A 4 mm NM annotation viewed on a 1 mm CT stack: half width is
      // (0 + 4) / 2 = 2, so CT slices within 2 mm show it - two on each side.
      const nmThickness = 4;
      const visible = [];
      for (let z = -4; z <= 4; z++) {
        if (isPlaneDepthViewable([0, 0, 0], [0, 0, z], AXIAL, nmThickness, 0)) {
          visible.push(z);
        }
      }
      expect(visible).toEqual([-1, 0, 1]);

      // A 2 mm CT annotation viewed on a 4 mm NM slice: half width is 1, so it
      // shows on the single NM slice it falls inside.
      const ctThickness = 2;
      expect(
        isPlaneDepthViewable([0, 0, 0], [0, 0, 0], AXIAL, ctThickness, 0)
      ).toBe(true);
      expect(
        isPlaneDepthViewable([0, 0, 0], [0, 0, 4], AXIAL, ctThickness, 0)
      ).toBe(false);
    });
  });
});

describe('updatePlaneRestriction', () => {
  it('records only the point for a single-point annotation', () => {
    const reference = { FrameOfReferenceUID: FOR };
    updatePlaneRestriction([[1, 2, 3]], reference);

    expect(reference.planeRestriction.point).toEqual([1, 2, 3]);
    expect(reference.planeRestriction.inPlaneVector1).toBeNull();
    expect(reference.planeRestriction.inPlaneVector2).toBeNull();
  });

  it('records one in-plane vector for a two-point annotation', () => {
    const reference = { FrameOfReferenceUID: FOR };
    updatePlaneRestriction(
      [
        [0, 0, 0],
        [2, 0, 0],
      ],
      reference
    );

    expect(reference.planeRestriction.inPlaneVector1).not.toBeNull();
    expect(reference.planeRestriction.inPlaneVector2).toBeNull();
  });

  it('records two non-collinear vectors for a planar annotation', () => {
    const reference = { FrameOfReferenceUID: FOR };
    updatePlaneRestriction(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
      reference
    );

    const { inPlaneVector1, inPlaneVector2 } = reference.planeRestriction;
    expect(inPlaneVector1).not.toBeNull();
    expect(inPlaneVector2).not.toBeNull();

    // The two must genuinely span a plane, so their cross product must not
    // vanish. This is what fails when an anti-parallel candidate is accepted.
    const cross = [
      inPlaneVector1[1] * inPlaneVector2[2] -
        inPlaneVector1[2] * inPlaneVector2[1],
      inPlaneVector1[2] * inPlaneVector2[0] -
        inPlaneVector1[0] * inPlaneVector2[2],
      inPlaneVector1[0] * inPlaneVector2[1] -
        inPlaneVector1[1] * inPlaneVector2[0],
    ];
    const magnitude = Math.hypot(...cross);
    expect(magnitude).toBeGreaterThan(0.1);
  });

  it('rejects an anti-parallel candidate as the second in-plane vector', () => {
    // A polyline that runs out and doubles straight back along itself. Every
    // candidate vector is parallel or anti-parallel to the first, so there is
    // no valid second in-plane vector and the result must stay null rather
    // than recording a collinear one.
    const reference = { FrameOfReferenceUID: FOR };
    updatePlaneRestriction(
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
        [2, 0, 0],
        [1, 0, 0],
      ],
      reference
    );

    expect(reference.planeRestriction.inPlaneVector1).not.toBeNull();
    expect(reference.planeRestriction.inPlaneVector2).toBeNull();
  });

  it('does not nest a planeRestriction inside a planeRestriction', () => {
    const reference = { FrameOfReferenceUID: FOR };
    updatePlaneRestriction(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      reference
    );

    expect(reference.planeRestriction.planeRestriction).toBeUndefined();
  });
});
