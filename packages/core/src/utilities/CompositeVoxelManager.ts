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
  volumeOfBounds,
  voxelGridKey,
  voxelGridsEqual,
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
   * THE IMAGES OF THE IMAGE CACHE THAT HOLD THE VOXELS, when the voxels live
   * there. One image holds one slice of the grid, in the order of the grid, and
   * the voxel manager above reads them. A consumer that wants the voxels of one
   * slice without a copy reads `cache.getImage(imageIds[slice])`.
   *
   * A representation that keeps an array of its own states nothing here.
   */
  imageIds?: string[];
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
    /**
     * While a derivation runs in batches, the first source k slice that it has
     * not reduced yet. The record above then covers the slices before it and no
     * others. `undefined` once the derivation is complete.
     */
    reducedUntil?: number;
  };
  /**
   * Resolves when the derivation of this representation is complete. A large
   * derivation reduces its slices in batches, in idle time, so the voxels and
   * the record of the quality fill over several tasks.
   */
  derivation?: Promise<void>;
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
  /**
   * BUILDS THE STORE OF A DERIVED REPRESENTATION.
   *
   * The composite computes the voxels of a derivation, and it does not decide
   * where those voxels live. `ImageVolume` supplies a function that puts them in
   * the IMAGE CACHE, one image for each slice of the derived grid, so the one
   * cache that holds the full-resolution frames counts and evicts the reduced
   * voxels as well.
   *
   * A composite that states no function, which a test does, keeps an array of
   * its own.
   *
   * @returns the store, or `undefined` to keep an array
   */
  createStorage?: (request: {
    /** The grid of the new representation. */
    grid: VoxelGrid;
    /** The statistic of the new representation. */
    statistic: VoxelStatistic;
    /** The box size of each axis, and the region of the source. */
    reduction: VoxelGridReduction;
    /** The representation that the derivation reads. */
    source: VoxelRepresentation<T>;
  }) => RepresentationStorage<T> | undefined;
  /**
   * Hears that a derivation wrote new voxels outside a delivery, which a
   * derivation in batches does. The region is in the index space of the
   * composite. `ImageVolume` marks its textures there, because a texture that
   * reads the derived representation must read the new voxels.
   */
  onDerivedRegionChanged?: (region: BoundsIJK) => void;
};

