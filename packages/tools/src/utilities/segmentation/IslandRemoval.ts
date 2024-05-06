import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import normalizeViewportPlane from '../normalizeViewportPlane';

const { RLEVoxelMap, VoxelManager } = utilities;

// The maximum size of a dimension on an image in DICOM
// Note, does not work for whole slide imaging
const MAX_IMAGE_SIZE = 65535;

export enum SegmentationEnum {
  // Segment means it is in the segment or preview of interest
  SEGMENT = -1,
  // Island means it is connected to a selected point
  ISLAND = -2,
  // Interior means it is inside the island, or possibly inside
  INTERIOR = -3,
  // Exterior means it is outside the island
  EXTERIOR = -4,
}

/**
 * This class has the fill island, with various options being available.
 *
 * The usage of this class is to:
 *   1. Get the viewport where a labelmap segmentation has been created with
 *      some data containing islands created.
 *   2. Initialize the instance of this class using the initialize method,
 *      providing it the viewport, the segmentation voxel manager and some options
 *   3. Generate the updated island classification using `floodFillSegmentIsland`
 *   4. For external island removal, call the `removeExternalIslands`.
 *      * External islands are segmentation data which not connected to the central
 *        selected points.
 *      * External island removal should be done before internal island removal for performance
 *   5. For internal island removal, call the 'removeInternalIslands'
 *      * Internal islands are entirely surrounded sections of non-segment marked areas
 *   6. Trigger a segmentation data updated on the originally provided segmentation voxel manager
 *      set of slices.
 */
export default class IslandRemoval {
  /**
   * The segment set is a set that categorizes points in the segmentation
   * as belonging to one of the categories in SegmentationEnum.  Undefined
   * here means that it is a non-relevant segment index.
   * Note this is an RLEVoxelMap for efficiency of storage and running
   * fill algorithms, as it is expected that the classes will have fairly long
   * runs.
   */
  segmentSet: Types.RLEVoxelMap<SegmentationEnum>;
  segmentIndex: number;
  fillSegments: (index: number) => boolean;
  previewVoxelManager: Types.VoxelManager<number>;
  previewSegmentIndex: number;
  /**
   * The selected points are the points that have been directly identified as
   * belonging to the segmentation set, either via user selection or some other
   * process that identifies this set of points as being definitely inside the
   * island.
   */
  selectedPoints: Types.Point3[];

  /**
   * Initializes the island fill.  This is used by providing a viewport
   * that is currently display the segment points of interest, plus a voxel manager
   * that is either a segmentation voxel manager or a preview voxel manager, and
   * a set of options for things like the segment indices to fill/apply to.
   *
   * The `floodFillSegmentIsland` is an additional initialization piece that
   * internally records additional information on the flood fill.
   *
   * Returns undefined if the data is invalid for some reason.
   *
   * @param viewport - showing the current orientation view of an image with the
   *        desired labelmap to have island removal applied.
   * @param segmentationVoxels - the voxel manager for the segmentation labelmap.
   *    * Can be a preview voxel manager or just a basic voxel manager on the segmentation, or
   *      an RLE history voxel manager for using with undo/redo.
   *    * May contain getPoints that is the set of starting points which mark
   *          individual islands
   * @param options - contains options on how to apply the island removal
   *    * points - the selected points to start the island removal from
   *    * segmentIndex - the segment index for the final color segmentation
   *      * If there is no previewSegmentIndex, then the segment index will be
   *        used for all operations, otherwise a preview will be updated, filling
   *        it with the preview segment index.
   *    * previewSegmentIndex - the preview segment index.
   *      * Allows for showing a preview of the changes.
   *      * Omit to perform non-preview displays of segmentation voxels.
   *      * Should be 255 typically
   *
   */
  initialize(viewport, segmentationVoxels, options) {
    const hasSource = !!segmentationVoxels.sourceVoxelManager;
    const segmentationVoxelManager = hasSource
      ? segmentationVoxels.sourceVoxelManager
      : segmentationVoxels;
    const previewVoxelManager = hasSource
      ? segmentationVoxels
      : VoxelManager.createRLEHistoryVoxelManager(segmentationVoxelManager);

    const { segmentIndex = 1, previewSegmentIndex = 1 } = options;

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
    this.previewVoxelManager = previewVoxelManager;
    this.segmentIndex = segmentIndex;
    this.previewSegmentIndex = previewSegmentIndex ?? segmentIndex;
    this.selectedPoints = clickedPoints;

    return true;
  }

  /**
   * This operation starts a flood fill on the set of points that were selected
   * (typically by clicking on them or hovering over them in some way, but other
   * options are possible).  All of the selected points are marked as SEGMENT,
   * and then all the flood fill points that planar connected to them are marked
   * as being ISLAND points.  Then, this is repeated for planes in both normal and
   * anti-normal directions for the points which were so marked (this is done
   * internally to the floodFill algorithm).
   *
   * This results in a set of points in the volume which are connected to the
   * points originally selected, thus an island point, where the island is the island
   * containing the selected points.
   *
   * The return value is the number of such points selected.
   */
  public floodFillSegmentIsland() {
    const { selectedPoints: clickedPoints, segmentSet } = this;
    // Just used to count up how many points got filled.
    let floodedCount = 0;
    const { fromIJK } = segmentSet.normalizer;

    // First mark everything as island that is connected to a start point
    clickedPoints.forEach((clickedPoint) => {
      const ijkPrime = fromIJK(clickedPoint);
      const index = segmentSet.toIndex(ijkPrime);
      const [iPrime, jPrime, kPrime] = ijkPrime;
      if (segmentSet.get(index) === SegmentationEnum.SEGMENT) {
        floodedCount += segmentSet.floodFill(
          iPrime,
          jPrime,
          kPrime,
          SegmentationEnum.ISLAND
        );
      }
    });

    return floodedCount;
  }

  /**
   * This part removes external islands.  External islands are regions of voxels which
   * are not connected to the selected/click points.  The algorithm is to
   * start with all of the clicked points, performing a flood fill along all
   * sections that are within the given segment, replacing the "SEGMENT"
   * indicator with a new "ISLAND" indicator.  Then, every point in the
   * preview that is not marked as ISLAND is now external and can be reset to
   * the value it had before the flood fill was initiated.
   */
  public removeExternalIslands() {
    const { previewVoxelManager, segmentSet } = this;
    const { toIJK } = segmentSet.normalizer;

    // Next, iterate over all points which were set to a new value in the preview
    // For everything NOT connected to something in set of clicked points,
    // remove it from the preview.

    const callback = (index, rle) => {
      const [, jPrime, kPrime] = segmentSet.toIJK(index);
      if (rle.value !== SegmentationEnum.ISLAND) {
        for (let iPrime = rle.start; iPrime < rle.end; iPrime++) {
          const clearPoint = toIJK([iPrime, jPrime, kPrime]);
          const v = previewVoxelManager.getAtIJKPoint(clearPoint);
          // preview voxel manager knows to reset on null if it has a preview
          // value, but need to clear to 0 for non-preview points as those
          // will be undefined in the preview voxel manager.
          previewVoxelManager.setAtIJKPoint(
            clearPoint,
            v === undefined ? 0 : null
          );
        }
      }
    };

    segmentSet.forEach(callback, { rowModified: true });
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
