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

  operationData.strategySpecificConfiguration.TRACKING ||= {
    modifiedSlices: new Set<number>(),
    clickedPoints: new Array<Types.Point3>(),
    boundsIJK: [
      [Infinity, -Infinity],
      [Infinity, -Infinity],
      [Infinity, -Infinity],
    ],
    updateCenter: function (centerIJK, boundsIJK) {
      this.boundsIJK.forEach((bound, index) => {
        bound[0] = Math.min(bound[0], boundsIJK[index][0]);
        bound[1] = Math.max(bound[1], boundsIJK[index][1]);
      });
      if (
        !this.clickedPoints.length ||
        !isEqual(this.clickedPoints[this.clickedPoints.length - 1], centerIJK)
      ) {
        this.clickedPoints.push(centerIJK);
      }
    },
    updateValue: function (pointIJK) {
      this.modifiedSlices.add(pointIJK[2]);
    },
  };
  const { completeUp } = operationData;
  operationData.completeUp = () => {
    completeUp?.();

    const { TRACKING: tracking } = operationData.strategySpecificConfiguration;
    const { boundsIJK, clickedPoints } = tracking;
    console.log(
      'completeUp',
      JSON.stringify(boundsIJK),
      JSON.stringify(clickedPoints)
    );
    tracking.boundsIJK.map((bound) => {
      bound[0] = Infinity;
      bound[1] = -Infinity;
    });
    tracking.clickedPoints = [];

    const floodData = new Map<number>();
    const minI = boundsIJK[0][0];
    const minJ = boundsIJK[1][0];
    const width = boundsIJK[0][1] - minI;
    const height = boundsIJK[1][1] - minJ;

    const getter = ([i, j, k]) => {
      const plane = floodData.get(k);
      if (!plane) {
        return 0;
      }
      return plane[i - minI + (j - minJ) * width];
    };

    const setter = ([i, j, k], value) => {
      let plane = floodData.get(k);
      if (!plane) {
        if (value === 0) {
          return;
        }
        plane = new Uint8Array(width * height);
        floodData.set(k, plane);
      }
      plane[i - minI + (j - minJ) * width] = value;
    };

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
