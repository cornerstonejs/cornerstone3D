import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

import type { InitializedOperationData } from '../BrushStrategy';
import floodFill from '../../../../utilities/segmentation/floodFill';
import { segmentIndex as segmentIndexController } from '../../../../stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import pointInShapeCallback from '../../../../utilities/pointInShapeCallback';

const { isEqual } = utilities;

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default function initializeIslandRemoval(
  operationData: InitializedOperationData
) {
  if (!operationData.strategySpecificConfiguration.THRESHOLD?.threshold) {
    return;
  }

  const { completeUp } = operationData;
  operationData.completeUp = () => {
    completeUp?.();

    const { strategySpecificConfiguration, segmentIndex } = operationData;
    const { TRACKING: tracking } = strategySpecificConfiguration;
    const { boundsIJK, clickedPoints } = tracking;
    if (!tracking?.getter || !clickedPoints?.length) {
      return;
    }
    console.log('completeUp - island removal', boundsIJK);

    const previewSegmentationIndex =
      segmentIndexController.getPreviewSegmentIndex(
        operationData.segmentationId
      );
    if (previewSegmentationIndex === undefined) {
      return;
    }

    // Returns true for new colour, and false otherwise
    const getter = (ijk) => {
      const val = getter(ijk);
      return val === previewSegmentationIndex || val === segmentIndex;
    };

    const onFlood = (ijk) => {
      // Fill this point with an indicator that this point is connected
      console.log('onFlood', ijk);
    };

    const onBoundary = (ijk) => {
      return !boundsIJK.find(
        (bounds, idx) => ijk[idx] <= bounds[0] || ijk[idx] >= bounds[1]
      );
    };

    floodFill(getter, clickedPoints[0], {
      onBoundary,
      onFlood,
      diagonals: true,
    });
    // Add a point in value callback to fill data with new data just created,
    // PLUS existing data already present (to fill regions already filled)

    // Next, fill from every center point, excluding any point which has already
    // been filled.

    // Finally, iterate through all points clearing them for anything not
    // filled.

    // TODO - add island removal here based on the full path seen
    // const arrayOfSlices: number[] = Array.from(
    //   operationData.modifiedSlicesToUse
    // );
    // operationData.modifiedSlicesToUse.clear();

    // triggerSegmentationDataModified(
    //   operationData.segmentationId,
    //   arrayOfSlices
    // );
  };

  // initializerData.cancel = () => {
  //   console.log('Restore original data', previewSegmentationIndex);
  // };
}
