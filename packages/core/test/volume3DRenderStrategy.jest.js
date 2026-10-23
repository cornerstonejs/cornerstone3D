import {
  describe,
  it,
  expect,
  jest,
  afterEach,
  beforeEach,
} from '@jest/globals';
import { VtkVolume3DRenderPath } from '../src/RenderingEngine/GenericViewport/Volume3D/VtkVolume3DRenderPath';
import { VtkVolumeSliceRenderPath } from '../src/RenderingEngine/GenericViewport/Planar/VtkVolumeSliceRenderPath';
import {
  defaultVolumeStrategyProvider,
  provisionFullResolutionStrategy,
  provisionReducedResolutionStrategy,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';
import {
  getGpuCapabilityProfile,
  resetActiveGpuCapabilityProfile,
} from '../src/utilities/gpuCapabilityProfiles';

// The 3D render path chooses a strategy in the same way that the slice render
// path does. A 3D render samples the whole texture, where a slice render
// samples one plane of it, so the two can report a different quality at the
// same moment.
//
// None of these tests needs a GPU. `setScalarTexture` is a spy.

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const dimensions = [512, 512, 8];

function makeVolume({ volumeId = 'volume-3d' } = {}) {
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

function makeRendering(volume, viewportId = 'viewport-3d') {
  return {
    imageVolume: volume,
    viewportId,
    mapper: { setScalarTexture: jest.fn(), modified: jest.fn() },
  };
}

function provision(path, rendering, reason = 'initial') {
  path.provisionStrategies(rendering, reason);
}

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

describe('the 3D render path chooses a strategy', () => {
  it('binds the texture that the strategy offers', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolume3DRenderPath();

    provision(path, rendering);
    render(path, rendering);

    expect(rendering.strategy.name).toBe('full-resolution/full-extent');
    expect(rendering.mapper.setScalarTexture).toHaveBeenCalledTimes(1);
    expect(
      rendering.mapper.setScalarTexture.mock.calls[0][0].getGrid().dimensions
    ).toEqual(dimensions);
  });

  it('never provisions on the frame path', () => {
    const provider = jest.fn(defaultVolumeStrategyProvider);
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolume3DRenderPath(provider);

    provision(path, rendering);
    render(path, rendering);
    render(path, rendering);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(rendering.mapper.setScalarTexture).toHaveBeenCalledTimes(1);
  });

  it('takes a provider and a selection that the caller supplies', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    // The vtk-wasm path will supply a pair like this: it reads a coarse texture
    // in a first pass and the fine data afterwards.
    const path = new VtkVolume3DRenderPath(
      ({ volume: aVolume }) => [
        provisionReducedResolutionStrategy({
          volume: aVolume,
          profile: getGpuCapabilityProfile('low-tablet'),
        }),
      ],
      ({ strategies }) => strategies[0]
    );

    provision(path, rendering);
    render(path, rendering);

    expect(rendering.strategy.name).toBe('reduced-2x2x1/full-extent/average');
  });

  it('binds nothing when the selection chooses no strategy', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolume3DRenderPath(
      defaultVolumeStrategyProvider,
      () => undefined
    );

    provision(path, rendering);
    render(path, rendering);

    expect(rendering.strategy).toBeUndefined();
    expect(rendering.mapper.setScalarTexture).not.toHaveBeenCalled();
  });

  it('gives its strategy back when the actor is removed', () => {
    const volume = makeVolume();
    const rendering = makeRendering(volume);
    const path = new VtkVolume3DRenderPath();

    provision(path, rendering);
    render(path, rendering);

    expect(volume.getTextureSet('full-resolution/full-extent').references).toBe(
      1
    );

    path.removeData(
      { vtk: { renderer: { removeVolume: jest.fn() } } },
      rendering
    );

    expect(volume.getTextureSet('full-resolution/full-extent').references).toBe(
      0
    );
    expect(rendering.strategy).toBeUndefined();
  });
});

describe('two viewports over one volume report independently', () => {
  it('holds a different record at the same moment', () => {
    // Acceptance criterion 7 of issue #2921. One volume, one moment, two
    // viewports: the 3D viewport draws reduced data because it samples the
    // whole texture, and the slice viewport draws the full-resolution data.
    const volume = makeVolume();

    const volume3D = new VtkVolume3DRenderPath(({ volume: aVolume }) => [
      provisionReducedResolutionStrategy({
        volume: aVolume,
        profile: getGpuCapabilityProfile('low-tablet'),
      }),
    ]);
    const slice = new VtkVolumeSliceRenderPath(({ volume: aVolume }) => [
      provisionFullResolutionStrategy({
        volume: aVolume,
        profile: getGpuCapabilityProfile('high'),
      }),
    ]);

    const rendering3D = makeRendering(volume, 'viewport-3d');
    const renderingSlice = makeRendering(volume, 'viewport-slice');

    provision(volume3D, rendering3D);
    render(volume3D, rendering3D);
    provision(slice, renderingSlice);
    render(slice, renderingSlice);

    // The two viewports bound a different grid at the same moment, which is
    // what acceptance criterion 7 asks for.
    expect(rendering3D.strategy.name).toBe('reduced-2x2x1/full-extent/average');
    expect(renderingSlice.strategy.name).toBe('full-resolution/full-extent');
    expect(rendering3D.boundTexture.getGrid().dimensions).toEqual([
      256, 256, 8,
    ]);
    expect(renderingSlice.boundTexture.getGrid().dimensions).toEqual(
      dimensions
    );
  });

  it('shares one texture set when both choose one strategy', () => {
    const volume = makeVolume();
    const first = new VtkVolume3DRenderPath();
    const second = new VtkVolume3DRenderPath();
    const renderingFirst = makeRendering(volume, 'viewport-a');
    const renderingSecond = makeRendering(volume, 'viewport-b');

    provision(first, renderingFirst);
    render(first, renderingFirst);
    provision(second, renderingSecond);
    render(second, renderingSecond);

    expect(volume.textureSets.length).toBe(1);
    expect(renderingFirst.boundTexture).toBe(renderingSecond.boundTexture);
    expect(volume.getTextureSet('full-resolution/full-extent').references).toBe(
      2
    );
  });
});
