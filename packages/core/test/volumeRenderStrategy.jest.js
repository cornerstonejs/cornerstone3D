import {
  describe,
  it,
  expect,
  jest,
  afterEach,
  beforeEach,
} from '@jest/globals';
import { VtkVolumeSliceRenderPath } from '../src/RenderingEngine/GenericViewport/Planar/VtkVolumeSliceRenderPath';
import {
  defaultVolumeStrategyProvider,
  provisionFullResolutionStrategy,
  provisionReducedResolutionStrategy,
  selectFirstReadyStrategy,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import { resolveVolumeTexture } from '../src/RenderingEngine/helpers/resolveVolumeTexture';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';
import {
  getGpuCapabilityProfile,
  setActiveGpuCapabilityProfile,
  resetActiveGpuCapabilityProfile,
} from '../src/utilities/gpuCapabilityProfiles';

// A STRATEGY IS THE UNIT: it states how a render gets its voxels, and the names
// of the texture sets derive from it. The provider builds the strategies when
// the render path adds its actor, and the selection runs on the frame path and
// cannot fail.
//
// NONE OF THESE TESTS NEEDS A GPU. `setScalarTexture` is a spy.

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const dimensions = [512, 512, 8];

function makeVolume({ volumeId = 'strategy-volume' } = {}) {
  const [width, height, depth] = dimensions;

  return new ImageVolume({
    volumeId,
    metadata: { FrameOfReferenceUID: 'for-1' },
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: identityDirection,
    imageIds: Array.from({ length: depth }, (_, k) => `image:${volumeId}:${k}`),
    dataType: 'Uint16Array',
    numberOfComponents: 1,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData: new Uint16Array(width * height * depth).fill(7),
      numberOfComponents: 1,
    }),
  });
}

function makeRendering(volume) {
  return {
    imageVolume: volume,
    viewportId: 'viewport-1',
    mapper: { setScalarTexture: jest.fn(), modified: jest.fn() },
  };
}

function context(volume, profileId = 'high') {
  return {
    volume,
    profile: getGpuCapabilityProfile(profileId),
    viewportId: 'viewport-1',
  };
}

/** Calls the private member that provisions, as `addData` does. */
function provision(path, rendering, profileId, reason = 'initial') {
  const active = getGpuCapabilityProfile(profileId ?? 'high');

  setActiveGpuCapabilityProfile(active.id);
  path.provisionStrategies(rendering, reason);
}

/** Calls the private member that selects, as each render does. */
function render(path, rendering) {
  path.applyStrategy(rendering);
}

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
});

afterEach(() => {
  resetActiveGpuCapabilityProfile();
});

describe('the default provider builds the strategies', () => {
  it('builds the full-resolution strategy when the device can hold it', () => {
    const volume = makeVolume();
    const strategies = defaultVolumeStrategyProvider(
      context(volume, 'high-texture-4096')
    );

    expect(strategies.map((strategy) => strategy.name)).toEqual([
      'full-resolution/full-extent',
    ]);
    expect(strategies[0].isReady()).toBe(true);
    // The name of the texture set derives from the strategy.
    expect(volume.getTextureSet('full-resolution/full-extent')).toBeDefined();
  });

  it('builds the reduced-resolution strategy when it cannot', () => {
    const volume = makeVolume();
    const strategies = defaultVolumeStrategyProvider(
      context(volume, 'low-tablet')
    );

    // The limit of one edge is 256, so the two in-plane axes reduce by 2 and
    // the k axis of 8 slices does not reduce. THE REDUCTION IS PER AXIS.
    expect(strategies.map((strategy) => strategy.name)).toEqual([
      'reduced-2x2x1/full-extent/average',
    ]);
    expect(strategies[0].bindings()[0].texture.getGrid().dimensions).toEqual([
      256, 256, 8,
    ]);
  });

  it('gives no full-resolution strategy when the profile cannot hold it', () => {
    const volume = makeVolume();

    expect(
      provisionFullResolutionStrategy(context(volume, 'low-tablet'))
    ).toBeUndefined();
    expect(
      provisionReducedResolutionStrategy(context(volume, 'high-texture-4096'))
    ).toBeUndefined();
  });

  it('derives a representation at the grid of the strategy', () => {
    const volume = makeVolume();

    provisionReducedResolutionStrategy(context(volume, 'low-tablet'));

    const representations = volume.getVoxelRepresentations();
    const derived = representations.find((one) => one.derivedFrom);

    // Most of the images of the volume have not arrived at this moment, so the
    // derivation reduces almost no data. `ImageVolume.markFrameDirty` redoes
    // the boxes of the representation as each frame arrives.
    expect(representations.length).toBe(2);
    expect(derived.grid.dimensions).toEqual([256, 256, 8]);
    expect(derived.reduction).toBe('boxAverage');
  });

  it('derives one representation when two viewports ask for one grid', () => {
    const volume = makeVolume();

    provisionReducedResolutionStrategy(context(volume, 'low-tablet'));
    provisionReducedResolutionStrategy(context(volume, 'low-tablet'));

    expect(volume.getVoxelRepresentations().length).toBe(2);
  });

  it('gives one texture set to two viewports that choose one strategy', () => {
    const volume = makeVolume();
    const first = defaultVolumeStrategyProvider(context(volume));
    const second = defaultVolumeStrategyProvider(context(volume));

    expect(volume.textureSets.length).toBe(1);
    expect(first[0].bindings()[0].texture).toBe(
      second[0].bindings()[0].texture
    );
  });
});

