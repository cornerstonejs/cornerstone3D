import { vec3 } from 'gl-matrix';
import type { IVolumeViewport, Point3 } from '../../types';
import { clip } from '../../utilities/clip';
import { transformWorldToIndexContinuous } from '../../utilities/transformWorldToIndex';

/**
 * Finds the slice that `voxelManager.getSliceData` has to read for the plane
 * that the viewport shows: the IJK axis along the view plane normal, and the
 * storage index on that axis nearest to the focal point, toward the camera on
 * a tie.
 *
 * These are not the `slicePlane` and the `sliceIndex` of `getSliceViewInfo`,
 * which are a world axis and an index that counts in the view direction, on
 * the grid of the volume with the finest spacing along that direction.
 *
 * @param viewport - Volume viewport
 * @returns The arguments for `getSliceData` of the default volume, and
 * `planeIndex`, the slice to put the matrices on: the same one, or the view
 * plane's own index outside the volume
 */
export default function getCurrentSliceStorageLocation(
  viewport: IVolumeViewport
): { sliceIndex: number; slicePlane: number; planeIndex: number } {
  const { imageData, dimensions, direction } = viewport.getImageData();
  const { focalPoint, viewPlaneNormal } = viewport.getCamera();

  const cosines = [0, 1, 2].map((axis) =>
    vec3.dot(direction.slice(axis * 3, axis * 3 + 3) as Point3, viewPlaneNormal)
  );
  const alignments = cosines.map(Math.abs);
  const slicePlane = alignments.indexOf(Math.max(...alignments));
  const position = transformWorldToIndexContinuous(imageData, focalPoint);
  // Halfway between two slices, the renderer shows the one toward the camera.
  // The margin covers a single-precision focal point, as setPan gives.
  const margin = 1e-3;
  const index = Math.round(
    position[slicePlane] + margin * Math.sign(cosines[slicePlane])
  );
  // The focal point can lie outside of this volume, for example in a fusion
  const sliceIndex = clip(index, 0, dimensions[slicePlane] - 1);
  // On the outer face, the renderer can still show the end slice
  const planeIndex =
    Math.abs(position[slicePlane] - sliceIndex) <= 0.5 + margin
      ? sliceIndex
      : index;

  return { sliceIndex, slicePlane, planeIndex };
}
