import { vec3 } from 'gl-matrix';

export default function snapFocalPointToSlice(
  focalPoint,
  position,
  scrollRange,
  viewPlaneNormal,
  spacingInNormalDirection,
  deltaFrames
) {
  let { min, max, current } = scrollRange;

  // Get the current offset off the camera position so we can add it on at the end.
  const posDiffFromFocalPoint = vec3.create();

  vec3.sub(posDiffFromFocalPoint, position, focalPoint);

  // Now we can see how many steps there are in this direction
  const steps = Math.round((max - min) / spacingInNormalDirection);

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

  newFocalPoint = [
    newFocalPoint[0] + viewPlaneNormal[0] * newSlicePosFromMin,
    newFocalPoint[1] + viewPlaneNormal[1] * newSlicePosFromMin,
    newFocalPoint[2] + viewPlaneNormal[2] * newSlicePosFromMin,
  ];

  const newPosition = [
    newFocalPoint[0] + posDiffFromFocalPoint[0],
    newFocalPoint[1] + posDiffFromFocalPoint[1],
    newFocalPoint[2] + posDiffFromFocalPoint[2],
  ];

  return { newFocalPoint, newPosition };
}
