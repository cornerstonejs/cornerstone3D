import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';
import cache from '../src/cache/cache';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import { defaultVolumeStrategyProvider } from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import { getGpuCapabilityProfile } from '../src/utilities/gpuCapabilityProfiles';

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

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

describe('ImageVolume frame marks and deliveries', () => {
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

  it('marks every frame in a full-resolution set beside a reduced one', () => {
    const { volume, imageIds } = makeStreamingVolume(512);
    defaultVolumeStrategyProvider({
      volume,
      profile: getGpuCapabilityProfile('low-tablet'),
      viewportId: 'vp',
    });
    const fullResolution = volume.getFullResolutionTexture();
    // A new texture starts with every frame marked for its first fill.
    fullResolution.getUpdatedFrames().fill(null);

    putSlice(imageIds[0], 10);
    putSlice(imageIds[1], 30);

    volume.markFrameTexturesDirty(0);
    volume.markFrameTexturesDirty(1);

    // Frames 0 and 1 share one reduced box, but the full-resolution texture
    // holds them as two slices.
    expect(fullResolution.getUpdatedFrames()[0]).toBe(true);
    expect(fullResolution.getUpdatedFrames()[1]).toBe(true);
  });

  it('gives a reader in the same turn the delivery that just arrived', () => {
    const { volume, imageIds } = makeStreamingVolume(512);
    const before = volume.getVoxelQuality().deliveries ?? 0;

    putSlice(imageIds[0], 40);
    volume.recordFrameDelivery(0, ImageQualityStatus.FULL_RESOLUTION);

    expect(volume.getVoxelQuality().deliveries).toBe(before + 1);
  });

  it('updates the derived box from the first frame alone (progressive)', async () => {
    const { volume, imageIds } = makeStreamingVolume(512);
    // A CPU reader derives the representation. The render strategy does not.
    const derived = volume.createVoxelRepresentation({ factors: [1, 1, 2] });

    await derived.derivation;

    putSlice(imageIds[0], 40);
    volume.recordFrameDelivery(0, ImageQualityStatus.FULL_RESOLUTION);

    // Only one source slice present — average of what arrived.
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(40);

    putSlice(imageIds[1], 20);
    volume.recordFrameDelivery(1, ImageQualityStatus.FULL_RESOLUTION);

    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(30);
  });
});
