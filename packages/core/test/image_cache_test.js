import { after } from 'node:test';
import {
  cleanupTestEnvironment,
  setupTestEnvironment,
} from '../../../utils/test/testUtils';
import * as cornerstone from '../src/index';

const { cache, Enums, eventTarget } = cornerstone;

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
      const onCacheSizeExceeded = jasmine.createSpy('onCacheSizeExceeded');
      eventTarget.addEventListener(
        Enums.Events.CACHE_SIZE_EXCEEDED,
        onCacheSizeExceeded
      );

      await cache.putImageLoadObject(
        largeImageId,
        createMockImageLoadObject(largeImageId, 9)
      );

      eventTarget.removeEventListener(
        Enums.Events.CACHE_SIZE_EXCEEDED,
        onCacheSizeExceeded
      );
      expect(onCacheSizeExceeded).toHaveBeenCalledTimes(1);
      expect(cache.getCacheSize()).toBe(0);
      expect(cache.getImage(largeImageId)).toBeUndefined();
    });

    it('should keep an image that a CACHE_SIZE_EXCEEDED listener caches in its place', async () => {
      const imageId = 'image1';
      const replacement = { imageId, sizeInBytes: 8 };
      const replaceImage = () => {
        cache.removeImageLoadObject(imageId);
        cache.putImageSync(imageId, replacement);
      };
      eventTarget.addEventListener(
        Enums.Events.CACHE_SIZE_EXCEEDED,
        replaceImage
      );

      await cache.putImageLoadObject(
        imageId,
        createMockImageLoadObject(imageId, 9)
      );

      eventTarget.removeEventListener(
        Enums.Events.CACHE_SIZE_EXCEEDED,
        replaceImage
      );
      expect(cache.getImage(imageId)).toBe(replacement);
      expect(cache.getCacheSize()).toBe(8);
    });
  });
});
