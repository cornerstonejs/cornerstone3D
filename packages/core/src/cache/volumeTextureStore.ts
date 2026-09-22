import VoxelStatistics from '../enums/VoxelStatistics';
import { getBufferConfiguration } from '../utilities/getBufferConfiguration';
import { maxEdgeOfGrid, voxelCountOfGrid } from '../utilities/voxelGrid';
import {
  MutableVolumeTextureSlab,
  VolumeTextureSet,
} from './classes/VolumeTextureSet';
import type {
  FixedVolumeTextureSlot,
  IMutableVolumeTextureSlab,
  VolumeTextureSetDescription,
  VolumeTextureSlot,
} from './classes/VolumeTextureSet';
import type {
  PixelDataTypedArrayString,
  VoxelGrid,
  VoxelStatistic,
} from '../types';
import { coreLog } from '../utilities/logger';

const log = coreLog.getLogger('cache', 'volumeTextureStore');

/** The limits that the store respects. */
export type VolumeTextureLimits = {
  /** The largest number of voxels that one axis of one texture can hold. */
  maxEdge?: number;
  /** The largest number of voxels that one texture can hold. */
  maxVoxelCount?: number;
};

/** What a caller states to provision one named set. */
export type ProvisionTextureSetOptions<TextureType> = {
  /** The volume that owns the set. */
  volumeId: string;
  /** The name of the set, which a selection states to find the set again. */
  name: string;
  /** The grid of the volume, which is the index space of every region. */
  volumeGrid: VoxelGrid;
  /** The grids of the members. One grid gives a full-extent set. */
  grids: VoxelGrid[];
  /** The type of the voxel data, which gives the cost of one voxel. */
  dataType?: PixelDataTypedArrayString;
  /** The number of components of one voxel. One by default. */
  numberOfComponents?: number;
  /** The statistic that every member holds. */
  statistic?: VoxelStatistic;
  /** Whether the members cover the whole volume between them. */
  coverage?: VolumeTextureSetDescription['coverage'];
  /** True for the set that a selection falls back on. */
  backstop?: boolean;
  /**
   * The owner of a set of slabs that re-point. When a caller states an owner,
   * every member is a slab with a front texture and a back texture, and only
   * that owner may re-point or publish it. A set with no owner holds fixed
   * textures that any number of viewports read.
   */
  ownerId?: string;
  /** Builds one texture. The store calls this after it accepts the cost. */
  createTexture: (request: {
    grid: VoxelGrid;
    statistic: VoxelStatistic;
    setName: string;
    id: string;
  }) => TextureType;
  /** Releases one texture. The store calls this when it evicts the set. */
  destroyTexture?: (texture: TextureType) => void;
  /** States the grid on a texture. A slab calls this again on each re-point. */
  applyGrid?: (texture: TextureType, grid: VoxelGrid) => void;
  /** The limits of one texture. No limit by default. */
  limits?: VolumeTextureLimits;
};

type StoredSet = {
  volumeId: string;
  set: VolumeTextureSet<unknown>;
  destroyTexture?: (texture: unknown) => void;
};

/**
 * The global store of the texture sets.
 *
 * The budget of the texture memory is global, because the device holds one
 * amount of it and a volume does not know what the other volumes take. The list
 * of sets of one volume is therefore a view of this store, which
 * `ImageVolume.textureSets` reads.
 *
 * The set is the unit of eviction. A set holds the members that belong
 * together, so a store that evicted one member would leave a set that covers
 * part of the volume and that no selection can reason about.
 */
class VolumeTextureStore {
  private readonly sets = new Map<string, StoredSet>();
  private budgetBytes = 0;
  private clock = 0;

  /** The number of bytes that every texture of every volume takes. */
  public get bytesUsed(): number {
    let total = 0;

    for (const stored of this.sets.values()) {
      total += stored.set.bytes;
    }

    return total;
  }

  /** The number of bytes that the store may take. Zero means no limit. */
  public get budget(): number {
    return this.budgetBytes;
  }

  /**
   * States the budget of the texture memory. An application states it from a
   * capability profile, and a budget that nobody states is no limit, so the
   * behaviour of a viewport does not change.
   */
  public setBudget(bytes: number): void {
    this.budgetBytes = bytes > 0 ? bytes : 0;
  }

  /** The number of bytes that the store can still take. */
  public get bytesAvailable(): number {
    return this.budgetBytes > 0
      ? Math.max(this.budgetBytes - this.bytesUsed, 0)
      : Number.POSITIVE_INFINITY;
  }

