import { Events } from '../../enums';
import eventTarget from '../../eventTarget';
import type { IImageVolume } from '../../types';
import type { vtkStreamingOpenGLTexture } from '../../cache/classes/ImageVolume';
import { gpuSettingsForRender } from '../../utilities/gpuSettingsPresets';
import type { RenderingFidelity } from '../GenericViewport/ViewportArchitectureTypes';
import {
  isBindingPending,
  readBoundQuality,
} from '../GenericViewport/renderingFidelity';
import type { BoundGrid } from '../GenericViewport/renderingFidelity';
import type {
  IVolumeRenderStrategy,
  SelectVolumeStrategy,
  VolumeStrategyProvider,
  VolumeStrategyProvisionReason,
} from './volumeRenderStrategy';

/** The strategy state that a volume render path keeps on its rendering. */
export type VolumeStrategyState = {
  /** The viewport that draws. */
  viewportId?: string;
  /** The strategies that the provider has built. */
  strategies?: IVolumeRenderStrategy[];
  /** The strategy of the present render. */
  strategy?: IVolumeRenderStrategy;
  /** The texture that the mapper holds. */
  boundTexture?: vtkStreamingOpenGLTexture;
  /** True when a volume data event came after the last record. */
  fidelityStale?: boolean;
  /** The grid of the base texture that the mapper holds. */
  boundGrid?: BoundGrid;
};

/** A rendering that the functions of this module drive. */
export type VolumeStrategyRendering = VolumeStrategyState &
  RenderingFidelity & {
    imageVolume: IImageVolume;
    mapper: unknown;
  };

/**
 * What a render path supplies to the strategy lifecycle.
 *
 * `onBind` runs after each bind, for the fields that only that render path
 * sets; `textureChanged` is true when the mapper got a new texture.
 */
export type VolumeStrategyHooks<
  R extends VolumeStrategyRendering = VolumeStrategyRendering,
> = {
  provideStrategies: VolumeStrategyProvider;
  selectStrategy: SelectVolumeStrategy;
  onBind?: (rendering: R, textureChanged: boolean) => void;
};

type VolumeEventType =
  | Events.IMAGE_VOLUME_MODIFIED
  | Events.IMAGE_VOLUME_LOADING_COMPLETED
  | Events.VOLUME_TEXTURE_LIMITS_CHANGED;

const volumeEventTypes: VolumeEventType[] = [
  Events.IMAGE_VOLUME_MODIFIED,
  Events.IMAGE_VOLUME_LOADING_COMPLETED,
  Events.VOLUME_TEXTURE_LIMITS_CHANGED,
];

/**
 * Runs the provider, and takes the strategies that it builds.
 *
 * This derives the voxels that a strategy needs and it allocates the
 * textures, which are the two expensive steps, so it never runs during a
 * render. A render path calls it when it adds its actor, to build the first
 * strategies, when the data of the volume finishes loading, so that a strategy
 * which could not draw before can be built, and when the texture limits change
 * (`memory`), so that the bound texture fits the new limits.
 *
 * The textures that this builds hold no data yet. The loader fills the voxel
 * managers as the data arrives, the volume marks the affected textures, and
 * each render refills the marked slices.
 *
 * A strategy that the provider builds again keeps its identity. The provider
 * builds fresh objects, and a fresh object holds no claim on its texture set,
 * so a run that replaced a live strategy would leave that claim behind.
 */
export function provisionStrategies(
  rendering: VolumeStrategyRendering,
  provideStrategies: VolumeStrategyProvider,
  reason: VolumeStrategyProvisionReason
): void {
  const held = rendering.strategies ?? [];
  const built = provideStrategies({
    volume: rendering.imageVolume,
    gpuSettings: gpuSettingsForRender(),
    viewportId: rendering.viewportId,
    reason,
  });
  const strategies = built.map(
    (fresh) => held.find((existing) => existing.name === fresh.name) ?? fresh
  );

  for (const existing of held) {
    if (!strategies.includes(existing)) {
      existing.deactivate();
    }
  }

  rendering.strategies = strategies;

  if (rendering.strategy && !strategies.includes(rendering.strategy)) {
    // The provider stopped naming the strategy that this render path drew, so
    // the next render selects again and binds again.
    rendering.strategy = undefined;
    rendering.boundTexture = undefined;
  }
}

/**
 * Chooses the strategy of this render, and binds what it offers.
 *
 * This runs on every render, so the render path changes its strategy between
 * two frames with no tear-down of the actor. `setScalarTexture` of the mapper
 * permits that.
 *
 * Nothing is allocated here. The provider already built every strategy, so
 * this chooses among them and cannot fail.
 *
 * A choice of nothing is legal, and it binds no texture. A CPU render does
 * that for its lossless pass.
 */
