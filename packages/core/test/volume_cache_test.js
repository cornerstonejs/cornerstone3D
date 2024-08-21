import {
  cleanupTestEnvironment,
  setupTestEnvironment,
} from '../../../utils/test/testUtils';
import * as cornerstone from '../src/index';

const { cache, imageLoader, volumeLoader } = cornerstone;

describe('Volume Cache', () => {
  beforeEach(() => {
    setupTestEnvironment();
    cache.setMaxCacheSize(8); // Set cache size to 8 bytes
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  function createMockImage(imageId, width, height) {
    return imageLoader.createAndCacheLocalImage(imageId, {
      scalarData: new Uint8Array(width * height),
      dimensions: [width, height],
      spacing: [1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0],
    });
  }

  function createMockVolume(volumeId, width, height, numSlices) {
    return volumeLoader.createLocalVolume(volumeId, {
      dimensions: [width, height, numSlices],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: new Uint8Array(width * height * numSlices),
    });
  }

  it('should cache a volume when there is enough free space after images', () => {
    cache.setMaxCacheSize(620000);

    const image1 = createMockImage('image1', 100, 100);
    const image2 = createMockImage('image2', 100, 100);

    const volume = createMockVolume('volume1', 100, 100, 60);

    expect(cache.getVolume('volume1')).toBeDefined();
    expect(cache.getCacheSize()).toBe(620000); // 2 images (20000) + volume (600000)
  });

  it('should cache a volume by decaching images if necessary', async () => {
    cache.setMaxCacheSize(620000);

    const image1 = await createMockImage('image1', 100, 100);
    const image2 = await createMockImage('image2', 100, 100);

    // Verify that the images are in the cache
    expect(cache.getImage('image1')).toBeDefined();
    expect(cache.getImage('image2')).toBeDefined();
    expect(cache.getCacheSize()).toBe(20000); // 2 images (10000 each)

    const volume = await createMockVolume('volume1', 100, 100, 61);

    expect(cache.getVolume('volume1')).toBeDefined();
    expect(cache.getImage('image1')).toBeUndefined();
    expect(cache.getImage('image2')).toBeDefined();
    expect(cache.getCacheSize()).toBe(620000); //
  });

  // Todo: rever this test
  // fit('should not cache a volume larger than the max cache size', async () => {
  //   const largeVolumeId = 'volume1';
  //   cache.setMaxCacheSize(900000);

  //   try {
  //     await createMockVolume(largeVolumeId, 300, 300, 100);
  //     // If we reach here, the method didn't throw an error as expected
  //     fail('Expected createMockVolume to throw an error');
  //   } catch (error) {
  //     // The error was thrown as expected
  //     console.debug('Caught expected error:', error);
  //   }

  //   expect(cache.getVolume(largeVolumeId)).toBeUndefined();
  //   expect(cache.getCacheSize()).toBe(0);
  // });

  it('should not decache a volume to make space for an image', async () => {
    const volumeId = 'volume1';
    const imageId = 'newImage';

    cache.setMaxCacheSize(600000);

    const volume = await createMockVolume(volumeId, 100, 100, 60);

    try {
      await createMockImage(imageId, 100, 100);
      // If we reach here, the method didn't throw an error as expected
      fail('Expected createMockImage to throw an error');
    } catch (error) {
      // The error was thrown as expected
      console.debug('Caught expected error:', error);
    }

    expect(cache.getVolume(volumeId)).toBeDefined();
    expect(cache.getImage(imageId)).toBeUndefined();
    expect(cache.getCacheSize()).toBe(600000); // volume (600000)
  });

  it('should cache a new image by decaching an existing image but not a volume', async () => {
    const volumeId = 'volume1';
    const smallImageId = 'smallImage';
    const largeImageId = 'largeImage';
    cache.setMaxCacheSize(620000);

    // Create a volume that almost fills the cache
    const volume = await createMockVolume(volumeId, 100, 100, 60);

    // Create a small image that fits in the remaining space
    await createMockImage(smallImageId, 100, 100);

    expect(cache.getVolume(volumeId)).toBeDefined();
    expect(cache.getImage(smallImageId)).toBeDefined();
    expect(cache.getCacheSize()).toBe(610000); // volume (600000) + small image (10000)

    // Try to create a larger image
    await createMockImage(largeImageId, 100, 200);

    // Check that the volume is still there
    expect(cache.getVolume(volumeId)).toBeDefined();

    // Check that the small image was decached
    expect(cache.getImage(smallImageId)).toBeUndefined();

    // Check that the large image was cached
    expect(cache.getImage(largeImageId)).toBeDefined();

    // Check the final cache size
    expect(cache.getCacheSize()).toBe(620000); // volume (600000) + large image (20000)

    // try to create a new image that is too large
    try {
      await createMockImage('tooLargeImage', 200, 200);
      fail('Expected createMockImage to throw an error');
    } catch (error) {
      console.debug('Caught expected error:', error);
    }
  });
});
