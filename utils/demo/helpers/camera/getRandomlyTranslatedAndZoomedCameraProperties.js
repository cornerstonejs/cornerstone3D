import { vec3 } from 'gl-matrix';

export default function getRandomlyTranslatedAndZoomedCameraProperties(
  camera,
  maxTranslateInMM
) {
  const { viewUp, viewPlaneNormal, parallelScale, position, focalPoint } =
    camera;

  // Modify the zoom by some factor
  const randomModifier = 0.5 + Math.random() - 0.5;
  const newParallelScale = parallelScale * randomModifier;

  // Move the camera in plane by some random number
  let viewRight = vec3.create(); // Get the X direction of the viewport

  vec3.cross(viewRight, viewUp, viewPlaneNormal);

  const randomPanX = maxTranslateInMM * (2.0 * Math.random() - 1);
  const randomPanY = maxTranslateInMM * (2.0 * Math.random() - 1);

  const diff = [0, 0, 0];

  // Pan X
  for (let i = 0; i <= 2; i++) {
    diff[i] += viewRight[i] * randomPanX;
  }

  // Pan Y
  for (let i = 0; i <= 2; i++) {
    diff[i] += viewUp[i] * randomPanY;
  }

  const newPosition = [];
  const newFocalPoint = [];

  for (let i = 0; i <= 2; i++) {
    newPosition[i] = position[i] + diff[i];
    newFocalPoint[i] = focalPoint[i] + diff[i];
  }

  return {
    focalPoint: newFocalPoint,
    position: newPosition,
    parallelScale: newParallelScale,
  };
}