export function applyStrategy<R extends VolumeStrategyRendering>(
  rendering: R,
  hooks: VolumeStrategyHooks<R>
): void {
  const volume = rendering.imageVolume;

  if (!volume?.voxelGrid) {
    return;
  }

  const selected = hooks.selectStrategy({
    strategies: rendering.strategies ?? [],
    previous: rendering.strategy,
    volume,
    viewportId: rendering.viewportId,
  });

  if (selected !== rendering.strategy) {
    rendering.strategy?.deactivate();
    selected?.activate();
    rendering.strategy = selected;
  }

  selected?.update();

  bindStrategy(rendering, selected, hooks);
}

/**
 * Binds what the strategy offers.
 *
 * A strategy that offers no binding is ready, and it states that the data is
 * not in a texture: the full-resolution data may live in the voxel manager of
 * a device that cannot hold the texture. The render path then binds nothing
 * and leaves the texture of the previous render.
 *
 * The quality record follows the grid that the mapper holds (see
 * `readBoundQuality`), so a 3D view and a slice view over one volume can
 * report a different quality at the same moment. The record is read only
 * when the bound texture changes, or after a volume data event
 * (`fidelityStale`), and not on each render.
 */
function bindStrategy<R extends VolumeStrategyRendering>(
  rendering: R,
  strategy: IVolumeRenderStrategy | undefined,
  hooks: VolumeStrategyHooks<R>
): void {
  const bindings = strategy?.bindings() ?? [];
  const base = bindings.find((binding) => binding.role === 'base');
  const textureChanged = !!base && base.texture !== rendering.boundTexture;
  // `vtkSharedImageResliceMapper` and `vtkSharedVolumeMapper` add
  // `setScalarTexture`; the vtk.js typings do not hold it.
  const mapper = rendering.mapper as {
    setScalarTexture?: (texture: unknown) => void;
    modified: () => void;
  };

  if (textureChanged) {
    mapper.setScalarTexture?.(base.texture);
    mapper.modified();
    rendering.boundTexture = base.texture;
  }

  if (base) {
    rendering.boundGrid = { grid: base.grid, statistic: base.statistic };
    rendering.reductionCause = strategy.reductionCause;
  }

  if (textureChanged || rendering.fidelityStale || !rendering.voxelQuality) {
    rendering.voxelQuality = readBoundQuality(
      rendering.imageVolume,
      rendering.boundGrid
    );
    rendering.fidelityStale = false;
  }

  rendering.qualityPending = isBindingPending(
    rendering.imageVolume,
    rendering.boundTexture
  );
  rendering.fullGrid = rendering.imageVolume.voxelGrid;
  hooks.onBind?.(rendering, textureChanged);
}

/**
 * Handles a volume data event without a camera change (GENVIEW-FIDELITY-1).
 * Each event marks the record stale, unless the fidelity ignores the binding
 * (a labelmap overlay has no fidelity, and a brush fires many events). A
 * completed load or a change of the texture limits runs the provider and
 * binds again at once. Any other event leaves the record to
 * `refreshFidelity`, which recomputes it once, when the viewport next reads
 * the fidelity, so a stream of volume events reads the quality at most once
 * for each read of the fidelity.
 */
export function onVolumeData<R extends VolumeStrategyRendering>(
  rendering: R,
  eventType: VolumeEventType,
  hooks: VolumeStrategyHooks<R>
): void {
  if (!rendering.excludeFromFidelity) {
    rendering.fidelityStale = true;
  }

  if (eventType === Events.IMAGE_VOLUME_MODIFIED) {
    return;
  }

  provisionStrategies(
    rendering,
    hooks.provideStrategies,
    eventType === Events.IMAGE_VOLUME_LOADING_COMPLETED ? 'loaded' : 'memory'
  );
  applyStrategy(rendering, hooks);
}

/**
 * Recomputes a stale record of the bound grid (see `onVolumeData`), and
 * reads at each call whether the bound texture still waits for its fill.
 */
export function refreshFidelity(rendering: VolumeStrategyRendering): void {
  if (rendering.fidelityStale) {
    rendering.fidelityStale = false;
    rendering.voxelQuality = readBoundQuality(
      rendering.imageVolume,
      rendering.boundGrid
    );
  }

  rendering.qualityPending = isBindingPending(
    rendering.imageVolume,
    rendering.boundTexture
  );
}

/** Gives back the strategy of a render path whose actor is gone. */
export function releaseStrategies(rendering: VolumeStrategyRendering): void {
  rendering.strategy?.deactivate();
  rendering.strategy = undefined;
  rendering.strategies = undefined;
}

/**
 * Calls `onEvent` for each volume data event of the volume, and for each
 * change of the texture limits, which names no volume and applies to each.
 * Returns the function that removes the listeners.
 */
export function subscribeToVolumeEvents(
  volumeId: string,
  onEvent: (eventType: VolumeEventType) => void
): () => void {
  const handle = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (
      evt.type !== Events.VOLUME_TEXTURE_LIMITS_CHANGED &&
      detail?.volumeId !== volumeId
    ) {
      return;
    }

    onEvent(evt.type as VolumeEventType);
  };

  volumeEventTypes.forEach((type) =>
    eventTarget.addEventListener(type, handle)
  );

  return () =>
    volumeEventTypes.forEach((type) =>
      eventTarget.removeEventListener(type, handle)
    );
}
