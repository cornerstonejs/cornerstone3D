import {
  getEnabledElementByViewportId,
  utilities,
  getWebWorkerManager,
  eventTarget,
  Enums,
  triggerEvent,
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
  viewportId,
}: {
  segmentationId: string;
  segmentIndices: number[] | number;
  viewportId: string;
}) {
  registerComputeWorker();

  triggerWorkerProgress(eventTarget, 0);

  const enabledElement = getEnabledElementByViewportId(viewportId);
  const viewport = enabledElement.viewport;

  const segmentation = getSegmentation(segmentationId);
  const { representationData } = segmentation;

  const { Labelmap } = representationData;

  if (!Labelmap) {
    console.debug('No labelmap found for segmentation', segmentationId);
    return;
  }

  const { volumeId } = Labelmap as LabelmapSegmentationDataVolume;
  const { imageIds } = Labelmap as LabelmapSegmentationDataStack;

  const {
    segmentationVoxelManager,
    imageVoxelManager,
    segmentationImageData,
    imageData,
  } = getStrategyData({
    operationData: { segmentationId, viewport, volumeId, imageIds },
    viewport,
    strategy: {
      ensureSegmentationVolumeFor3DManipulation:
        ensureSegmentationVolume.ensureSegmentationVolumeFor3DManipulation,
      ensureImageVolumeFor3DManipulation:
        ensureImageVolume.ensureImageVolumeFor3DManipulation,
    },
  });

  let indices = segmentIndices;

  if (!indices) {
    indices = [getActiveSegmentIndex(segmentationId)];
  } else if (!Array.isArray(indices)) {
    // Include the preview index
    indices = [indices, 255];
  }

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

  const indicesArr = indices as number[];

  const stats = await workerManager.executeTask(
    'compute',
    'calculateSegmentsStatistics',
    {
      segmentationInfo,
      imageInfo,
      indices: indicesArr,
    }
  );

  triggerWorkerProgress(eventTarget, 100);

  const targetId = viewport.getViewReferenceId();
  const modalityUnitOptions = {
    isPreScaled: isViewportPreScaled(viewport, targetId),
    isSuvScaled: AnnotationTool.isSuvScaled(
      viewport,
      targetId,
      viewport.getCurrentImageId()
    ),
  };

  const unit = getPixelValueUnitsImageId(
    viewport.getCurrentImageId(),
    modalityUnitOptions
  );

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

  return stats;
}

/**
 * Gets the statistics for a 1 cm^3 sphere centered on radiusIJK.
 * Assumes the segmentation and pixel data are co-incident.
 */
function getSphereStats(testMax, radiusIJK, segData, imageVoxels, spacing) {
  const { pointIJK: centerIJK } = testMax;
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
