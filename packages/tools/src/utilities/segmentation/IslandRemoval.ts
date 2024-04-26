import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import normalizeViewportPlane from './normalizeViewportPlane';

const { RLEVoxelMap, VoxelManager } = utilities;

// The maximum size of a dimension on an image in DICOM
// Note, does not work for whole slide imaging
const MAX_IMAGE_SIZE = 65535;

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

/**
 * This class has the fill island, with various options being available.
 */
export default class IslandRemoval {
  segmentSet: Types.RLEVoxelMap<number>;
  segmentIndex: number;
  fillSegments: (index: number) => boolean;
  previewVoxelManager: Types.VoxelManager<number>;
  previewSegmentIndex: number;

  constructor() {
    // TODO - figure out options to apply here.
  }

  /**
   * Creates a segment set - an RLE based map of points to segment data.
   * This function returns the data in the appropriate planar orientation according
   * to the view, with SegmentationEnum.SEGMENT set for any point within the segment,
   * either preview or base segment colour.
   *
   * Returns undefined if the data is invalid for some reason.
   */
  initialize(viewport, segmentationVoxels, options) {
    const hasSource = !!segmentationVoxels.sourceVoxelManager;
    const segmentationVoxelManager = hasSource
      ? segmentationVoxels.sourceVoxelManager
      : segmentationVoxels;
    const previewVoxelManager = hasSource
      ? segmentationVoxels
      : VoxelManager.createRLEHistoryVoxelManager(segmentationVoxelManager);

    const { previewSegmentIndex, segmentIndex } = options;

    const clickedPoints = options.points || previewVoxelManager.getPoints();
    if (!clickedPoints?.length) {
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

    if (boundsIJK.find((it) => it[0] < 0 || it[1] > MAX_IMAGE_SIZE)) {
      // Nothing done, so just skip this
      return;
    }

    // First get the set of points which are directly connected to the points
    // that the user clicked on/dragged over.
    const { toIJK, fromIJK, boundsIJKPrime, error } = normalizeViewportPlane(
      viewport,
      boundsIJK
    );

    if (error) {
      console.warn(
        'Not performing island removal for planes not orthogonal to acquisition plane',
        error
      );
      return;
    }

    const [width, height, depth] = fromIJK(segmentationVoxelManager.dimensions);
    const segmentSet = new RLEVoxelMap<SegmentationEnum>(width, height, depth);

    // Returns true for new colour, and false otherwise
    const getter = (i, j, k) => {
      const index = segmentationVoxelManager.toIndex(toIJK([i, j, k]));
      const oldVal = segmentationVoxelManager.getAtIndex(index);
      if (oldVal === previewSegmentIndex || oldVal === segmentIndex) {
        // Values are initially false for indexed values.
        return SegmentationEnum.SEGMENT;
      }
    };
    segmentSet.fillFrom(getter, boundsIJKPrime);
    segmentSet.normalizer = { toIJK, fromIJK, boundsIJKPrime };
    this.segmentSet = segmentSet;
  }

  /**
   *  Handle islands which are internal to the flood fill - these are points which
   *  are surrounded entirely by the filled area.
   *  Start by getting the island map - that is, the output from the previous
   *  external island removal.  Then, mark all the points in between two islands
   *  as being "Interior".  The set of points marked interior is within a boundary
   *  point on the left and right, but may still be open above or below.  To
   *  test that, perform a flood fill on the interior points, and see if it is
   *  entirely contained ('covered') on the top and bottom.
   *  Note this is done in a planar fashion, that is one plane at a time, but
   *  covering all planes that have interior data.  That removes islands that
   *  are interior to the currently displayed view to be handled.
   */
  public removeInternalIslands() {
    const { segmentSet, previewVoxelManager, previewSegmentIndex } = this;
    const { height, normalizer } = segmentSet;
    const { toIJK } = normalizer;

    segmentSet.forEachRow((baseIndex, row) => {
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
          segmentSet.set(baseIndex + iPrime, SegmentationEnum.INTERIOR);
        }
        lastRle = rle;
      }
    });
    // Next, remove the island sets which are adjacent to an opening
    segmentSet.forEach((baseIndex, rle) => {
      if (rle.value !== SegmentationEnum.INTERIOR) {
        // Already filled/handled
        return;
      }
      const [, jPrime, kPrime] = segmentSet.toIJK(baseIndex);
      const rowPrev = jPrime > 0 ? segmentSet.getRun(jPrime - 1, kPrime) : null;
      const rowNext =
        jPrime + 1 < height ? segmentSet.getRun(jPrime + 1, kPrime) : null;
      const prevCovers = IslandRemoval.covers(rle, rowPrev);
      const nextCovers = IslandRemoval.covers(rle, rowNext);
      if (rle.end - rle.start > 2 && (!prevCovers || !nextCovers)) {
        segmentSet.floodFill(
          rle.start,
          jPrime,
          kPrime,
          SegmentationEnum.EXTERIOR,
          { singlePlane: true }
        );
      }
    });

    // Finally, for all the islands, fill them in with the preview colour as
    // they are now internal
    segmentSet.forEach((baseIndex, rle) => {
      if (rle.value !== SegmentationEnum.INTERIOR) {
        return;
      }
      for (let iPrime = rle.start; iPrime < rle.end; iPrime++) {
        const clearPoint = toIJK(segmentSet.toIJK(baseIndex + iPrime));
        previewVoxelManager.setAtIJKPoint(clearPoint, previewSegmentIndex);
      }
    });
    return previewVoxelManager.getArrayOfSlices();
  }

  /**
   * Determine if the rle `[start...end)` is covered by row completely, by which
   * it is meant that the row has RLE elements from the start to the end of the
   * RLE section, matching every index i in the start to end.
   */
  public static covers(rle, row) {
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
}