  /** Every named set of one volume. */
  public setsOfVolume<TextureType>(
    volumeId: string
  ): VolumeTextureSet<TextureType>[] {
    const found: VolumeTextureSet<TextureType>[] = [];

    for (const stored of this.sets.values()) {
      if (stored.volumeId === volumeId) {
        found.push(stored.set as VolumeTextureSet<TextureType>);
      }
    }

    return found;
  }

  /** One named set of one volume. */
  public getSet<TextureType>(
    volumeId: string,
    name: string
  ): VolumeTextureSet<TextureType> | undefined {
    return this.sets.get(keyOf(volumeId, name))?.set as
      | VolumeTextureSet<TextureType>
      | undefined;
  }

  /**
   * The cost of a texture for a grid, in bytes, counted before the store builds
   * the texture. The code therefore knows in advance whether a texture can
   * work.
   *
   * The count uses the type of the buffer of a volume, which is the type that
   * the texture really holds. A `Uint16Array` volume renders through a
   * `Float32Array` buffer, so a count that read `Uint16Array` would state half
   * of the true cost.
   */
  public costOf(
    grid: VoxelGrid,
    dataType?: PixelDataTypedArrayString,
    numberOfComponents = 1
  ): number {
    const voxels = voxelCountOfGrid(grid) * Math.max(numberOfComponents, 1);

    if (!dataType) {
      return voxels;
    }

    return getBufferConfiguration(dataType, voxels, { isVolumeBuffer: true })
      .numBytes;
  }

  /**
   * Provisions a named set. This is the expensive step, and it never runs on
   * the frame path: it counts the cost, evicts if it must, builds the textures
   * and builds the area index.
   *
   * A set of this name that already exists is returned as it is, so a caller
   * may ask without a test of its own.
   *
   * @returns the set, or `undefined` when the store refuses it because the
   * limits or the budget cannot hold it
   */
  public provision<TextureType>(
    options: ProvisionTextureSetOptions<TextureType>
  ): VolumeTextureSet<TextureType> | undefined {
    const {
      volumeId,
      name,
      volumeGrid,
      grids,
      dataType,
      numberOfComponents = 1,
      statistic = VoxelStatistics.Average,
      coverage,
      backstop,
      ownerId,
      createTexture,
      destroyTexture,
      applyGrid,
      limits,
    } = options;
    const key = keyOf(volumeId, name);
    const existing = this.sets.get(key);

    if (existing) {
      existing.set.lastUsed = ++this.clock;

      return existing.set as VolumeTextureSet<TextureType>;
    }

    if (grids.length === 0) {
      return undefined;
    }

    for (const grid of grids) {
      if (!withinLimits(grid, limits)) {
        log.warn(
          `the set ${name} of the volume ${volumeId} holds a grid of ${grid.dimensions} that exceeds the limits, so nothing is built`
        );

        return undefined;
      }
    }

    // A slab holds a front texture and a back texture, so it costs twice.
    const perTexture = grids.map((grid) =>
      this.costOf(grid, dataType, numberOfComponents)
    );
    const bytes = perTexture.reduce(
      (total, cost) => total + (ownerId ? cost * 2 : cost),
      0
    );

    if (!this.makeRoomFor(bytes)) {
      log.warn(
        `the budget of ${this.budgetBytes} bytes cannot hold the set ${name} of the volume ${volumeId}, which costs ${bytes} bytes`
      );

      return undefined;
    }

    const set = new VolumeTextureSet<TextureType>({
      name,
      volumeGrid,
      statistic,
      coverage: coverage ?? (grids.length === 1 ? 'full-extent' : 'partial'),
      spacing: grids[0].spacing,
      backstop,
    });

    grids.forEach((grid, index) => {
      const id = `${name}#${index}`;

      if (ownerId) {
        set.add(
          new MutableVolumeTextureSlab<TextureType>({
            id,
            ownerId,
            grid,
            statistic,
            bytes: perTexture[index],
            front: createTexture({ grid, statistic, setName: name, id }),
            back: createTexture({ grid, statistic, setName: name, id }),
            applyGrid: applyGrid ?? (() => undefined),
          }) as unknown as VolumeTextureSlot<TextureType>
        );

        return;
      }

      const texture = createTexture({ grid, statistic, setName: name, id });

      applyGrid?.(texture, grid);

      const slot: FixedVolumeTextureSlot<TextureType> = {
        mutability: 'fixed',
        id,
        grid,
        statistic,
        texture,
        bytes: perTexture[index],
        dirty: [],
      };

      set.add(slot);
    });

    // Every texture holds nothing yet, so the first render of each one fills it.
    set.markAllDirty();
    set.lastUsed = ++this.clock;

    this.sets.set(key, {
      volumeId,
      set: set as VolumeTextureSet<unknown>,
      destroyTexture: destroyTexture as (texture: unknown) => void,
    });

    return set;
  }