/** Where the voxels of one derived representation live. */
export type RepresentationStorage<T> = {
  /** The voxel manager over those voxels. */
  voxelManager: IVoxelManager<T>;
  /** The images of the image cache that hold them, one for each slice. */
  imageIds?: string[];
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

/**
 * The number of slices of the derived grid that one batch of a derivation
 * reduces. A derivation of 16 slices of 256 x 256 from 32 source slices of
 * 512 x 512 reads about 8 million voxels, which keeps one batch short.
 */
const DERIVATION_BATCH_SLICES = 16;

/** Runs a callback in idle time, or in the next task where no idle callback exists. */
function scheduleIdle(callback: () => void): void {
  const requestIdle = (
    globalThis as {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;

  if (requestIdle) {
    requestIdle(callback);
  } else {
    setTimeout(callback, 0);
  }
}

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
 * THE INDEX OF ONE RECORD OF DELIVERIES, so that one delivery costs a constant
 * number of comparisons and not one for each delivery that arrived before it.
 *
 * A streaming volume of 3720 frames records 3720 deliveries, and each frame is
 * one k slice that no other frame contains, so the record never collapses. A
 * scan of the record for each delivery is therefore quadratic over a load.
 *
 * `byBounds` answers "did this exact region arrive before". `bySlice` holds the
 * deliveries that touch one k slice, and CONTAINMENT NEEDS AN OVERLAP IN K, so
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
  /**
   * The quality at which a refresh of the derived representations last WROTE
   * voxels for one region of one source. See `acceptData`.
   */
  private readonly refreshedQuality = new Map<string, ImageQualityStatus>();
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

  /** Builds the store of a derived representation. See the options. */
  private readonly createStorage?: CompositeVoxelManagerOptions<T>['createStorage'];

  /** Hears the regions that a derivation in batches wrote. See the options. */
  private readonly onDerivedRegionChanged?: CompositeVoxelManagerOptions<T>['onDerivedRegionChanged'];

  /** Set by `dispose`, which stops every derivation that still runs. */
  private disposed = false;

  constructor({
    primary,
    grid,
    statistic = VoxelStatistics.Average,
    quality,
    delivered,
    id,
    createStorage,
    onDerivedRegionChanged,
  }: CompositeVoxelManagerOptions<T>) {
    this.primary = primary;
    this.createStorage = createStorage;
    this.onDerivedRegionChanged = onDerivedRegionChanged;
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
    const { voxelManager, imageIds } = this.createStorageForGrid(
      grid,
      sourceRepresentation,
      reduction,
      statistic
    );

    const reducesAnAxis = factors.some((factor) => factor > 1);
    const boxReduction =
      statistic === VoxelStatistics.ForegroundMajority
        ? VoxelReductions.BoxForegroundMajority
        : VoxelReductions.BoxAverage;
    const representation = this.addRepresentation({
      grid,
      statistic,
      voxelManager,
      imageIds,
      quality: sourceRepresentation.quality,
      // A BOX REDUCTION DOES NOT ALIAS: every source voxel of the box reaches
      // the result. An axis that no factor reduces holds every source voxel, so
      // that derivation is no reduction at all.
      reduction: kind ?? (reducesAnAxis ? boxReduction : VoxelReductions.None),
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

    // The source states which regions hold data, so reduce those regions and
    // no others. A streaming volume of 512 x 512 x 1232 voxels holds 323
    // million of them, and a pass over all of them takes tens of seconds and
    // gives nothing for a region that no delivery covers. A source that states
    // no region holds data everywhere.
    const regions = sourceRepresentation.delivered
      ? sourceRepresentation.delivered.map((delivery) => delivery.bounds)
      : [boundsOfGrid(sourceRepresentation.grid)];

    this.deriveInBatches(representation, sourceRepresentation, regions);

    return representation;
  }

  /**
   * Stops every derivation that still runs. A volume that discards its
   * composite calls this member, because a batch would otherwise write into a
   * representation that nothing reads.
   */
  public dispose(): void {
    this.disposed = true;
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
        reduction: !reducesAnAxis
          ? VoxelReductions.None
          : statistic === VoxelStatistics.ForegroundMajority
            ? VoxelReductions.BoxForegroundMajority
            : VoxelReductions.BoxAverage,
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
   * Reduces the regions of a source into a derived representation, in batches
   * of `DERIVATION_BATCH_SLICES` slices of the derived grid.
   *
   * The first batch runs at once. Each later batch runs in idle time, because a
   * volume that holds all of its data would otherwise reduce every voxel in one
   * call: 512 x 512 x 2464 voxels take many seconds on the main thread. While
   * the batches run, the record of the representation covers the slices that
   * the batches reduced and no others.
   */
  private deriveInBatches(
    representation: VoxelRepresentation<T>,
    source: VoxelRepresentation<T>,
    regions: BoundsIJK[]
  ): void {
    const { derivedFrom } = representation;
    const factorK = derivedFrom.reduction.factors[2];
    const offsetK = derivedFrom.reduction.sourceOffset?.[2] ?? 0;
    const depth = representation.grid.dimensions[2];
    const batches = Math.ceil(depth / DERIVATION_BATCH_SLICES);

    const reduceBatch = (batch: number): BoundsIJK => {
      const firstK = offsetK + batch * DERIVATION_BATCH_SLICES * factorK;
      const lastK =
        offsetK +
        Math.min((batch + 1) * DERIVATION_BATCH_SLICES, depth) * factorK -
        1;
      const sourceBounds = boundsOfGrid(source.grid);
      const slab: BoundsIJK = [
        sourceBounds[0],
        sourceBounds[1],
        [firstK, Math.min(lastK, sourceBounds[2][1])],
      ];

      for (const region of regions) {
        const part = intersectBounds(region, slab);

        if (volumeOfBounds(part) > 0) {
          this.reduceRegionInto(representation, source, { bounds: part });
        }
      }

      derivedFrom.reducedUntil =
        batch + 1 < batches ? slab[2][1] + 1 : undefined;
      this.syncDerivedRecord(representation, source);

      return slab;
    };

    reduceBatch(0);

    if (batches <= 1) {
      representation.derivation = Promise.resolve();

      return;
    }

    representation.derivation = new Promise<void>((resolve) => {
      const runBatch = (batch: number) => {
        if (
          this.disposed ||
          !this.representations.includes(representation) ||
          batch >= batches
        ) {
          resolve();

          return;
        }

        const slab = reduceBatch(batch);

        this.onDerivedRegionChanged?.(
          intersectBounds(
            mapBoundsBetweenGrids(source.grid, this.grid, slab),
            boundsOfGrid(this.grid)
          )
        );
        scheduleIdle(() => runBatch(batch + 1));
      };

      scheduleIdle(() => runBatch(1));
    });
  }

  /**
   * Copies the record of a source into the record of a derived representation.
   *
   * A derivation that still runs covers the source slices before
   * `reducedUntil` and no others, so the copy keeps the deliveries of those
   * slices only, and it states no quality for the rest. The record therefore
   * never states a voxel that the derivation has not written.
   */
  private syncDerivedRecord(
    representation: VoxelRepresentation<T>,
    source: VoxelRepresentation<T>
  ): void {
    const { derivedFrom } = representation;
    const { reducedUntil } = derivedFrom;

    if (reducedUntil === undefined) {
      derivedFrom.delivered = source.delivered
        ? [...source.delivered]
        : undefined;
      derivedFrom.quality = source.quality;

      return;
    }

    const sourceBounds = boundsOfGrid(source.grid);
    const reduced: BoundsIJK = [
      sourceBounds[0],
      sourceBounds[1],
      [sourceBounds[2][0], reducedUntil - 1],
    ];
    const deliveries =
      source.delivered ??
      (source.quality === undefined
        ? []
        : [{ bounds: sourceBounds, quality: source.quality }]);

    derivedFrom.delivered = deliveries
      .map((delivery) => ({
        bounds: intersectBounds(delivery.bounds, reduced),
        quality: delivery.quality,
      }))
      .filter((delivery) => volumeOfBounds(delivery.bounds) > 0);
    derivedFrom.quality = undefined;
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

    // ONE DELIVERY CAN ARRIVE TWICE. `BaseStreamingImageVolume` marks a frame
    // from the delivery itself, and again from the event that the cache sends
    // when the image of that frame arrives. The two marks carry the same data,
    // and a second reduction of that data reads every source voxel of every box
    // again and writes the same values.
    //
    // The record holds the quality at which a refresh last WROTE voxels for
    // this region. A mark that runs before the image arrives writes nothing and
    // therefore leaves no record, so it never blocks the mark that follows the
    // image. That ordering is what `listenForCachedImages` exists to repair.
    const refreshKey = `${voxelGridKey(grid, statistic)}#${deliveredBounds.join(
      ','
    )}`;
    const refreshed = this.refreshedQuality.get(refreshKey);

    if (refreshed === undefined || refreshed < quality) {
      if (this.refreshDerivedFrames(deliveredBounds, grid, statistic) > 0) {
        this.refreshedQuality.set(refreshKey, quality);
      }
    }

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

    // A refresh that wrote no voxel changed nothing, so the record of the
    // result must not claim the deliveries that the source now holds.
    if (this.reduceRegionInto(representation, source, { bounds }) === 0) {
      return false;
    }

    // The record of the source becomes the record of the result again, because
    // the boxes now hold the data that the source holds now. A derivation that
    // still runs in batches keeps to the slices that it has reduced.
    this.syncDerivedRecord(representation, source);

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
   * @returns the number of reduced voxels that the member wrote. A box whose
   *     source voxels have not arrived holds no value, so a region of a source
   *     that holds nothing yet gives 0.
   */
  private reduceRegionInto(
    representation: VoxelRepresentation<T>,
    source: VoxelRepresentation<T>,
    { bounds }: { bounds: BoundsIJK }
  ): number {
    const { reduction, round = true } = representation.derivedFrom ?? {};

    if (!reduction || !source.voxelManager || !representation.voxelManager) {
      return 0;
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
        return 0;
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

    return reduceByBoxStatistic(
      source.voxelManager as never,
      { factors, sourceOffset, sourceDimensions, targetOffset },
      representation.voxelManager as never,
      { statistic: representation.statistic, round }
    );
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
    const index = this.deliveryIndexOf(delivered);
    const existing = index.byBounds.get(boundsKey(bounds));

    if (existing) {
      // The same region arrived again. A LOWER QUALITY NEVER REPLACES A HIGHER
      // ONE, which is the rule of `cachedFrames`. The key is the region alone,
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

  /**
   * Builds the store of a derived representation.
   *
   * THE IMAGE CACHE HOLDS THE VOXELS WHERE IT CAN. `createStorage` puts one
   * image of the cache at each slice of the derived grid, so the reduced voxels
   * are counted, evicted and shared by the one cache that already holds the
   * full-resolution frames, and a second viewport that asks for the same
   * reduction finds the same voxels.
   *
   * The array below is the fallback. A composite that states no `createStorage`
   * keeps it, and so does a derivation that the cache cannot hold, such as one
   * of an element type that no image uses.
   */
  private createStorageForGrid(
    grid: VoxelGrid,
    source: VoxelRepresentation<T>,
    reduction: VoxelGridReduction,
    statistic: VoxelStatistic
  ): RepresentationStorage<T> {
    const stored = this.createStorage?.({ grid, statistic, reduction, source });

    if (stored?.voxelManager) {
      return stored;
    }

    const { numberOfComponents } = source.voxelManager;
    const Constructor = source.voxelManager.getConstructor();
    const length =
      grid.dimensions[0] *
      grid.dimensions[1] *
      grid.dimensions[2] *
      (numberOfComponents || 1);

    return {
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions: grid.dimensions,
        scalarData: new Constructor(length) as PixelDataTypedArray,
        numberOfComponents,
        id: `${this.compositeId}-${voxelGridKey(grid, statistic)}`,
        // The factory gives a voxel manager over a number or over an RGB value,
        // according to the number of the components, and the composite holds
        // whichever of the two its primary representation holds.
      }) as unknown as IVoxelManager<T>,
    };
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
