import ImageQualityStatus from '../enums/ImageQualityStatus';
import VoxelDataSources from '../enums/VoxelDataSources';
import VoxelReductions from '../enums/VoxelReductions';
import VoxelStatistics from '../enums/VoxelStatistics';
import type {
  BoundsIJK,
  DeliveredRegion,
  IVoxelManager,
  PixelDataTypedArray,
  Point3,
  VoxelDataSource,
  VoxelGrid,
  VoxelGridReduction,
  VoxelManagerForEachOptions,
  VoxelQualityRecord,
  VoxelReduction,
  VoxelStatistic,
} from '../types';
import type { PointInShape } from './pointInShapeCallback';
import VoxelManager from './VoxelManager';
import {
  boundsOfFrame,
  boundsOfGrid,
  containsBounds,
  deriveBoxAverageGrid,
  gridCoversRegion,
  imageQualityStatusOfRecord,
  intersectBounds,
  isDefaultSelectionStatistic,
  mapBoundsBetweenGrids,
  mapIndexToNearestVoxel,
  reduceByBoxStatistic,
  sameBounds,
  volumeOfBounds,
  voxelGridKey,
} from './voxelGrid';

/**
 * One sub voxel manager of a composite, with the grid and the statistic that
 * identify it.
 *
 * A representation is identified by the pair (grid, statistic). MANY
 * REPRESENTATIONS CAN EXIST AT ONE RESOLUTION, each one covering a different
 * part of the volume: a set of bricks is exactly that. What is single is one
 * representation for one region, at one resolution, at one statistic.
 */
export type VoxelRepresentation<T> = {
  /** The grid of this representation. */
  grid: VoxelGrid;
  /** The statistic that this representation holds. */
  statistic: VoxelStatistic;
  /** The voxels of this representation. */
  voxelManager: IVoxelManager<T>;
  /**
   * WHAT A LOADER HAS DELIVERED, and at which quality.
   *
   * THE UNIT OF A DELIVERY IS NOT ALWAYS A FRAME. A streaming volume delivers
   * one frame at a time, a brick store delivers a box of voxels, and a whole
   * slide image delivers a tile. Each entry therefore carries the REGION that
   * the delivery covered, in the index space of THIS representation, and the
   * quality of that data. A frame is the entry whose region is one k slice, and
   * `boundsOfFrame` builds that region.
   *
   * One delivery can also replace an earlier delivery of the same region at a
   * better quality: a byte range of an HTJ2K frame arrives as `SUBRESOLUTION`,
   * and the rest of that frame arrives later as `FULL_RESOLUTION`.
   * `setDeliveredQuality` applies the rule that
   * `BaseStreamingImageVolume.updateTextureAndTriggerEvents` applies to
   * `cachedFrames`: A LOWER QUALITY NEVER REPLACES A HIGHER ONE.
   *
   * MR-API-VM-12: one vocabulary describes the quality, and the vocabulary
   * applies at more than one granularity. The record of one delivery and the
   * record of a region that a viewport reads are the same thing at two scales,
   * and `getRegionQuality` aggregates the one into the other.
   *
   * DELIVERIES CAN OVERLAP, and they often do: a brick store delivers a box
   * that holds part of a frame that a progressive loader already delivered.
   * EACH VOXEL THEN CARRIES THE BEST QUALITY THAT ANY DELIVERY GAVE IT, and
   * `getRegionQuality` counts the union of the deliveries exactly, so an
   * overlap is never counted twice.
   */
  delivered?: DeliveredRegion[];
  /**
   * The quality of every voxel that no entry of `delivered` covers. A
   * representation that arrives in one piece states this value and no entry.
   * `undefined` means that the data of those voxels has not arrived.
   */
  quality?: ImageQualityStatus;
  /**
   * HOW the data of this representation reached its spacing. `none` by default,
   * which is a representation that holds every voxel of its own grid.
   *
   * The kind of the reduction is not the source of the data. A box average and
   * a decimation at one spacing have a different loss, and a verdict reads the
   * kind to decide whether a display resolution can carry the data.
   */
  reduction?: VoxelReduction;
  /**
   * WHERE the data of this representation came from: a level of a server store,
   * a reduction that this client computed, a sub-resolution decode, or a direct
   * load. The source carries no rule, and a reader that reports the fidelity to
   * a user names it.
   */
  source?: VoxelDataSource;
  /**
   * THE RECORD OF THE DATA THAT PRODUCED A DERIVED REPRESENTATION, frozen at
   * the moment of the derivation, in the index space of that source.
   *
   * A voxel of a derived representation is a box of source voxels, and not one
   * source voxel, so the quality of that voxel is the quality of the WORST
   * source voxel of its box, and the voxel holds no data at all while any
   * source voxel of its box has not arrived. `getRegionQuality` therefore maps
   * the region back into the source and reads this record, instead of holding a
   * record of its own.
   *
   * The copy is frozen, so the record never states more than the data that the
   * derivation really read. A later derivation from a better source replaces
   * the data and the copy at the same time.
   */
  derivedFrom?: {
    grid: VoxelGrid;
    delivered?: DeliveredRegion[];
    quality?: ImageQualityStatus;
    /**
     * The box size and the region that took the source to this representation.
     * `refreshDerivedFrames` reads it to redo one part of the derivation when
     * new source data arrives.
     */
    reduction?: VoxelGridReduction;
    /** Whether the derivation rounds each value. */
    round?: boolean;
  };
};

export type { DeliveredRegion, VoxelQualityRecord };

/**
 * The absolute record of a region. This is the name that this file used before
 * the record moved to `types/VoxelQuality.ts`, and it stays as an alias.
 */
export type RegionQuality = VoxelQualityRecord;

/** The three inputs of the selection rule. */
export type VoxelRepresentationSelector = {
  /**
   * The region that the caller reads, in the index space of the composite. The
   * default is the whole volume.
   */
  region?: BoundsIJK;
  /**
   * The statistic that the caller needs. The default considers every statistic
   * whose definition sets `defaultSelection`, which is `average` alone.
   */
  statistic?: VoxelStatistic;
  /**
   * The resolution that the caller will use, as the spacing of one voxel. A
   * request that fills a texture at one eighth passes the spacing of that
   * texture. A read from a tool passes nothing, and the rule then degenerates
   * to "the highest resolution available".
   */
  ceiling?: Point3;
};