describe('the render path provisions once and selects per render', () => {
  it('never provisions on the frame path, however many renders happen', () => {
    const provider = jest.fn(defaultVolumeStrategyProvider);
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath(provider);

    provision(path, rendering);
    render(path, rendering);
    render(path, rendering);
    render(path, rendering);

    // THE PROVISION NEVER RUNS ON THE FRAME PATH.
    expect(provider).toHaveBeenCalledTimes(1);
    expect(rendering.mapper.setScalarTexture).toHaveBeenCalledTimes(1);
  });

  it('selects on every render, and cannot fail', () => {
    const select = jest.fn(selectFirstReadyStrategy);
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath(
      defaultVolumeStrategyProvider,
      select
    );

    provision(path, rendering);
    render(path, rendering);
    render(path, rendering);

    expect(select).toHaveBeenCalledTimes(2);
    expect(rendering.strategy.name).toBe('full-resolution/full-extent');
  });

  it('takes a selection that the caller supplies, and does not branch inside', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    // A render component that implements phases supplies a function like this.
    const select = ({ strategies }) => strategies[strategies.length - 1];
    const path = new VtkVolumeSliceRenderPath(
      ({ volume: aVolume, profile }) => [
        provisionReducedResolutionStrategy({
          volume: aVolume,
          profile: getGpuCapabilityProfile('low-tablet'),
        }),
        provisionFullResolutionStrategy({ volume: aVolume, profile }),
      ],
      select
    );

    provision(path, rendering);
    render(path, rendering);

    expect(rendering.strategy.name).toBe('full-resolution/full-extent');
  });

  it('binds nothing when the selection chooses no strategy', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath(
      defaultVolumeStrategyProvider,
      () => undefined
    );

    provision(path, rendering);
    render(path, rendering);

    // A CPU render does this for its lossless pass.
    expect(rendering.strategy).toBeUndefined();
    expect(rendering.mapper.setScalarTexture).not.toHaveBeenCalled();
  });

  it('changes its strategy between two renders with no tear-down of the actor', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    let useFull = false;
    const path = new VtkVolumeSliceRenderPath(
      ({ volume: aVolume }) => [
        provisionReducedResolutionStrategy({
          volume: aVolume,
          profile: getGpuCapabilityProfile('low-tablet'),
        }),
        provisionFullResolutionStrategy({
          volume: aVolume,
          profile: getGpuCapabilityProfile('high'),
        }),
      ],
      ({ strategies }) => (useFull ? strategies[1] : strategies[0])
    );

    provision(path, rendering);
    render(path, rendering);

    const reduced = rendering.mapper.setScalarTexture.mock.calls[0][0];

    expect(reduced.getGrid().dimensions).toEqual([256, 256, 8]);

    // "Reduced until the full resolution is ready, then full resolution."
    useFull = true;
    render(path, rendering);

    const full = rendering.mapper.setScalarTexture.mock.calls[1][0];

    expect(full).not.toBe(reduced);
    expect(full.getGrid().dimensions).toEqual(dimensions);
    // The earlier strategy gave its set back, so the store can evict it.
    expect(
      volume.getTextureSet('reduced-2x2x1/full-extent/average').references
    ).toBe(0);
  });

  it('binds one texture once while the strategy does not change', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath();

    provision(path, rendering);
    render(path, rendering);
    render(path, rendering);
    render(path, rendering);

    expect(rendering.mapper.setScalarTexture).toHaveBeenCalledTimes(1);
  });
});

