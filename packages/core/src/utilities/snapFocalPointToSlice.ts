import { vec3 } from 'gl-matrix';
import { ActorSliceRange, Point3 } from '../types';

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

  // Get the current offset off the camera position so we can add it on at the end.
  const posDiffFromFocalPoint = vec3.create();

  vec3.sub(posDiffFromFocalPoint, <vec3>position, <vec3>focalPoint);

  // Now we can see how many steps there are in this direction
  const steps = Math.round((max - min) / spacingInNormalDirection);

  // Find out current frameIndex
  const fraction = (current - min) / (max - min);
  const floatingStepNumber = fraction * steps;
  let frameIndex = Math.round(floatingStepNumber);

  // Dolly the focal point back to min slice focal point.
  let newFocalPoint = <Point3>[
    focalPoint[0] -
      viewPlaneNormal[0] * floatingStepNumber * spacingInNormalDirection,
    focalPoint[1] -
      viewPlaneNormal[1] * floatingStepNumber * spacingInNormalDirection,
    focalPoint[2] -
      viewPlaneNormal[2] * floatingStepNumber * spacingInNormalDirection,
  ];

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

  newFocalPoint = <Point3>[
    newFocalPoint[0] + viewPlaneNormal[0] * newSlicePosFromMin,
    newFocalPoint[1] + viewPlaneNormal[1] * newSlicePosFromMin,
    newFocalPoint[2] + viewPlaneNormal[2] * newSlicePosFromMin,
  ];

  const newPosition = <Point3>[
    newFocalPoint[0] + posDiffFromFocalPoint[0],
    newFocalPoint[1] + posDiffFromFocalPoint[1],
    newFocalPoint[2] + posDiffFromFocalPoint[2],
  ];

  return { newFocalPoint, newPosition };
}