export type CompositeVoxelManagerOptions<T> = {
  /**
   * The representation that defines the index space of the composite. Every
   * region, and every index of the existing API, belongs to this grid.
   */
  primary: IVoxelManager<T>;
  /** The grid of the primary representation. */
  grid: VoxelGrid;
  /** The statistic of the primary representation. `average` by default. */
  statistic?: VoxelStatistic;
  /** The quality of the primary representation. */
  quality?: ImageQualityStatus;
  /**
   * What a loader has already delivered into the primary representation.
   *
   * A volume that holds every voxel states nothing here, and a derivation then
   * reads the whole grid. A volume that still loads states the regions that
   * arrived, and an empty list therefore means that nothing arrived yet.
   */
  delivered?: DeliveredRegion[];
  /** The identifier of the composite. */
  id?: string;
};

/** The options of a derivation of a new representation. */
export type CreateVoxelRepresentationOptions = {
  /** The box size of each axis of the derivation. */
  factors: Point3;
  /** The representation that the derivation reads. The best source by default. */
  sourceGrid?: VoxelGrid;
  /** The region of the source, for a derivation of one brick. */
  sourceOffset?: Point3;
  /** The number of source voxels of the region. */
  sourceDimensions?: Point3;
  /** The statistic of the new representation. `average` by default. */
  statistic?: VoxelStatistic;
  /** Rounds each value. `true` by default, for a store of whole numbers. */
  round?: boolean;
  /**
   * The kind of the reduction that this derivation performs. A box reduction by
   * default, which does not alias.
   */
  reduction?: VoxelReduction;
  /** The source of the data. A reduction of this client by default. */
  source?: VoxelDataSource;
};

/** What the deliveries of one region cover, and at which quality. */
type Coverage = {
  covered: number;
  lowest: ImageQualityStatus;
  highest: ImageQualityStatus;
  deliveries: number;
  exact: boolean;
};

/**
 * The largest number of cells that an exact count of the coverage builds, and
 * the largest amount of work that the marking of those cells costs.
 *
 * A loader tiles a representation, so the deliveries share their edges: 500
 * frames give 501 edges on one axis and 2 edges on each other axis, and a store
 * of 8 x 8 x 8 bricks gives 9 edges on each axis. A regular delivery therefore
 * stays far below these limits, and only a set of boxes at unrelated offsets
 * reaches them.
 */
const MAX_COVERAGE_CELLS = 1 << 20;
const MAX_COVERAGE_WORK = 1 << 23;

/** Gives the index of each distinct edge of the boxes, on one axis. */
function edgesOfAxis(
  boxes: BoundsIJK[],
  region: BoundsIJK,
  axis: number
): number[] {
  const edges = new Set<number>([region[axis][0], region[axis][1] + 1]);

  for (const box of boxes) {
    edges.add(box[axis][0]);
    edges.add(box[axis][1] + 1);
  }

  return [...edges].sort((a, b) => a - b);
}

/**
 * Gives what the deliveries cover inside the region, and the quality of that
 * coverage.
 *
 * DELIVERIES CAN OVERLAP. The function therefore cuts the region at every edge
 * of every delivery, which gives a set of cells that no delivery crosses. Each
 * cell then takes THE BEST QUALITY OF THE DELIVERIES THAT HOLD IT, because a
 * voxel that arrived twice holds the better of the two. The count of what the
 * deliveries cover is exact, and an overlap is never counted twice.
 *
 * The cost grows with the number of deliveries that MEET THE REGION, and not
 * with the number of deliveries that the representation holds.
 */
function coverageOfRegion(
  deliveries: DeliveredRegion[],
  region: BoundsIJK
): Coverage {
  const coverage: Coverage = {
    covered: 0,
    lowest: undefined,
    highest: undefined,
    deliveries: 0,
    exact: true,
  };
  const clipped: DeliveredRegion[] = [];

  for (const delivery of deliveries ?? []) {
    const bounds = intersectBounds(delivery.bounds, region);

    if (volumeOfBounds(bounds) > 0) {
      clipped.push({ bounds, quality: delivery.quality });
      coverage.deliveries++;
    }
  }

  if (clipped.length === 0) {
    return coverage;
  }

  const boxes = clipped.map((delivery) => delivery.bounds);
  const edges = [0, 1, 2].map((axis) => edgesOfAxis(boxes, region, axis));
  const counts = edges.map((axisEdges) => axisEdges.length - 1);
  const indexOfEdge = edges.map(
    (axisEdges) => new Map(axisEdges.map((edge, index) => [edge, index]))
  );
  const cellCount = counts[0] * counts[1] * counts[2];

  if (
    cellCount > MAX_COVERAGE_CELLS ||
    cellCount * clipped.length > MAX_COVERAGE_WORK
  ) {
    // The edges of these deliveries are too many to cut exactly. THE ESTIMATE
    // TAKES THE LARGEST DELIVERY ALONE, which never counts more than the
    // deliveries really cover, so the record never states less than what is
    // missing.
    for (const delivery of clipped) {
      const volume = volumeOfBounds(delivery.bounds);

      coverage.covered = Math.max(coverage.covered, volume);
      coverage.lowest = Math.min(
        coverage.lowest ?? delivery.quality,
        delivery.quality
      );
      coverage.highest = Math.max(
        coverage.highest ?? delivery.quality,
        delivery.quality
      );
    }

    coverage.exact = false;

    return coverage;
  }

  const cells = new Array<number>(cellCount).fill(0);

  for (const delivery of clipped) {
    const from = [0, 1, 2].map((axis) =>
      indexOfEdge[axis].get(delivery.bounds[axis][0])
    );
    const to = [0, 1, 2].map((axis) =>
      indexOfEdge[axis].get(delivery.bounds[axis][1] + 1)
    );

    for (let k = from[2]; k < to[2]; k++) {
      for (let j = from[1]; j < to[1]; j++) {
        for (let i = from[0]; i < to[0]; i++) {
          const cell = i + j * counts[0] + k * counts[0] * counts[1];

          if (delivery.quality > cells[cell]) {
            cells[cell] = delivery.quality;
          }
        }
      }
    }
  }

  for (let k = 0; k < counts[2]; k++) {
    for (let j = 0; j < counts[1]; j++) {
      for (let i = 0; i < counts[0]; i++) {
        const quality = cells[i + j * counts[0] + k * counts[0] * counts[1]];

        if (quality === 0) {
          continue;
        }

        coverage.covered +=
          (edges[0][i + 1] - edges[0][i]) *
          (edges[1][j + 1] - edges[1][j]) *
          (edges[2][k + 1] - edges[2][k]);
        coverage.lowest = Math.min(coverage.lowest ?? quality, quality);
        coverage.highest = Math.max(coverage.highest ?? quality, quality);
      }
    }
  }

  return coverage;
}

