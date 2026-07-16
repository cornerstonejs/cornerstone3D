import { vec3 } from 'gl-matrix';
import {
  getViewportPlane,
  intersectPlanes,
  projectPointToPlane,
  distancePointToPlane,
  clipWorldLineToViewportCanvas,
  areViewportsSpatiallyLinked,
  translateViewportAlongNormal,
  rotateViewportAroundWorldPoint,
} from './index';
import type { Plane } from './index';

/**
 * Minimal axial viewport stand-in: the canvas maps world x/y linearly with
 * the canvas center at the camera focal point.
 */
function createFakeAxialViewport({
  id = 'fakeViewport',
  focalPoint = [0, 0, 0],
  frameOfReferenceUID = 'FOR1',
  canvasSize = 500,
} = {}) {
  const half = canvasSize / 2;
  const camera = {
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
    focalPoint: [...focalPoint],
    position: [focalPoint[0], focalPoint[1], focalPoint[2] + 100],
    parallelScale: 100,
  };

  return {
    id,
    type: 'orthographic',
    renderingEngineId: 'fakeRenderingEngine',
    canvas: { clientWidth: canvasSize, clientHeight: canvasSize },
    getFrameOfReferenceUID: () => frameOfReferenceUID,
    getViewReference: () => undefined,
    getCamera: () => ({
      viewPlaneNormal: [...camera.viewPlaneNormal],
      viewUp: [...camera.viewUp],
      focalPoint: [...camera.focalPoint],
      position: [...camera.position],
      parallelScale: camera.parallelScale,
    }),
    setCamera: (newCamera) => {
      if (newCamera.focalPoint) {
        camera.focalPoint = [...newCamera.focalPoint];
      }
      if (newCamera.position) {
        camera.position = [...newCamera.position];
      }
      if (newCamera.viewUp) {
        camera.viewUp = [...newCamera.viewUp];
      }
    },
    render: () => undefined,
    worldToCanvas: (world) => [
      world[0] - camera.focalPoint[0] + half,
      world[1] - camera.focalPoint[1] + half,
    ],
    canvasToWorld: (canvasPos) => [
      canvasPos[0] - half + camera.focalPoint[0],
      canvasPos[1] - half + camera.focalPoint[1],
      camera.focalPoint[2],
    ],
  };
}

const zZeroPlane: Plane = { normal: [0, 0, 1], point: [0, 0, 0] };

