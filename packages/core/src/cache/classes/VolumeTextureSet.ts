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

/**
 * Whether the grid of a texture can change.
 *
 * The two kinds have different lifetimes and different owners.
 *
 * - `fixed` — the grid never changes. Any number of viewports read the texture,
 *   and nothing needs to know when a draw starts or stops.
 * - `owned` — the basis point of the grid moves. An oblique MPR slab follows
 *   the camera, and the code re-points the slab instead of building a new
 *   texture for each position. Exactly one owner holds such a texture, because
 *   the owner is the only party that knows when a draw starts and stops. An
 *   owner may later be a set of viewports; it is never "whoever asks".
 */
export type VolumeTextureMutability = 'fixed' | 'owned';

/** What every texture of a set holds. */
type VolumeTextureSlotBase = {
  /**
   * The stable identity of the texture. It is not the grid: a slab re-points,
   * so a key that held the grid would change under the holder of that key.
   */
  readonly id: string;
  /** The statistic that this texture holds. */
  readonly statistic: VoxelStatistic;
  /** The cost of the texture, in bytes. */
  readonly bytes: number;
  /** The regions of this grid that must refill, in the index space of the grid. */
  dirty: BoundsIJK[];
};

/** A texture whose grid never changes. */
export type FixedVolumeTextureSlot<TextureType = unknown> =
  VolumeTextureSlotBase & {
    readonly mutability: 'fixed';
    readonly grid: VoxelGrid;
    readonly texture: TextureType;
  };

/**
 * A texture whose basis point moves.
 *
 * A slab of this kind holds two textures. The owner writes the back texture and
 * a draw reads the front texture, so a re-point never tears an image that a
 * draw is reading. A slab is small — the worked example uses 25 frames — so the
 * second texture costs little beside the problems that it removes.
 *
 * The owner drives the state. It calls `beginRender` when a draw starts and
 * `endRender` when that draw stops, and no other party may do so.
 */
export interface IMutableVolumeTextureSlab<TextureType = unknown> {
  readonly id: string;
  readonly mutability: 'owned';
  readonly statistic: VoxelStatistic;
  readonly bytes: number;
  /** The one owner of this slab, which is a viewport in this version. */
  readonly ownerId: string;
  /** The grid of the front texture, which is what a draw reads. */
  readonly grid: VoxelGrid;
  /** The grid of the back texture, which the owner writes. */
  readonly pendingGrid: VoxelGrid;
  /** True while a draw reads the front texture. */
  readonly inFlight: boolean;
  /** True while the back texture holds a fill that nothing published yet. */
  readonly hasPendingFill: boolean;
  /** The regions of the back texture that must refill. */
  dirty: BoundsIJK[];
  /** Points the back texture at a new basis. A draw reads the front, so this is safe. */
  retarget(grid: VoxelGrid): void;
  /** The back texture, which the owner fills. */
  writeTarget(): TextureType;
  /**
   * Publishes the back texture, so the next draw reads it.
   *
   * A publish while a draw is in flight defers the exchange to `endRender`,
   * because the exchange would otherwise take the texture out from under that
   * draw.
   *
   * @returns true when the exchange happened now
   */
  publish(): boolean;
  /** The owner states that a draw starts, and takes the front texture. */
  beginRender(): TextureType;
  /** The owner states that the draw stopped. */
  endRender(): void;
}

export type VolumeTextureSlot<TextureType = unknown> =
  | FixedVolumeTextureSlot<TextureType>
  | IMutableVolumeTextureSlab<TextureType>;

/** States whether a slot re-points. */
export function isMutableSlab<TextureType>(
  slot: VolumeTextureSlot<TextureType>
): slot is IMutableVolumeTextureSlab<TextureType> {
  return slot.mutability === 'owned';
}

/**
 * A slab that holds a front texture and a back texture, and that belongs to one
 * owner. See `IMutableVolumeTextureSlab`.
 */
