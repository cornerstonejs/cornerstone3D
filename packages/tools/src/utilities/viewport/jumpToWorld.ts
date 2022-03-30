import { VolumeViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { vec3 } from 'gl-matrix';

// Todo: merge this utility functionality with Crosshair _jump
/**
 * Uses the viewport's current camera to jump to a specific world coordinate
 * @param enabledElement - enabled element
 * @param jumpWorld - location in the world to jump to
 * @returns True if successful
 */
export default function jumpToWorld(
  viewport: Types.IVolumeViewport,
  jumpWorld: Types.Point3
): true | undefined {
  // if not instance of volumeViewport, return
  if (!(viewport instanceof VolumeViewport)) {
    return;
  }

  const { focalPoint } = viewport.getCamera();

  const delta: Types.Point3 = [0, 0, 0];
  vec3.sub(delta, jumpWorld, focalPoint);

  _applyShift(viewport, delta);

  return true;
}

function _applyShift(viewport, delta) {
  const camera = viewport.getCamera();
  const normal = camera.viewPlaneNormal;

  const dotProd = vec3.dot(delta, normal);
  const projectedDelta = vec3.fromValues(normal[0], normal[1], normal[2]);

  vec3.scale(projectedDelta, projectedDelta, dotProd);

  if (
    Math.abs(projectedDelta[0]) > 1e-3 ||
    Math.abs(projectedDelta[1]) > 1e-3 ||
    Math.abs(projectedDelta[2]) > 1e-3
  ) {
    const newFocalPoint: Types.Point3 = [0, 0, 0];
    const newPosition: Types.Point3 = [0, 0, 0];

    vec3.add(newFocalPoint, camera.focalPoint, projectedDelta);
    vec3.add(newPosition, camera.position, projectedDelta);

    viewport.setCamera({
      focalPoint: newFocalPoint,
      position: newPosition,
    });
    viewport.render();
  }
}
