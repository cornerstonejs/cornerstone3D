import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { getBoundingBoxAroundShapeIJK } from '../boundingBox/getBoundingBoxAroundShape';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

export type ThresholdInformation = {
  volume: Types.IImageVolume;
  lower: number;
  upper: number;
};

export type VolumeInfo = {
  imageData: vtkImageData;
  lower: number;
  upper: number;
  spacing: Types.Point3;
  dimensions: Types.Point3;
  volumeSize: number;
  voxelManager: Types.IVoxelManager<number> | Types.IVoxelManager<Types.RGB>;
};

const equalsCheck = (a, b) => {
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Given the center of a voxel in world coordinates, calculate the voxel
 * corners in world coords to calculate the voxel overlap in another volume
 */
export function getVoxelOverlap(
  imageData,
  dimensions,
  voxelSpacing,
  voxelCenter
) {
  // Pre-calculate half spacings
  const halfSpacingX = voxelSpacing[0] / 2;
  const halfSpacingY = voxelSpacing[1] / 2;
  const halfSpacingZ = voxelSpacing[2] / 2;

  // Pre-allocate array for 8 corners
  const voxelCornersIJK = new Array(8);

  // Calculate first corner
  voxelCornersIJK[0] = csUtils.transformWorldToIndex(imageData, [
    voxelCenter[0] - halfSpacingX,
    voxelCenter[1] - halfSpacingY,
    voxelCenter[2] - halfSpacingZ,
  ]) as Types.Point3;

  // Define offsets for remaining 7 corners
  const offsets = [
    [1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ];

  // Calculate remaining corners
  for (let i = 0; i < 7; i++) {
    const [xOff, yOff, zOff] = offsets[i];
    voxelCornersIJK[i + 1] = csUtils.transformWorldToIndex(imageData, [
      voxelCenter[0] + xOff * halfSpacingX,
      voxelCenter[1] + yOff * halfSpacingY,
      voxelCenter[2] + zOff * halfSpacingZ,
    ]) as Types.Point3;
  }

  return getBoundingBoxAroundShapeIJK(voxelCornersIJK, dimensions);
}

/**
 * Prepare a list of volume information objects for callback functions
 */
export function processVolumes(
  segmentationVolume: Types.IImageVolume,
  thresholdVolumeInformation: ThresholdInformation[]
) {
  const { spacing: segmentationSpacing } = segmentationVolume;
  const scalarDataLength =
    segmentationVolume.voxelManager.getScalarDataLength();

  // prepare a list of volume information objects for callback functions
  const volumeInfoList: VolumeInfo[] = [];
  let baseVolumeIdx = 0;
  for (let i = 0; i < thresholdVolumeInformation.length; i++) {
    const { imageData, spacing, dimensions, voxelManager } =
      thresholdVolumeInformation[i].volume;

    const volumeSize =
      thresholdVolumeInformation[i].volume.voxelManager.getScalarDataLength();
    // discover the index of the volume the segmentation data is based on
    if (
      volumeSize === scalarDataLength &&
      equalsCheck(spacing, segmentationSpacing)
    ) {
      baseVolumeIdx = i;
    }

    // prepare information used in callback functions
    const lower = thresholdVolumeInformation[i].lower;
    const upper = thresholdVolumeInformation[i].upper;

    volumeInfoList.push({
      imageData,
      lower,
      upper,
      spacing,
      dimensions,
      volumeSize,
      voxelManager,
    });
  }

  return {
    volumeInfoList,
    baseVolumeIdx,
  };
}

const segmentIndicesCache = new Map<
  string,
  { indices: number[]; isDirty: boolean }
>();

export const setSegmentationDirty = (segmentationId: string) => {
  const cached = segmentIndicesCache.get(segmentationId);
  if (cached) {
    cached.isDirty = true;
  }
};

export const setSegmentationClean = (segmentationId: string) => {
  const cached = segmentIndicesCache.get(segmentationId);
  if (cached) {
    cached.isDirty = false;
  }
};

export const getCachedSegmentIndices = (segmentationId: string) => {
  const cached = segmentIndicesCache.get(segmentationId);
  if (cached && !cached.isDirty) {
    return cached.indices;
  }
  return null;
};

export const setCachedSegmentIndices = (
  segmentationId: string,
  indices: number[]
) => {
  segmentIndicesCache.set(segmentationId, { indices, isDirty: false });
};
