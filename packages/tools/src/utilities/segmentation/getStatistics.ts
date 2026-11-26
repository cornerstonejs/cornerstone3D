import { utilities, getWebWorkerManager } from '@cornerstonejs/core';
import {
  triggerWorkerProgress,
  getSegmentationDataForWorker,
  prepareVolumeStrategyDataForWorker,
  prepareStackDataForWorker,
  prepareVideoFrameDataForWorker,
  getVideoViewportOfSegmentation,
  getImageReferenceInfo,
  getReferencedImageIdsOfLabelmap,
} from './utilsForWorker';
import { getPixelValueUnitsImageId } from '../getPixelValueUnits';
import VolumetricCalculator from './VolumetricCalculator';
import { WorkerTypes } from '../../enums';
import type { NamedStatistics } from '../../types';
import { registerComputeWorker } from '../registerComputeWorker';

// Radius for a volume of 10, eg 1 cm^3 = 1000 mm^3
const radiusForVol1 = Math.pow((3 * 1000) / (4 * Math.PI), 1 / 3);

/**
 * Get statistics for a segmentation.
 *
 * @param segmentationId - The segmentation ID.
 * @param segmentIndices - The segment indices to get statistics for.
 *   - If a single number is provided, it retrieves statistics for that specific segment.
 *   - If an array is provided:
 *     - In `collective` mode (default), it retrieves statistics for all voxels that belong to any of the specified segment indices (OR operation).
 *     - In `individual` mode, it retrieves statistics separately for each segment index.
 * @param mode - The computation mode (optional, defaults to `'collective'`).
 *   - `'collective'` (default): Treats the segment indices as a group, computing combined statistics.
 *   - `'individual'`: Treats each segment index separately, computing statistics for each one independently.
 *
 * @returns The statistics, either as a single aggregated result (if `collective` mode)
 * or an object with segment indices as keys and statistics as values (if `individual` mode).
 *
 * A labelmap over a video viewport gives the statistics of the frame on
 * display of the video viewport that shows the segmentation: the pixels of
 * that frame under the labelmap image of that frame, red, green and blue
 * apart as for a colour image of a stack, and `frameNumber` says which frame
 * it was. The other frames are not read: show a frame to get its statistics.
 */
async function getStatistics({
  segmentationId,
  segmentIndices,
  mode = 'collective',
}: {
  segmentationId: string;
  segmentIndices: number[] | number;
  mode?: 'collective' | 'individual';
}): Promise<NamedStatistics | { [segmentIndex: number]: NamedStatistics }> {
  registerComputeWorker();

  triggerWorkerProgress(WorkerTypes.COMPUTE_STATISTICS, 0);

  const segData = getSegmentationDataForWorker(segmentationId, segmentIndices);

  if (!segData) {
    return;
  }

  const {
    operationData,
    segVolumeId,
    segImageIds,
    reconstructableVolume,
    indices,
  } = segData;

  const referencedImageIds =
    !segVolumeId && segImageIds?.length
      ? getReferencedImageIdsOfLabelmap(segmentationId, segImageIds)
      : undefined;

  // Get reference image ID and modality unit options
  const { refImageId, modalityUnitOptions } = getImageReferenceInfo(
    segVolumeId,
    segImageIds,
    referencedImageIds
  );

  const unit = getPixelValueUnitsImageId(refImageId, modalityUnitOptions);
  const videoViewport = getVideoViewportOfSegmentation(segmentationId);

  if (videoViewport) {
    return calculateVideoFrameStatistics({
      segmentationId,
      videoViewport,
      segImageIds,
      indices,
      unit,
      mode,
    });
  }

  const stats = reconstructableVolume
    ? await calculateVolumeStatistics({
        operationData,
        indices,
        unit,
        mode,
      })
    : await calculateStackStatistics({
        segImageIds,
        indices,
        unit,
        mode,
        referencedImageIds,
      });

  return stats;
}

/**
 * Calculate statistics for a reconstructable volume
 */
