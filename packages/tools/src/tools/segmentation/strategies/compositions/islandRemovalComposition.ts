import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import IslandRemoval from '../../../../utilities/segmentation/islandRemoval';

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
      previewSegmentIndex,
      segmentIndex,
      viewport,
      previewVoxelManager,
      segmentationVoxelManager,
      activeStrategy,
    } = operationData;

    if (
      activeStrategy !== 'THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL' ||
      segmentIndex === null
    ) {
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
    islandRemoval.floodFillSegmentIsland();
    islandRemoval.removeExternalIslands();
    islandRemoval.removeInternalIslands();
    const arrayOfSlices = voxelManager.getArrayOfModifiedSlices();
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