/**
 * Derives the comparable summary of a record, and gives the record back.
 *
 * `ImageQualityStatus` stays as the comparable summary, and every existing
 * `minQuality` floor reads it. The code derives the summary from the record, so
 * the record holds the facts and the summary holds one number that a floor can
 * compare.
 */
function withStatus(record: VoxelQualityRecord): VoxelQualityRecord {
  record.status = imageQualityStatusOfRecord(record);

  return record;
}

/** The volume of one voxel, which orders the resolutions. */
function voxelVolume(grid: VoxelGrid): number {
  return grid.spacing[0] * grid.spacing[1] * grid.spacing[2];
}

/** States whether the grid is at or below the resolution of the ceiling. */
function withinCeiling(grid: VoxelGrid, ceiling: Point3): boolean {
  const tolerance = 1e-6;

  for (let axis = 0; axis < 3; axis++) {
    if (grid.spacing[axis] < ceiling[axis] - tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * A voxel manager that holds MORE THAN ONE REPRESENTATION OF THE SAME DATA AT
 * THE SAME TIME.
 *
 * The composite implements `IVoxelManager`, and it is not a subclass of
 * `VoxelManager`. Every member of the existing API delegates to the PRIMARY
 * representation, so a viewport, a tool, a segmentation and an annotation get
 * the same geometry, the same number of slices and the same positions that they
 * get today. New code opts in to the new API.
 *
 * WHAT THE COMPOSITE ADDS:
 *
 * - `addRepresentation` and `getRepresentations` hold the sub voxel managers.
 * - `getRepresentation` addresses one representation DIRECTLY, and no selection
 *   rule applies to that read.
 * - `selectRepresentation` holds the selection rule, which is a volatility. A
 *   later implementation can select a different access pattern, and no call
 *   site changes.
 * - `createRepresentation` derives a new representation. THE SELECTION NEVER
 *   CREATES, because whether a new representation is worth its cost depends on
 *   the configuration and on the data that is available, so a CALLER decides.
 * - `acceptData` takes new data for a region at a stated quality, which is what
 *   a loader calls when a brick, a sub-resolution frame or a full frame
 *   arrives.
 * - `fillGrid` fills a grid from the best sources that the composite has. A
 *   FILL IS MANY TO ONE: several representations can cover one region between
 *   them, which is the brick case.
 *
 * `getAtIJK` returns the nearest value that is available, and it never returns
 * `undefined` for a voxel that is in bounds. The values are already wrong today
 * when the load is not complete, so this is not a new defect; what changes is
 * that a consumer can now discover the defect.
 */
export default class CompositeVoxelManager<T> implements IVoxelManager<T> {
  private readonly representations: VoxelRepresentation<T>[] = [];
  private readonly primaryRepresentation: VoxelRepresentation<T>;
  private readonly compositeId: string;

  /** The representation that defines the index space of the composite. */
  public readonly primary: IVoxelManager<T>;

  constructor({
    primary,
    grid,
    statistic = VoxelStatistics.Average,
    quality,
    delivered,
    id,
  }: CompositeVoxelManagerOptions<T>) {
    this.primary = primary;
    this.compositeId = id || `composite-${primary.id}`;
    this.primaryRepresentation = {
      grid,
      statistic,
      voxelManager: primary,
      quality,
      delivered,
    };
    this.representations.push(this.primaryRepresentation);
  }

  // ==========================================================================
  // The multi-resolution API
  // ==========================================================================

  /** The grid of the primary representation. */
  public get grid(): VoxelGrid {
    return this.primaryRepresentation.grid;
  }

  /** Every representation that the composite holds, the primary included. */
  public getRepresentations(): VoxelRepresentation<T>[] {
    return [...this.representations];
  }

  /**
   * Adds a representation. The caller owns the voxel manager and the grid.
   *
   * A representation that shares the key of a representation that the composite
   * already holds REPLACES that representation, because one region at one
   * resolution at one statistic has one sub voxel manager.
   */
  public addRepresentation(
    representation: VoxelRepresentation<T>
  ): VoxelRepresentation<T> {
    const key = voxelGridKey(representation.grid, representation.statistic);
    const existing = this.representations.findIndex(
      (candidate) => voxelGridKey(candidate.grid, candidate.statistic) === key
    );

    if (existing >= 0) {
      this.representations[existing] = representation;
    } else {
      this.representations.push(representation);
    }

    return representation;
  }

  /**
   * Gives one representation DIRECTLY, by its grid and its statistic. No
   * selection rule applies to a read through the result. A render path does
   * this when it draws the sub-resolution data, and this is the only way to
   * reach a statistic that a default selection does not consider.
   */
  public getRepresentation(
    grid: VoxelGrid,
    statistic: VoxelStatistic = VoxelStatistics.Average
  ): VoxelRepresentation<T> {
    const key = voxelGridKey(grid, statistic);

    return this.representations.find(
      (candidate) => voxelGridKey(candidate.grid, candidate.statistic) === key
    );
  }

  /**
   * THE SELECTION RULE. It takes three inputs: the region, the statistic and
   * the ceiling.
   *
   * The rule selects the representation of the HIGHEST RESOLUTION THAT IS NOT
   * HIGHER THAN THE CEILING, among those that match the statistic and cover the
   * region. A tie of the resolution takes the better quality.
   *
   * WHY THE CEILING MATTERS. Without it, a request that fills a texture at one
   * eighth selects the full-resolution data, and it reduces that data at every
   * fill.
   *
   * WHEN NOTHING SITS AT THE CEILING the rule returns the best that exists.
   * Every candidate is then finer than the ceiling, and the rule takes the
   * coarsest of them, which is the cheapest source that still holds the
   * resolution that the caller asked for.
   *
   * THE RULE NEVER CREATES. `createRepresentation` creates, and a caller
   * decides whether a new representation is worth its cost.
   *
   * The rule resolves FOR A REGION, and not for each voxel, because a test
   * inside the inner loop of a brush tool is too slow.
   */
  public selectRepresentation({
    region,
    statistic,
    ceiling,
  }: VoxelRepresentationSelector = {}): VoxelRepresentation<T> {
    const candidates = this.candidatesFor(region, statistic);

    if (candidates.length === 0) {
      return undefined;
    }

    const atOrBelowCeiling = ceiling
      ? candidates.filter((candidate) => withinCeiling(candidate.grid, ceiling))
      : candidates;

    if (atOrBelowCeiling.length > 0) {
      return this.finest(atOrBelowCeiling, region);
    }

    return this.coarsest(candidates, region);
  }

  /**
   * Gives every representation that covers the region, from the finest to the
   * coarsest. A read that finds no value in one representation continues with
   * the next, so a region that no representation covers yet - A HOLE - still
   * gives a value from the coarsest representation that covers it. The user
   * must not see a blank region.
   */
  public coveringRepresentations(
    region?: BoundsIJK,
    statistic?: VoxelStatistic
  ): VoxelRepresentation<T>[] {
    return this.candidatesFor(region, statistic).sort(
      (a, b) => voxelVolume(a.grid) - voxelVolume(b.grid)
    );
  }

  /**
   * Derives a new representation, and adds it to the composite.
   *
   * The source is the representation of `sourceGrid`, or the best that the
   * composite holds. A box size is a whole number of at least 1, so the result
   * is never finer than its source: A DERIVATION ALWAYS GOES FROM A HIGHER
   * RESOLUTION TO A LOWER ONE, and data that no derivation can give comes from
   * a direct load through `acceptData`.
   */
  public createRepresentation({
    factors,
    sourceGrid,
    sourceOffset,
    sourceDimensions,
    statistic = VoxelStatistics.Average,
    round = true,
    reduction: kind,
    source = VoxelDataSources.ClientDerived,
  }: CreateVoxelRepresentationOptions): VoxelRepresentation<T> {
    const sourceRepresentation = sourceGrid
      ? this.sourceOfDerivation(sourceGrid, { statistic })
      : this.selectRepresentation({});

    if (!sourceRepresentation) {
      throw new Error(
        'createRepresentation: the composite holds no source for the derivation'
      );
    }

    const reduction: VoxelGridReduction = {
      factors,
      sourceOffset,
      sourceDimensions,
    };
    // A DERIVATION ALWAYS GOES FROM A HIGHER RESOLUTION TO A LOWER ONE. The
    // construction holds that rule: a box size is a whole number of at least 1,
    // so the result is never finer than the source that it reads.
    const grid = deriveBoxAverageGrid(sourceRepresentation.grid, reduction);
    const voxelManager = this.createVoxelManagerForGrid(
      grid,
      sourceRepresentation
    );

    const reducesAnAxis = factors.some((factor) => factor > 1);
    const representation = this.addRepresentation({
      grid,
      statistic,
      voxelManager,
      quality: sourceRepresentation.quality,
      // A BOX REDUCTION DOES NOT ALIAS: every source voxel of the box reaches
      // the result. An axis that no factor reduces holds every source voxel, so
      // that derivation is no reduction at all.
      reduction:
        kind ??
        (reducesAnAxis ? VoxelReductions.BoxAverage : VoxelReductions.None),
      source,
      // THE RECORD OF THE SOURCE BECOMES THE RECORD OF THE RESULT, and the copy
      // states the data that the derivation really read. A box that reads a
      // source voxel that has not arrived holds nothing, and
      // `refreshDerivedFrames` redoes that box, and this copy, when the voxel
      // arrives.
      derivedFrom: {
        grid: sourceRepresentation.grid,
        delivered: sourceRepresentation.delivered
          ? [...sourceRepresentation.delivered]
          : undefined,
        quality: sourceRepresentation.quality,
        reduction,
        round,
      },
    });

    const { delivered } = sourceRepresentation;

    if (delivered) {
      // The source states which regions hold data, so reduce those regions and
      // no others. A streaming volume of 512 x 512 x 1232 voxels holds 323
      // million of them, and a pass over all of them takes tens of seconds and
      // gives nothing for a region that no delivery covers.
      for (const delivery of delivered) {
        this.reduceRegionInto(representation, sourceRepresentation, {
          bounds: delivery.bounds,
        });
      }
    } else {
      // The source states no region, so it holds data everywhere.
      reduceByBoxStatistic(
        sourceRepresentation.voxelManager as never,
        reduction,
        voxelManager as never,
        { statistic, round }
      );
    }

    return representation;
  }

  /**
   * Takes new data at a stated quality.
   *
   * A loader calls this member when a brick, a sub-resolution frame or a full
   * frame arrives. The data goes into the representation of its own grid, and
   * the composite adds that representation when the composite does not hold it
   * yet.
   *
   * THE UNIT OF A DELIVERY IS NOT ALWAYS A FRAME. `bounds` states the region
   * that the delivery covered, in the index space of that representation, so a
   * brick of a brick store and a tile of a whole slide image each state their
   * own box. `frameIndex` is the convenience for the case of one frame, and it
   * builds the bounds of one k slice.
   *
   * A call that states neither `bounds` nor `frameIndex` states the quality of
   * every voxel that no delivery covers.
   */
  public acceptData({
    grid,
    voxelManager,
    statistic = VoxelStatistics.Average,
    quality = ImageQualityStatus.FULL_RESOLUTION,
    bounds,
    frameIndex,
    reduction,
    source,
  }: {
    grid: VoxelGrid;
    voxelManager?: IVoxelManager<T>;
    statistic?: VoxelStatistic;
    quality?: ImageQualityStatus;
    bounds?: BoundsIJK;
    frameIndex?: number;
    /** How this data reached its spacing. `none` by default. */
    reduction?: VoxelReduction;
    /** Where this data came from. A direct load by default. */
    source?: VoxelDataSource;
  }): VoxelRepresentation<T> {
    const existing = this.getRepresentation(grid, statistic);
    const production = {
      reduction: reduction ?? existing?.reduction ?? VoxelReductions.None,
      source: source ?? existing?.source ?? VoxelDataSources.DirectLoad,
    };
    const deliveredBounds =
      bounds ??
      (frameIndex === undefined ? undefined : boundsOfFrame(grid, frameIndex));

    if (!deliveredBounds) {
      return this.addRepresentation({
        grid,
        statistic,
        voxelManager: voxelManager ?? existing?.voxelManager,
        quality,
        delivered: existing?.delivered,
        ...production,
      });
    }

    const representation =
      existing ??
      this.addRepresentation({
        grid,
        statistic,
        voxelManager,
        delivered: [],
        ...production,
      });

    representation.reduction = production.reduction;
    representation.source = production.source;

    if (voxelManager && representation.voxelManager !== voxelManager) {
      representation.voxelManager = voxelManager;
    }

    this.setDeliveredQuality(representation, deliveredBounds, quality);
    this.refreshDerivedFrames(deliveredBounds, grid, statistic);

    return representation;
  }

  /**
   * Redoes the part of every derived representation that a delivery changed.
   *
   * A derived voxel is a box of source voxels, and `createRepresentation`
   * computes that box once, from the data that the composite held at that
   * moment. A streaming loader delivers its frames after that moment, so
   * without this member a derived representation keeps the empty result of the
   * derivation for ever.
   *
   * The work covers the boxes that the delivery touches, and not the whole
   * volume: a volume of 3720 frames re-derives far too slowly to run on the
   * arrival of each frame.
   *
   * @param bounds - the region of the delivery, in the index space of `grid`
   * @param grid - the grid that the delivery wrote
   * @param statistic - the statistic that the delivery wrote
   * @returns the number of representations that this member changed
   */
  public refreshDerivedFrames(
    bounds: BoundsIJK,
    grid: VoxelGrid,
    statistic: VoxelStatistic = VoxelStatistics.Average
  ): number {
    const delivered = this.getRepresentation(grid, statistic);
    let refreshed = 0;

    if (!delivered) {
      return 0;
    }

    for (const representation of this.representations) {
      if (!representation.derivedFrom?.reduction) {
        continue;
      }

      if (this.refreshDerivedRegion(representation, delivered, bounds)) {
        refreshed++;
      }
    }

    return refreshed;
  }

  /**
   * The representation of `grid` that a derivation of `statistic` reads.
   *
   * A derivation prefers the source of its own statistic, and it falls back to
   * the statistic of the primary representation, which is the statistic that
   * a loader delivers.
   */
  private sourceOfDerivation(
    grid: VoxelGrid,
    { statistic }: { statistic: VoxelStatistic }
  ): VoxelRepresentation<T> {
    return (
      this.getRepresentation(grid, statistic) ||
      this.getRepresentation(grid, this.primaryRepresentation.statistic)
    );
  }

  /**
   * Redoes the boxes of one derived representation that cover a source region.
   *
   * @returns true when the member redid at least one box
   */
  private refreshDerivedRegion(
    representation: VoxelRepresentation<T>,
    delivered: VoxelRepresentation<T>,
    bounds: BoundsIJK
  ): boolean {
    const { derivedFrom } = representation;
    const source = this.sourceOfDerivation(derivedFrom.grid, representation);

    if (source !== delivered) {
      // This representation reads other data, so the delivery changes no box
      // of it.
      return false;
    }

    if (!this.reduceRegionInto(representation, source, { bounds })) {
      return false;
    }

    // The record of the source becomes the record of the result again, because
    // the boxes now hold the data that the source holds now.
    derivedFrom.delivered = source.delivered
      ? [...source.delivered]
      : undefined;
    derivedFrom.quality = source.quality;

    return true;
  }

  /**
   * Reduces the part of a source that covers a region into a derived
   * representation.
   *
   * The region states source voxels, and a box holds several of them, so the
   * member grows the region to whole boxes: a delivery of one voxel makes the
   * whole box of that voxel out of date.
   *
   * @returns true when the member reduced at least one box
   */
  private reduceRegionInto(
    representation: VoxelRepresentation<T>,
    source: VoxelRepresentation<T>,
    { bounds }: { bounds: BoundsIJK }
  ): boolean {
    const { reduction, round = true } = representation.derivedFrom ?? {};

    if (!reduction || !source.voxelManager || !representation.voxelManager) {
      return false;
    }

    const { factors } = reduction;
    const offset = reduction.sourceOffset ?? [0, 0, 0];
    const extent = reduction.sourceDimensions ?? source.grid.dimensions;
    const sourceOffset = [0, 0, 0] as Point3;
    const sourceDimensions = [0, 0, 0] as Point3;
    const targetOffset = [0, 0, 0] as Point3;

    for (let axis = 0; axis < 3; axis++) {
      // The region, in the index space that the reduction reads. The reduction
      // reads a region of the source, so a delivery that falls outside that
      // region changes nothing here.
      const first = Math.max(bounds[axis][0] - offset[axis], 0);
      const last = Math.min(bounds[axis][1] - offset[axis], extent[axis] - 1);

      if (first > last) {
        return false;
      }

      const firstBox = Math.floor(first / factors[axis]);
      const lastBox = Math.floor(last / factors[axis]);

      sourceOffset[axis] = offset[axis] + firstBox * factors[axis];
      sourceDimensions[axis] = Math.min(
        (lastBox - firstBox + 1) * factors[axis],
        offset[axis] + extent[axis] - sourceOffset[axis]
      );
      targetOffset[axis] = firstBox;
    }

    reduceByBoxStatistic(
      source.voxelManager as never,
      { factors, sourceOffset, sourceDimensions, targetOffset },
      representation.voxelManager as never,
      { statistic: representation.statistic, round }
    );

    return true;
  }

  /**
   * Records the quality of one delivery of one representation.
   *
   * A LOWER QUALITY NEVER REPLACES A HIGHER ONE for a region that a delivery
   * already covered, which is the rule that
   * `BaseStreamingImageVolume.updateTextureAndTriggerEvents` applies to
   * `cachedFrames`: a decimated frame that arrives after the full frame must
   * not take the record backwards.
   *
   * @returns true when the record changed
   */
  public setDeliveredQuality(
    representation: VoxelRepresentation<T>,
    bounds: BoundsIJK,
    quality: ImageQualityStatus
  ): boolean {
    if (!representation.delivered) {
      representation.delivered = [];
    }

    const { delivered } = representation;
    const existing = delivered.find((delivery) =>
      sameBounds(delivery.bounds, bounds)
    );

    if (existing) {
      // The same region arrived again. A LOWER QUALITY NEVER REPLACES A HIGHER
      // ONE, which is the rule of `cachedFrames`.
      if (existing.quality >= quality) {
        return false;
      }

      existing.quality = quality;

      return true;
    }

    // A delivery that a better delivery already holds changes nothing, so the
    // record does not grow.
    if (
      delivered.some(
        (delivery) =>
          delivery.quality >= quality && containsBounds(delivery.bounds, bounds)
      )
    ) {
      return false;
    }

    // A delivery that holds an earlier delivery of no better quality replaces
    // that earlier delivery, so an overlap does not make the record grow
    // without a limit.
    for (let index = delivered.length - 1; index >= 0; index--) {
      const delivery = delivered[index];

      if (
        delivery.quality <= quality &&
        containsBounds(bounds, delivery.bounds)
      ) {
        delivered.splice(index, 1);
      }
    }

    delivered.push({ bounds, quality });

    return true;
  }

  /**
   * The absolute record of what one representation holds for a region.
   *
   * The region belongs to the index space of the composite, and the function
   * maps that region into the grid of the representation. The record then
   * aggregates the deliveries that meet the region: THE RECORD OF ONE DELIVERY
   * AND THE RECORD OF A REGION ARE THE SAME THING AT TWO SCALES.
   *
   * The record states no verdict. A reader compares the record against its own
   * requirement, so two viewports over one volume can report differently.
   */
  public getRegionQuality(
    representation: VoxelRepresentation<T>,
    region?: BoundsIJK
  ): VoxelQualityRecord {
    const { grid } = representation;
    const target = region
      ? intersectBounds(
          mapBoundsBetweenGrids(this.grid, grid, region),
          boundsOfGrid(grid)
        )
      : boundsOfGrid(grid);
    const voxels = volumeOfBounds(target);
    const record: VoxelQualityRecord = {
      grid,
      reduction: representation.reduction ?? VoxelReductions.None,
      source: representation.source ?? VoxelDataSources.DirectLoad,
      lowest: undefined,
      highest: undefined,
      voxels,
      missing: voxels,
      deliveries: 0,
      exact: true,
      status: ImageQualityStatus.FAR_REPLICATE,
    };

    if (voxels === 0) {
      record.missing = 0;

      return withStatus(record);
    }

    if (representation.derivedFrom) {
      return withStatus(this.qualityOfDerived(representation, target, record));
    }

    const coverage = coverageOfRegion(representation.delivered, target);
    let { covered } = coverage;

    record.deliveries = coverage.deliveries;
    record.lowest = coverage.lowest;
    record.highest = coverage.highest;
    record.exact = coverage.exact;

    if (covered < voxels && representation.quality !== undefined) {
      // Every voxel that no delivery covers carries the quality of the
      // representation, which a representation that arrived in one piece
      // states.
      record.lowest = Math.min(
        record.lowest ?? representation.quality,
        representation.quality
      );
      record.highest = Math.max(
        record.highest ?? representation.quality,
        representation.quality
      );
      covered = voxels;
    }

    record.missing = voxels - covered;

    return withStatus(record);
  }

  /**
   * Fills a target grid from the best sources that the composite holds.
   *
   * A FILL IS MANY TO ONE. Several representations can cover one region between
   * them, which is the brick case, so the fill asks the composite for a value
   * at each voxel of the target, and the composite answers from the best source
   * that holds that voxel. There is no strategy parameter in this version.
   *
   * @returns the number of voxels of the target that the fill wrote
   */
  public fillGrid(
    grid: VoxelGrid,
    target: IVoxelManager<T>,
    statistic: VoxelStatistic = VoxelStatistics.Average
  ): number {
    const sources = this.coveringRepresentations(undefined, statistic);
    let written = 0;

    for (let k = 0; k < grid.dimensions[2]; k++) {
      for (let j = 0; j < grid.dimensions[1]; j++) {
        for (let i = 0; i < grid.dimensions[0]; i++) {
          const value = this.valueFromSources(sources, grid, [i, j, k]);

          if (value === undefined) {
            continue;
          }

          target.setAtIJK(i, j, k, value);
          written++;
        }
      }
    }

    return written;
  }

  /**
   * The absolute record of the data that a reader would get for a region.
   *
   * The reader states the same three inputs that the selection takes, so a
   * reader that will draw at one eighth passes that ceiling and gets the record
   * of the representation that it will really read. TWO VIEWPORTS OVER ONE
   * VOLUME CAN THEREFORE HOLD A DIFFERENT RECORD AT ONE MOMENT, and each record
   * is correct for its reader.
   *
   * The record states no verdict. Commit 4 of this work adds the pure function
   * that compares a record against the requirement of one reader.
   */
  public getQuality(
    selector: VoxelRepresentationSelector = {}
  ): VoxelQualityRecord {
    const selected = this.selectRepresentation(selector);

    return selected
      ? this.getRegionQuality(selected, selector.region)
      : undefined;
  }

  /**
   * The record of a region of a DERIVED representation, which the record of its
   * source gives.
   *
   * The function maps the region back into the source, and it reads the frozen
   * record of the source there. A derived voxel holds no data while any source
   * voxel of its box is missing, so the part of the region that is missing
   * follows the part of the source that is missing.
   */
  private qualityOfDerived(
    representation: VoxelRepresentation<T>,
    target: BoundsIJK,
    record: VoxelQualityRecord
  ): VoxelQualityRecord {
    const { grid, delivered, quality } = representation.derivedFrom;
    const sourceBounds = intersectBounds(
      mapBoundsBetweenGrids(representation.grid, grid, target),
      boundsOfGrid(grid)
    );
    const sourceVoxels = volumeOfBounds(sourceBounds);
    const coverage = coverageOfRegion(delivered, sourceBounds);

    record.deliveries = coverage.deliveries;
    record.lowest = coverage.lowest;
    record.highest = coverage.highest;
    record.exact = coverage.exact;

    if (sourceVoxels === 0) {
      record.missing = record.voxels;

      return withStatus(record);
    }

    let missingSource = sourceVoxels - coverage.covered;

    if (missingSource > 0 && quality !== undefined) {
      record.lowest = Math.min(record.lowest ?? quality, quality);
      record.highest = Math.max(record.highest ?? quality, quality);
      missingSource = 0;
    }

    record.missing = Math.ceil((record.voxels * missingSource) / sourceVoxels);

    // A voxel of this representation is a BOX of source voxels, so the part of
    // the source that is missing gives the part of this representation that is
    // missing, in proportion. The count is exact when the source holds
    // everything, and when the source holds nothing.
    record.exact =
      record.exact && (missingSource === 0 || missingSource === sourceVoxels);

    return withStatus(record);
  }

  // ==========================================================================
  // The parts of the selection rule
  // ==========================================================================

  private candidatesFor(
    region?: BoundsIJK,
    statistic?: VoxelStatistic
  ): VoxelRepresentation<T>[] {
    return this.representations.filter((candidate) => {
      if (statistic) {
        if (candidate.statistic !== statistic) {
          return false;
        }
      } else if (!isDefaultSelectionStatistic(candidate.statistic)) {
        // A DEFAULT SELECTION CONSIDERS THE `average` STATISTIC ONLY. A minimum
        // grid at a high resolution would otherwise win, and a read would
        // return minimum values in place of the data.
        return false;
      }

      if (!region) {
        return true;
      }

      return gridCoversRegion(this.grid, region, candidate.grid);
    });
  }

  private finest(
    representations: VoxelRepresentation<T>[],
    region?: BoundsIJK
  ): VoxelRepresentation<T> {
    return representations.reduce((best, candidate) =>
      this.better(candidate, best, -1, region) ? candidate : best
    );
  }

  private coarsest(
    representations: VoxelRepresentation<T>[],
    region?: BoundsIJK
  ): VoxelRepresentation<T> {
    return representations.reduce((best, candidate) =>
      this.better(candidate, best, 1, region) ? candidate : best
    );
  }

  /**
   * States whether the candidate wins against the best so far. `direction` is
   * -1 for the finest, and 1 for the coarsest. A tie of the resolution takes
   * the better quality.
   */
  private better(
    candidate: VoxelRepresentation<T>,
    best: VoxelRepresentation<T>,
    direction: number,
    region?: BoundsIJK
  ): boolean {
    const difference = voxelVolume(candidate.grid) - voxelVolume(best.grid);

    if (Math.abs(difference) > 1e-9) {
      return Math.sign(difference) === direction;
    }

    // THE QUALITY OF A TIE IS THE QUALITY OVER THE REGION, and not a quality of
    // the whole representation. A representation whose deliveries have arrived
    // for this region wins against a representation that holds the same
    // resolution and has nothing here yet.
    const candidateQuality = this.getRegionQuality(candidate, region);
    const bestQuality = this.getRegionQuality(best, region);

    if (candidateQuality.missing !== bestQuality.missing) {
      return candidateQuality.missing < bestQuality.missing;
    }

    return (candidateQuality.lowest ?? 0) > (bestQuality.lowest ?? 0);
  }

  private createVoxelManagerForGrid(
    grid: VoxelGrid,
    source: VoxelRepresentation<T>
  ): IVoxelManager<T> {
    const { numberOfComponents } = source.voxelManager;
    const Constructor = source.voxelManager.getConstructor();
    const length =
      grid.dimensions[0] *
      grid.dimensions[1] *
      grid.dimensions[2] *
      (numberOfComponents || 1);

    return VoxelManager.createScalarVolumeVoxelManager({
      dimensions: grid.dimensions,
      scalarData: new Constructor(length) as PixelDataTypedArray,
      numberOfComponents,
      id: `${this.compositeId}-${voxelGridKey(grid, source.statistic)}`,
      // The factory gives a voxel manager over a number or over an RGB value,
      // according to the number of the components, and the composite holds
      // whichever of the two its primary representation holds.
    }) as unknown as IVoxelManager<T>;
  }

  /** Reads one voxel of the target grid from the first source that holds it. */
  private valueFromSources(
    sources: VoxelRepresentation<T>[],
    grid: VoxelGrid,
    ijk: Point3
  ): T {
    for (const source of sources) {
      const sourceIJK = mapIndexToNearestVoxel(grid, source.grid, ijk);
      const { dimensions } = source.voxelManager;

      if (
        sourceIJK[0] < 0 ||
        sourceIJK[1] < 0 ||
        sourceIJK[2] < 0 ||
        sourceIJK[0] >= dimensions[0] ||
        sourceIJK[1] >= dimensions[1] ||
        sourceIJK[2] >= dimensions[2]
      ) {
        continue;
      }

      const value = source.voxelManager.getAtIJK(...sourceIJK);

      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  // ==========================================================================
  // `IVoxelManager`: the members that read the data
  // ==========================================================================

  /**
   * Gives the value at an index of the primary grid.
   *
   * The primary representation answers when the primary representation holds a
   * value. Otherwise the read falls back to the representations that cover that
   * voxel, from the finest to the coarsest, so THE READ NEVER GIVES
   * `undefined` FOR A VOXEL THAT IS IN BOUNDS while any representation holds
   * the region.
   */
  public getAtIJK = (i: number, j: number, k: number): T => {
    const value = this.primary.getAtIJK(i, j, k);

    if (value !== undefined && value !== null) {
      return value;
    }

    if (this.representations.length === 1) {
      return value;
    }

    return this.valueFromSources(
      this.coveringRepresentations().filter(
        (representation) => representation !== this.primaryRepresentation
      ),
      this.grid,
      [i, j, k]
    );
  };

  public getAtIJKPoint = (point: Point3): T =>
    this.getAtIJK(point[0], point[1], point[2]);

  public getAtIndex = (index: number): T =>
    this.getAtIJKPoint(this.toIJK(index));

  // ==========================================================================
  // `IVoxelManager`: the members that the primary representation answers
  // ==========================================================================

  public get id(): string {
    return this.compositeId;
  }
  public get dimensions(): Point3 {
    return this.primary.dimensions;
  }
  public get numberOfComponents(): number {
    return this.primary.numberOfComponents;
  }
  public get width(): number {
    return this.primary.width;
  }
  public set width(width: number) {
    this.primary.width = width;
  }
  public get frameSize(): number {
    return this.primary.frameSize;
  }
  public set frameSize(frameSize: number) {
    this.primary.frameSize = frameSize;
  }
  public get map() {
    return this.primary.map;
  }
  public set map(map) {
    this.primary.map = map;
  }
  public get sourceVoxelManager(): IVoxelManager<T> {
    return this.primary.sourceVoxelManager;
  }
  public set sourceVoxelManager(voxelManager: IVoxelManager<T>) {
    this.primary.sourceVoxelManager = voxelManager;
  }
  public get points(): Set<number> {
    return this.primary.points;
  }
  public get modifiedSlices(): Set<number> {
    return this.primary.modifiedSlices;
  }
  public get isInObject() {
    return this.primary.isInObject;
  }
  public set isInObject(isInObject) {
    this.primary.isInObject = isInObject;
  }
  public get sizeInBytes(): number {
    return this.primary.sizeInBytes;
  }
  public get bytePerVoxel(): number {
    return this.primary.bytePerVoxel;
  }
  public get _get() {
    return this.primary._get;
  }
  public get _set() {
    return this.primary._set;
  }
  public get _getConstructor() {
    return this.primary._getConstructor;
  }
  public get _getScalarDataLength() {
    return this.primary._getScalarDataLength;
  }
  public get _getScalarData() {
    return this.primary._getScalarData;
  }
  public get _updateScalarData() {
    return this.primary._updateScalarData;
  }
  public get _getSliceData() {
    return this.primary._getSliceData;
  }
  public get getCompleteScalarDataArray() {
    return this.primary.getCompleteScalarDataArray;
  }
  public get setCompleteScalarDataArray() {
    return this.primary.setCompleteScalarDataArray;
  }
  public get invalidateCache() {
    return this.primary.invalidateCache;
  }
  public get getRange() {
    return this.primary.getRange;
  }

  public setAtIJK = (i: number, j: number, k: number, v): boolean =>
    this.primary.setAtIJK(i, j, k, v);
  public setAtIJKPoint = (point: Point3, v): void =>
    this.primary.setAtIJKPoint(point, v);
  public setAtIndex = (index: number, v): boolean =>
    this.primary.setAtIndex(index, v);

  public toIJK(index: number): Point3 {
    return this.primary.toIJK(index);
  }
  public toIndex(ijk: Point3): number {
    return this.primary.toIndex(ijk);
  }
  public getDefaultBounds(): BoundsIJK {
    return this.primary.getDefaultBounds();
  }
  public getBoundsIJK(): BoundsIJK {
    return this.primary.getBoundsIJK();
  }
  public setBounds(bounds: BoundsIJK): void {
    this.primary.setBounds(bounds);
  }
  public clearBounds(): void {
    this.primary.clearBounds();
  }
  public forEach = (
    callback,
    options?: VoxelManagerForEachOptions
  ): PointInShape[] | void => this.primary.forEach(callback, options);
  public rleForEach(callback, options?): void {
    this.primary.rleForEach(callback, options);
  }
  public getScalarData(storeScalarData?: boolean): PixelDataTypedArray {
    return this.primary.getScalarData(storeScalarData);
  }
  public setScalarData(newScalarData: PixelDataTypedArray): void {
    this.primary.setScalarData(newScalarData);
  }
  public getWritableScalarData(): PixelDataTypedArray | undefined {
    return this.primary.getWritableScalarData();
  }
  public setFromScalarData(scalarData: ArrayLike<number>): void {
    this.primary.setFromScalarData(scalarData);
  }
  public getScalarDataLength(): number {
    return this.primary.getScalarDataLength();
  }
  public getConstructor(): new (length: number) => PixelDataTypedArray {
    return this.primary.getConstructor();
  }
  public getSliceData = (args: {
    sliceIndex: number;
    slicePlane: number;
  }): PixelDataTypedArray => this.primary.getSliceData(args);
  public getMiddleSliceData = (): PixelDataTypedArray =>
    this.primary.getMiddleSliceData();
  public getArrayOfModifiedSlices(): number[] {
    return this.primary.getArrayOfModifiedSlices();
  }
  public resetModifiedSlices(): void {
    this.primary.resetModifiedSlices();
  }
  public addPoint(point: Point3 | number): void {
    this.primary.addPoint(point);
  }
  public getPoints(): Point3[] {
    return this.primary.getPoints();
  }
  public getMinMax(): { min: T; max: T } {
    return this.primary.getMinMax();
  }
  public clear(): void {
    this.primary.clear();
  }
}

export { CompositeVoxelManager };
