import { vec3 } from 'gl-matrix';
import type { ActorSliceRange, Point3 } from '../types';

/**
 * Given a number of frames, `deltaFrames`,
 * move the `focalPoint` and camera `position` so that it moves forward/backwards
 * `deltaFrames` in the camera's normal direction, and snaps to the nearest frame.
 *
 * @param focalPoint - The focal point to move.
 * @param position - The camera position to move.
 * @param sliceRange - The scroll range used to find the current
 * position in the stack, as well as prevent scrolling past the extent of the volume.
 * @param viewPlaneNormal - The normal direction of the camera.
 * @param spacingInNormalDirection - The spacing of frames the normal direction of the camera.
 * @param deltaFrames - The number of frames to jump.
 *
 * @returns The `newFocalPoint` and `newPosition` of the camera.
 */
export default function snapFocalPointToSlice(
  focalPoint: Point3,
  position: Point3,
  sliceRange: ActorSliceRange,
  viewPlaneNormal: Point3,
  spacingInNormalDirection: number,
  deltaFrames: number
): { newFocalPoint: Point3; newPosition: Point3 } {
  const { min, max, current } = sliceRange;

  // How many steps there are in this direction. Computed before the guard below
  // because the guard tests it.
  const steps = Math.round((max - min) / spacingInNormalDirection);

  // A single-slice volume collapses the range to zero, which makes the fraction
  // below 0 / 0 = NaN. That NaN reaches newFocalPoint and newPosition, and a camera
  // whose focal point and position are both NaN has no direction of projection at
  // all: vtk.js falls back to its default axial direction while the view up stays on
  // the acquisition plane, leaving a basis that spans no plane and renders nothing.
  // There is no slice to snap to in that case, so leave the camera alone.
  //
  // The test is on `steps` rather than only on the raw range because getSliceRange
  // measures that range by rotating the volume's corners until the normal points at
  // +X and taking min/max of the X components. The rotation is the identity only for
  // an axis-aligned positive normal; for an antiparallel or oblique one its
  // off-diagonal terms are ~1e-16, so the coplanar corners of a one-slice volume come
  // out differing in the last bits and the range is something like 3e-14 rather than
  // 0. `steps` rounds both shapes of it to 0.
  //
  // `!(spacingInNormalDirection > 0)` folds together zero, negative, NaN and
  // undefined spacing, which produce the same NaN by a different route. It is needed
  // in its own right, since `steps` is NaN when spacing is and `NaN <= 0` is false.
  //
  // getVolumeViewportScrollInfo and getPlanarVolumeSliceNavigationState guard the
  // same degenerate range; all three agree on what "can't scroll" means.
  if (steps <= 0 || max - min === 0 || !(spacingInNormalDirection > 0)) {
    return {
      newFocalPoint: [...focalPoint] as Point3,
      newPosition: [...position] as Point3,
    };
  }

  // Get the current offset off the camera position so we can add it on at the end.
  const posDiffFromFocalPoint = vec3.create();

  vec3.sub(posDiffFromFocalPoint, position as vec3, focalPoint as vec3);

  // Find out current frameIndex
  const fraction = (current - min) / (max - min);
  const floatingStepNumber = fraction * steps;
  let frameIndex = Math.round(floatingStepNumber);

  // Dolly the focal point back to min slice focal point.
  let newFocalPoint = [
    focalPoint[0] -
      viewPlaneNormal[0] * floatingStepNumber * spacingInNormalDirection,
    focalPoint[1] -
      viewPlaneNormal[1] * floatingStepNumber * spacingInNormalDirection,
    focalPoint[2] -
      viewPlaneNormal[2] * floatingStepNumber * spacingInNormalDirection,
  ] as Point3;

  // Increment the slice number by deltaFrames.
  frameIndex += deltaFrames;

  // Clamp sliceNumber to volume.
  if (frameIndex > steps) {
    frameIndex = steps;
  } else if (frameIndex < 0) {
    frameIndex = 0;
  }

  // Dolly the focal towards to the correct frame focal point.
  const newSlicePosFromMin = frameIndex * spacingInNormalDirection;

  newFocalPoint = [
    newFocalPoint[0] + viewPlaneNormal[0] * newSlicePosFromMin,
    newFocalPoint[1] + viewPlaneNormal[1] * newSlicePosFromMin,
    newFocalPoint[2] + viewPlaneNormal[2] * newSlicePosFromMin,
  ] as Point3;

  const newPosition = [
    newFocalPoint[0] + posDiffFromFocalPoint[0],
    newFocalPoint[1] + posDiffFromFocalPoint[1],
    newFocalPoint[2] + posDiffFromFocalPoint[2],
  ] as Point3;

  return { newFocalPoint, newPosition };
}
