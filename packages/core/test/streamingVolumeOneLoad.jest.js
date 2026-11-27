import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import StreamingImageVolume from '../src/cache/classes/StreamingImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import imageLoadPoolManager from '../src/requestPool/imageLoadPoolManager';

/**
 * OHIF M94 (lane FX23): OHIF's TMTV mode queues the requests of its volumes
 * itself (`interleaveTopToBottom`: the requests of `getImageLoadRequests` of
 * the CT and the PET, one of each in turn), and then mounts them. A volume
 * mount of 6.0 loads its volume (`volume.load()`), and the volume did not
 * know that its requests were out: it started a second load with the
 * retrieve stages, which copied each image it delivered into the frames
 * around it (374 copies per volume) and delivered half of the frames twice,
 * and both loads took the request slots. The requests that the volume hands
 * out are its load now: a later `load` joins it, starts no second load, and
 * calls its callback when that load ends.
 */

const dimensions = [4, 4, 6];

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeVolume(volumeId) {
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `image:${volumeId}:${k}`
  );
  const volume = new StreamingImageVolume(
    {
      volumeId,
      metadata: { FrameOfReferenceUID: 'for-1' },
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageIds,
      dataType: 'Uint16Array',
      numberOfComponents: 1,
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: new Uint16Array(4 * 4 * 6),
        numberOfComponents: 1,
      }),
    },
    {
      loadStatus: {
        loaded: false,
        loading: false,
        cancelled: false,
        callbacks: [],
      },
    }
  );

  return { volume, imageIds };
}

describe('A streaming volume whose requests an application queued', () => {
  it('joins that load at a later load call, queues nothing more, and calls back when it ends', async () => {
    const { volume, imageIds } = makeVolume('oneLoad');
    const addRequest = jest.spyOn(imageLoadPoolManager, 'addRequest');
    const requests = volume.getImageLoadRequests(0);

    expect(requests.length).toBe(imageIds.length);
    expect(volume.loadStatus.loading).toBe(true);

    const callback = jest.fn();

    volume.load(callback);

    expect(addRequest).not.toHaveBeenCalled();

    imageIds.forEach((imageId, index) =>
      volume.updateTextureAndTriggerEvents(
        index,
        imageId,
        ImageQualityStatus.FULL_RESOLUTION
      )
    );
    await Promise.resolve();

    expect(volume.loadStatus.loaded).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
