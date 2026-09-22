import VoxelStatistics from '../../enums/VoxelStatistics';
import {
  boxAverageReductionFactors,
  deriveBoxAverageGrid,
} from '../../utilities/voxelGrid';
import { getBufferConfiguration } from '../../utilities/getBufferConfiguration';
import { gridLimitsOfProfile } from '../../utilities/gpuCapabilityProfiles';
import { isMutableSlab } from '../../cache/classes/VolumeTextureSet';
import { FULL_RESOLUTION_TEXTURE_SET } from '../../cache/classes/ImageVolume';
import type { GpuCapabilityProfile } from '../../utilities/gpuCapabilityProfiles';
import type { vtkStreamingOpenGLTexture } from '../../cache/classes/ImageVolume';
import type {
  IImageVolume,
  Point3,
  VoxelGrid,
  VoxelStatistic,
} from '../../types';

/**
 * What one texture of a strategy is for.
 *
 * A strategy that draws one texture states one binding of the role `base`. A
 * strategy that draws a coarse texture to decide which fine textures to read
 * states the coarse one as `base` and the fine ones as `refinement`, and the
 * render decides what to do with each.
 */
export type StrategyBindingRole = 'base' | 'refinement';

/** One texture that a strategy offers, and what that texture is for. */
export type StrategyBinding = {
  texture: vtkStreamingOpenGLTexture;
  grid: VoxelGrid;
  statistic: VoxelStatistic;
  role: StrategyBindingRole;
};

/**
 * How a render gets its voxels.
 *
 * The strategy is the unit that a render path works with, and the name of a
 * texture set derives from it. A render component defines the strategies that
 * it can use, and a strategy says what to bind and how to keep those bindings
 * current.
 *
 * A strategy need not be backed by a texture. "Full resolution over the whole
 * region" is the default intent, and a device that cannot hold that texture may
 * still hold the data in the voxel manager. Such a strategy is ready, its
 * bindings are empty, and the render reads the composite instead.
 *
 * A render may also choose no strategy at all, which binds no texture. A CPU
 * render does that for its lossless pass.
 *
 * A strategy instance belongs to one render path, which belongs to one
 * viewport. It is therefore the single owner that a slab which re-points
 * requires, which `IMutableVolumeTextureSlab` describes.
 */
export interface IVolumeRenderStrategy {
  /** The name of the strategy. The names of its texture sets derive from it. */
  readonly name: string;
  /** The volume that this strategy draws. */
  readonly volume: IImageVolume;
  /** Whether this strategy can draw now. */
  isReady(): boolean;
  /** The textures to bind, in order. An empty list is legal and binds nothing. */
  bindings(): StrategyBinding[];
  /** Takes what this strategy needs to draw. */
  activate(): void;
  /** Gives back what this strategy holds. */
  deactivate(): void;
  /**
   * Brings what this strategy holds up to date. A strategy that holds an
   * element that moves re-points that element here.
   */
  update(): void;
}

/**
 * Why a provider runs.
 *
 * A provider runs when the render path adds its actor, and it runs again when
 * something changes that could change the answer. The core states two reasons:
 *
 * - `loaded` — the data of the volume finished loading, so a strategy that
 *   could not draw before may now be worth building;
 * - `memory` — the budget of the texture memory changed, or the store evicted a
 *   set, so a strategy may need to be rebuilt or replaced by a cheaper one.
 *
 * A render component may state a reason of its own, and the type admits one.
 */
export type VolumeStrategyProvisionReason =
  | 'initial'
  | 'loaded'
  | 'memory'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** What a render component tells a provider when it provisions. */
export type VolumeStrategyProvisionContext = {
  /** The volume to draw. */
  volume: IImageVolume;
  /** The capability profile that the application stated. */
  profile: GpuCapabilityProfile;
  /** The viewport that draws. */
  viewportId?: string;
  /** Why this provision runs. */
  reason?: VolumeStrategyProvisionReason;
};

