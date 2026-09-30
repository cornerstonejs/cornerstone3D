import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';
import { defaultVolumeStrategyProvider } from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import { getGpuCapabilityProfile } from '../src/utilities/gpuCapabilityProfiles';
import {
  enableVolumeGpuTrace,
  disableVolumeGpuTrace,
  resetVolumeGpuTrace,
  summarizeVolumeGpuTrace,
} from '../src/utilities/volumeGpuTrace';

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function makeVolume(dimensions, volumeId) {
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

describe.skip('volumeGpuTrace on reduced >2048 load path', () => {
  beforeEach(() => {
    resetVolumeGpuTrace();
    enableVolumeGpuTrace({ logEvery: 0 });
  });

  afterEach(() => {
    resetVolumeGpuTrace();
    disableVolumeGpuTrace();
    volumeTextureStore.clear();
  });

  it('marks one reduced texture slice per coalesced dirty flush', async () => {
    const volume = makeVolume([32, 32, 4096], 'trace-oversize');
    defaultVolumeStrategyProvider({
      volume,
      profile: getGpuCapabilityProfile('high'),
      viewportId: 'vp',
    });

    // Mid-volume frame → reduced k = floor(2000/2)=1000
    volume.markFrameDirty(2000);
    volume.markFrameDirty(2001); // same reduced box when factorK=2
    await Promise.resolve();

    const summary = summarizeVolumeGpuTrace();

    // Coalesce: one flush / one markFrameDirty trace for the pair
    expect(summary.markFrameDirty.count).toBe(1);
    expect(summary.markFrameDirty.avgTextureSets).toBe(1);
    expect(summary.markFrameDirty.avgMappedSlices).toBe(1);
    expect(summary.markFrameDirty.maxMappedSlices).toBe(1);
    expect(summary.refreshDerived.count).toBe(1);
    expect(summary.hypotheses.some((h) => h.startsWith('multi-set'))).toBe(
      false
    );
  });

  it('full-resolution path also maps one slice per frame', async () => {
    const volume = makeVolume([32, 32, 100], 'trace-under');
    defaultVolumeStrategyProvider({
      volume,
      profile: getGpuCapabilityProfile('high'),
      viewportId: 'vp',
    });

    volume.markFrameDirty(10);
    await Promise.resolve();

    const summary = summarizeVolumeGpuTrace();
    expect(summary.markFrameDirty.avgMappedSlices).toBe(1);
    expect(summary.markFrameDirty.avgTextureSets).toBe(1);
  });
});
