jest.mock('../src/loaders/imageLoader', () => ({
  __esModule: true,
  ...jest.requireActual('../src/loaders/imageLoader'),
  loadAndCacheImage: jest.fn(),
}));

import BaseStreamingImageVolume from '../src/cache/classes/BaseStreamingImageVolume';
import eventTarget from '../src/eventTarget';
import { Events } from '../src/enums';
import triggerEvent from '../src/utilities/triggerEvent';
import { loadAndCacheImage } from '../src/loaders/imageLoader';

const IMAGE_ID = 'streaming-test:image-1';

function createVolume() {
  // callLoadImage only touches these members, so a bare prototype instance
  // avoids the heavyweight ImageVolume constructor requirements.
  const volume = Object.create(BaseStreamingImageVolume.prototype);
  volume.cachedFrames = [];
  volume.vtkOpenGLTexture = { setUpdatedFrame: jest.fn() };
  volume.successCallback = jest.fn();
  volume.errorCallback = jest.fn();
  return volume;
}

function dispatchImageCacheAdded(imageId) {
  triggerEvent(eventTarget, Events.IMAGE_CACHE_IMAGE_ADDED, {
    image: { imageId },
  });
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('BaseStreamingImageVolume.callLoadImage listener cleanup', () => {
  beforeEach(() => {
    eventTarget.reset();
    jest.clearAllMocks();
  });

  it('removes the IMAGE_CACHE_IMAGE_ADDED listener once the load resolves', async () => {
    const volume = createVolume();
    const image = { imageId: IMAGE_ID };
    loadAndCacheImage.mockReturnValue(Promise.resolve(image));

    await volume.callLoadImage(IMAGE_ID, 0, {});
    await flushMicrotasks();

    dispatchImageCacheAdded(IMAGE_ID);

    expect(volume.successCallback).toHaveBeenCalledWith(IMAGE_ID, image);
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).not.toHaveBeenCalled();
  });

  it('removes the IMAGE_CACHE_IMAGE_ADDED listener when the load rejects', async () => {
    const volume = createVolume();
    loadAndCacheImage.mockReturnValue(
      Promise.reject(new Error('network failure'))
    );

    await volume.callLoadImage(IMAGE_ID, 0, {}).catch(() => undefined);
    await flushMicrotasks();

    dispatchImageCacheAdded(IMAGE_ID);

    expect(volume.errorCallback).toHaveBeenCalled();
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).not.toHaveBeenCalled();
  });

  it('still updates the texture frame for cache adds while the load is in flight', async () => {
    const volume = createVolume();
    let resolveLoad;
    loadAndCacheImage.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );

    const loadPromise = volume.callLoadImage(IMAGE_ID, 3, {});

    dispatchImageCacheAdded(IMAGE_ID);
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).toHaveBeenCalledTimes(1);
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).toHaveBeenCalledWith(3);

    resolveLoad({ imageId: IMAGE_ID });
    await loadPromise;
  });

  it('ignores cache adds for other imageIds and still cleans up on settle', async () => {
    const volume = createVolume();
    const image = { imageId: IMAGE_ID };
    loadAndCacheImage.mockReturnValue(Promise.resolve(image));

    const loadPromise = volume.callLoadImage(IMAGE_ID, 0, {});

    dispatchImageCacheAdded('streaming-test:other-image');
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).not.toHaveBeenCalled();

    await loadPromise;
    await flushMicrotasks();

    dispatchImageCacheAdded(IMAGE_ID);
    expect(volume.vtkOpenGLTexture.setUpdatedFrame).not.toHaveBeenCalled();
  });
});
