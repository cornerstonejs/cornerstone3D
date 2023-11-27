import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

import type { InitializedOperationData } from '../BrushStrategy';

const { isEqual } = utilities;

/**
 * Sets up tracking for use by preview and other services.
 * This sets up a  TRACKING value in the strategy specific configuration which
 * stores the original value for updated pixels, and allows the changes to be
 * applied (eg for a preview), reverted, or acted on in other ways.
 */
export default function initializeTracking(
  operationData: InitializedOperationData
) {
  const { initDown } = operationData;
  operationData.initDown = () => {
    operationData.strategySpecificConfiguration.TRACKING = null;
    initDown?.();
  };

  const { imageData } = operationData;
  const dimensions = imageData.getDimensions();
  const width = dimensions[0];
  const floodData = new Map<number, Map<number, Uint8Array>>();

  operationData.strategySpecificConfiguration.TRACKING ||= {
    floodData,
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
    updateValue: function (pointIJK, oldValue, newValue) {
      this.setter(pointIJK, oldValue);
      this.modifiedSlices.add(pointIJK[2]);
    },

    /**
     * Gets the old value of the pixel at i,j,k
     * @returns original value for pixel at ijk
     */
    getter: ([i, j, k]) => {
      const plane = floodData.get(k)?.get(j);
      return plane?.[i];
    },

    /**
     * Stores the old value at a given location when it is getting changed.
     */
    setter: ([i, j, k], value) => {
      let kMap = floodData.get(k);
      if (!kMap) {
        kMap = new Map<number, Uint8Array>();
        floodData.set(k, kMap);
      }
      let plane = kMap.get(j);
      if (!plane) {
        plane = new Uint8Array(width);
        kMap.set(j, plane);
      }
      plane[i] = value;
    },
  };
}
