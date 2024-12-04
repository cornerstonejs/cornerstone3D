import { vec3 } from 'gl-matrix';
import type { Point3 } from '../types';
import { transformWorldToIndexContinuous } from './transformWorldToIndex';

/**
 * Calculates the volume direction vectors using the camera vectors.
 * @param imageData - Volume's image data
 * @param camera - Camera
 * @returns Direction vetors in world and index spaces
 */
function getVolumeDirectionVectors(imageData, camera) {
  const { viewUp, viewPlaneNormal } = camera;
  const ijkOrigin = transformWorldToIndexContinuous(imageData, [0, 0, 0]);

  const worldVecColDir = vec3.negate(vec3.create(), viewUp);
  const worldVecSliceDir = vec3.negate(vec3.create(), viewPlaneNormal);
  const worldVecRowDir = vec3.cross(
    vec3.create(),
    worldVecColDir,
    worldVecSliceDir
  );

  const ijkVecColDir = vec3.sub(
    vec3.create(),
    transformWorldToIndexContinuous(imageData, worldVecColDir as Point3),
    ijkOrigin
  );

  // const ijkVecSlice = vec3.negate(vec3.create(), viewPlaneNormal);
  const ijkVecSliceDir = vec3.sub(
    vec3.create(),
    transformWorldToIndexContinuous(imageData, worldVecSliceDir as Point3),
    ijkOrigin
  );

  vec3.normalize(ijkVecColDir, ijkVecColDir);
  vec3.normalize(ijkVecSliceDir, ijkVecSliceDir);

  const ijkVecRowDir = vec3.cross(vec3.create(), ijkVecColDir, ijkVecSliceDir);

  return {
    worldVecRowDir,
    worldVecColDir,
    worldVecSliceDir,
    ijkVecRowDir,
    ijkVecColDir,
    ijkVecSliceDir,
  };
}

export { getVolumeDirectionVectors as default, getVolumeDirectionVectors };