/**
 * Builds the strategies that a render component can use.
 *
 * This never runs on the frame path. It derives the voxels that a strategy
 * needs and it allocates the texture sets, which are the two expensive steps.
 *
 * It runs when the render path adds its actor, and it runs again whenever
 * something could change the answer: the data finished loading, or the memory
 * changed. `reason` says which. A provider must therefore be safe to run more
 * than once. A texture set that the store already holds comes back as it is, so
 * a second run of the same provider allocates nothing.
 *
 * A new render type defines its own provider, and that is how a new render type
 * defines new texture sets. The provider below is the default one.
 *
 * The textures that this builds hold no data yet. The loader fills the voxel
 * managers as the data arrives, the volume marks the affected textures, and
 * each render refills the marked slices — which is what the code already does.
 */
export type VolumeStrategyProvider = (
  context: VolumeStrategyProvisionContext
) => IVolumeRenderStrategy[];

/** What a render path tells the function that selects a strategy. */
export type SelectVolumeStrategyContext = {
  /** The strategies to choose among, in the order that the provider built them. */
  strategies: IVolumeRenderStrategy[];
  /** The strategy of the previous render. */
  previous?: IVolumeRenderStrategy;
  /** The volume that the render path draws. */
  volume: IImageVolume;
  /** The viewport that draws. */
  viewportId?: string;
};

/**
 * Chooses the strategy of one render.
 *
 * This runs on the frame path, and it cannot fail. The provider already built
 * every strategy, so this function chooses among them and never allocates.
 * There is no refusal to answer, and nothing to repeat.
 *
 * The phase of a render is not a field here. A phased render is tightly bound
 * to how that render draws, so the render component that implements phases adds
 * the fields that its own function reads. A reader therefore takes the fields
 * that it needs by name, and does not assume that this record holds nothing
 * else.
 *
 * @returns the strategy, or `undefined` to bind no texture at all
 */
export type SelectVolumeStrategy = (
  context: SelectVolumeStrategyContext
) => IVolumeRenderStrategy | undefined;

/**
 * A strategy that draws one full-extent texture set.
 *
 * The full-resolution strategy and the reduced-resolution strategy differ only
 * in the grid that they state, so one class serves both.
 */
class FullExtentTextureStrategy implements IVolumeRenderStrategy {
  public readonly name: string;
  public readonly volume: IImageVolume;

  private readonly grid: VoxelGrid;
  private readonly statistic: VoxelStatistic;
  private active = false;

  constructor({
    name,
    volume,
    grid,
    statistic = VoxelStatistics.Average,
  }: {
    name: string;
    volume: IImageVolume;
    grid: VoxelGrid;
    statistic?: VoxelStatistic;
  }) {
    this.name = name;
    this.volume = volume;
    this.grid = grid;
    this.statistic = statistic;
  }

  public isReady(): boolean {
    return Boolean(this.volume.getTextureSet(this.name));
  }

  public bindings(): StrategyBinding[] {
    const member = this.volume.getTextureSet(this.name)?.members()[0];

    if (!member || isMutableSlab(member)) {
      return [];
    }

    return [
      {
        texture: member.texture,
        grid: member.grid,
        statistic: member.statistic,
        role: 'base',
      },
    ];
  }

  public activate(): void {
    if (this.active) {
      return;
    }

    this.volume.claimTextureSet(this.name);
    this.active = true;
  }

  public deactivate(): void {
    if (!this.active) {
      return;
    }

    this.volume.releaseTextureSet(this.name);
    this.active = false;
  }

  public update(): void {
    // Nothing of this strategy moves. The volume marks the slices that new data
    // changed, and the texture refills them at the next render.
  }
}

/** The number of bytes of one voxel of a texture of this volume. */
function bytesPerVoxelOf(volume: IImageVolume): number {
  return getBufferConfiguration(volume.dataType, 1, { isVolumeBuffer: true })
    .numBytes;
}

/**
 * The name of the set that holds a reduction by these factors.
 *
 * The name derives from the strategy, so a second viewport that chooses the
 * same strategy finds the same textures instead of building them again.
 */
export function reducedStrategyName(
  factors: Point3,
  statistic: VoxelStatistic = VoxelStatistics.Average
): string {
  return `reduced-${factors.join('x')}/full-extent/${statistic}`;
}

