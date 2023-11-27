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
  if (!operationData.strategySpecificConfiguration.THRESHOLD) {
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

    const previewSegmentIndex = segmentIndexController.getPreviewSegmentIndex(
      operationData.segmentationId
    );
    if (previewSegmentIndex === undefined) {
      return;
    }

    // Returns true for new colour, and false otherwise
    const getter = (i, j, k) => {
      if (
        i < boundsIJK[0][0] ||
        i > boundsIJK[0][1] ||
        j < boundsIJK[1][0] ||
        j > boundsIJK[1][1] ||
        k < boundsIJK[2][0] ||
        k > boundsIJK[2][1]
      ) {
        return -1;
      }

      const oldVal = scalarData[i + j * width + k * frameSize];
      return oldVal === previewSegmentIndex || oldVal === segmentIndex ? 1 : 0;
    };

    const { dimensions, scalarData } = operationData;
    const width = dimensions[0];
    const frameSize = dimensions[1] * width;

    const modifiedSlices = new Set<number>();

    const floodedIndex = 255;

    let floodedCount = 0;

    const onFlood = (i, j, k) => {
      // Fill this point with an indicator that this point is connected
      const index = k * frameSize + j * width + i;
      const value = scalarData[index];
      if (value === floodedIndex) {
        // This is already filled
        return;
      }
      if (value === segmentIndex) {
        tracking.updateValue([i, j, k], value);
      }
      scalarData[index] = floodedIndex;
      floodedCount++;
      modifiedSlices.add(k);
    };

    clickedPoints.forEach((clickedPoint) => {
      if (getter(...clickedPoint) === 1) {
        floodFill(getter, clickedPoints[0], {
          onFlood,
          diagonals: true,
        });
      }
    });

    const isInObject = () => true;

    let clearedCount = 0;
    let previewCount = 0;

    const callback = ({ index, pointIJK }) => {
      const value = scalarData[index];
      const trackValue = tracking.getter(pointIJK);
      if (value === floodedIndex) {
        previewCount++;
        scalarData[index] =
          trackValue === segmentIndex ? segmentIndex : previewSegmentIndex;
      } else if (value === previewSegmentIndex) {
        clearedCount++;
        const newValue = trackValue ?? 0;
        scalarData[index] = newValue;
        modifiedSlices.add(pointIJK[2]);
      }
    };

    pointInShapeCallback(
      operationData.imageData,
      isInObject,
      callback,
      boundsIJK
    );
    if (floodedCount - previewCount !== 0) {
      console.warn(
        'There were flooded=',
        floodedCount,
        'cleared=',
        clearedCount,
        'preview count=',
        previewCount,
        'not handled',
        floodedCount - previewCount
      );
    }

    triggerSegmentationDataModified(
      operationData.segmentationId,
      Array.from(modifiedSlices)
    );
  };

  // initializerData.cancel = () => {
  //   console.log('Restore original data', previewSegmentationIndex);
  // };
}
