import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import normalizeViewportPlane from '../utils/normalizeViewportPlane';

const { RLEVoxelMap } = utilities;

export enum SegmentationEnum {
  // Segment means it is in the segment or preview of interest
  SEGMENT = 1,
  // Island means it is connected to a selected point
  ISLAND = 2,
  // Interior means it is inside the island, or possibly inside
  INTERIOR = 3,
  // Exterior means it is outside the island
  EXTERIOR = 4,
}

const showFillColors = true;

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
      viewport,
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
      ]) as Types.BoundsIJK;

    if (boundsIJK.find((it) => it[0] < 0 || it[1] > 65535)) {
      // Nothing done, so just skip this
      return;
    }

    // First get the set of points which are directly connected to the points
    // that the user clicked on/dragged over.
    const { toIJK, fromIJK, boundsIJKPrime } = normalizeViewportPlane(
      viewport,
      boundsIJK
    );

    const [width, height, depth] = fromIJK(segmentationVoxelManager.dimensions);
    const floodedSet = new RLEVoxelMap<SegmentationEnum>(width, height, depth);
    // Returns true for new colour, and false otherwise
    const getter = (i, j, k) => {
      const index = segmentationVoxelManager.toIndex(toIJK([i, j, k]));
      const oldVal = segmentationVoxelManager.getAtIndex(index);
      if (oldVal === previewSegmentIndex || oldVal === segmentIndex) {
        // Values are initially false for indexed values.
        return SegmentationEnum.SEGMENT;
      }
    };
    floodedSet.fillFrom(getter, boundsIJKPrime);

    let floodedCount = 0;

    clickedPoints.forEach((clickedPoint) => {
      const ijkPrime = fromIJK(clickedPoint);
      const index = floodedSet.toIndex(ijkPrime);
      const [iPrime, jPrime, kPrime] = ijkPrime;
      if (floodedSet.get(index) === SegmentationEnum.SEGMENT) {
        floodedCount += floodedSet.floodFill(
          iPrime,
          jPrime,
          kPrime,
          SegmentationEnum.ISLAND
        );
      }
    });

    if (floodedCount === 0) {
      return;
    }
    // Next, iterate over all points which were set to a new value in the preview
    // For everything NOT connected to something in set of clicked points,
    // remove it from the preview.
    const clearedCount = 0;
    let previewCount = 0;

    const callback = (index, rle, row) => {
      const [, jPrime, kPrime] = floodedSet.toIJK(index);
      if (rle.value === SegmentationEnum.ISLAND) {
        previewCount += rle.end - rle.start;
      } else {
        // TODO - figure out what value to set to restore this to before preview
        for (let iPrime = rle.start; iPrime < rle.end; iPrime++) {
          // preview voxel manager knows to reset on null
          const clearPoint = toIJK([iPrime, jPrime, kPrime]);
          previewVoxelManager.setAtIJKPoint(clearPoint, null);
          // previewVoxelManager.setAtIJKPoint(clearPoint, 2);
        }
      }
    };

    floodedSet.forEach(callback, { rowModified: true });

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
    // Start by getting the island map - the set of islands which are between
    // two rle runs.
    floodedSet.forEachRow((baseIndex, row) => {
      let lastRle;
      for (const rle of [...row]) {
        if (rle.value !== SegmentationEnum.ISLAND) {
          continue;
        }
        if (!lastRle) {
          lastRle = rle;
          continue;
        }
        for (let iPrime = lastRle.end; iPrime < rle.start; iPrime++) {
          floodedSet.set(baseIndex + iPrime, SegmentationEnum.INTERIOR);
        }
        lastRle = rle;
      }
    });
    // Next, remove the island sets which are adjacent to an opening
    floodedSet.forEach((baseIndex, rle) => {
      if (rle.value !== SegmentationEnum.INTERIOR) {
        // Already filled/handled
        return;
      }
      const [, jPrime, kPrime] = floodedSet.toIJK(baseIndex);
      const rowPrev = jPrime > 0 ? floodedSet.getRun(jPrime - 1, kPrime) : null;
      const rowNext =
        jPrime + 1 < height ? floodedSet.getRun(jPrime + 1, kPrime) : null;
      const prevCovers = covers(rle, rowPrev);
      const nextCovers = covers(rle, rowNext);
      if (rle.end - rle.start > 2 && (!prevCovers || !nextCovers)) {
        floodedSet.floodFill(
          rle.start,
          jPrime,
          kPrime,
          SegmentationEnum.EXTERIOR,
          { singlePlane: true }
        );
      }
    });

    // Finally, for all the islands, fill them in
    floodedSet.forEach((baseIndex, rle) => {
      if (rle.value !== SegmentationEnum.INTERIOR) {
        return;
      }
      for (let iPrime = rle.start; iPrime < rle.end; iPrime++) {
        const clearPoint = toIJK(floodedSet.toIJK(baseIndex + iPrime));
        previewVoxelManager.setAtIJKPoint(clearPoint, previewSegmentIndex);
      }
    });

    triggerSegmentationDataModified(
      operationData.segmentationId,
      previewVoxelManager.getArrayOfSlices(),
      previewSegmentIndex
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
  console.log('Not covered', rle, row, start, end);
  return false;
}
