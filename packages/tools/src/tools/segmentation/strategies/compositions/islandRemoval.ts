import type { InitializedOperationData } from '../BrushStrategy';
import floodFill from '../../../../utilities/segmentation/floodFill';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

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
      previewVoxelManager: previewVoxelManager,
      segmentationVoxelManager: segmentationVoxelManager,
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

    const floodedSet = new Set<number>();
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
      const index = segmentationVoxelManager.toIndex([i, j, k]);
      if (floodedSet.has(index)) {
        // Values already flooded
        return -2;
      }
      const oldVal = segmentationVoxelManager.getAtIndex(index);
      const isIn =
        oldVal === previewSegmentIndex || oldVal === segmentIndex ? 1 : 0;
      if (!isIn) {
        segmentationVoxelManager.addPoint(index);
      }
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
      floodedSet.add(index);
      floodedCount++;
    };
    clickedPoints.forEach((clickedPoint) => {
      // @ts-ignore - need to ignore the spread appication to array params
      if (getter(...clickedPoint) === 1) {
        floodFill(getter, clickedPoint, {
          onFlood,
          diagonals: true,
        });
      }
    });

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
    const islandMap = new Set(segmentationVoxelManager.points || []);
    floodedSet.clear();

    for (const index of islandMap.keys()) {
      if (floodedSet.has(index)) {
        continue;
      }
      let isInternal = true;
      const internalSet = new Set<number>();
      const onFloodInternal = (i, j, k) => {
        const floodIndex = previewVoxelManager.toIndex([i, j, k]);
        floodedSet.add(floodIndex);
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
        continue;
      }
      floodFill(getter, pointIJK, {
        onFlood: onFloodInternal,
        diagonals: false,
      });
      if (isInternal) {
        for (const index of internalSet) {
          previewVoxelManager.setAtIndex(index, previewSegmentIndex);
        }
      }
    }
    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelManager.getArrayOfSlices()
    );
  },
};