describe('the strategies are rebuilt when something changes', () => {
  it('runs the provider again, and states why', () => {
    const provider = jest.fn(defaultVolumeStrategyProvider);
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath(provider);

    provision(path, rendering, 'high', 'initial');
    render(path, rendering);
    provision(path, rendering, 'high', 'loaded');

    expect(provider.mock.calls.map((call) => call[0].reason)).toEqual([
      'initial',
      'loaded',
    ]);
  });

  it('keeps the identity of a strategy that the provider names again', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath();

    provision(path, rendering, 'high', 'initial');
    render(path, rendering);

    const first = rendering.strategy;

    provision(path, rendering, 'high', 'loaded');
    render(path, rendering);

    // A fresh object would hold no claim on its texture set, so the claim of
    // the live strategy would be left behind. The identity therefore survives.
    expect(rendering.strategy).toBe(first);
    expect(volume.getTextureSet('full-resolution/full-extent').references).toBe(
      1
    );
    // Nothing was allocated again, and nothing was bound again.
    expect(volume.textureSets.length).toBe(1);
    expect(rendering.mapper.setScalarTexture).toHaveBeenCalledTimes(1);
  });

  it('deactivates a strategy that the provider stops naming, and binds again', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    let reduced = true;
    const path = new VtkVolumeSliceRenderPath(({ volume: aVolume }) =>
      reduced
        ? [
            provisionReducedResolutionStrategy({
              volume: aVolume,
              profile: getGpuCapabilityProfile('low-tablet'),
            }),
          ]
        : [
            provisionFullResolutionStrategy({
              volume: aVolume,
              profile: getGpuCapabilityProfile('high'),
            }),
          ]
    );

    provision(path, rendering, 'high', 'initial');
    render(path, rendering);

    expect(rendering.strategy.name).toBe('reduced-2x2x1/full-extent/average');

    // The data finished loading, so the provider now names a better strategy.
    reduced = false;
    provision(path, rendering, 'high', 'loaded');

    // The dropped strategy gave its set back, so the store can evict it.
    expect(
      volume.getTextureSet('reduced-2x2x1/full-extent/average').references
    ).toBe(0);
    expect(rendering.strategy).toBeUndefined();

    render(path, rendering);

    expect(rendering.strategy.name).toBe('full-resolution/full-extent');
    expect(rendering.mapper.setScalarTexture).toHaveBeenCalledTimes(2);
  });

  it('rebuilds a set that the store evicted under memory pressure', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath();

    provision(path, rendering, 'high', 'initial');
    render(path, rendering);

    const strategy = rendering.strategy;

    // The store lost the set, so the strategy cannot draw.
    volumeTextureStore.evict(volume.volumeId, 'full-resolution/full-extent');

    expect(strategy.isReady()).toBe(false);

    provision(path, rendering, 'high', 'memory');

    expect(strategy.isReady()).toBe(true);
  });
});

describe('the render reports the quality', () => {
  it('reports the record of the grid that it really bound', () => {
    setActiveGpuCapabilityProfile('low-tablet');

    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolumeSliceRenderPath();

    provision(path, rendering, 'low-tablet');
    render(path, rendering);

    const record = rendering.voxelQuality;

    // The record describes the data that the render really bound, which is the
    // reduced representation that the strategy derived, and not the
    // full-resolution data under the ceiling.
    expect(record.grid.dimensions).toEqual([256, 256, 8]);
    expect(record.reduction).toBe('boxAverage');
    // The record states no verdict. A reader compares it against its own
    // requirement, which is how a viewport reports lossless at a display
    // resolution below the resolution of the data.
    expect(record.verdict).toBeUndefined();
  });

  it('reports the full-resolution record when no binding exists', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    // A strategy that is ready but that offers no texture: the data lives in
    // the voxel manager of a device that cannot hold the texture.
    const strategy = {
      name: 'voxel-manager/full-extent',
      volume,
      isReady: () => true,
      bindings: () => [],
      activate: () => undefined,
      deactivate: () => undefined,
      update: () => undefined,
    };
    const path = new VtkVolumeSliceRenderPath(() => [strategy]);

    provision(path, rendering);
    render(path, rendering);

    expect(rendering.strategy).toBe(strategy);
    expect(rendering.mapper.setScalarTexture).not.toHaveBeenCalled();
    expect(rendering.voxelQuality.grid.dimensions).toEqual(dimensions);
  });
});

describe('the actor helpers choose a strategy for either architecture', () => {
  it('gives the reduced texture that the profile allows', () => {
    // A legacy viewport has no render path, so the choice at the creation of
    // its actor is the only one it gets. The capability of a device does not
    // change while a viewport lives, so one choice is what the capability
    // needs.
    const volume = makeVolume();

    const { strategy, texture } = resolveVolumeTexture(volume, {
      provideStrategies: ({ volume: aVolume }) =>
        defaultVolumeStrategyProvider({
          volume: aVolume,
          profile: getGpuCapabilityProfile('low-tablet'),
        }),
    });

    expect(strategy.name).toBe('reduced-2x2x1/full-extent/average');
    expect(texture.getGrid().dimensions).toEqual([256, 256, 8]);
    // The full-resolution set is not built, so it takes no room in the budget.
    expect(volume.getTextureSet('full-resolution/full-extent')).toBeUndefined();
  });

  it('gives the full-resolution texture when the device can hold it', () => {
    const volume = makeVolume();

    const { strategy, texture } = resolveVolumeTexture(volume, {
      provideStrategies: ({ volume: aVolume }) =>
        defaultVolumeStrategyProvider({
          volume: aVolume,
          profile: getGpuCapabilityProfile('high'),
        }),
    });

    expect(strategy.name).toBe('full-resolution/full-extent');
    expect(texture.getGrid().dimensions).toEqual(dimensions);
  });

  it('takes no reference, so a render path owns the claim', () => {
    const volume = makeVolume();

    resolveVolumeTexture(volume);

    expect(volume.getTextureSet('full-resolution/full-extent').references).toBe(
      0
    );
  });
});