export class MutableVolumeTextureSlab<TextureType = unknown>
  implements IMutableVolumeTextureSlab<TextureType>
{
  public readonly mutability = 'owned' as const;
  public readonly id: string;
  public readonly statistic: VoxelStatistic;
  public readonly bytes: number;
  public readonly ownerId: string;
  public dirty: BoundsIJK[] = [];

  private frontTexture: TextureType;
  private backTexture: TextureType;
  private frontGrid: VoxelGrid;
  private backGrid: VoxelGrid;
  private drawDepth = 0;
  private pendingFill = false;
  private readonly applyGrid: (texture: TextureType, grid: VoxelGrid) => void;

  constructor({
    id,
    ownerId,
    grid,
    statistic = VoxelStatistics.Average,
    bytes,
    front,
    back,
    applyGrid,
  }: {
    id: string;
    ownerId: string;
    grid: VoxelGrid;
    statistic?: VoxelStatistic;
    bytes: number;
    front: TextureType;
    back: TextureType;
    applyGrid: (texture: TextureType, grid: VoxelGrid) => void;
  }) {
    this.id = id;
    this.ownerId = ownerId;
    this.statistic = statistic;
    // Both textures cost memory, and the record states both.
    this.bytes = bytes * 2;
    this.frontTexture = front;
    this.backTexture = back;
    this.frontGrid = grid;
    this.backGrid = grid;
    this.applyGrid = applyGrid;
    this.applyGrid(front, grid);
    this.applyGrid(back, grid);
  }

  public get grid(): VoxelGrid {
    return this.frontGrid;
  }

  public get pendingGrid(): VoxelGrid {
    return this.backGrid;
  }

  public get inFlight(): boolean {
    return this.drawDepth > 0;
  }

  public get hasPendingFill(): boolean {
    return this.pendingFill;
  }

  public retarget(grid: VoxelGrid): void {
    this.backGrid = grid;
    this.applyGrid(this.backTexture, grid);
    // The back texture holds nothing of this basis, so every voxel must refill.
    this.dirty = [boundsOfGrid(grid)];
    this.pendingFill = true;
  }

  public writeTarget(): TextureType {
    return this.backTexture;
  }

  public publish(): boolean {
    if (this.inFlight) {
      // A draw reads the front texture now. The exchange waits for `endRender`.
      return false;
    }

    this.exchange();

    return true;
  }

  public beginRender(): TextureType {
    this.drawDepth++;

    return this.frontTexture;
  }

  public endRender(): void {
    this.drawDepth = Math.max(this.drawDepth - 1, 0);

    if (this.drawDepth === 0 && this.pendingFill) {
      this.exchange();
    }
  }

  private exchange(): void {
    if (!this.pendingFill) {
      return;
    }

    const texture = this.frontTexture;
    const grid = this.frontGrid;

    this.frontTexture = this.backTexture;
    this.frontGrid = this.backGrid;
    this.backTexture = texture;
    this.backGrid = grid;
    this.pendingFill = false;
  }
}