async function calculateVolumeStatistics({
  operationData,
  indices,
  unit,
  mode,
}) {
  // Get the strategy data
  const strategyData = prepareVolumeStrategyDataForWorker(operationData);

  if (!strategyData) {
    return;
  }

  const {
    segmentationVoxelManager,
    imageVoxelManager,
    segmentationImageData,
    imageData,
  } = strategyData;

  if (!segmentationVoxelManager || !segmentationImageData) {
    return;
  }

  const spacing = segmentationImageData.getSpacing();

  const { boundsIJK: boundsOrig } = segmentationVoxelManager;
  if (!boundsOrig) {
    return VolumetricCalculator.getStatistics({ spacing });
  }

  // Through the voxel manager, so this works whatever representation the
  // labelmap uses (a full frame buffer or an RLE map, which expands here).
  const segmentationScalarData =
    segmentationVoxelManager.getCompleteScalarDataArray();

  if (!segmentationScalarData?.length) {
    return;
  }

  const segmentationInfo = {
    scalarData: segmentationScalarData,
    dimensions: segmentationImageData.getDimensions(),
    spacing: segmentationImageData.getSpacing(),
    origin: segmentationImageData.getOrigin(),
    direction: segmentationImageData.getDirection(),
  };

  const imageInfo = {
    scalarData: imageVoxelManager.getCompleteScalarDataArray(),
    dimensions: imageData.getDimensions(),
    spacing: imageData.getSpacing(),
    origin: imageData.getOrigin(),
    direction: imageData.getDirection(),
  };

  if (!imageInfo.scalarData?.length) {
    return;
  }

  const stats = await getWebWorkerManager().executeTask(
    'compute',
    'calculateSegmentsStatisticsVolume',
    {
      segmentationInfo,
      imageInfo,
      indices,
      unit,
      mode,
    }
  );

  triggerWorkerProgress(WorkerTypes.COMPUTE_STATISTICS, 100);

  if (mode === 'collective') {
    return processSegmentationStatistics({
      stats,
      unit,
      spacing,
      segmentationImageData,
      imageVoxelManager,
    });
  } else {
    const finalStats = {};
    Object.entries(stats).forEach(([segmentIndex, stat]) => {
      finalStats[segmentIndex] = processSegmentationStatistics({
        stats: stat,
        unit,
        spacing,
        segmentationImageData,
        imageVoxelManager,
      });
    });
    return finalStats;
  }
}

const updateStatsArray = (stats, newStat) => {
  if (!stats.array) {
    return;
  }

  const existingIndex = stats.array.findIndex(
    (stat) => stat.name === newStat.name
  );

  if (existingIndex !== -1) {
    stats.array[existingIndex] = newStat;
  } else {
    stats.array.push(newStat);
  }
};

const processSegmentationStatistics = ({
  stats,
  unit,
  spacing,
  segmentationImageData,
  imageVoxelManager,
}) => {
  stats.mean.unit = unit;
  stats.max.unit = unit;
  stats.min.unit = unit;

  if (unit !== 'SUV') {
    return stats;
  }

  // Get the IJK rounded radius, not using less than 1, and using the
  // radius for the spacing given the desired mm spacing of 10
  // Add 10% to the radius to account for whole pixel in/out issues
  const radiusIJK = spacing.map((s) =>
    Math.max(1, Math.round((1.1 * radiusForVol1) / s))
  );

  for (const testMax of stats.maxIJKs) {
    const testStats = getSphereStats(
      testMax,
      radiusIJK,
      segmentationImageData,
      imageVoxelManager,
      spacing
    );
    if (!testStats) {
      continue;
    }
    const { mean } = testStats;
    if (!stats.peakValue || stats.peakValue.value <= mean.value) {
      stats.peakValue = {
        name: 'peakValue',
        label: 'Peak Value',
        value: mean.value,
        unit,
      };

      // Store the LPS point coordinates for peak SUV
      stats.peakPoint = {
        name: 'peakLPS',
        label: 'Peak SUV Point',
        value: testMax.pointLPS ? [...testMax.pointLPS] : null,
        unit: null,
      };

      updateStatsArray(stats, stats.peakValue);
      updateStatsArray(stats, stats.peakPoint);
    }
  }

  if (stats.volume && stats.mean) {
    const mtv = stats.volume.value;
    const suvMean = stats.mean.value;

    stats.lesionGlycolysis = {
      name: 'lesionGlycolysis',
      label: 'Lesion Glycolysis',
      value: mtv * suvMean,
      unit: `${stats.volume.unit}·${unit}`,
    };

    updateStatsArray(stats, stats.lesionGlycolysis);
  }

  return stats;
};

