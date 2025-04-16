import { utilities, getWebWorkerManager } from '@cornerstonejs/core';
import { triggerWorkerProgress } from './utilsForWorker';
import { WorkerTypes } from '../../enums';
import type {
  LabelmapSegmentationDataStack,
  NamedStatistics,
} from '../../types';
import { registerComputeWorker } from '../registerComputeWorker';
import createMergedLabelmapForIndex from './createMergedLabelmapForIndex';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import getOrCreateSegmentationVolume from './getOrCreateSegmentationVolume';
import { getReferenceVolumeForSegmentation } from './getReferenceVolumeForSegmentation';

/**
 * Get the TMTV for a segmentation.
 *
 * @param segmentationIds - The segmentation IDs. If there are multiple, a merged
 * labelmap will get created first for that segmentIndex
 * @param segmentIndex - The segment index to get TMTV for.
 * @returns The TMTV.
 */
async function computeMetabolicStats({
  segmentationIds,
  segmentIndex,
}: {
  segmentationIds: string[];
  segmentIndex: number;
}): Promise<NamedStatistics | { [segmentIndex: number]: NamedStatistics }> {
  registerComputeWorker();

  triggerWorkerProgress(WorkerTypes.COMPUTE_STATISTICS, 0);

  const segmentation = getSegmentation(segmentationIds[0]);
  const { imageIds: segImageIds } = segmentation.representationData
    .Labelmap as LabelmapSegmentationDataStack;

  const isValidVolume = utilities.isValidVolume(segImageIds);

  if (!isValidVolume) {
    throw new Error('Invalid volume - TMTV cannot be calculated');
  }

  const stats = await calculateForVolume({
    segmentationIds,
    segmentIndex,
  });

  return stats;
}

async function calculateForVolume({ segmentationIds, segmentIndex }) {
  // create volume from segmentationIds

  const labelmapVolumes = segmentationIds.map((id) => {
    return getOrCreateSegmentationVolume(id);
  });

  const mergedLabelmap = createMergedLabelmapForIndex(
    labelmapVolumes,
    segmentIndex
  );

  if (!mergedLabelmap) {
    throw new Error('Invalid volume - TMTV cannot be calculated');
  }

  const { imageData, dimensions, direction, origin, voxelManager } =
    mergedLabelmap;

  const spacing = imageData.getSpacing();
  const segmentationScalarData = voxelManager.getCompleteScalarDataArray();

  const segmentationInfo = {
    scalarData: segmentationScalarData,
    dimensions,
    spacing,
    origin,
    direction,
  };

  const referenceVolume = getReferenceVolumeForSegmentation(segmentationIds[0]);

  const imageInfo = {
    dimensions: referenceVolume.dimensions,
    spacing: referenceVolume.spacing,
    origin: referenceVolume.origin,
    direction: referenceVolume.direction,
    scalarData: referenceVolume.voxelManager.getCompleteScalarDataArray(),
  };

  const stats = await getWebWorkerManager().executeTask(
    'compute',
    'computeMetabolicStats',
    {
      segmentationInfo,
      imageInfo,
    }
  );

  triggerWorkerProgress(WorkerTypes.COMPUTE_STATISTICS, 100);

  return stats;
}

export { computeMetabolicStats };