/**
 * What a set is for. A selection reads this to rank the sets without touching
 * one member.
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
 * A set holds one member for a full-extent reduction, and it holds many members
 * for a level of a brick store. The area index is what makes the second case
 * fast: a selection asks for the members that meet a region, and the index
 * answers without a scan of every member.
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
  /** The region of each member, in the index space of the volume. */
  private readonly regions = new Map<string, BoundsIJK>();
  /** The area index. See `membersCovering`. */
  private readonly buckets = new Map<
    string,
    VolumeTextureSlot<TextureType>[]
  >();
  private bucketSize: Point3 = [1, 1, 1];

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

  /** Adds one member, and puts that member in the area index. */
  public add(
    slot: VolumeTextureSlot<TextureType>
  ): VolumeTextureSlot<TextureType> {
    this.slots.push(slot);
    this.slotsById.set(slot.id, slot);
    this.indexSlot(slot);

    return slot;
  }

  /**
   * The members that meet a region, which the region states in the index space
   * of the volume.
   *
   * A selection calls this member on the frame path, and a brick level holds
   * thousands of members, so the answer must not cost a scan of all of them.
   * The index buckets the members over a coarse grid of the volume, and the
   * query reads the buckets that the region meets. A set of one member answers
   * directly, which is the full-extent case.
   */
  public membersCovering(region?: BoundsIJK): VolumeTextureSlot<TextureType>[] {
    if (!region || this.slots.length <= 1) {
      return this.members();
    }

    const found = new Set<VolumeTextureSlot<TextureType>>();

    for (const key of this.bucketKeysOf(region)) {
      const bucket = this.buckets.get(key);

      if (!bucket) {
        continue;
      }

      for (const slot of bucket) {
        if (found.has(slot)) {
          continue;
        }

        const slotRegion = this.regions.get(slot.id);

        if (slotRegion && volumeOfBounds(intersectBounds(slotRegion, region))) {
          found.add(slot);
        }
      }
    }

    return [...found];
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
    for (const slot of this.membersCovering(bounds)) {
      const grid = isMutableSlab(slot) ? slot.pendingGrid : slot.grid;
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
      const grid = isMutableSlab(slot) ? slot.pendingGrid : slot.grid;
      const region = boundsOfGrid(grid);

      if (onSlice) {
        for (let slice = region[2][0]; slice <= region[2][1]; slice++) {
          onSlice(slot, slice);
        }
      }

      addRegion(slot, region);
    }
  }

  /**
   * Puts one member in the area index, under the buckets that its region meets.
   *
   * The bucket edge follows the largest member, so a set of even members puts
   * each member in a small number of buckets.
   */
  private indexSlot(slot: VolumeTextureSlot<TextureType>): void {
    const grid = isMutableSlab(slot) ? slot.pendingGrid : slot.grid;
    const region = intersectBounds(
      mapBoundsBetweenGrids(grid, this.volumeGrid, boundsOfGrid(grid)),
      boundsOfGrid(this.volumeGrid)
    );

    this.regions.set(slot.id, region);

    const extent = [0, 1, 2].map((axis) =>
      Math.max(1, region[axis][1] - region[axis][0] + 1)
    ) as Point3;

    if (this.slots.length === 1) {
      this.bucketSize = extent;
    } else {
      // A later member that is larger than the bucket widens the bucket, and
      // the index rebuilds so that every member stays reachable.
      const widened = [0, 1, 2].map((axis) =>
        Math.max(this.bucketSize[axis], extent[axis])
      ) as Point3;

      if (widened.some((size, axis) => size !== this.bucketSize[axis])) {
        this.bucketSize = widened;
        this.rebuildIndex();

        return;
      }
    }

    this.putInBuckets(slot, region);
  }

  private rebuildIndex(): void {
    this.buckets.clear();

    for (const slot of this.slots) {
      this.putInBuckets(slot, this.regions.get(slot.id));
    }
  }

  private putInBuckets(
    slot: VolumeTextureSlot<TextureType>,
    region: BoundsIJK
  ): void {
    if (!region) {
      return;
    }

    for (const key of this.bucketKeysOf(region)) {
      const bucket = this.buckets.get(key);

      if (bucket) {
        bucket.push(slot);
      } else {
        this.buckets.set(key, [slot]);
      }
    }
  }

  private *bucketKeysOf(region: BoundsIJK): Generator<string> {
    const [width, height, depth] = this.bucketSize;
    const first = [
      Math.floor(region[0][0] / width),
      Math.floor(region[1][0] / height),
      Math.floor(region[2][0] / depth),
    ];
    const last = [
      Math.floor(region[0][1] / width),
      Math.floor(region[1][1] / height),
      Math.floor(region[2][1] / depth),
    ];

    for (let k = first[2]; k <= last[2]; k++) {
      for (let j = first[1]; j <= last[1]; j++) {
        for (let i = first[0]; i <= last[0]; i++) {
          yield `${i},${j},${k}`;
        }
      }
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
