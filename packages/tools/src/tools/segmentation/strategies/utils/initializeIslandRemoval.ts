import type { Types } from '@cornerstonejs/core';

import type { InitializedOperationData } from '../BrushStrategy';
import floodFill from '../../../../utilities/segmentation/floodFill';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default {
  completeUp: (enabled, operationData: InitializedOperationData) => {
    const {
      previewVoxelValue,
      segmentationVoxelValue,
      strategySpecificConfiguration,
      previewSegmentIndex,
      segmentIndex,
    } = operationData;

    if (!strategySpecificConfiguration.THRESHOLD) {
      return;
    }

    const clickedPoints = previewVoxelValue.getPoints();
    if (!clickedPoints?.length) {
      return;
    }

    if (previewSegmentIndex === undefined) {
      return;
    }

    const boundsIJK = previewVoxelValue.getBoundsIJK();

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

      const index = segmentationVoxelValue.toIndex([i, j, k]);
      if (segmentationVoxelValue.points?.has(index)) {
        return -2;
      }
      const oldVal = segmentationVoxelValue.getIndex(index);
      const isIn =
        oldVal === previewSegmentIndex || oldVal === segmentIndex ? 1 : 0;
      if (!isIn) {
        segmentationVoxelValue.addPoint(index);
      }
      return isIn;
    };

    let floodedIndex = 255;

    let floodedCount = 0;

    const onFlood = (i, j, k) => {
      // Fill this point with an indicator that this point is connected
      const value = segmentationVoxelValue.getIJK(i, j, k);
      if (value === floodedIndex) {
        // This is already filled
        return;
      }
      previewVoxelValue.setIJK(i, j, k, floodedIndex);
      floodedCount++;
    };

    clickedPoints.forEach((clickedPoint) => {
      // @ts-ignore - need to ignore the spread appication to array params
      if (getter(...clickedPoint) === 1) {
        floodFill(getter, clickedPoints[0], {
          onFlood,
          diagonals: true,
        });
      }
    });

    let clearedCount = 0;
    let previewCount = 0;

    const callback = ({ index, pointIJK, value: trackValue }) => {
      const value = segmentationVoxelValue.getIndex(index);
      if (value === floodedIndex) {
        previewCount++;
        const newValue =
          trackValue === segmentIndex ? segmentIndex : previewSegmentIndex;
        previewVoxelValue.set(pointIJK, newValue);
      } else if (value === previewSegmentIndex) {
        clearedCount++;
        const newValue = trackValue ?? 0;
        previewVoxelValue.set(pointIJK, newValue);
      }
    };

    previewVoxelValue.forEach(callback, {});

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
    const islandMap = new Set(segmentationVoxelValue.points || []);
    const handledSet = new Set<number>();

    // Flood now with the final value
    floodedIndex = previewSegmentIndex;

    for (const index of islandMap.keys()) {
      if (handledSet.has(index)) {
        continue;
      }
      handledSet.add(index);
      const floodMap = new Set<number>();
      let isInternal = true;
      const onFloodInternal = (i, j, k) => {
        const floodIndex = previewVoxelValue.toIndex([i, j, k]);
        floodMap.add(floodIndex);
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
        // Skip duplicating fills
        if (islandMap.has(floodIndex)) {
          handledSet.add(floodIndex);
        }
      };
      const pointIJK = previewVoxelValue.toIJK(index);
      floodFill(getter, pointIJK, {
        onFlood: onFloodInternal,
        diagonals: false,
      });
      if (isInternal) {
        for (const index of floodMap) {
          previewVoxelValue.setIndex(index, previewSegmentIndex);
        }
      }
    }
    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelValue.getArrayOfSlices()
    );
  },
};
