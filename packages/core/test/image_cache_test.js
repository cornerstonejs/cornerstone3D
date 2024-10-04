import { after } from 'node:test';
import {
  cleanupTestEnvironment,
  setupTestEnvironment,
} from '../../../utils/test/testUtils';
import * as cornerstone from '../src/index';

const { cache, Enums } = cornerstone;

describe('New Image Cache', () => {
  beforeEach(() => {
    setupTestEnvironment();
    cache.setMaxCacheSize(8); // Set cache size to 8 bytes
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  describe('Image Cache', () => {
    function createMockImageLoadObject(imageId, size) {
      return {
        promise: Promise.resolve({
          imageId,
          sizeInBytes: size,
          getPixelData: () => new Uint8Array(size),
        }),
      };
    }

    it('should cache multiple images when their total size is less than the max cache size', async () => {
      const imageId1 = 'image1';
      const imageId2 = 'image2';
      const imageId3 = 'image3';

      await cache.putImageLoadObject(
        imageId1,
        createMockImageLoadObject(imageId1, 2)
      );
      await cache.putImageLoadObject(
        imageId2,
        createMockImageLoadObject(imageId2, 3)
      );
      await cache.putImageLoadObject(
        imageId3,
        createMockImageLoadObject(imageId3, 2)
      );

      expect(cache.getCacheSize()).toBe(7);
      expect(cache.getImage(imageId1)).toBeDefined();
      expect(cache.getImage(imageId2)).toBeDefined();
      expect(cache.getImage(imageId3)).toBeDefined();
    });

    it('should replace oldest image when cache is full', async () => {
      const imageId1 = 'image1';
      const imageId2 = 'image2';
      const imageId3 = 'image3';

      await cache.putImageLoadObject(
        imageId1,
        createMockImageLoadObject(imageId1, 3)
      );
      await cache.putImageLoadObject(
        imageId2,
        createMockImageLoadObject(imageId2, 3)
      );
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different timestamps
      await cache.putImageLoadObject(
        imageId3,
        createMockImageLoadObject(imageId3, 3)
      );

      expect(cache.getCacheSize()).toBe(6);
      expect(cache.getImage(imageId1)).toBeUndefined();
      expect(cache.getImage(imageId2)).toBeDefined();
      expect(cache.getImage(imageId3)).toBeDefined();
    });

    it('should not cache an image larger than the max cache size', async () => {
      const largeImageId = 'largeImage';

      try {
        await cache.putImageLoadObject(
          largeImageId,
          createMockImageLoadObject(largeImageId, 9)
        );
        // If we reach here, the method didn't throw an error as expected
        fail('Expected putImageLoadObject to throw an error');
      } catch (error) {
        // The error was thrown as expected
        console.debug('Caught expected error:', error);
      }

      expect(cache.getCacheSize()).toBe(0);
      expect(cache.getImage(largeImageId)).toBeUndefined();
    });
  });
});
