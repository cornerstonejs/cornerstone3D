import { utilities } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

const { RLEVoxelMap } = utilities;

export enum SegmentationEnum {
  // Segment means it is in the segment or preview of interest
  SEGMENT = 1,
  // Island means it is connected to a selected point
  ISLAND = 2,
  // Interior means it is inside the island, or possibly inside
  INTERIOR = 4,
  // Exterior means it is outside the island
  EXTERIOR = 5,
}

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
    const floodedSet = new RLEVoxelMap<SegmentationEnum>(width, height, depth);
    floodedSet.defaultValue = undefined;
    // Returns true for new colour, and false otherwise
    const getter = (i, j, k) => {
      const index = segmentationVoxelManager.toIndex([i, j, k]);
      const oldVal = segmentationVoxelManager.getAtIndex(index);
      if (oldVal === previewSegmentIndex || oldVal === segmentIndex) {
        // Values are initially false for indexed values.
        return SegmentationEnum.SEGMENT;
      }
    };
    floodedSet.fillFrom(getter, boundsIJK);

    let floodedCount = 0;

    clickedPoints.forEach((clickedPoint) => {
      const index = segmentationVoxelManager.toIndex(clickedPoint);
      const [i, j, k] = segmentationVoxelManager.toIJK(index);
      if (floodedSet.get(index) === SegmentationEnum.SEGMENT) {
        floodedCount += floodedSet.floodFill(i, j, k, SegmentationEnum.ISLAND);
      }
    });
    console.timeEnd('floodedSet');

    if (floodedCount === 0) {
      return;
    }
    // Next, iterate over all points which were set to a new value in the preview
    // For everything NOT connected to something in set of clicked points,
    // remove it from the preview.
    console.time('clearExternalIslands');
    const clearedCount = 0;
    let previewCount = 0;

    const callback = (index, rle, row) => {
      const [, j, k] = segmentationVoxelManager.toIJK(index);
      if (rle.value === SegmentationEnum.ISLAND) {
        previewCount += rle.end - rle.start;
      } else {
        // TODO - figure out what value to set to restore this to before preview
        for (let i = rle.start; i < rle.end; i++) {
          previewVoxelManager.setAtIJK(i, j, k, 0);
        }
      }
    };

    floodedSet.forEach(callback);
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
    // Handle islands which are internal to the flood fill - these are points which
    // are surrounded entirely by the filled area.
    console.time('internalIslands');
    // Start by getting the island map - the set of islands which are between
    // two rle runs.
    floodedSet.forEachRow((baseIndex, row) => {
      let lastRle;
      for (const rle of row) {
        if (rle.value === false) {
          continue;
        }
        if (!lastRle) {
          lastRle = rle;
          continue;
        }
        for (let i = lastRle.end; i < rle.start; i++) {
          floodedSet.set(baseIndex + i, SegmentationEnum.INTERIOR);
        }
        lastRle = undefined;
      }
    });
    // Next, remove the island sets which are adjacent to an opening
    floodedSet.forEach((baseIndex, rle) => {
      if (rle.value !== SegmentationEnum.INTERIOR) {
        // Already filled/handled
        return;
      }
      const j = (baseIndex / width) % height;
      const k = (baseIndex / width - j) / height;
      const rowPrev = j > 0 ? floodedSet.getRun(j - 1, k) : null;
      const rowNext = j + 1 < height ? floodedSet.getRun(j + 1, k) : null;
      const prevCovers = covers(rle, rowPrev);
      const nextCovers = covers(rle, rowNext);
      if (!prevCovers || !nextCovers) {
        floodedSet.floodFill(rle.start, j, k, SegmentationEnum.EXTERIOR);
      }
    });

    // Finally, for all the islands, fill them in
    floodedSet.forEach((baseIndex, rle) => {
      if (rle.value !== SegmentationEnum.INTERIOR) {
        return;
      }
      for (let i = rle.start; i < rle.end; i++) {
        if (rle.value === false) {
          continue;
        }
        previewVoxelManager.setAtIndex(baseIndex + i, previewSegmentIndex);
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

/**
 * Determine if the rle `[start...end)` is covered by row completely
 */
function covers(rle, row) {
  if (!row) {
    return false;
  }
  let { start } = rle;
  const { end } = rle;
  for (const rowRle of row) {
    if (start >= rowRle.start && start < rowRle.end) {
      start = rowRle.end;
      if (start >= end) {
        return true;
      }
    }
  }
  return false;
}
