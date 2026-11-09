import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';
import BaseVolumeViewport from '../src/RenderingEngine/BaseVolumeViewport';
import createVolumeActor from '../src/RenderingEngine/helpers/createVolumeActor';
import {
  resetGpuSettingsPreset,
  setGpuSettingsPreset,
} from '../src/utilities/gpuSettingsPresets';
import { setLossyDownsampling } from '../src/init';

// A legacy viewport has no render path, so the set that its actor draws is held
// while the viewport holds the actor, and a budget can take it afterwards.

const mockVolumes = new Map();

jest.mock('../src/loaders/volumeLoader', () => ({
  loadVolume: async (volumeId) => mockVolumes.get(volumeId),
}));
jest.mock('../src/RenderingEngine/helpers/setDefaultVolumeVOI', () => ({
  __esModule: true,
  default: async () => undefined,
}));

const dimensions = [64, 64, 8];

function makeVolume(volumeId, dims = dimensions) {
  const volume = new ImageVolume({
    volumeId,
    metadata: { FrameOfReferenceUID: 'for-1' },
    dimensions: dims,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageIds: [],
    dataType: 'Float32Array',
    numberOfComponents: 1,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions: dims,
      scalarData: new Float32Array(dims[0] * dims[1] * dims[2]),
      numberOfComponents: 1,
    }),
  });

  mockVolumes.set(volumeId, volume);

  return volume;
}

/** The prototype without the constructor, which needs WebGL. */
function legacyViewport() {
  const element = document.createElement('div');

  return Object.assign(Object.create(BaseVolumeViewport.prototype), {
    id: 'viewport-1',
    element,
    _actors: new Map(),
    getRenderer: () => ({
      addActor: () => undefined,
      removeActor: () => undefined,
      removeAllViewProps: () => undefined,
    }),
    getRenderingEngine: () => ({ hasBeenDestroyed: false }),
    updateCameraClippingPlanesAndRange: () => undefined,
    resetCamera: () => undefined,
  });
}

async function show(viewport, volumeId) {
  const actor = await createVolumeActor(
    { volumeId },
    viewport.element,
    viewport.id,
    true
  );

  viewport.setActors([{ uid: volumeId, actor, referencedId: volumeId }]);
}

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
  mockVolumes.clear();
});

describe('a legacy viewport holds the texture set that it draws', () => {
  it('lets a budget evict the set of a volume that the viewport no longer shows', async () => {
    const viewport = legacyViewport();

    ['a', 'b', 'c'].forEach((id) => makeVolume(id));
    volumeTextureStore.setBudget(
      2 *
        volumeTextureStore.costOf(
          mockVolumes.get('a').voxelGrid,
          'Float32Array'
        )
    );

    await show(viewport, 'a');
    await show(viewport, 'b');
    // `a` stays in the cache, but no viewport draws it.
    await expect(show(viewport, 'c')).resolves.toBeUndefined();

    expect(mockVolumes.get('a').textureSets).toEqual([]);
    expect(mockVolumes.get('b').textureSets.length).toBe(1);
  });
});

describe('a legacy viewport follows a change of the GPU settings', () => {
  it('binds a texture that fits the new preset, and holds that set instead', async () => {
    const viewport = legacyViewport();
    const volume = makeVolume('wide', [512, 64, 8]);

    setLossyDownsampling({ final: true });

    try {
      await show(viewport, 'wide');

      const mapper = viewport.getActor('wide').actor.getMapper();

      expect(mapper.getScalarTexture().getGrid().dimensions).toEqual([
        512, 64, 8,
      ]);

      setGpuSettingsPreset('low');

      expect(mapper.getScalarTexture().getGrid().dimensions).toEqual([
        256, 64, 8,
      ]);
      expect(
        volume.getTextureSet('full-resolution/full-extent').references
      ).toBe(0);
    } finally {
      resetGpuSettingsPreset();
      setLossyDownsampling({ final: false });
    }
  });
});
