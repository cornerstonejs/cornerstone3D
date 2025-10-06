import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { Types } from '@cornerstonejs/core';

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
  // [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
  //   const { centerSegmentIndex } = operationData.configuration || {};

  //   if (!centerSegmentIndex) {
  //     return;
  //   }

  //   operationData.segmentIndex = centerSegmentIndex.segmentIndex;
  // },
  [StrategyCallbacks.OnInteractionStart]: (
    operationData: InitializedOperationData
  ) => {
    const {
      segmentIndex,
      previewSegmentIndex,
      segmentationVoxelManager,
      centerIJK,
      viewPlaneNormal,
      segmentationImageData,
      configuration,
    } = operationData;

    // Reset center segment index info when the feature is disabled
    if (!configuration?.useCenterSegmentIndex) {
      operationData.centerSegmentIndexInfo.segmentIndex = null;
      operationData.centerSegmentIndexInfo.hasSegmentIndex = false;
      operationData.centerSegmentIndexInfo.hasPreviewIndex = false;

      return;
    }

    // Get rid of the previous data

    let hasSegmentIndex = false;
    let hasPreviewIndex = false;

    const nestedBounds = <Types.BoundsIJK>[
      ...segmentationVoxelManager.getBoundsIJK(),
    ];

    if (Math.abs(viewPlaneNormal[0]) > 0.8) {
      nestedBounds[0] = [centerIJK[0], centerIJK[0]];
    } else if (Math.abs(viewPlaneNormal[1]) > 0.8) {
      nestedBounds[1] = [centerIJK[1], centerIJK[1]];
    } else if (Math.abs(viewPlaneNormal[2]) > 0.8) {
      nestedBounds[2] = [centerIJK[2], centerIJK[2]];
    }

    const callback = ({ value }) => {
      hasSegmentIndex ||= value === segmentIndex;
      hasPreviewIndex ||= value === previewSegmentIndex;
    };

    segmentationVoxelManager.forEach(callback, {
      imageData: segmentationImageData,
      isInObject: operationData.isInObject,
      boundsIJK: nestedBounds,
    });

    if (!hasSegmentIndex && !hasPreviewIndex) {
      operationData.centerSegmentIndexInfo.segmentIndex = null;
      return;
    }

    const existingValue = segmentationVoxelManager.getAtIJKPoint(centerIJK);

    operationData.centerSegmentIndexInfo.segmentIndex = existingValue;
    operationData.centerSegmentIndexInfo.hasSegmentIndex = hasSegmentIndex;
    operationData.centerSegmentIndexInfo.hasPreviewIndex = hasPreviewIndex;
  },
};