/**
 * Calculates the statistics of the labelmap image of the frame on display of
 * a video viewport over the pixels of that frame, in the worker of the stack
 * statistics, and says which frame they are of.
 */
async function calculateVideoFrameStatistics({
  segmentationId,
  videoViewport,
  segImageIds,
  indices,
  unit,
  mode,
}) {
  const { segmentationInfo, imageInfo, frameNumber } =
    prepareVideoFrameDataForWorker(segmentationId, videoViewport, segImageIds);
  const stats = await calculateStackStatistics({
    segImageIds,
    indices,
    unit,
    mode,
    stackData: { segmentationInfo, imageInfo },
  });

  if (mode === 'collective') {
    return { ...stats, frameNumber };
  }

  return Object.fromEntries(
    Object.entries(stats as Record<string, NamedStatistics>).map(
      ([segmentIndex, stat]) => [segmentIndex, { ...stat, frameNumber }]
    )
  );
}

/**
 * Calculate statistics for a stack of images
 */
async function calculateStackStatistics({
  segImageIds,
  indices,
  unit,
  mode,
  stackData = undefined,
  referencedImageIds = undefined,
}) {
  triggerWorkerProgress(WorkerTypes.COMPUTE_STATISTICS, 0);

  // Get segmentation and image info for each image in the stack
  const { segmentationInfo, imageInfo } =
    stackData ?? prepareStackDataForWorker(segImageIds, referencedImageIds);

  const stats = await getWebWorkerManager().executeTask(
    'compute',
    'calculateSegmentsStatisticsStack',
    {
      segmentationInfo,
      imageInfo,
      indices,
      mode,
    }
  );

  triggerWorkerProgress(WorkerTypes.COMPUTE_STATISTICS, 100);

  const spacing = segmentationInfo[0].spacing;
  const segmentationImageData = segmentationInfo[0];
  const imageVoxelManager = imageInfo[0].voxelManager;

  if (mode === 'collective') {
    return processSegmentationStatistics({
      stats,
      unit,
      spacing,
      segmentationImageData,
      imageVoxelManager,
    });
  } else {
    const finalStats = {};
    Object.entries(stats).forEach(([segmentIndex, stat]) => {
      finalStats[segmentIndex] = processSegmentationStatistics({
        stats: stat,
        unit,
        spacing,
        segmentationImageData,
        imageVoxelManager,
      });
    });
    return finalStats;
  }
}

/**
 * Gets the statistics for a 1 cm^3 sphere centered on radiusIJK.
 * Assumes the segmentation and pixel data are co-incident.
 */
function getSphereStats(testMax, radiusIJK, segData, imageVoxels, spacing) {
  const { pointIJK: centerIJK, pointLPS: centerLPS } = testMax;

  if (!centerIJK) {
    return;
  }

  const boundsIJK = centerIJK.map((ijk, idx) => [
    ijk - radiusIJK[idx],
    ijk + radiusIJK[idx],
  ]);
  const testFunction = (_pointLPS, pointIJK) => {
    const i = (pointIJK[0] - centerIJK[0]) / radiusIJK[0];
    const j = (pointIJK[1] - centerIJK[1]) / radiusIJK[1];
    const k = (pointIJK[2] - centerIJK[2]) / radiusIJK[2];
    const radius = i * i + j * j + k * k;
    return radius <= 1;
  };
  const statsFunction = ({ pointIJK, pointLPS }) => {
    const value = imageVoxels.getAtIJKPoint(pointIJK);
    if (value === undefined) {
      return;
    }
    VolumetricCalculator.statsCallback({ value, pointLPS, pointIJK });
  };
  VolumetricCalculator.statsInit({ storePointData: false });

  utilities.pointInShapeCallback(segData, {
    pointInShapeFn: testFunction,
    callback: statsFunction,
    boundsIJK,
  });

  return VolumetricCalculator.getStatistics({ spacing });
}

export default getStatistics;