describe('spatial utilities', () => {
  describe('distancePointToPlane', () => {
    it('returns the correct signed distance', () => {
      expect(distancePointToPlane([1, 2, 5], zZeroPlane)).toBeCloseTo(5);
      expect(distancePointToPlane([1, 2, -3], zZeroPlane)).toBeCloseTo(-3);
      expect(distancePointToPlane([7, -4, 0], zZeroPlane)).toBeCloseTo(0);
    });

    it('normalizes non-unit plane normals', () => {
      const plane: Plane = { normal: [0, 0, 10], point: [0, 0, 2] };
      expect(distancePointToPlane([0, 0, 7], plane)).toBeCloseTo(5);
    });
  });

  describe('projectPointToPlane', () => {
    it('projects onto the closest point of the plane', () => {
      expect(projectPointToPlane([1, 2, 5], zZeroPlane)).toEqual([1, 2, 0]);

      const obliquePlane: Plane = {
        normal: [1, 1, 0].map((v) => v / Math.sqrt(2)) as [
          number,
          number,
          number
        ],
        point: [0, 0, 0],
      };
      const projected = projectPointToPlane([1, 1, 3], obliquePlane);
      expect(distancePointToPlane(projected, obliquePlane)).toBeCloseTo(0);
      expect(projected[2]).toBeCloseTo(3);
    });
  });

  describe('intersectPlanes', () => {
    it('returns null for parallel planes', () => {
      expect(
        intersectPlanes(zZeroPlane, { normal: [0, 0, 1], point: [0, 0, 10] })
      ).toBeNull();
      expect(
        intersectPlanes(zZeroPlane, { normal: [0, 0, -1], point: [3, 4, 5] })
      ).toBeNull();
    });

    it('returns a stable line for orthogonal planes', () => {
      const sagittalPlane: Plane = { normal: [1, 0, 0], point: [10, 5, 5] };

      const line = intersectPlanes(zZeroPlane, sagittalPlane);
      expect(line).not.toBeNull();

      // Point satisfies both plane equations.
      expect(distancePointToPlane(line.point, zZeroPlane)).toBeCloseTo(0);
      expect(distancePointToPlane(line.point, sagittalPlane)).toBeCloseTo(0);

      // Direction lies in both planes (perpendicular to both normals),
      // i.e. parallel to the y axis here.
      expect(Math.abs(vec3.dot(line.direction, [0, 1, 0]))).toBeCloseTo(1);
      expect(vec3.length(line.direction)).toBeCloseTo(1);

      // Deterministic: the same inputs yield the same line.
      const again = intersectPlanes(zZeroPlane, sagittalPlane);
      expect(again.point).toEqual(line.point);
      expect(again.direction).toEqual(line.direction);
    });
  });

  describe('getViewportPlane', () => {
    it('returns the normalized camera plane', () => {
      const viewport = createFakeAxialViewport({ focalPoint: [1, 2, 3] });
      const plane = getViewportPlane(viewport as never);

      expect(plane).not.toBeNull();
      expect(plane.normal).toEqual([0, 0, 1]);
      expect(plane.point).toEqual([1, 2, 3]);
    });

    it('returns null for invalid viewports', () => {
      expect(getViewportPlane(null as never)).toBeNull();
      expect(
        getViewportPlane({
          getViewReference: () => undefined,
          getCamera: () => ({}),
        } as never)
      ).toBeNull();
    });
  });

  describe('clipWorldLineToViewportCanvas', () => {
    it('returns two clipped canvas points when the line is visible', () => {
      const viewport = createFakeAxialViewport({});

      // World line x=10, z=0, running along y: crosses the whole canvas.
      const clipped = clipWorldLineToViewportCanvas(
        { point: [10, 0, 0], direction: [0, 1, 0] },
        viewport as never
      );

      expect(clipped).not.toBeNull();
      const [start, end] = clipped;
      expect(start[0]).toBeCloseTo(260);
      expect(end[0]).toBeCloseTo(260);
      expect(Math.min(start[1], end[1])).toBeCloseTo(0);
      expect(Math.max(start[1], end[1])).toBeCloseTo(500);
    });

    it('returns null when the line misses the canvas', () => {
      const viewport = createFakeAxialViewport({});

      expect(
        clipWorldLineToViewportCanvas(
          { point: [1000, 0, 0], direction: [0, 1, 0] },
          viewport as never
        )
      ).toBeNull();
    });

    it('returns null for a line perpendicular to the view plane', () => {
      const viewport = createFakeAxialViewport({});

      expect(
        clipWorldLineToViewportCanvas(
          { point: [0, 0, 0], direction: [0, 0, 1] },
          viewport as never
        )
      ).toBeNull();
    });
  });

  describe('areViewportsSpatiallyLinked', () => {
    it('links viewports with the same FrameOfReferenceUID', () => {
      const a = createFakeAxialViewport({
        id: 'a',
        frameOfReferenceUID: 'FOR1',
      });
      const b = createFakeAxialViewport({
        id: 'b',
        frameOfReferenceUID: 'FOR1',
      });

      expect(
        areViewportsSpatiallyLinked(a as never, b as never, {
          policy: 'frameOfReferenceUID',
        })
      ).toBe(true);
    });

    it('rejects unrelated viewports by default', () => {
      const a = createFakeAxialViewport({
        id: 'a',
        frameOfReferenceUID: 'FOR1',
      });
      const b = createFakeAxialViewport({
        id: 'b',
        frameOfReferenceUID: 'FOR2',
      });

      expect(
        areViewportsSpatiallyLinked(a as never, b as never, {
          policy: 'frameOfReferenceUID',
        })
      ).toBe(false);

      // Viewports without a frame of reference are never linked either.
      const c = createFakeAxialViewport({ id: 'c' });
      (c as { getFrameOfReferenceUID }).getFrameOfReferenceUID = () =>
        undefined;
      expect(
        areViewportsSpatiallyLinked(a as never, c as never, {
          policy: 'frameOfReferenceUID',
        })
      ).toBe(false);
    });

    it('links different frames of reference when a registration transform exists', () => {
      const a = createFakeAxialViewport({
        id: 'a',
        frameOfReferenceUID: 'FOR1',
      });
      const b = createFakeAxialViewport({
        id: 'b',
        frameOfReferenceUID: 'FOR2',
      });

      const registrationTransforms = new Map([
        ['FOR1:FOR2', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
      ]);

      expect(
        areViewportsSpatiallyLinked(a as never, b as never, {
          policy: 'frameOfReferenceUID',
          registrationTransforms,
        })
      ).toBe(true);
    });

    it('respects explicit links', () => {
      const a = createFakeAxialViewport({ id: 'a' });
      const b = createFakeAxialViewport({ id: 'b' });

      expect(
        areViewportsSpatiallyLinked(a as never, b as never, {
          policy: 'explicit',
          explicitLinks: [{ sourceViewportId: 'a', targetViewportId: 'b' }],
        })
      ).toBe(true);

      expect(
        areViewportsSpatiallyLinked(a as never, b as never, {
          policy: 'explicit',
          explicitLinks: [{ sourceViewportId: 'a', targetViewportId: 'x' }],
        })
      ).toBe(false);

      expect(
        areViewportsSpatiallyLinked(a as never, b as never, {
          policy: 'explicit',
        })
      ).toBe(false);
    });
  });

  describe('translateViewportAlongNormal', () => {
    it('moves position and focal point along the view plane normal', () => {
      const viewport = createFakeAxialViewport({ focalPoint: [1, 2, 3] });

      const moved = translateViewportAlongNormal(viewport as never, 7);
      expect(moved).toBe(true);

      const camera = viewport.getCamera();
      expect(camera.focalPoint).toEqual([1, 2, 10]);
      expect(camera.position).toEqual([1, 2, 110]);
    });

    it('does nothing for a zero distance', () => {
      const viewport = createFakeAxialViewport({ focalPoint: [1, 2, 3] });
      expect(translateViewportAlongNormal(viewport as never, 0)).toBe(false);
      expect(viewport.getCamera().focalPoint).toEqual([1, 2, 3]);
    });
  });

  describe('rotateViewportAroundWorldPoint', () => {
    it('rotates the camera rigidly around the pivot', () => {
      const viewport = createFakeAxialViewport({ focalPoint: [0, 0, 0] });

      const rotated = rotateViewportAroundWorldPoint(
        viewport as never,
        [0, 0, 0],
        [0, 1, 0],
        Math.PI / 2
      );
      expect(rotated).toBe(true);

      const camera = viewport.getCamera();
      expect(camera.focalPoint[0]).toBeCloseTo(0);
      expect(camera.focalPoint[1]).toBeCloseTo(0);
      expect(camera.focalPoint[2]).toBeCloseTo(0);

      // position [0, 0, 100] rotated +90deg around y -> [100, 0, 0]
      expect(camera.position[0]).toBeCloseTo(100);
      expect(camera.position[1]).toBeCloseTo(0);
      expect(camera.position[2]).toBeCloseTo(0);

      // Camera distance is preserved.
      expect(
        vec3.distance(camera.position, camera.focalPoint)
      ).toBeCloseTo(100);

      // viewUp is perpendicular to the rotation axis here and unchanged.
      expect(camera.viewUp[0]).toBeCloseTo(0);
      expect(camera.viewUp[1]).toBeCloseTo(-1);
      expect(camera.viewUp[2]).toBeCloseTo(0);
    });
  });
});
