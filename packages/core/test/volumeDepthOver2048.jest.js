import { describe, it, expect, afterEach } from '@jest/globals';
import {
  boxAverageReductionFactors,
  deriveBoxAverageGrid,
} from '../src/utilities/voxelGrid';
import {
  getGpuCapabilityProfile,
  gridLimitsOfProfile,
} from '../src/utilities/gpuCapabilityProfiles';
import {
  defaultVolumeStrategyProvider,
  provisionFullResolutionStrategy,
  provisionReducedResolutionStrategy,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';

// Confirms Phase 1 of the >2048 GPU-cost plan: oversized depth becomes ONE
// reduced full-extent texture (reduced-1x1xN), not a multi-slab split.

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function makeVolume(dimensions, volumeId = 'depth-volume') {
  const [, , depth] = dimensions;

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
      scalarData: new Uint16Array(1),
      numberOfComponents: 1,
    }),
  });
}

function context(volume, profileId = 'high') {
  return {
    volume,
    profile: getGpuCapabilityProfile(profileId),
    viewportId: 'viewport-1',
  };
}

afterEach(() => {
  volumeTextureStore.clear();
});

describe('volume depth >2048 uses reduction not multi-slab split', () => {
  it('computes factorK=2 for 64×64×4096 under the high profile', () => {
    const profile = getGpuCapabilityProfile('high');
    const limits = gridLimitsOfProfile(profile, 2);
    const factors = boxAverageReductionFactors([64, 64, 4096], limits);

    expect(factors).toEqual([1, 1, 2]);
    expect(
      deriveBoxAverageGrid(
        {
          dimensions: [64, 64, 4096],
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: identityDirection,
        },
        { factors }
      ).dimensions
    ).toEqual([64, 64, 2048]);
  });

  it('provisions a single reduced-1x1x2 full-extent texture set', () => {
    const volume = makeVolume([64, 64, 4096], 'oversize-k');
    const strategies = defaultVolumeStrategyProvider(context(volume, 'high'));

    expect(strategies).toHaveLength(1);
    expect(strategies[0].name).toBe('reduced-1x1x2/full-extent/average');

    const set = volume.getTextureSet('reduced-1x1x2/full-extent/average');
    expect(set.members()).toHaveLength(1);
    expect(set.coverage).toBe('full-extent');
    expect(strategies[0].bindings()[0].texture.getGrid().dimensions).toEqual([
      64, 64, 2048,
    ]);

    expect(
      provisionFullResolutionStrategy(context(volume, 'high'))
    ).toBeUndefined();
    expect(
      provisionReducedResolutionStrategy(context(volume, 'high'))
    ).toBeDefined();
  });

  it('keeps a single full-resolution set for depth 2000', () => {
    const volume = makeVolume([64, 64, 2000], 'under-k');
    const strategies = defaultVolumeStrategyProvider(context(volume, 'high'));

    expect(strategies.map((s) => s.name)).toEqual([
      'full-resolution/full-extent',
    ]);
    expect(
      volume.getTextureSet('full-resolution/full-extent').members()
    ).toHaveLength(1);
  });

  it('high-texture-4096 holds 2464 depth without reduction (amplifier A/B)', () => {
    const volume = makeVolume([64, 64, 2464], 'control-4096');
    const strategies = defaultVolumeStrategyProvider(
      context(volume, 'high-texture-4096')
    );

    expect(strategies.map((s) => s.name)).toEqual([
      'full-resolution/full-extent',
    ]);
  });
});
