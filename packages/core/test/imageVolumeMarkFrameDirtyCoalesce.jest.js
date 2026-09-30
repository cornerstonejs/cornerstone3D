import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';
import cache from '../src/cache/cache';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import { defaultVolumeStrategyProvider } from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import { getGpuCapabilityProfile } from '../src/utilities/gpuCapabilityProfiles';

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

async function flushDirtyMicrotask() {
  await Promise.resolve();
}

function putSlice(imageId, value, width = 8, height = 8) {
  const scalarData = new Uint16Array(width * height).fill(value);
  const voxelManager = VoxelManager.createImageVoxelManager({
    width,
    height,
    scalarData,
    numberOfComponents: 1,
  });

  cache.putImageSync(imageId, {
    imageId,
    width,
    height,
    voxelManager,
    getPixelData: () => scalarData,
    sizeInBytes: scalarData.byteLength,
  });
}

function makeStreamingVolume(depth = 512) {
  const dimensions = [8, 8, depth];
  const imageIds = Array.from(
    { length: depth },
    (_, k) => `coalesce-image:${k}`
  );
  const volume = new ImageVolume({
    volumeId: 'coalesce-volume',
    metadata: { FrameOfReferenceUID: 'for-1' },
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: identityDirection,
    imageIds,
    dataType: 'Uint16Array',
    numberOfComponents: 1,
    voxelManager: VoxelManager.createImageVolumeVoxelManager({
      dimensions,
      imageIds,
      numberOfComponents: 1,
    }),
  });

  return { volume, imageIds, dimensions };
}

describe('ImageVolume markFrameDirty coalesce + progressive derived', () => {
  beforeEach(() => {
    volumeTextureStore.clear();
  });

  afterEach(() => {
    volumeTextureStore.clear();
    for (let k = 0; k < 4; k++) {
      try {
        cache.removeImageLoadObject(`coalesce-image:${k}`);
      } catch {
        // ignore
      }
    }
  });

  it('coalesces a factor-K pair into one derived refresh in the same turn', async () => {
    // depth 512 against low-tablet maxEdge 256 → factors [1,1,2]
    const { volume, imageIds } = makeStreamingVolume(512);
    defaultVolumeStrategyProvider({
      volume,
      profile: getGpuCapabilityProfile('low-tablet'),
      viewportId: 'vp',
    });

    putSlice(imageIds[0], 10);
    putSlice(imageIds[1], 30);

    const refreshSpy = jest.spyOn(
      volume.compositeVoxelManager,
      'refreshDerivedFrames'
    );

    volume.markFrameDirty(0, ImageQualityStatus.FULL_RESOLUTION);
    volume.markFrameDirty(1, ImageQualityStatus.FULL_RESOLUTION);
    await flushDirtyMicrotask();

    // Both frames share one reduced k-box under factorK=2.
    expect(refreshSpy.mock.calls.length).toBe(1);

    const derived = volume
      .getVoxelRepresentations()
      .find((representation) => representation.derivedFrom);
    expect(derived).toBeDefined();
    // Average of 10 and 30 (partial progressive replace in place).
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(20);

    refreshSpy.mockRestore();
  });

  it('updates the derived box from the first frame alone (progressive)', async () => {
    const { volume, imageIds } = makeStreamingVolume(512);
    defaultVolumeStrategyProvider({
      volume,
      profile: getGpuCapabilityProfile('low-tablet'),
      viewportId: 'vp',
    });

    putSlice(imageIds[0], 40);
    volume.markFrameDirty(0);
    await flushDirtyMicrotask();

    const derived = volume
      .getVoxelRepresentations()
      .find((representation) => representation.derivedFrom);
    // Only one source slice present — average of what arrived.
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(40);

    putSlice(imageIds[1], 20);
    volume.markFrameDirty(1);
    await flushDirtyMicrotask();

    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(30);
  });
});
