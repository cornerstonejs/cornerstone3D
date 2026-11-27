import type { ActorSliceRange, Point3 } from '../types';
import getVolumeSliceGrid, { getSliceGridIndex } from './getVolumeSliceGrid';

/**
 * Given a number of frames, `deltaFrames`,
 * move the `focalPoint` and camera `position` so that it moves forward/backwards
 * `deltaFrames` in the camera's normal direction, and snaps to the nearest frame
 * of the slice grid that is centred on the volume (see getVolumeSliceGrid).
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
  const grid = getVolumeSliceGrid(min, max, spacingInNormalDirection);

  // A single-slice volume, or a spacing that is zero, negative, NaN or
  // undefined, has no slice to snap to. A camera with a NaN focal point and
  // position renders nothing, so leave the camera alone. `maxIndex` also
  // rounds the ~1e-14 range that getSliceRange gives a one-slice volume under a
  // rotated normal to 0. getVolumeViewportScrollInfo and
  // getPlanarVolumeSliceNavigationState use the same grid.
  if (grid.maxIndex <= 0) {
    return {
      newFocalPoint: [...focalPoint] as Point3,
      newPosition: [...position] as Point3,
    };
  }

  // Snap to the centred slice grid (VSN-I-2, VSN-I-4), then step deltaFrames.
  const frameIndex = Math.min(
    Math.max(0, getSliceGridIndex(grid, current) + deltaFrames),
    grid.maxIndex
  );
  const offset = grid.start + frameIndex * grid.step - current;

  const newFocalPoint = [
    focalPoint[0] + viewPlaneNormal[0] * offset,
    focalPoint[1] + viewPlaneNormal[1] * offset,
    focalPoint[2] + viewPlaneNormal[2] * offset,
  ] as Point3;
  const newPosition = [
    position[0] + viewPlaneNormal[0] * offset,
    position[1] + viewPlaneNormal[1] * offset,
    position[2] + viewPlaneNormal[2] * offset,
  ] as Point3;

  return { newFocalPoint, newPosition };
}
