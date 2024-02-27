import { utilities } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import floodFill from '../../../../utilities/segmentation/floodFill';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

const { RLEVoxelMap } = utilities;

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
      previewVoxelManager,
      segmentationVoxelManager,
      strategySpecificConfiguration,
      previewSegmentIndex,
      segmentIndex,
    } = operationData;

    if (!strategySpecificConfiguration.THRESHOLD || segmentIndex === null) {
      return;
    }

    const clickedPoints = previewVoxelManager.getPoints();
    if (!clickedPoints?.length) {
      return;
    }

    if (previewSegmentIndex === undefined) {
      return;
    }

    console.log('***** start of islandRemoval');
    console.time('islandRemoval');
    // Ensure the bounds includes the clicked points, otherwise the fill
    // fails.
    const boundsIJK = previewVoxelManager
      .getBoundsIJK()
      .map((bound, i) => [
        Math.min(bound[0], ...clickedPoints.map((point) => point[i])),
        Math.max(bound[1], ...clickedPoints.map((point) => point[i])),
      ]);

    if (boundsIJK.find((it) => it[0] < 0 || it[1] > 65535)) {
      // Nothing done, so just skip this
      return;
    }

    // First get the set of points which are directly connected to the points
    // that the user clicked on/dragged over.
    console.time('floodedSet');
    const filter = ([i, j, k]) => {
      return !(
        i < boundsIJK[0][0] ||
        i > boundsIJK[0][1] ||
        j < boundsIJK[1][0] ||
        j > boundsIJK[1][1] ||
        k < boundsIJK[2][0] ||
        k > boundsIJK[2][1]
      );
    };
    const [width, height, depth] = segmentationVoxelManager.dimensions;
    let floodedSet = new RLEVoxelMap<boolean>(width, height, depth);
    floodedSet.defaultValue = undefined;
    // Returns true for new colour, and false otherwise
    const getter = (i, j, k) => {
      const index = segmentationVoxelManager.toIndex([i, j, k]);
      const oldVal = segmentationVoxelManager.getAtIndex(index);
      const isIn =
        oldVal === previewSegmentIndex || oldVal === segmentIndex ? 1 : 0;
      // 1 is values that are preview/segment index, 0 is everything else
      return isIn;
    };

    let floodedCount = 0;

    const onFlood = (i, j, k) => {
      const index = segmentationVoxelManager.toIndex([i, j, k]);
      if (floodedSet.has(index)) {
        return;
      }
      // Fill this point with an indicator that this point is connected
      previewVoxelManager.setAtIJK(i, j, k, previewSegmentIndex);
      floodedSet.set(index, true);
      floodedCount++;
    };
    clickedPoints.forEach((clickedPoint) => {
      const index = segmentationVoxelManager.toIndex(clickedPoint);
      if (!floodedSet.has(index)) {
        floodFill(getter, clickedPoint, {
          onFlood,
          diagonals: false,
          filter,
        });
      }
    });
    console.timeEnd('floodedSet');

    // Next, iterate over all points which were set to a new value in the preview
    // For everything NOT connected to something in set of clicked points,
    // remove it from the preview.
    console.time('clearExternalIslands');
    let clearedCount = 0;
    let previewCount = 0;

    const callback = ({ index, pointIJK, value: trackValue }) => {
      const value = segmentationVoxelManager.getAtIndex(index);
      if (floodedSet.has(index)) {
        previewCount++;
        const newValue =
          trackValue === segmentIndex ? segmentIndex : previewSegmentIndex;
        previewVoxelManager.setAtIJKPoint(pointIJK, newValue);
      } else if (value === previewSegmentIndex) {
        clearedCount++;
        const newValue = trackValue ?? 0;
        previewVoxelManager.setAtIJKPoint(pointIJK, newValue);
      }
    };

    previewVoxelManager.forEach(callback, {});
    console.timeEnd('clearExternalIslands');

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
    const islandMap = floodedSet;
    floodedSet = new RLEVoxelMap<boolean>(width, height, depth);
    floodedSet.defaultValue = undefined;

    // Handle islands which are internal to the flood fill - these are points which
    // are surrounded entirely by the filled area.
    // For this, we want to flood starting points within the image area, which
    // are NOT within the island being filled.
    // Use the flood fill on these points to get surrounding points NOT in the
    // image area, and then

    console.time('internalIslands');
    islandMap.forEach((baseIndex, rle) => {
      if (rle.start === 0) {
        return;
      }
      const index = baseIndex + rle.start - 1;
      if (floodedSet.has(index)) {
        return;
      }
      let isInternal = true;
      const internalSet = new Set<number>();
      const onFloodInternal = (i, j, k) => {
        const floodIndex = previewVoxelManager.toIndex([i, j, k]);
        floodedSet.set(floodIndex, true);
        if (
          (boundsIJK[0][0] !== boundsIJK[0][1] &&
            (i === boundsIJK[0][0] || i === boundsIJK[0][1])) ||
          (boundsIJK[1][0] !== boundsIJK[1][1] &&
            (j === boundsIJK[1][0] || j === boundsIJK[1][1])) ||
          (boundsIJK[2][0] !== boundsIJK[2][1] &&
            (k === boundsIJK[2][0] || k === boundsIJK[2][1]))
        ) {
          isInternal = false;
        }
        if (isInternal) {
          internalSet.add(floodIndex);
        }
      };
      const pointIJK = previewVoxelManager.toIJK(index);
      if (getter(...pointIJK) !== 0) {
        return;
      }
      floodFill(getter, pointIJK, {
        onFlood: onFloodInternal,
        diagonals: false,
        filter,
      });
      if (isInternal) {
        for (const index of internalSet) {
          previewVoxelManager.setAtIndex(index, previewSegmentIndex);
        }
      }
    });
    console.timeEnd('internalIslands');
    console.timeEnd('islandRemoval');

    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelManager.getArrayOfSlices()
    );
  },
};
