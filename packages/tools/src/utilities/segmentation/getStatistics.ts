import {
  cache,
  utilities,
  getWebWorkerManager,
  eventTarget,
  Enums,
  triggerEvent,
  metaData,
} from '@cornerstonejs/core';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import VolumetricCalculator from './VolumetricCalculator';
import { getStrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';
import { getPixelValueUnitsImageId } from '../getPixelValueUnits';
import { AnnotationTool } from '../../tools/base';
import { isViewportPreScaled } from '../viewport/isViewportPreScaled';
import ensureSegmentationVolume from '../../tools/segmentation/strategies/compositions/ensureSegmentationVolume';
import ensureImageVolume from '../../tools/segmentation/strategies/compositions/ensureImageVolume';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { registerComputeWorker } from '../registerComputeWorker';
import { WorkerTypes } from '../../enums';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
// Radius for a volume of 10, eg 1 cm^3 = 1000 mm^3
const radiusForVol1 = Math.pow((3 * 1000) / (4 * Math.PI), 1 / 3);

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.COMPUTE_STATISTICS,
  });
};

async function getStatistics({
  segmentationId,
  segmentIndices,
}: {
  segmentationId: string;
  segmentIndices: number[] | number;
}) {
  registerComputeWorker();

  triggerWorkerProgress(eventTarget, 0);

  const segmentation = getSegmentation(segmentationId);
  const { representationData } = segmentation;

  const { Labelmap } = representationData;

  if (!Labelmap) {
    console.debug('No labelmap found for segmentation', segmentationId);
    return;
  }

  const segVolumeId = (Labelmap as LabelmapSegmentationDataVolume).volumeId;
  const segImageIds = (Labelmap as LabelmapSegmentationDataStack).imageIds;

  // Create a minimal operationData object
  const operationData = {
    segmentationId,
    volumeId: segVolumeId,
    imageIds: segImageIds,
  };

  let reconstructableVolume = false;
  if (segImageIds) {
    const refImageIds = segImageIds.map((imageId) => {
      const image = cache.getImage(imageId);
      return image.referencedImageId;
    });
    reconstructableVolume = utilities.isValidVolume(refImageIds);
  }

  let indices = segmentIndices;

  if (!indices) {
    indices = [getActiveSegmentIndex(segmentationId)];
  } else if (!Array.isArray(indices)) {
    // Include the preview index
    indices = [indices, 255];
  }

  // Get reference image ID and modality unit options
  const { refImageId, modalityUnitOptions } = getImageReferenceInfo(
    segVolumeId,
    segImageIds
  );

  debugger;

  const unit = getPixelValueUnitsImageId(refImageId, modalityUnitOptions);

  let stats;
  if (reconstructableVolume) {
    // Get the strategy data
    const strategyData = getStrategyData({
      // @ts-expect-error
      operationData,
      strategy: reconstructableVolume
        ? {
            ensureSegmentationVolumeFor3DManipulation:
              ensureSegmentationVolume.ensureSegmentationVolumeFor3DManipulation,
            ensureImageVolumeFor3DManipulation:
              ensureImageVolume.ensureImageVolumeFor3DManipulation,
          }
        : undefined,
    });

    const {
      segmentationVoxelManager,
      imageVoxelManager,
      segmentationImageData,
      imageData,
    } = strategyData;

    const spacing = segmentationImageData.getSpacing();

    const { boundsIJK: boundsOrig } = segmentationVoxelManager;
    if (!boundsOrig) {
      return VolumetricCalculator.getStatistics({ spacing });
    }

    const segmentationScalarData =
      segmentationVoxelManager.getCompleteScalarDataArray();

    const imageScalarData = imageVoxelManager.getCompleteScalarDataArray();

    const segmentationInfo = {
      scalarData: segmentationScalarData,
      dimensions: segmentationImageData.getDimensions(),
      spacing: segmentationImageData.getSpacing(),
      origin: segmentationImageData.getOrigin(),
    };

    const imageInfo = {
      scalarData: imageScalarData,
      dimensions: imageData.getDimensions(),
      spacing: imageData.getSpacing(),
      origin: imageData.getOrigin(),
    };

    stats = await workerManager.executeTask(
      'compute',
      'calculateSegmentsStatisticsVolume',
      {
        segmentationInfo,
        imageInfo,
        indices,
      }
    );

    triggerWorkerProgress(eventTarget, 100);

    // Update units
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
      }
    }
  } else {
    triggerWorkerProgress(eventTarget, 0);
    // we need to loop over each seg image separately and calculate the stats
    const segmentationInfo = [];
    const imageInfo = [];
    for (const segImageId of segImageIds) {
      const segImage = cache.getImage(segImageId);
      const segPixelData = segImage.getPixelData();
      const segVoxelManager = segImage.voxelManager;
      const segSpacing = [
        segImage.rowPixelSpacing,
        segImage.columnPixelSpacing,
      ];

      const refImageId = segImage.referencedImageId;
      const refImage = cache.getImage(refImageId);
      const refPixelData = refImage.getPixelData();
      const refVoxelManager = refImage.voxelManager;
      const refSpacing = [
        refImage.rowPixelSpacing,
        refImage.columnPixelSpacing,
      ];

      segmentationInfo.push({
        scalarData: segPixelData,
        dimensions: segVoxelManager.dimensions,
        spacing: segSpacing,
      });

      imageInfo.push({
        scalarData: refPixelData,
        dimensions: refVoxelManager.dimensions,
        spacing: refSpacing,
      });
    }

    stats = await workerManager.executeTask(
      'compute',
      'calculateSegmentsStatisticsStack',
      {
        segmentationInfo,
        imageInfo,
        indices,
      }
    );

    triggerWorkerProgress(eventTarget, 100);

    stats.mean.unit = unit;
    stats.max.unit = unit;
    stats.min.unit = unit;

    return stats;
  }
}

/**
 * Gets the statistics for a 1 cm^3 sphere centered on radiusIJK.
 * Assumes the segmentation and pixel data are co-incident.
 */
function getSphereStats(testMax, radiusIJK, segData, imageVoxels, spacing) {
  const { pointIJK: centerIJK } = testMax;

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

/**
 * Gets the reference image ID and modality unit options based on segmentation data
 * @param segVolumeId - The segmentation volume ID
 * @param segImageIds - The segmentation image IDs
 * @returns Object containing reference image ID and modality unit options
 */
function getImageReferenceInfo(segVolumeId, segImageIds) {
  let refImageId;
  let modalityUnitOptions;

  if (segVolumeId) {
    const segmentationVolume = cache.getVolume(segVolumeId);
    const referencedVolumeId = segmentationVolume.referencedVolumeId;
    const volume = cache.getVolume(referencedVolumeId);

    if (volume?.imageIds?.length > 0) {
      refImageId = volume.imageIds[0];
    }

    modalityUnitOptions = {
      isPreScaled: Object.keys(volume.scaling || {}).length > 0,
      isSuvScaled: Boolean(volume.scaling?.PT),
    };
  } else if (segImageIds?.length) {
    const segImage = cache.getImage(segImageIds[0]);
    refImageId = segImage.referencedImageId;
    const refImage = cache.getImage(refImageId);
    const scalingModule = metaData.get('scalingModule', refImageId);

    modalityUnitOptions = {
      isPreScaled: Boolean(refImage.preScale?.scaled),
      isSuvScaled: typeof scalingModule?.preScale?.scaled === 'number',
    };
  }

  return { refImageId, modalityUnitOptions };
}

export default getStatistics;
