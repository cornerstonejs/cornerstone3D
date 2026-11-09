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
  VoxelManagerForEachOptions,
  VoxelQualityRecord,
  VoxelReduction,
  VoxelStatistic,
} from '../types';
import type { PointInShape } from './pointInShapeCallback';
import {
  boundsOfFrame,
  boundsOfGrid,
  containsBounds,
  gridCoversRegion,
  imageQualityStatusOfRecord,
  intersectBounds,
  isDefaultSelectionStatistic,
  mapBoundsBetweenGrids,
  mapIndexToNearestVoxel,
  requireVoxelStatistic,
  volumeOfBounds,
  voxelGridKey,
  voxelGridsEqual,
} from './voxelGrid';

/**
 * One sub voxel manager of a composite, with the grid and the statistic that
 * identify it.
 *
 * A representation is identified by the pair (grid, statistic). Many
 * representations can exist at one resolution, each one covering a different
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
   * The images of the image cache that hold the voxels, when the voxels live
   * there. One image holds one slice of the grid, in the order of the grid, and
   * the voxel manager above reads them. A consumer that wants the voxels of one
   * slice without a copy reads `cache.getImage(imageIds[slice])`.
   *
   * A representation that keeps an array of its own states nothing here.
   */
  imageIds?: string[];
  /**
   * What a loader has delivered, and at which quality.
   *
   * The unit of a delivery is not always a frame. A streaming volume delivers
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
   * `cachedFrames`: a lower quality never replaces a higher one.
   *
   * One vocabulary describes the quality, and the vocabulary
   * applies at more than one granularity. The record of one delivery and the
   * record of a region that a viewport reads are the same thing at two scales,
   * and `getRegionQuality` aggregates the one into the other.
   *
   * Deliveries can overlap, and they often do: a brick store delivers a box
   * that holds part of a frame that a progressive loader already delivered.
   * Each voxel then carries the best quality that any delivery gave it, and
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
   * The record of the data that produced a derived representation, in the
   * index space of that source.
   *
   * A voxel of a derived representation is a box of source voxels, and not one
   * source voxel, so the quality of that voxel is the quality of the WORST
   * source voxel of its box. The voxel is the average of the source voxels of
   * its box that arrived, and it holds no data only while no source voxel of
   * its box has arrived. `getRegionQuality` therefore maps
   * the region back into the source and reads this record, instead of holding a
   * record of its own.
   *
   * `getGridQuality` builds such a record for a grid that no representation
   * holds, from the live record of the source.
   */
  derivedFrom?: {
    grid: VoxelGrid;
    delivered?: DeliveredRegion[];
    quality?: ImageQualityStatus;
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
   * A volume that holds every voxel states nothing here. A volume that still loads states the regions that
   * arrived, and an empty list therefore means that nothing arrived yet.
   */
  delivered?: DeliveredRegion[];
  /** The identifier of the composite. */
  id?: string;
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
 * Deliveries can overlap. The function therefore cuts the region at every edge
 * of every delivery, which gives a set of cells that no delivery crosses. Each
 * cell then takes the best quality of the deliveries that hold it, because a
 * voxel that arrived twice holds the better of the two. The count of what the
 * deliveries cover is exact, and an overlap is never counted twice.
 *
 * The cost grows with the number of deliveries that meet the region, and not
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

  // The marking visits the cells that each delivery spans. One frame of a
  // volume spans one layer of cells, so the work grows with the number of
  // frames, and not with the square of that number.
  const spans = clipped.map((delivery) => ({
    from: [0, 1, 2].map((axis) =>
      indexOfEdge[axis].get(delivery.bounds[axis][0])
    ),
    to: [0, 1, 2].map((axis) =>
      indexOfEdge[axis].get(delivery.bounds[axis][1] + 1)
    ),
  }));
  const work = spans.reduce(
    (total, { from, to }) =>
      total + (to[0] - from[0]) * (to[1] - from[1]) * (to[2] - from[2]),
    0
  );

  if (cellCount > MAX_COVERAGE_CELLS || work > MAX_COVERAGE_WORK) {
    // The edges of these deliveries are too many to cut exactly. The estimate
    // takes the largest delivery alone, which never counts more than the
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

  for (let index = 0; index < clipped.length; index++) {
    const delivery = clipped[index];
    const { from, to } = spans[index];

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
 * The index of one record of deliveries, so that one delivery costs a constant
 * number of comparisons and not one for each delivery that arrived before it.
 *
 * A streaming volume of 3720 frames records 3720 deliveries, and each frame is
 * one k slice that no other frame contains, so the record never collapses. A
 * scan of the record for each delivery is therefore quadratic over a load.
 *
 * `byBounds` answers "did this exact region arrive before". `bySlice` holds the
 * deliveries that touch one k slice, and containment needs an overlap in k, so
 * a delivery compares itself against the deliveries of its own k slices alone.
 */
type DeliveryIndex = {
  byBounds: Map<string, DeliveredRegion>;
  bySlice: Map<number, Set<DeliveredRegion>>;
};

/** The key of one region. `sameBounds` compares the same six whole numbers. */
function boundsKey(bounds: BoundsIJK): string {
  return `${bounds[0][0]},${bounds[0][1]},${bounds[1][0]},${bounds[1][1]},${bounds[2][0]},${bounds[2][1]}`;
}

function addToDeliveryIndex(
  index: DeliveryIndex,
  delivery: DeliveredRegion
): void {
  index.byBounds.set(boundsKey(delivery.bounds), delivery);

  for (let k = delivery.bounds[2][0]; k <= delivery.bounds[2][1]; k++) {
    let bucket = index.bySlice.get(k);

    if (!bucket) {
      bucket = new Set<DeliveredRegion>();
      index.bySlice.set(k, bucket);
    }

    bucket.add(delivery);
  }
}

function removeFromDeliveryIndex(
  index: DeliveryIndex,
  delivery: DeliveredRegion
): void {
  index.byBounds.delete(boundsKey(delivery.bounds));

  for (let k = delivery.bounds[2][0]; k <= delivery.bounds[2][1]; k++) {
    index.bySlice.get(k)?.delete(delivery);
  }
}

function buildDeliveryIndex(delivered: DeliveredRegion[]): DeliveryIndex {
  const index: DeliveryIndex = {
    byBounds: new Map(),
    bySlice: new Map(),
  };

  for (const delivery of delivered) {
    addToDeliveryIndex(index, delivery);
  }

  return index;
}

/**
 * A voxel manager that holds more than one representation of the same data at
 * the same time.
 *
 * The composite implements `IVoxelManager`, and it is not a subclass of
 * `VoxelManager`. Every member of the existing API delegates to the PRIMARY
 * representation, so a viewport, a tool, a segmentation and an annotation get
 * the same geometry, the same number of slices and the same positions that they
 * get today. New code opts in to the new API.
 *
 * What the composite adds:
 *
 * - `addRepresentation` and `getRepresentations` hold the sub voxel managers.
 * - `getRepresentation` addresses one representation DIRECTLY, and no selection
 *   rule applies to that read.
 * - `selectRepresentation` holds the selection rule, which is a volatility. A
 *   later implementation can select a different access pattern, and no call
 *   site changes.
 * - The selection never creates. A caller adds a representation with
 *   `addRepresentation` or `acceptData`.
 * - `acceptData` takes new data for a region at a stated quality, which is what
 *   a loader calls when a brick, a sub-resolution frame or a full frame
 *   arrives.
 * - `fillGrid` fills a grid from the best sources that the composite has. A
 *   fill is many to one: several representations can cover one region between
 *   them, which is the brick case.
 *
 * `getAtIJK` returns the nearest value that is available, and it never returns
 * `undefined` for a voxel that is in bounds. The values are already wrong today
 * when the load is not complete, so this is not a new defect; what changes is
 * that a consumer can now discover the defect.
 */
/** The reduction that a box derivation of this statistic records. */
function boxReductionOf(statistic: VoxelStatistic): VoxelReduction {
  return (
    requireVoxelStatistic(statistic).boxReduction ?? VoxelReductions.BoxAverage
  );
}

export default class CompositeVoxelManager<T> implements IVoxelManager<T> {
  private readonly representations: VoxelRepresentation<T>[] = [];
  private readonly primaryRepresentation: VoxelRepresentation<T>;
  private readonly compositeId: string;
  /**
   * The index of each record of deliveries, by the array that holds that
   * record. `setDeliveredQuality` is the one member that changes such an array,
   * so an index stays true while the array lives. A representation that takes a
   * new array gets a new index, because the key is the array itself.
   */
  private readonly deliveryIndexes = new WeakMap<
    DeliveredRegion[],
    DeliveryIndex
  >();

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
   * The selection rule. It takes three inputs: the region, the statistic and
   * the ceiling.
   *
   * The rule selects the representation of the highest resolution that is not
   * higher than the ceiling, among those that match the statistic and cover the
   * region. A tie of the resolution takes the better quality.
   *
   * Why the ceiling matters. Without it, a request that fills a texture at one
   * eighth selects the full-resolution data, and it reduces that data at every
   * fill.
   *
   * When nothing sits at the ceiling the rule returns the best that exists.
   * Every candidate is then finer than the ceiling, and the rule takes the
   * coarsest of them, which is the cheapest source that still holds the
   * resolution that the caller asked for.
   *
   * The rule never creates a representation.
   *
   * The rule resolves for a region, and not for each voxel, because a test
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
   * The record of the data that a grid holds when it reads the best source of
   * the composite.
   *
   * A representation of that grid answers for itself. A grid that no
   * representation holds is the grid of a texture that fills by box average
   * straight from the source, and the record of the source deliveries, mapped
   * into that grid, is then the record of the texture.
   */
  public getGridQuality(
    grid: VoxelGrid,
    {
      statistic = VoxelStatistics.Average,
      region,
    }: { statistic?: VoxelStatistic; region?: BoundsIJK } = {}
  ): VoxelQualityRecord {
    const existing = this.getRepresentation(grid, statistic);

    if (existing) {
      return this.getRegionQuality(existing, region);
    }

    const source = this.sourceOfDerivation(this.grid, { statistic });

    if (!source) {
      return undefined;
    }

    // A representation that holds no voxels and states the live record of its
    // source: the texture reads the source as the source is now.
    const reducesAnAxis = !voxelGridsEqual(grid, source.grid);

    return this.getRegionQuality(
      {
        grid,
        statistic,
        voxelManager: undefined,
        reduction: reducesAnAxis
          ? boxReductionOf(statistic)
          : VoxelReductions.None,
        source: VoxelDataSources.ClientDerived,
        derivedFrom: {
          grid: source.grid,
          delivered: source.delivered,
          quality: source.quality,
        },
      },
      region
    );
  }

  /**
   * Takes new data at a stated quality.
   *
   * A loader calls this member when a brick, a sub-resolution frame or a full
   * frame arrives. The data goes into the representation of its own grid, and
   * the composite adds that representation when the composite does not hold it
   * yet.
   *
   * The unit of a delivery is not always a frame. `bounds` states the region
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
    imageIds,
    statistic = VoxelStatistics.Average,
    quality = ImageQualityStatus.FULL_RESOLUTION,
    bounds,
    frameIndex,
    reduction,
    source,
  }: {
    grid: VoxelGrid;
    voxelManager?: IVoxelManager<T>;
    /**
     * The images of the image cache that hold the voxels of this
     * representation, one for each slice of its grid. A loader that delivers a
     * reduced level of a server store, or a brick, states them, and the voxels
     * then live in the image cache with the full-resolution frames.
     */
    imageIds?: string[];
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
        imageIds: imageIds ?? existing?.imageIds,
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
        imageIds,
        delivered: [],
        ...production,
      });

    representation.reduction = production.reduction;
    representation.source = production.source;

    if (voxelManager && representation.voxelManager !== voxelManager) {
      representation.voxelManager = voxelManager;
    }

    if (imageIds) {
      representation.imageIds = imageIds;
    }

    this.setDeliveredQuality(representation, deliveredBounds, quality);

    return representation;
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
   * Records the quality of one delivery of one representation.
   *
   * A lower quality never replaces a higher one for a region that a delivery
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
    const index = this.deliveryIndexOf(delivered);
    const existing = index.byBounds.get(boundsKey(bounds));

    if (existing) {
      // The same region arrived again. A lower quality never replaces a higher
      // one, which is the rule of `cachedFrames`. The key is the region alone,
      // so a change of the quality leaves the index true.
      if (existing.quality >= quality) {
        return false;
      }

      existing.quality = quality;

      return true;
    }

    // A delivery that a better delivery already holds changes nothing, so the
    // record does not grow. A delivery that holds this region covers every k
    // slice of it, so it lies in the bucket of the first of those slices.
    const containers = index.bySlice.get(bounds[2][0]);

    if (containers) {
      for (const delivery of containers) {
        if (
          delivery.quality >= quality &&
          containsBounds(delivery.bounds, bounds)
        ) {
          return false;
        }
      }
    }

    // A delivery that holds an earlier delivery of no better quality replaces
    // that earlier delivery, so an overlap does not make the record grow
    // without a limit. Such an earlier delivery lies inside the k slices of
    // this one, so the buckets of those slices hold every candidate.
    const contained = new Set<DeliveredRegion>();

    for (let k = bounds[2][0]; k <= bounds[2][1]; k++) {
      const bucket = index.bySlice.get(k);

      if (!bucket) {
        continue;
      }

      for (const delivery of bucket) {
        if (
          delivery.quality <= quality &&
          containsBounds(bounds, delivery.bounds)
        ) {
          contained.add(delivery);
        }
      }
    }

    if (contained.size) {
      for (const delivery of contained) {
        removeFromDeliveryIndex(index, delivery);
      }

      // One pass over the record, and not one `splice` for each removal.
      let write = 0;

      for (let read = 0; read < delivered.length; read++) {
        if (!contained.has(delivered[read])) {
          delivered[write++] = delivered[read];
        }
      }

      delivered.length = write;
    }

    const delivery = { bounds, quality };

    delivered.push(delivery);
    addToDeliveryIndex(index, delivery);

    return true;
  }

  /**
   * The index of one record of deliveries, which the member builds once for
   * each array that it sees. See `DeliveryIndex`.
   */
  private deliveryIndexOf(delivered: DeliveredRegion[]): DeliveryIndex {
    let index = this.deliveryIndexes.get(delivered);

    if (!index) {
      index = buildDeliveryIndex(delivered);
      this.deliveryIndexes.set(delivered, index);
    }

    return index;
  }

  /**
   * The absolute record of what one representation holds for a region.
   *
   * The region belongs to the index space of the composite, and the function
   * maps that region into the grid of the representation. The record then
   * aggregates the deliveries that meet the region: the record of one delivery
   * and the record of a region are the same thing at two scales.
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
   * A fill is many to one. Several representations can cover one region between
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

    // The primary holds the data itself, with no reduction, so it serves every
    // statistic. It is also the finest source.
    if (!sources.includes(this.primaryRepresentation)) {
      sources.unshift(this.primaryRepresentation);
    }

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
   * of the representation that it will really read. Two viewports over one
   * volume can therefore hold a different record at one moment, and each record
   * is correct for its reader.
   *
   * The record states no verdict. `compareVoxelQuality` compares a record
   * against the requirement of one reader.
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
   * The record of a region of a derived representation, which the record of its
   * source gives.
   *
   * The function maps the region back into the source, and it reads the frozen
   * record of the source there for the qualities. A derived voxel is the
   * average of the source voxels of its box that arrived, so it holds
   * data when any source voxel of its box arrived. Only a box that no source
   * delivery meets counts as missing. A box can be fractional (see `boxSpan`),
   * and a source voxel that the box cuts counts as a voxel of that box.
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

    if (coverage.covered < sourceVoxels && quality !== undefined) {
      record.lowest = Math.min(record.lowest ?? quality, quality);
      record.highest = Math.max(record.highest ?? quality, quality);
      record.missing = 0;

      return withStatus(record);
    }

    // The deliveries of the source, mapped onto the boxes that they meet.
    const boxes = coverageOfRegion(
      (delivered ?? []).map((delivery) => ({
        bounds: mapBoundsBetweenGrids(
          grid,
          representation.grid,
          delivery.bounds
        ),
        quality: delivery.quality,
      })),
      target
    );

    record.missing = record.voxels - boxes.covered;
    record.exact = record.exact && boxes.exact;

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
        // A default selection considers the `average` statistic only. A minimum
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

    // The quality of a tie is the quality over the region, and not a quality of
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
   * voxel, from the finest to the coarsest, so the read never gives
   * `undefined` for a voxel that is in bounds while any representation holds
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
