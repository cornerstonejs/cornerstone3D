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
  describe('with a degenerate slice range', () => {
    it.each([
      ['a single-slice volume', { min: 5, max: 5, current: 5 }, 1],
      ['zero spacing', { min: 0, max: 10, current: 0 }, 0],
      ['non-finite spacing', { min: 0, max: 10, current: 0 }, NaN],
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
