import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import IslandRemoval from '../../../../utilities/segmentation/IslandRemoval';

/**
 * Removes external islands and fills internal islands.
 * External islands are areas of preview which are not connected via fill or
 * preview colours to the clicked/dragged over points.
 * Internal islands are areas of non-preview which are entirely surrounded by
 * colours connected to the clicked/dragged over points.
 */
export default {
  [StrategyCallbacks.OnInteractionEnd]: (
    operationData: InitializedOperationData
  ) => {
    const {
      strategySpecificConfiguration,
      previewSegmentIndex,
      segmentIndex,
      viewport,
      previewVoxelManager,
      segmentationVoxelManager,
    } = operationData;

    if (!strategySpecificConfiguration.THRESHOLD || segmentIndex === null) {
      return;
    }

    const islandRemoval = new IslandRemoval();
    const voxelManager = previewVoxelManager ?? segmentationVoxelManager;
    if (
      !islandRemoval.initialize(viewport, voxelManager, {
        previewSegmentIndex,
        segmentIndex,
      })
    ) {
      return;
    }
    islandRemoval.applyPoints();
    islandRemoval.removeExternalIslands();
    islandRemoval.removeInternalIslands();
    const arrayOfSlices = voxelManager.getArrayOfSlices();
    if (!arrayOfSlices) {
      return;
    }

    triggerSegmentationDataModified(
      operationData.segmentationId,
      arrayOfSlices,
      previewSegmentIndex
    );
  },
};
