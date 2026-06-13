import type { ICamera, Point2, Point3 } from '../../../types';
import type { ProjectionScale } from '../ViewportProjectionTypes';
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
