import { vec3 } from 'gl-matrix';
import getClosestImageId from '../../../utilities/getClosestImageId';
import type { IImageVolume, Point3 } from '../../../types';
import { getVolumeImageIdIndexWorldPoint } from './planarSliceBasis';
import type { PlanarViewState } from './PlanarViewportTypes';

/**
 * Converts the slice of a planar view state between the volume path and the
 * image path that draws the acquired frames of the same volume.
 *
 * The volume path keeps a world point (`volumePoint`), and the image path
 * keeps an index into its own image ids (`stackIndex`). The conversion goes
 * through the image id, so the two paths can list the frames in different
 * orders.
 *
 * @param args.slice - the slice of the current view state
 * @param args.toVolumePath - true for a change to the volume path
 * @param args.imageVolume - the volume that both paths draw
 * @param args.imageIds - the image ids of the image path
 * @param args.currentImageIdIndex - the index that the image path draws now,
 * for a slice that does not state one
 * @param args.inPlanePoint - a point whose position in the acquisition plane
 * the volume point keeps, so a sagittal or coronal view returns to the same
 * column after a visit to the acquisition plane
 * @returns the converted slice, or `undefined` when it cannot be converted
 */
export function convertAcquiredFrameSlice(args: {
  slice: PlanarViewState['slice'];
  toVolumePath: boolean;
  imageVolume: IImageVolume;
  imageIds: string[];
  currentImageIdIndex?: number;
  inPlanePoint?: Point3;
}): PlanarViewState['slice'] | undefined {
  const { slice, toVolumePath, imageVolume, imageIds } = args;

  if (slice?.kind === (toVolumePath ? 'volumePoint' : 'stackIndex')) {
    return slice;
  }

  if (toVolumePath) {
    const imageIdIndex =
      slice?.kind === 'stackIndex'
        ? slice.imageIdIndex
        : args.currentImageIdIndex;
    const sliceWorldPoint =
      typeof imageIdIndex === 'number'
        ? volumePointOfAcquiredFrame(
            imageVolume,
            imageIds,
            imageIdIndex,
            args.inPlanePoint
          )
        : undefined;

    return sliceWorldPoint ? { kind: 'volumePoint', sliceWorldPoint } : slice;
  }

  if (slice?.kind !== 'volumePoint') {
    return typeof args.currentImageIdIndex === 'number'
      ? { kind: 'stackIndex', imageIdIndex: args.currentImageIdIndex }
      : slice;
  }

  const imageIdIndex = acquiredFrameIndexOfVolumePoint(
    imageVolume,
    imageIds,
    slice.sliceWorldPoint
  );

  return typeof imageIdIndex === 'number'
    ? { kind: 'stackIndex', imageIdIndex }
    : undefined;
}

/** The scan axis of a volume: the normal of its acquired frames. */
function scanAxisOf(imageVolume: IImageVolume): Point3 {
  return [
    imageVolume.direction[6],
    imageVolume.direction[7],
    imageVolume.direction[8],
  ];
}

/**
 * The index in `imageIds` of the acquired frame nearest to a world point,
 * measured along the scan axis. A `viewPlaneNormal` that is not parallel to
 * the scan axis gives no frame.
 */
export function acquiredFrameIndexOfVolumePoint(
  imageVolume: IImageVolume,
  imageIds: string[],
  sliceWorldPoint: Point3,
  viewPlaneNormal: Point3 = scanAxisOf(imageVolume)
): number | undefined {
  const imageId = getClosestImageId(
    imageVolume,
    sliceWorldPoint,
    viewPlaneNormal,
    { ignoreSpacing: true }
  );
  const imageIdIndex = imageId ? imageIds.indexOf(imageId) : -1;

  return imageIdIndex >= 0 ? imageIdIndex : undefined;
}

/**
 * A world point on an acquired frame. With `inPlanePoint`, the point is
 * `inPlanePoint` moved along the scan axis onto the frame; otherwise it is the
 * center of the frame.
 */
export function volumePointOfAcquiredFrame(
  imageVolume: IImageVolume,
  imageIds: string[],
  imageIdIndex: number,
  inPlanePoint?: Point3
): Point3 | undefined {
  const volumeIndex = imageVolume.imageIds?.indexOf(imageIds[imageIdIndex]);
  const framePoint = getVolumeImageIdIndexWorldPoint(
    imageVolume,
    volumeIndex >= 0 ? volumeIndex : imageIdIndex
  );

  if (!framePoint || !inPlanePoint) {
    return framePoint;
  }

  const scanAxis = scanAxisOf(imageVolume) as unknown as vec3;
  const offset = vec3.sub(
    vec3.create(),
    framePoint as unknown as vec3,
    inPlanePoint as unknown as vec3
  );
  const point = vec3.scaleAndAdd(
    vec3.create(),
    inPlanePoint as unknown as vec3,
    scanAxis,
    vec3.dot(offset, scanAxis)
  );

  return [point[0], point[1], point[2]];
}
