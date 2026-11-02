import snapFocalPointToSlice from '../src/utilities/snapFocalPointToSlice';

describe('snapFocalPointToSlice', () => {
  const focalPoint = [0, 0, 0];
  const position = [0, 0, 100];
  const viewPlaneNormal = [0, 0, 1];

  describe('with a scrollable volume', () => {
    const sliceRange = { min: 0, max: 10, current: 0 };

    it('dollies the focal point and position by the requested number of frames', () => {
      const { newFocalPoint, newPosition } = snapFocalPointToSlice(
        focalPoint,
        position,
        sliceRange,
        viewPlaneNormal,
        1,
        2
      );

      expect(newFocalPoint).toEqual([0, 0, 2]);
      // The camera keeps its original offset from the focal point.
      expect(newPosition).toEqual([0, 0, 102]);
    });

    it('leaves the camera where it is for a zero delta', () => {
      const { newFocalPoint, newPosition } = snapFocalPointToSlice(
        focalPoint,
        position,
        sliceRange,
        viewPlaneNormal,
        1,
        0
      );

      expect(newFocalPoint).toEqual([0, 0, 0]);
      expect(newPosition).toEqual([0, 0, 100]);
    });
  });

  // A single-image series produces a volume one slice thick, so the slice range
  // collapses to min === max === current. Without a guard, `(current - min) /
  // (max - min)` is 0 / 0 = NaN, and the NaN reaches both returned points. A camera
  // whose focal point and position are both NaN has no direction of projection, so
  // vtk.js falls back to its default axial direction while the view up stays on the
  // acquisition plane - a basis that spans no plane, which renders nothing and logs
  // "WebGL: INVALID_VALUE: uniformMatrix3fv: no array".
  //
  // getSliceRange does not measure that range along the normal directly - it rotates
  // the volume's eight corners until the normal points at +X and takes min/max of the
  // X components. That rotation is the identity only for an axis-aligned positive
  // normal; for an antiparallel normal like [0, 0, -1], or any oblique one, its
  // off-diagonal terms are ~1e-16 and the four coplanar corners come out differing in
  // the last bits. A single-slice volume then reports a range of ~1e-14 rather than 0,
  // so the guard has to be on the step count, not on an exact zero range.
  describe('with a degenerate slice range', () => {
    it.each([
      ['a single-slice volume', { min: 5, max: 5, current: 5 }, 1],
      // The residue a non-identity rotation leaves on a one-slice volume.
      [
        'a single slice under a rotated normal',
        { min: 5, max: 5 + 3e-14, current: 5 },
        1,
      ],
      // Spacing wider than the range rounds to zero steps just the same.
      ['spacing wider than the range', { min: 0, max: 0.4, current: 0 }, 1],
      ['zero spacing', { min: 0, max: 10, current: 0 }, 0],
      ['negative spacing', { min: 0, max: 10, current: 0 }, -1],
      ['non-finite spacing', { min: 0, max: 10, current: 0 }, NaN],
      ['undefined spacing', { min: 0, max: 10, current: 0 }, undefined],
    ])('returns the camera unchanged for %s', (_label, sliceRange, spacing) => {
      const { newFocalPoint, newPosition } = snapFocalPointToSlice(
        focalPoint,
        position,
        sliceRange,
        viewPlaneNormal,
        spacing,
        0
      );

      expect(newFocalPoint).toEqual(focalPoint);
      expect(newPosition).toEqual(position);
    });

    it('never returns NaN components, whatever delta is asked for', () => {
      const { newFocalPoint, newPosition } = snapFocalPointToSlice(
        focalPoint,
        position,
        { min: 5, max: 5, current: 5 },
        viewPlaneNormal,
        1,
        3
      );

      [...newFocalPoint, ...newPosition].forEach((component) => {
        expect(Number.isFinite(component)).toBe(true);
      });
    });

    it('returns copies so the caller cannot mutate the camera it passed in', () => {
      const { newFocalPoint, newPosition } = snapFocalPointToSlice(
        focalPoint,
        position,
        { min: 5, max: 5, current: 5 },
        viewPlaneNormal,
        1,
        0
      );

      expect(newFocalPoint).not.toBe(focalPoint);
      expect(newPosition).not.toBe(position);
    });
  });
});
