import { quat, vec3 } from 'gl-matrix';
import type { ICamera, Point2, Point3 } from '../../../types';
import type { ProjectionScale } from '../ViewportProjectionTypes';
import type { Volume3DProjectionFit } from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

function clonePoint2(point?: Point2): Point2 | undefined {
  return point ? [point[0], point[1]] : undefined;
}

function clonePoint3(point?: Point3): Point3 | undefined {
  return point ? [point[0], point[1], point[2]] : undefined;
}

/**
 * Clones a 3D camera payload so projection snapshots cannot mutate VTK state
 * through shared point arrays.
 */
export function cloneVolume3DCamera(camera: Volume3DCamera & ICamera) {
  return {
    ...camera,
    clippingRange: clonePoint2(camera.clippingRange),
    focalPoint: clonePoint3(camera.focalPoint),
    position: clonePoint3(camera.position),
    viewPlaneNormal: clonePoint3(camera.viewPlaneNormal),
    viewUp: clonePoint3(camera.viewUp),
  } as Volume3DCamera & ICamera;
}

/**
 * The length of the reference view up taken into the view plane below which
 * the camera looks along that view up (within about 0.06 degrees), so the
 * view up gives no direction in the view plane.
 */
const ROTATION_POLE_TOLERANCE = 1e-3;

/**
 * The rotation of a 3D view in degrees, from 0 up to 360: the angle about the
 * view plane normal from the reference view up, taken into the view plane,
 * to the view up of the camera, counterclockwise as seen from the camera, as
 * the legacy 3D viewport turned it. 0 without a reference.
 *
 * When the camera looks along the reference view up, that view up gives no
 * direction in the view plane, and the reference view plane normal does:
 * looking along the view up, its opposite is the reference, and looking
 * against the view up, the normal itself. That is where the reference view
 * up taken into the view plane goes when the camera orbits from the view of
 * rotation 0 to there, so the rotation keeps its value on that orbit. Without
 * a reference view plane normal the rotation there is 0.
 *
 * @param camera - The camera now.
 * @param referenceViewUp - The view up of rotation 0.
 * @param referenceViewPlaneNormal - The view plane normal of rotation 0.
 */
export function getVolume3DProjectionRotation(
  camera: Volume3DCamera & ICamera,
  referenceViewUp?: Point3,
  referenceViewPlaneNormal?: Point3
): number {
  const { viewPlaneNormal, viewUp } = camera;

  if (!referenceViewUp || !viewPlaneNormal || !viewUp) {
    return 0;
  }

  const normal = vec3.normalize(vec3.create(), viewPlaneNormal);
  const alongNormal = vec3.dot(referenceViewUp, normal);
  let reference = vec3.scaleAndAdd(
    vec3.create(),
    referenceViewUp,
    normal,
    -alongNormal
  );

  if (
    vec3.length(reference) < ROTATION_POLE_TOLERANCE &&
    referenceViewPlaneNormal
  ) {
    const secondAxis = vec3.scale(
      vec3.create(),
      referenceViewPlaneNormal,
      alongNormal > 0 ? -1 : 1
    );

    reference = vec3.scaleAndAdd(
      vec3.create(),
      secondAxis,
      normal,
      -vec3.dot(secondAxis, normal)
    );
  }

  if (vec3.length(reference) < 1e-6) {
    return 0;
  }

  const sine = vec3.dot(vec3.cross(vec3.create(), reference, viewUp), normal);
  const degrees =
    (Math.atan2(sine, vec3.dot(reference, viewUp)) * 180) / Math.PI;

  if (Math.abs(degrees) < 1e-9) {
    return 0;
  }

  return degrees < 0 ? degrees + 360 : degrees;
}

/**
 * Turns the view up of a 3D camera about its view plane normal by an angle
 * in degrees, counterclockwise as seen from the camera. The focal point, the
 * position and the zoom stay.
 *
 * @param camera - The camera to turn.
 * @param degrees - The angle of the turn.
 * @returns A camera with the turned view up.
 */