/**
 * Builds the full-resolution strategy when the device can hold it.
 *
 * @returns the strategy, or `undefined` when the profile cannot hold the
 * full-resolution grid, in which case a caller builds a reduced strategy
 */
export function provisionFullResolutionStrategy({
  volume,
  profile,
}: VolumeStrategyProvisionContext): IVolumeRenderStrategy | undefined {
  const grid = volume.voxelGrid;
  const limits = gridLimitsOfProfile(profile, bytesPerVoxelOf(volume));
  const factors = boxAverageReductionFactors(grid.dimensions, limits);

  if (factors.some((factor) => factor > 1)) {
    return undefined;
  }

  const set = volume.provisionTextureSet({
    name: FULL_RESOLUTION_TEXTURE_SET,
    grids: [grid],
    coverage: 'full-extent',
    backstop: true,
  });

  if (!set) {
    return undefined;
  }

  return new FullExtentTextureStrategy({
    name: FULL_RESOLUTION_TEXTURE_SET,
    volume,
    grid,
  });
}

/**
 * Builds the reduced-resolution strategy that the device can hold.
 *
 * The reduction applies a separate factor to each axis. An edge of 2049 voxels
 * exceeds a limit of 2048 on one axis and by one voxel, so the reduction takes
 * that one axis and leaves the other two. A uniform reduction by 2 on three
 * axes would take 8 times fewer voxels for an excess of one voxel.
 *
 * The strategy asks for the box average only, and never for a decimation.
 */
export function provisionReducedResolutionStrategy({
  volume,
  profile,
}: VolumeStrategyProvisionContext): IVolumeRenderStrategy | undefined {
  const fullResolutionGrid = volume.voxelGrid;
  const limits = gridLimitsOfProfile(profile, bytesPerVoxelOf(volume));
  const factors = boxAverageReductionFactors(
    fullResolutionGrid.dimensions,
    limits
  );

  if (!factors.some((factor) => factor > 1)) {
    return undefined;
  }

  const grid = deriveBoxAverageGrid(fullResolutionGrid, { factors });
  const name = reducedStrategyName(factors);

  // The selection never creates a representation, so this is where a caller
  // decides that a new representation is worth its cost.
  if (!volume.compositeVoxelManager.getRepresentation(grid)) {
    volume.createVoxelRepresentation({ factors });
  }

  const set = volume.provisionTextureSet({
    name,
    grids: [grid],
    coverage: 'full-extent',
  });

  if (!set) {
    return undefined;
  }

  return new FullExtentTextureStrategy({ name, volume, grid });
}

/**
 * The default provider, and the only one that this version ships.
 *
 * It builds the full-resolution strategy when the device can hold it, and the
 * reduced-resolution strategy otherwise. It reads the capability alone.
 *
 * It implements no performance-bound reduction. "The texture is too large" and
 * "the frame rate is too low" are different causes with different timing: a
 * capability does not change while a viewport lives, and a frame rate changes
 * inside one interaction. The second belongs to task T14, which also owns the
 * correction of the opacity that goes with a change of the sample distance.
 * Task T14 supplies its own provider and its own selection.
 */
export const defaultVolumeStrategyProvider: VolumeStrategyProvider = (
  context
) => {
  const strategies: IVolumeRenderStrategy[] = [];
  const full = provisionFullResolutionStrategy(context);

  if (full) {
    strategies.push(full);

    return strategies;
  }

  const reduced = provisionReducedResolutionStrategy(context);

  if (reduced) {
    strategies.push(reduced);
  }

  return strategies;
};

/**
 * The default selection. It keeps the strategy of the previous render while
 * that strategy is still ready, and takes the first ready strategy otherwise.
 *
 * A render component that implements phases supplies its own function, and that
 * is where "reduced for the first render, full resolution for the lossless
 * render" belongs.
 */
export const selectFirstReadyStrategy: SelectVolumeStrategy = ({
  strategies,
  previous,
}) => {
  if (previous?.isReady()) {
    return previous;
  }

  return strategies.find((strategy) => strategy.isReady());
};
