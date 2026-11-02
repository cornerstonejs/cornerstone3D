import { updatePlaneRestriction } from '../src/utilities/updatePlaneRestriction';

const FOR = '1.2.3.4';

/** Compares a Point3 against a plain array, allowing for Float32Array. */
function expectVec(actual, expected) {
  expect(actual).toBeTruthy();
  expect(Array.from(actual)).toHaveLength(expected.length);
  Array.from(actual).forEach((value, i) => {
    expect(value).toBeCloseTo(expected[i], 5);
  });
}

/**
 * Builds the reference that a camera produces: a restriction that already
 * holds an exact pair of in-plane vectors from the cross products of the
 * display.
 */
function cameraReference(point = [10, 20, 5]) {
  return {
    FrameOfReferenceUID: FOR,
    cameraFocalPoint: [10, 20, 5],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
    planeRestriction: {
      FrameOfReferenceUID: FOR,
      point,
      inPlaneVector1: [0, -1, 0],
      inPlaneVector2: [-1, 0, 0],
    },
  };
}

describe('updatePlaneRestriction', () => {
  describe('guards', () => {
    it('creates no restriction without a FrameOfReferenceUID', () => {
      const reference = {};
      expect(updatePlaneRestriction([[1, 2, 3]], reference)).toBeUndefined();
      expect(reference.planeRestriction).toBeUndefined();
    });

    it('creates no restriction for an empty point list', () => {
      const reference = { FrameOfReferenceUID: FOR };
      expect(updatePlaneRestriction([], reference)).toBeUndefined();
      expect(reference.planeRestriction).toBeUndefined();
    });
  });

  describe('a single point', () => {
    // A restriction states compatibility, and one point supports no
    // orientation. A camera pair here would claim that the point lies in one
    // plane only, and every viewport of another orientation would report that
    // the viewport cannot show the point.
    it('clears the in-plane vectors of the camera', () => {
      const reference = cameraReference();

      updatePlaneRestriction([[10, 20, 5]], reference);

      expect(reference.planeRestriction.inPlaneVector1).toBeNull();
      expect(reference.planeRestriction.inPlaneVector2).toBeNull();
    });

    it('leaves the top level orientation of the reference alone', () => {
      // viewUp and viewPlaneNormal restore the view, so the point must not
      // touch either one.
      const reference = cameraReference();

      updatePlaneRestriction([[10, 20, 5]], reference);

      expect(reference.viewUp).toEqual([0, -1, 0]);
      expect(reference.viewPlaneNormal).toEqual([0, 0, 1]);
    });

    it('records the point on a restriction that it creates', () => {
      const reference = { FrameOfReferenceUID: FOR };

      updatePlaneRestriction([[1, 2, 3]], reference);

      expect(reference.planeRestriction.inPlaneVector1).toBeNull();
      expect(reference.planeRestriction.inPlaneVector2).toBeNull();
      expect(reference.planeRestriction.point).toEqual([1, 2, 3]);
    });
  });

  describe('two points', () => {
    it('uses the vector between the two points, and no second vector', () => {
      const reference = cameraReference([0, 0, 0]);

      updatePlaneRestriction(
        [
          [0, 0, 0],
          [0, 10, 0],
        ],
        reference
      );

      expectVec(reference.planeRestriction.inPlaneVector1, [0, -1, 0]);
      expect(reference.planeRestriction.inPlaneVector2).toBeNull();
    });

    it('clears a camera pair, because two points pin no plane', () => {
      const reference = cameraReference([0, 0, 0]);

      updatePlaneRestriction(
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
        reference
      );

      expectVec(reference.planeRestriction.inPlaneVector1, [-1, 0, 0]);
      expect(reference.planeRestriction.inPlaneVector2).toBeNull();
    });
  });

  describe('the in-plane vector gate', () => {
    const polyline = [
      [0, 0, 0],
      [5, 0, 0],
      [10, 5, 0],
      [10, 0, 0],
      [0, 5, 0],
      [3, 5, 0],
    ];

    it('reads no points when the restriction already holds a pair', () => {
      const reference = cameraReference([0, 0, 0]);
      const { inPlaneVector1, inPlaneVector2 } = reference.planeRestriction;

      updatePlaneRestriction(polyline, reference);

      // The same arrays, and not a recomputed copy.
      expect(reference.planeRestriction.inPlaneVector1).toBe(inPlaneVector1);
      expect(reference.planeRestriction.inPlaneVector2).toBe(inPlaneVector2);
    });

    it('reads the points when forceInPlaneVectors is set', () => {
      const reference = cameraReference([0, 0, 0]);

      updatePlaneRestriction(polyline, reference, {
        forceInPlaneVectors: true,
      });

      expectVec(reference.planeRestriction.inPlaneVector1, [-1, 0, 0]);
      expectVec(reference.planeRestriction.inPlaneVector2, [0, 1, 0]);
    });

    it('reads the points when the restriction holds only a first vector', () => {
      const reference = cameraReference([0, 0, 0]);
      reference.planeRestriction.inPlaneVector2 = null;

      updatePlaneRestriction(polyline, reference);

      expectVec(reference.planeRestriction.inPlaneVector1, [-1, 0, 0]);
      expectVec(reference.planeRestriction.inPlaneVector2, [0, 1, 0]);
    });
  });

  describe('the second in-plane vector', () => {
    it('takes the most orthogonal candidate, and not the first one', () => {
      // inPlaneVector1 comes from points[0] - points[3], which is [-1, 0, 0].
      // The scan starts at index 2. The candidate at index 2 is 0.894
      // collinear, and the older code returned that candidate. The candidate
      // at index 4 is a right angle, so the code must return that one.
      const reference = { FrameOfReferenceUID: FOR };

      updatePlaneRestriction(
        [
          [0, 0, 0],
          [5, 0, 0],
          [10, 5, 0],
          [10, 0, 0],
          [0, 5, 0],
          [3, 5, 0],
        ],
        reference
      );

      expectVec(reference.planeRestriction.inPlaneVector1, [-1, 0, 0]);
      expectVec(reference.planeRestriction.inPlaneVector2, [0, 1, 0]);
    });

    it('rejects an anti-parallel candidate', () => {
      // Every candidate lies on the x axis, so no candidate pins a second
      // direction. The candidate at index 2 is anti-parallel: an unsigned
      // comparison would accept that candidate.
      const reference = { FrameOfReferenceUID: FOR };

      updatePlaneRestriction(
        [
          [0, 0, 0],
          [1, 0, 0],
          [-4, 0, 0],
          [2, 0, 0],
        ],
        reference
      );

      expectVec(reference.planeRestriction.inPlaneVector1, [1, 0, 0]);
      expect(reference.planeRestriction.inPlaneVector2).toBeNull();
    });

    it('keeps the existing vector when no candidate is computed', () => {
      // Three collinear points give a first vector and no usable candidate.
      // The second vector of the camera describes the same plane, so that
      // vector must survive.
      const reference = cameraReference([0, 0, 0]);

      updatePlaneRestriction(
        [
          [0, 0, 0],
          [0, 5, 0],
          [0, 10, 0],
        ],
        reference,
        { forceInPlaneVectors: true }
      );

      expectVec(reference.planeRestriction.inPlaneVector1, [0, -1, 0]);
      expectVec(reference.planeRestriction.inPlaneVector2, [-1, 0, 0]);
    });
  });

  describe('the restriction point and the focal point', () => {
    it('moves the focal point to the plane of the new point', () => {
      const reference = cameraReference();

      updatePlaneRestriction([[30, 40, 9]], reference);

      expect(reference.planeRestriction.point).toEqual([30, 40, 9]);
      // The depth follows the new point, and the pan does not move.
      expectVec(reference.cameraFocalPoint, [10, 20, 9]);
    });

    it('leaves the focal point alone for a point in the same plane', () => {
      const reference = cameraReference();

      updatePlaneRestriction([[30, 40, 5]], reference);

      expect(reference.planeRestriction.point).toEqual([30, 40, 5]);
      expectVec(reference.cameraFocalPoint, [10, 20, 5]);
    });

    it('leaves the focal point alone when the point does not move', () => {
      const reference = cameraReference();
      const { cameraFocalPoint } = reference;

      updatePlaneRestriction([[10, 20, 5]], reference);

      expect(reference.cameraFocalPoint).toBe(cameraFocalPoint);
    });

    it('updates the point without a camera on the reference', () => {
      const reference = { FrameOfReferenceUID: FOR };
      updatePlaneRestriction([[1, 2, 3]], reference);

      updatePlaneRestriction([[4, 5, 6]], reference);

      expect(reference.planeRestriction.point).toEqual([4, 5, 6]);
      expect(reference.cameraFocalPoint).toBeUndefined();
    });
  });
});