export function rollVolume3DCamera(
  camera: Volume3DCamera & ICamera,
  degrees: number
): Volume3DCamera & ICamera {
  const { viewPlaneNormal, viewUp } = camera;

  if (!viewPlaneNormal || !viewUp || !degrees) {
    return camera;
  }

  const turn = quat.setAxisAngle(
    quat.create(),
    vec3.normalize(vec3.create(), viewPlaneNormal),
    (degrees * Math.PI) / 180
  );
  const turnedViewUp = vec3.transformQuat(vec3.create(), viewUp, turn);

  return {
    ...camera,
    viewUp: [turnedViewUp[0], turnedViewUp[1], turnedViewUp[2]],
  };
}

/**
 * Reports 3D parallel scale as physical canvas spacing for projection callers.
 */
export function getVolume3DProjectionScale(args: {
  camera: Volume3DCamera & ICamera;
  canvasHeight: number;
}): ProjectionScale | undefined {
  const { camera, canvasHeight } = args;

  if (typeof camera.parallelScale !== 'number') {
    return;
  }

  return {
    kind: 'physical',
    mmPerCanvasPixel: (camera.parallelScale * 2) / Math.max(canvasHeight, 1),
  };
}

/**
 * Reports 3D position semantics as a focal point when one is available.
 */
export function getVolume3DProjectionPosition(
  camera: Volume3DCamera & ICamera
) {
  if (!camera.focalPoint) {
    return;
  }

  return {
    kind: 'focalPoint' as const,
    worldPoint: clonePoint3(camera.focalPoint) as Point3,
  };
}

/** The tangent of half an angle in degrees. */
function tanOfHalf(degrees: number): number {
  return Math.tan((degrees * Math.PI) / 360);
}

/**
 * Half the height of the view at the focal point, in world units: the
 * parallel scale of a parallel camera, and for a perspective camera the
 * distance of the camera times the tangent of half its view angle.
 */
function getViewHalfHeight(camera: Volume3DCamera & ICamera): number {
  if (camera.parallelProjection !== false) {
    return camera.parallelScale;
  }

  return (
    vec3.distance(camera.position, camera.focalPoint) *
    tanOfHalf(camera.viewAngle)
  );
}

/** Half the height of the view at the focal point in the fit. */
function getFitHalfHeight(
  camera: Volume3DCamera & ICamera,
  fit: Volume3DProjectionFit
): number {
  return camera.parallelProjection !== false
    ? fit.parallelScale
    : fit.distance * tanOfHalf(fit.viewAngle);
}

/**
 * The world vectors of the canvas axes: the view right, along the canvas x,
 * and the view down, along the canvas y.
 */
function getCanvasAxes(camera: Volume3DCamera & ICamera): {
  right: vec3;
  down: vec3;
} {
  const right = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), camera.viewUp, camera.viewPlaneNormal)
  );
  const down = vec3.cross(vec3.create(), right, camera.viewPlaneNormal);

  return { right, down: vec3.normalize(down, down) };
}

/**
 * The zoom of a 3D camera against its fit: 1 for the fit, 2 when the picture
 * is twice as large. See `Volume3DProjectionPresentation`.
 */
export function getVolume3DProjectionZoom(
  camera: Volume3DCamera & ICamera,
  fit: Volume3DProjectionFit
): number {
  return getFitHalfHeight(camera, fit) / getViewHalfHeight(camera);
}

/**
 * The pan of a 3D camera against its fit in canvas pixels on the screen:
 * where the focal point of the fit shows, less the centre of the canvas.
 */
