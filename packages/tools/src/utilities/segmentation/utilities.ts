import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';
import { getToolGroup } from '../../store/ToolGroupManager';
import BrushTool from '../../tools/segmentation/BrushTool';
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

export function getBrushToolInstances(toolGroupId: string, toolName?: string) {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    return;
  }

  const toolInstances = toolGroup._toolInstances;

  if (!Object.keys(toolInstances).length) {
    return;
  }

  if (toolName && toolInstances[toolName]) {
    return [toolInstances[toolName]];
  }

  // For each tool that has BrushTool as base class, set the brush size.
  const brushBasedToolInstances = Object.values(toolInstances).filter(
    (toolInstance) => toolInstance instanceof BrushTool
  ) as BrushTool[];

  return brushBasedToolInstances;
}

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
  const voxelCornersWorld = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        const point = [...voxelCenter]; // Create a new point from voxelCenter
        point[0] = point[0] + ((i * 2 - 1) * voxelSpacing[0]) / 2;
        point[1] = point[1] + ((j * 2 - 1) * voxelSpacing[1]) / 2;
        point[2] = point[2] + ((k * 2 - 1) * voxelSpacing[2]) / 2;
        voxelCornersWorld.push(point);
      }
    }
  }
  const voxelCornersIJK = voxelCornersWorld.map(
    (world) => csUtils.transformWorldToIndex(imageData, world) as Types.Point3
  );
  const overlapBounds = getBoundingBoxAroundShapeIJK(
    voxelCornersIJK,
    dimensions
  );

  return overlapBounds;
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
