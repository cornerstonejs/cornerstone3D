import VoxelStatistics from '../../enums/VoxelStatistics';
import {
  boundsOfGrid,
  containsBounds,
  intersectBounds,
  mapBoundsBetweenGrids,
  volumeOfBounds,
  voxelCountOfGrid,
} from '../../utilities/voxelGrid';
import type { BoundsIJK, Point3, VoxelGrid, VoxelStatistic } from '../../types';

/** What every texture of a set holds. */
type VolumeTextureSlotBase = {
  /** The stable identity of the texture. */
  readonly id: string;
  /** The statistic that this texture holds. */
  readonly statistic: VoxelStatistic;
  /** The cost of the texture, in bytes. */
  readonly bytes: number;
  /** The regions of this grid that must refill, in the index space of the grid. */
  dirty: BoundsIJK[];
};

/** One texture of a set, whose grid never changes. */
export type FixedVolumeTextureSlot<TextureType = unknown> =
  VolumeTextureSlotBase & {
    readonly grid: VoxelGrid;
    readonly texture: TextureType;
  };

export type VolumeTextureSlot<TextureType = unknown> =
  FixedVolumeTextureSlot<TextureType>;

/**
 * What a set is for. A selection reads this to rank the sets without touching
 * one member. `partial` is reserved for bricks; the cache index does not export
 * this type until a brick set exists.
 */
export type VolumeTextureSetCoverage = 'full-extent' | 'partial';

export type VolumeTextureSetDescription = {
  /** The name of the set, which a caller states when it provisions the set. */
  name: string;
  /** The grid of the volume, which is the index space of every region. */
  volumeGrid: VoxelGrid;
  /** The statistic that every member holds. */
  statistic?: VoxelStatistic;
  /** Whether the members cover the whole volume between them. */
  coverage?: VolumeTextureSetCoverage;
  /** The spacing of one voxel of a member, which orders the sets by resolution. */
  spacing: Point3;
  /**
   * True for the set that a selection falls back on when nothing else covers a
   * region. The user must not see a blank region, so one set of a volume should
   * carry this mark, and it is the coarsest full-extent set.
   */
  backstop?: boolean;
};

/**
 * A named set of textures, and the unit of storage, of cost and of eviction.
 *
 * A set is what a provision builds and what a selection reads. The two costs
 * are deliberately different: a provision derives voxels and allocates
 * textures, and a selection touches neither.
 *
 * A set holds one member for a full-extent reduction, and it can hold many
 * members that each cover a part of the volume.
 */
export class VolumeTextureSet<TextureType = unknown> {
  public readonly name: string;
  public readonly statistic: VoxelStatistic;
  public readonly coverage: VolumeTextureSetCoverage;
  public readonly spacing: Point3;
  public readonly backstop: boolean;
  /** The number of consumers that hold this set. A set that nobody holds can be evicted. */
  public references = 0;
  /** The order of the last use, which gives the least recently used set. */
  public lastUsed = 0;

  private readonly volumeGrid: VoxelGrid;
  private readonly slots: VolumeTextureSlot<TextureType>[] = [];
  private readonly slotsById = new Map<
    string,
    VolumeTextureSlot<TextureType>
  >();

  constructor(description: VolumeTextureSetDescription) {
    this.name = description.name;
    this.volumeGrid = description.volumeGrid;
    this.statistic = description.statistic ?? VoxelStatistics.Average;
    this.coverage = description.coverage ?? 'full-extent';
    this.spacing = description.spacing;
    this.backstop = description.backstop ?? false;
  }

  /** Every member of the set. */
  public members(): VolumeTextureSlot<TextureType>[] {
    return [...this.slots];
  }

  /** The number of members. */
  public get size(): number {
    return this.slots.length;
  }

  /** The cost of every member, in bytes. */
  public get bytes(): number {
    return this.slots.reduce((total, slot) => total + slot.bytes, 0);
  }

  /** One member, by its stable identity. */
  public get(id: string): VolumeTextureSlot<TextureType> | undefined {
    return this.slotsById.get(id);
  }

  /** Adds one member. */
  public add(
    slot: VolumeTextureSlot<TextureType>
  ): VolumeTextureSlot<TextureType> {
    this.slots.push(slot);
    this.slotsById.set(slot.id, slot);

    return slot;
  }

  /**
   * Marks a region of the volume dirty in every member that covers it.
   *
   * @param bounds - the region, in the index space of the volume
   * @param onSlice - called for each z slice of each member that the region met
   */
  public markDirty(
    bounds: BoundsIJK,
    onSlice?: (slot: VolumeTextureSlot<TextureType>, slice: number) => void
  ): void {
    for (const slot of this.slots) {
      const { grid } = slot;
      const region = intersectBounds(
        mapBoundsBetweenGrids(this.volumeGrid, grid, bounds),
        boundsOfGrid(grid)
      );

      if (volumeOfBounds(region) === 0) {
        continue;
      }

      if (onSlice) {
        for (let slice = region[2][0]; slice <= region[2][1]; slice++) {
          onSlice(slot, slice);
        }
      }

      addRegion(slot, region);
    }
  }

  /** Marks every voxel of every member dirty. */
  public markAllDirty(
    onSlice?: (slot: VolumeTextureSlot<TextureType>, slice: number) => void
  ): void {
    for (const slot of this.slots) {
      const region = boundsOfGrid(slot.grid);

      if (onSlice) {
        for (let slice = region[2][0]; slice <= region[2][1]; slice++) {
          onSlice(slot, slice);
        }
      }

      addRegion(slot, region);
    }
  }
}

/**
 * Adds one region to the record of a slot.
 *
 * A region that an existing region already holds changes nothing, and a region
 * that holds existing regions replaces them, so the record does not grow
 * without a limit while a progressive load delivers frame after frame.
 */
function addRegion(slot: { dirty: BoundsIJK[] }, region: BoundsIJK): void {
  if (slot.dirty.some((existing) => containsBounds(existing, region))) {
    return;
  }

  slot.dirty = slot.dirty.filter(
    (existing) => !containsBounds(region, existing)
  );
  slot.dirty.push(region);
}

/** The number of voxels of a grid, which gives the cost of a texture. */
export function voxelsOfGrid(grid: VoxelGrid): number {
  return voxelCountOfGrid(grid);
}
