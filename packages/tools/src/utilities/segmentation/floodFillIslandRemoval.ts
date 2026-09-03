import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import IslandRemoval, { SegmentationEnum } from './islandRemoval';

const { logger } = utilities;
const { growCutLog: islandRemovalLog } = logger;

export { SegmentationEnum };

/**
 * {@link IslandRemoval} specialized for the one-click flood fill tools. It
 * keeps the base algorithm untouched and adds:
 *
 * - **Painted-point tracking**: {@link getInternalFilledPoints} reports the
 *   exact hole voxels the last `removeInternalIslands` run painted, so callers
 *   can report the true final painted set without value-scanning slices (which
 *   would over-collect same-segment voxels from earlier operations).
 * - **Delta-safe external removal**: `removeExternalIslands` only clears the
 *   voxels this run added (source value still equal to the preview index) and
 *   is skipped with a warning when no preview layer exists — clearing accepted
 *   voxels from earlier runs is never possible.
 * - **Verbose diagnostics** behind the `verboseLogging` option.
 */
export default class FloodFillIslandRemoval extends IslandRemoval {
  /** When true, log bounds, per-click flood, and voxel counts. */
  private verboseLogging = false;
  /**
   * True when the caller supplied a real preview layer (the input voxel manager
   * had a `sourceVoxelManager`). External island removal is only meaningful with
   * a preview layer to hold the per-run delta. See {@link removeExternalIslands}.
   */
  private usingPreviewLayer = false;
  /** Exact points the last removeInternalIslands run painted (filled holes). */
  private internalFilledPoints: Types.Point3[] = [];

  constructor(options?: {
    maxInternalRemove?: number;
    fillInternalEdge?: boolean;
    verboseLogging?: boolean;
  }) {
    super(options);
    this.verboseLogging = options?.verboseLogging ?? this.verboseLogging;
  }

  initialize(viewport, segmentationVoxels, options) {
    this.usingPreviewLayer = !!segmentationVoxels.sourceVoxelManager;
    const initialized = super.initialize(viewport, segmentationVoxels, options);
    if (initialized && this.verboseLogging) {
      const { segmentSet } = this;
      islandRemovalLog.info('islandRemoval: initialize', {
        segmentIndex: this.segmentIndex,
        previewSegmentIndex: this.previewSegmentIndex,
        segmentSetDimensions: {
          width: segmentSet.width,
          height: segmentSet.height,
          depth: segmentSet.depth,
        },
        boundsIJKPrime: segmentSet.normalizer.boundsIJKPrime,
        clickedPoints: this.selectedPoints,
        segmentVoxelsInPlaneGrid: FloodFillIslandRemoval.countRleValueVolume(
          segmentSet,
          SegmentationEnum.SEGMENT
        ),
      });
    }
    return initialized;
  }

  /** Sum of run lengths in the RLE map for a given classification value. */
  private static countRleValueVolume(
    segmentSet: Types.RLEVoxelMap<SegmentationEnum>,
    value: SegmentationEnum
  ): number {
    let n = 0;
    segmentSet.forEach((_baseIndex, rle) => {
      if (rle.value === value) {
        n += rle.end - rle.start;
      }
    });
    return n;
  }

  public floodFillSegmentIsland() {
    if (this.verboseLogging) {
      const { selectedPoints, segmentSet } = this;
      const { fromIJK } = segmentSet.normalizer;
      for (const clickedPoint of selectedPoints) {
        const ijkPrime = fromIJK(clickedPoint);
        const atClick = segmentSet.get(segmentSet.toIndex(ijkPrime));
        if (atClick !== SegmentationEnum.SEGMENT) {
          islandRemovalLog.info(
            'islandRemoval: floodFillSegmentIsland click skipped (not SEGMENT)',
            {
              clickedPointVolumeIJK: clickedPoint,
              ijkPrime,
              segmentSetAtIndex: atClick,
            }
          );
        }
      }
    }

    const floodedCount = super.floodFillSegmentIsland();

    if (this.verboseLogging) {
      islandRemovalLog.info('islandRemoval: floodFillSegmentIsland done', {
        totalIslandVoxels: floodedCount,
        islandVoxelsAfterFlood: FloodFillIslandRemoval.countRleValueVolume(
          this.segmentSet,
          SegmentationEnum.ISLAND
        ),
      });
    }

    return floodedCount;
  }