  /** Adds one holder of a set, so an eviction cannot take it. */
  public claim(volumeId: string, name: string): boolean {
    const stored = this.sets.get(keyOf(volumeId, name));

    if (!stored) {
      return false;
    }

    stored.set.references++;
    stored.set.lastUsed = ++this.clock;

    return true;
  }

  /** Gives one holder of a set back. */
  public release(volumeId: string, name: string): boolean {
    const stored = this.sets.get(keyOf(volumeId, name));

    if (!stored) {
      return false;
    }

    stored.set.references = Math.max(stored.set.references - 1, 0);

    return true;
  }

  /** Removes one set, and releases every texture of that set. */
  public evict(volumeId: string, name: string): boolean {
    const key = keyOf(volumeId, name);
    const stored = this.sets.get(key);

    if (!stored) {
      return false;
    }

    this.sets.delete(key);

    if (stored.destroyTexture) {
      for (const slot of stored.set.members()) {
        releaseTexturesOf(slot, stored.destroyTexture);
      }
    }

    return true;
  }

  /** Removes every set of one volume. */
  public evictVolume(volumeId: string): void {
    for (const [key, stored] of [...this.sets.entries()]) {
      if (stored.volumeId === volumeId) {
        this.evict(stored.volumeId, key.slice(stored.volumeId.length + 1));
      }
    }
  }

  /** Removes every set of every volume. */
  public clear(): void {
    for (const [, stored] of [...this.sets.entries()]) {
      this.evictVolume(stored.volumeId);
    }
  }

  /**
   * Releases memory until the store can hold `bytes` more.
   *
   * The store first removes the set that no consumer holds and that is the
   * least recently used, and it never removes a set that a viewport draws. A
   * backstop set leaves last, because a fill that finds no source leaves a
   * blank region and MR-U-6 forbids that.
   *
   * @returns true when the store can now hold the new set
   */
  private makeRoomFor(bytes: number): boolean {
    if (this.budgetBytes <= 0 || this.bytesUsed + bytes <= this.budgetBytes) {
      return true;
    }

    const evictable = [...this.sets.values()]
      .filter((stored) => stored.set.references === 0)
      .sort((a, b) => {
        if (a.set.backstop !== b.set.backstop) {
          return a.set.backstop ? 1 : -1;
        }

        return a.set.lastUsed - b.set.lastUsed;
      });

    for (const stored of evictable) {
      this.evict(stored.volumeId, stored.set.name);

      if (this.bytesUsed + bytes <= this.budgetBytes) {
        return true;
      }
    }

    return false;
  }
}

function keyOf(volumeId: string, name: string): string {
  return `${volumeId}|${name}`;
}

function withinLimits(grid: VoxelGrid, limits?: VolumeTextureLimits): boolean {
  const { maxEdge, maxVoxelCount } = limits ?? {};

  if (maxEdge > 0 && maxEdgeOfGrid(grid) > maxEdge) {
    return false;
  }

  if (maxVoxelCount > 0 && voxelCountOfGrid(grid) > maxVoxelCount) {
    return false;
  }

  return true;
}

function releaseTexturesOf(
  slot: VolumeTextureSlot<unknown>,
  destroyTexture: (texture: unknown) => void
): void {
  if (slot.mutability === 'owned') {
    const slab = slot as IMutableVolumeTextureSlab<unknown>;

    // A slab holds two textures, and the exchange may have swapped them, so the
    // release takes both through the members that name them.
    destroyTexture(slab.beginRender());
    slab.endRender();
    destroyTexture(slab.writeTarget());

    return;
  }

  destroyTexture((slot as FixedVolumeTextureSlot<unknown>).texture);
}

const volumeTextureStore = new VolumeTextureStore();

export { VolumeTextureStore, volumeTextureStore };
export default volumeTextureStore;
