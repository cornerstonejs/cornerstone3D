import transformWorldToIndex from './transformWorldToIndex';
import transformIndexToWorld from './transformIndexToWorld';
import uuidv4 from './uuidv4';
import { createLocalVolume } from '../loaders/volumeLoader';
import cache from '../cache/cache';
import type {
  AABB3,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point3,
} from '../types';

/**
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

  const ijkTopLeft: Point3 = [
    Math.min(minX, maxX),
    Math.min(minY, maxY),
    Math.min(minZ, maxZ),
  ];

  const boundingBoxOriginWorld = transformIndexToWorld(
    referencedVolume.imageData,
    ijkTopLeft
  );
  const dimensions: Point3 = [
    Math.abs(maxX - minX) + 1,
    Math.abs(maxY - minY) + 1,
    Math.abs(maxZ - minZ) + 1,
  ];

  const { targetBuffer } = options;
  const subVolumeOptions = {
    metadata,
    dimensions,
    spacing,
    origin: boundingBoxOriginWorld,
    direction,
    targetBuffer,
    scalarData:
      targetBuffer?.type === 'Float32Array'
        ? new Float32Array(dimensions[0] * dimensions[1] * dimensions[2])
        : undefined,
  };

  const subVolume = createLocalVolume(uuidv4(), subVolumeOptions);

  const subVolumeData = subVolume.voxelManager.getCompleteScalarDataArray();
  const subVolumeSliceSize = dimensions[0] * dimensions[1];
  const refVolumeSliceSize = refVolumeDim[0] * refVolumeDim[1];
  const refVolumeData =
    referencedVolume.voxelManager.getCompleteScalarDataArray() as PixelDataTypedArray;

  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      // Get the position of the first voxel of a row and copy the entire row.
      // That is possible because the volumes have the same orientation.
      const rowStartWorld = transformIndexToWorld(subVolume.imageData, [
        0,
        y,
        z,
      ]);

      const refVolumeRowStartIJK = transformWorldToIndex(
        referencedVolume.imageData,
        rowStartWorld
      );
      const refVolumeRowStartOffset =
        refVolumeRowStartIJK[2] * refVolumeSliceSize +
        refVolumeRowStartIJK[1] * refVolumeDim[0] +
        refVolumeRowStartIJK[0];

      const rowData = refVolumeData.slice(
        refVolumeRowStartOffset,
        refVolumeRowStartOffset + dimensions[0]
      );
      const subVolumeLineStartOffset =
        z * subVolumeSliceSize + y * dimensions[0];

      // @ts-expect-error
      subVolumeData.set(rowData, subVolumeLineStartOffset);
    }
  }

  subVolume.voxelManager.setCompleteScalarDataArray(subVolumeData);

  // cache.putVolumeSync(subVolume.volumeId, subVolume);

  return subVolume;
}

export { createSubVolume as default, createSubVolume };
