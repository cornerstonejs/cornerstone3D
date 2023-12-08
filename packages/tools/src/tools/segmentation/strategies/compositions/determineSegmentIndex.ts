import type { InitializedOperationData } from '../BrushStrategy';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * This function determines whether to fill or erase based on what the user
 * initially clicks on.  The behaviour is:
 * 1. If the user clicks on an area that has no active segment index in it,
 *    then assume the user using the active segment index for filling
 * 2. Find the segment index of the pixel the user clicked on, and assume they
 *    want to fill with that segment index.  Use the given segment index for
 *    the fill colour.
 *    a. If the user clicks on the active segment index, then they will fill
 *       with the active segment
 *    b. If the user clicks on the 0 segment index, they will clear the segment
 *       index, erasing the segment.
 *    c. If the user clicks on another segment index, they will "restore" that
 *       segment index, so that they can push back the segment area.
 *
 */
export default {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    const { strategySpecificConfiguration } = operationData;
    if (!strategySpecificConfiguration) {
      return;
    }
    const { centerSegmentIndex } = strategySpecificConfiguration;
    if (centerSegmentIndex) {
      operationData.segmentIndex = centerSegmentIndex.segmentIndex;
    }
  },

  [StrategyCallbacks.OnInteractionStart]: (
    operationData: InitializedOperationData
  ) => {
    const {
      segmentIndex,
      previewSegmentIndex,
      segmentationVoxelManager: segmentationVoxelManager,
      centerIJK,
      strategySpecificConfiguration,
      imageVoxelManager: imageVoxelManager,
      segmentationImageData,
      preview,
    } = operationData;
    if (!strategySpecificConfiguration?.useCenterSegmentIndex) {
      return;
    }
    // Get rid of the previous data
    delete strategySpecificConfiguration.centerSegmentIndex;

    let hasSegmentIndex = false;
    let hasPreviewIndex = false;
    const callback = ({ value }) => {
      hasSegmentIndex ||= value === segmentIndex;
      hasPreviewIndex ||= value === previewSegmentIndex;
    };

    pointInShapeCallback(
      segmentationImageData as unknown,
      imageVoxelManager.isInObject,
      callback,
      segmentationVoxelManager.boundsIJK
    );

    if (!hasSegmentIndex && !hasPreviewIndex) {
      return;
    }

    let existingValue = segmentationVoxelManager.getAtIJKPoint(centerIJK);
    if (existingValue === previewSegmentIndex) {
      if (preview) {
        existingValue = preview.segmentIndex;
      } else {
        return;
      }
    } else if (hasPreviewIndex) {
      // Clear the preview area
      existingValue = null;
    }
    operationData.segmentIndex = existingValue;
    strategySpecificConfiguration.centerSegmentIndex = {
      segmentIndex: existingValue,
    };
  },
};
