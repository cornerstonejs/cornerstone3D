import {
  defaultVolumeStrategyProvider,
  selectFirstReadyStrategy,
} from './volumeRenderStrategy';
import { getActiveGpuCapabilityProfile } from '../../utilities/gpuCapabilityProfiles';
import type {
  IVolumeRenderStrategy,
  SelectVolumeStrategy,
  VolumeStrategyProvider,
} from './volumeRenderStrategy';
import type { vtkStreamingOpenGLTexture } from '../../cache/classes/ImageVolume';
import type { IImageVolume } from '../../types';

/** What a caller states to resolve the first texture of an actor. */
export type ResolveVolumeTextureOptions = {
  /** Builds the strategies. The default provider otherwise. */
  provideStrategies?: VolumeStrategyProvider;
  /** Chooses among them. The first ready strategy otherwise. */
  selectStrategy?: SelectVolumeStrategy;
  /** The viewport that draws. */
  viewportId?: string;
};

export type ResolvedVolumeTexture = {
  /** The strategy that the selection chose. */
  strategy?: IVolumeRenderStrategy;
  /** The texture to bind, when the strategy offers one. */
  texture?: vtkStreamingOpenGLTexture;
};

/**
 * Builds the strategies of a volume and gives the texture that an actor binds
 * when it is created.
 *
 * Both architectures build their actor through the two actor helpers, so this
 * is the one place that a legacy viewport and a viewport of the generic
 * architecture share. A legacy viewport has no render path and therefore no
 * per-frame choice, but the capability of a device does not change while a
 * viewport lives, so one choice at the creation of the actor is what the
 * capability needs.
 *
 * A render path calls this with its own provider, and then keeps choosing on
 * every render. The provision is idempotent, so the render path finds the sets
 * that this call already built.
 *
 * A render path claims the set of the strategy that it selects, and releases
 * the claim when it stops drawing. A legacy viewport has no point at which it
 * could release a claim, so this pins the set that a legacy viewport draws: the
 * set then lives as long as its volume, which is how long the one texture of a
 * volume lived before the store existed. A budget never evicts a pinned set.
 */
export function resolveVolumeTexture(
  volume: IImageVolume,
  options: ResolveVolumeTextureOptions = {}
): ResolvedVolumeTexture {
  const {
    provideStrategies = defaultVolumeStrategyProvider,
    selectStrategy = selectFirstReadyStrategy,
    viewportId,
  } = options;
  const isLegacy =
    options.provideStrategies === undefined &&
    options.selectStrategy === undefined;

  if (!volume?.voxelGrid) {
    return {};
  }

  const strategies = provideStrategies({
    volume,
    profile: getActiveGpuCapabilityProfile(),
    viewportId,
    reason: 'initial',
  });
  const strategy = selectStrategy({
    strategies,
    volume,
    viewportId,
  });
  const base = strategy?.bindings().find((binding) => binding.role === 'base');

  if (isLegacy && strategy && base) {
    volume.pinTextureSet(strategy.name);
  }

  return { strategy, texture: base?.texture };
}

export default resolveVolumeTexture;