  /**
   * Clear segment voxels not connected (in segmentSet topology) to the click.
   *
   * External island removal is inherently a delta operation: it clears the
   * voxels this run added that are not connected to the click. That delta only
   * exists on a preview layer. When the caller passed a plain segmentation
   * voxel manager (no preview layer), `initialize` synthesizes a history
   * wrapper whose source still holds the accepted voxels, so clearing the
   * preview override reverts straight back to the accepted value — a no-op for
   * accepted data. Warn so the skipped cleanup is explicit rather than silent.
   *
   * @returns Number of voxels cleared in the labelmap.
   */
  public removeExternalIslands(): number {
    const { previewVoxelManager, segmentSet } = this;
    const { toIJK } = segmentSet.normalizer;
    const sourceVoxelManager =
      previewVoxelManager.sourceVoxelManager ?? previewVoxelManager;

    if (!this.usingPreviewLayer) {
      islandRemovalLog.warn(
        'islandRemoval: removeExternalIslands has no preview layer; ' +
          'external island cleanup of accepted voxels is skipped. ' +
          'Run island removal through a preview layer to clear external islands.'
      );
      return 0;
    }

    // Next, iterate over all points which were set to a new value in the preview
    // For everything NOT connected to something in set of clicked points,
    // remove it from the preview.
    let clearedVoxels = 0;

    const callback = (index, rle) => {
      const [, jPrime, kPrime] = segmentSet.toIJK(index);
      if (rle.value !== SegmentationEnum.ISLAND) {
        for (let iPrime = rle.start; iPrime < rle.end; iPrime++) {
          const clearPoint = toIJK([iPrime, jPrime, kPrime]);
          // The preview layer here is a WRITE-THROUGH history voxel manager:
          // the source already holds this run's values, so reading the source
          // identifies candidates, and `set(null)` reverts a voxel to its
          // pre-run value only if this run modified it (no-op otherwise) —
          // accepted voxels from earlier runs are left untouched.
          const sourceVal = sourceVoxelManager.getAtIJKPoint(clearPoint);
          if (sourceVal === this.previewSegmentIndex) {
            previewVoxelManager.setAtIJKPoint(clearPoint, null);
            clearedVoxels += 1;
          }
        }
      }
    };

    segmentSet.forEach(callback, { rowModified: true });

    if (this.verboseLogging) {
      islandRemovalLog.info('islandRemoval: removeExternalIslands', {
        clearedVoxels,
      });
    }

    return clearedVoxels;
  }

  public removeInternalIslands() {
    this.internalFilledPoints = [];
    const modifiedSlices = super.removeInternalIslands();
    if (this.verboseLogging) {
      islandRemovalLog.info('islandRemoval: removeInternalIslands', {
        modifiedSliceCount: modifiedSlices?.length,
        internalFilledPoints: this.internalFilledPoints.length,
        maxInternalRemove: this.maxInternalRemove,
      });
    }
    return modifiedSlices;
  }

  protected onInternalPointFilled(point: Types.Point3): void {
    this.internalFilledPoints.push(point);
  }

  /**
   * Exact points the last {@link removeInternalIslands} call painted — the
   * filled internal holes, beyond the caller's own flood. Lets callers report
   * the true final painted set without value-scanning slices (which would
   * over-collect same-segment voxels from earlier operations).
   */
  public getInternalFilledPoints(): Types.Point3[] {
    return this.internalFilledPoints;
  }
}
