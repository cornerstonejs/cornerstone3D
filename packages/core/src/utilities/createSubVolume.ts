import transformIndexToWorld from './transformIndexToWorld';
import uuidv4 from './uuidv4';
import { createLocalVolume } from '../loaders/volumeLoader';
import cache from '../cache/cache';
import { getBufferConfiguration } from './getBufferConfiguration';
import type {
  AABB3,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point3,
} from '../types';

/**
 * Creates a new volume that contains a copy of the voxels of the referenced
 * volume within the given IJK bounding box. The sub-volume has the same
 * orientation and spacing as the referenced volume, which is what allows rows
 * to be copied directly between the two index spaces.
 *
 * @param boundsIJK - Array that contains [[minX, maxX], [minY, maxY], [minZ, maxZ]]
 */
function createSubVolume(
  referencedVolumeId: string,
  boundsIJK: AABB3,
  options: {
    targetBuffer?: {
      type: PixelDataTypedArrayString;
    };
  } = {}
) {
  const referencedVolume = cache.getVolume(referencedVolumeId);

  if (!referencedVolume) {
    throw new Error(
      `Referenced volume with id ${referencedVolumeId} does not exist.`
    );
  }

  const {
    metadata,
    spacing,
    direction,
    dimensions: refVolumeDim,
  } = referencedVolume;

  const { minX, maxX, minY, maxY, minZ, maxZ } = boundsIJK;

  // Clamp to the referenced volume extents so out-of-range bounds (eg: from a
  // drag that ends outside of the canvas) cannot read/write out of range.
  const clamp = (value: number, max: number) =>
    Math.min(Math.max(value, 0), max);

  const ijkTopLeft: Point3 = [
    clamp(Math.min(minX, maxX), refVolumeDim[0] - 1),
    clamp(Math.min(minY, maxY), refVolumeDim[1] - 1),
    clamp(Math.min(minZ, maxZ), refVolumeDim[2] - 1),
  ];
  const ijkBottomRight: Point3 = [
    clamp(Math.max(minX, maxX), refVolumeDim[0] - 1),
    clamp(Math.max(minY, maxY), refVolumeDim[1] - 1),
    clamp(Math.max(minZ, maxZ), refVolumeDim[2] - 1),
  ];

  const boundingBoxOriginWorld = transformIndexToWorld(
    referencedVolume.imageData,
    ijkTopLeft
  );
  const dimensions: Point3 = [
    ijkBottomRight[0] - ijkTopLeft[0] + 1,
    ijkBottomRight[1] - ijkTopLeft[1] + 1,
    ijkBottomRight[2] - ijkTopLeft[2] + 1,
  ];

  const { targetBuffer } = options;
  const { TypedArrayConstructor } = getBufferConfiguration(
    targetBuffer?.type ?? 'Float32Array',
    dimensions[0] * dimensions[1] * dimensions[2]
  );
  const subVolumeData = new TypedArrayConstructor(
    dimensions[0] * dimensions[1] * dimensions[2]
  ) as PixelDataTypedArray;

  const subVolumeSliceSize = dimensions[0] * dimensions[1];
  const refVolumeSliceSize = refVolumeDim[0] * refVolumeDim[1];
  const refVoxelManager = referencedVolume.voxelManager;

  // Copying rows directly between the index spaces is possible because both
  // volumes have the same orientation. Prefer per-slice backing arrays to
  // avoid materializing a full copy of the referenced volume.
  let refVolumeData: PixelDataTypedArray = null;
  const getRefSliceData = (refSlice: number): PixelDataTypedArray => {
    const sliceData = refVoxelManager.getSliceBackingArray(refSlice);

    if (sliceData) {
      return sliceData;
    }

    refVolumeData ??=
      refVoxelManager.getCompleteScalarDataArray() as PixelDataTypedArray;

    return refVolumeData.subarray(
      refSlice * refVolumeSliceSize,
      (refSlice + 1) * refVolumeSliceSize
    ) as PixelDataTypedArray;
  };

  for (let z = 0; z < dimensions[2]; z++) {
    const refSliceData = getRefSliceData(ijkTopLeft[2] + z);

    for (let y = 0; y < dimensions[1]; y++) {
      const refRowStartOffset =
        (ijkTopLeft[1] + y) * refVolumeDim[0] + ijkTopLeft[0];
      const subVolumeRowStartOffset = z * subVolumeSliceSize + y * dimensions[0];

      subVolumeData.set(
        refSliceData.subarray(
          refRowStartOffset,
          refRowStartOffset + dimensions[0]
        ),
        subVolumeRowStartOffset
      );
    }
  }

  const subVolume = createLocalVolume(uuidv4(), {
    metadata,
    dimensions,
    spacing,
    origin: boundingBoxOriginWorld,
    direction,
    targetBuffer,
    scalarData: subVolumeData,
  });

  // The slice images created by createLocalVolume are subarray views of
  // `subVolumeData`, so it can be installed as the contiguous backing store
  // giving consumers copy-free access through `getScalarData`.
  subVolume.voxelManager.setScalarData(subVolumeData);

  return subVolume;
}

export { createSubVolume as default, createSubVolume };
