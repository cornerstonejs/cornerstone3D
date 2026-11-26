import { describe, it, expect, beforeEach } from '@jest/globals';
import StreamingImageVolume from '../src/cache/classes/StreamingImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import { VoxelManager } from '../src/utilities';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';
import { fillNearbyFrames } from '../src/loaders/fillNearbyFrames';
import cache from '../src/cache/cache';

/**
 * Row 290 of `v6-open-issues.md`: a progressive load delivers an image and
 * then copies it into the frames near it, in the same task. The volume fired
 * IMAGE_VOLUME_MODIFIED for each of those frames, so 135 images of a PET
 * fired 518 events, and each listener ran 518 times. The volume now fires
 * one event for the deliveries of one task, before any render, and the last
 * one before LOADING_COMPLETED.
 */

beforeEach(() => {
  volumeTextureStore.clear();
  volumeTextureStore.setBudget(0);
});

const dimensions = [4, 4, 8];

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
        scalarData: new Uint16Array(4 * 4 * 8),
        numberOfComponents: 1,
      }),
    },
    {
      loadStatus: {
        loaded: false,
        loading: true,
        cancelled: false,
        callbacks: [],
      },
    }
  );

  volume.autoRenderOnLoad = false;
  volume.totalNumFrames = imageIds.length;

  return { volume, imageIds };
}

function recordEvents(volumeId) {
  const events = [];
  const record = (evt) => {
    if (evt.detail?.volumeId === volumeId) {
      events.push(evt.type);
    }
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, record);
  eventTarget.addEventListener(Events.IMAGE_VOLUME_LOADING_COMPLETED, record);

  return {
    events,
    stop: () => {
      eventTarget.removeEventListener(Events.IMAGE_VOLUME_MODIFIED, record);
      eventTarget.removeEventListener(
        Events.IMAGE_VOLUME_LOADING_COMPLETED,
        record
      );
    },
  };
}

describe('IMAGE_VOLUME_MODIFIED of a streaming volume', () => {
  it('fires once for an image and the copies of it in the frames near it', async () => {
    const { volume, imageIds } = makeVolume('modifiedOnce');
    const { events, stop } = recordEvents(volume.volumeId);
    const image = {
      imageId: imageIds[4],
      imageQualityStatus: ImageQualityStatus.FULL_RESOLUTION,
    };
    const request = {
      nearbyRequests: [2, 3, 5, 6].map((index) => ({
        itemId: imageIds[index],
        imageQualityStatus:
          Math.abs(index - 4) === 1
            ? ImageQualityStatus.ADJACENT_REPLICATE
            : ImageQualityStatus.FAR_REPLICATE + 0.5,
      })),
    };

    volume.successCallback(imageIds[4], image);
    fillNearbyFrames(volume, request, image);
    await Promise.resolve();

    expect(volume.getImageQuality(3)).toBe(
      ImageQualityStatus.ADJACENT_REPLICATE
    );
    expect(events).toEqual([Events.IMAGE_VOLUME_MODIFIED]);

    stop();
    imageIds.forEach((imageId) => {
      if (cache.getImage(imageId)) {
        cache.removeImageLoadObject(imageId);
      }
    });
  });

  it('fires the change of the last image before LOADING_COMPLETED, and none after it', async () => {
    const { volume, imageIds } = makeVolume('modifiedBeforeCompleted');
    const { events, stop } = recordEvents(volume.volumeId);

    imageIds.forEach((imageId, index) =>
      volume.updateTextureAndTriggerEvents(
        index,
        imageId,
        ImageQualityStatus.FULL_RESOLUTION
      )
    );
    await Promise.resolve();

    expect(events).toEqual([
      Events.IMAGE_VOLUME_MODIFIED,
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
    ]);

    stop();
  });
});