export function getVolume3DProjectionPan(
  camera: Volume3DCamera & ICamera,
  fit: Volume3DProjectionFit,
  canvasHeight: number
): Point2 {
  const { right, down } = getCanvasAxes(camera);
  const pixelsPerWorldUnit = canvasHeight / (2 * getViewHalfHeight(camera));
  const offset = vec3.subtract(
    vec3.create(),
    fit.focalPoint,
    camera.focalPoint
  );

  return [
    vec3.dot(offset, right) * pixelsPerWorldUnit,
    vec3.dot(offset, down) * pixelsPerWorldUnit,
  ];
}

/**
 * The camera with a zoom and a pan against its fit. A parallel camera gets
 * the parallel scale of the zoom. A perspective camera moves along its view
 * plane normal to the distance of the zoom, and keeps its focal point and
 * its view angle. The pan then moves the focal point and the position in the
 * plane of the view. Without a pan, a zoom keeps the world point of
 * `anchorCanvas` under that canvas point, and without either the focal point.
 *
 * @param camera - The camera now.
 * @param fit - The fit of the viewport.
 * @param canvas - The size of the canvas in canvas pixels.
 * @param change - The zoom, the pan in canvas pixels at zoom 1, and the
 *   canvas point that a zoom keeps.
 * @returns The camera fields that change.
 */
export function withVolume3DProjectionZoomPan(
  camera: Volume3DCamera & ICamera,
  fit: Volume3DProjectionFit,
  canvas: { width: number; height: number },
  change: { zoom?: number; pan?: Point2; anchorCanvas?: Point2 }
): Pick<Volume3DCamera, 'focalPoint' | 'parallelScale' | 'position'> {
  const { right, down } = getCanvasAxes(camera);
  const zoom = Math.max(
    change.zoom ?? getVolume3DProjectionZoom(camera, fit),
    0.000001
  );
  const halfHeight = getViewHalfHeight(camera);
  const nextHalfHeight = getFitHalfHeight(camera, fit) / zoom;
  const worldUnitsPerPixel = (2 * halfHeight) / canvas.height;
  const nextWorldUnitsPerPixel = (2 * nextHalfHeight) / canvas.height;
  const inPlane = (canvasOffset: Point2, scale: number): vec3 =>
    vec3.scaleAndAdd(
      vec3.create(),
      vec3.scale(vec3.create(), right, canvasOffset[0] * scale),
      down,
      canvasOffset[1] * scale
    );
  const focalPoint = vec3.clone(camera.focalPoint);

  if (change.pan) {
    const depth = vec3.dot(
      vec3.subtract(vec3.create(), camera.focalPoint, fit.focalPoint),
      camera.viewPlaneNormal
    );

    vec3.subtract(
      focalPoint,
      fit.focalPoint,
      inPlane(
        [change.pan[0] * zoom, change.pan[1] * zoom],
        nextWorldUnitsPerPixel
      )
    );
    vec3.scaleAndAdd(focalPoint, focalPoint, camera.viewPlaneNormal, depth);
  } else if (change.anchorCanvas) {
    const fromCentre: Point2 = [
      change.anchorCanvas[0] - canvas.width / 2,
      change.anchorCanvas[1] - canvas.height / 2,
    ];

    vec3.add(focalPoint, focalPoint, inPlane(fromCentre, worldUnitsPerPixel));
    vec3.subtract(
      focalPoint,
      focalPoint,
      inPlane(fromCentre, nextWorldUnitsPerPixel)
    );
  }

  const distance =
    camera.parallelProjection !== false
      ? vec3.distance(camera.position, camera.focalPoint)
      : nextHalfHeight / tanOfHalf(camera.viewAngle);

  return {
    focalPoint: [focalPoint[0], focalPoint[1], focalPoint[2]],
    parallelScale:
      camera.parallelProjection !== false
        ? nextHalfHeight
        : camera.parallelScale,
    position: [
      ...vec3.scaleAndAdd(
        vec3.create(),
        focalPoint,
        camera.viewPlaneNormal,
        distance
      ),
    ] as Point3,
  };
}
