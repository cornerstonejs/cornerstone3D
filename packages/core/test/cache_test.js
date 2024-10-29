import * as cornerstone from '../src/index';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createViewports,
} from '../../../utils/test/testUtils';

const { cache } = cornerstone;

describe('Cache', () => {
  const renderingEngineId = 'myRenderingEngine';
  const toolGroupIds = ['default'];

  beforeEach(() => {
    setupTestEnvironment({
      renderingEngineId,
      toolGroupIds,
    });
  });

  afterEach(() =>
    cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds,
    })
  );

  describe('Set maximum cache size', () => {
    it('Maximum cache size should be at least 1 GB', () => {
      const maximumSizeInBytes = 1073741824; // 1GB
      expect(cache.getMaxCacheSize()).toBeGreaterThanOrEqual(
        maximumSizeInBytes
      );
    });

    it('should fail if numBytes is not defined', () => {
      expect(cache.setMaxCacheSize.bind(cache, undefined)).toThrow();
    });

    it('should fail if numBytes is not a number', () => {
      expect(cache.setMaxCacheSize.bind(cache, '10000')).toThrow();
    });
  });

  describe('Image Cache: Store, retrieve, and remove imagePromises from the cache', () => {
    let image, imageLoadObject;

    beforeEach(() => {
      image = {
        imageId: 'anImageId',
        sizeInBytes: 100,
      };

      imageLoadObject = {
        promise: Promise.resolve(image),
        cancelFn: undefined,
      };
    });

    it('should allow image promises to be added to the cache (putImageLoadObject)', async () => {
      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;
      const cacheSize = cache.getCacheSize();

      expect(cacheSize).toBe(image.sizeInBytes);

      const imageLoad = cache.getImageLoadObject(image.imageId);
      expect(imageLoad).toBeDefined();
    });

    it('should throw an error if imageId is not defined (putImageLoadObject)', async () => {
      try {
        await cache.putImageLoadObject(undefined, imageLoadObject);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should throw an error if imagePromise is not defined (putImageLoadObject)', async () => {
      try {
        await cache.putImageLoadObject(image.imageId, undefined);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should throw an error if imageId is already in the cache (putImageLoadObject)', async () => {
      await cache.putImageLoadObject(image.imageId, imageLoadObject);

      try {
        await cache.putImageLoadObject(image.imageId, imageLoadObject);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBe(
          'putImageLoadObject: imageId already in cache'
        );
      }
    });

    it('should allow image promises to be retrieved from the cache (getImageLoadObject()', async () => {
      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      const retrievedImageLoadObject = cache.getImageLoadObject(image.imageId);

      expect(retrievedImageLoadObject).toBe(imageLoadObject);
    });

    it('should throw an error if imageId is not defined (getImageLoadObject()', () => {
      expect(function () {
        cache.getImageLoadObject(undefined);
      }).toThrow();
    });

    it('should fail silently to retrieve a promise for an imageId not in the cache', () => {
      const retrievedImageLoadObject = cache.getImageLoadObject(
        'AnImageIdNotInCache'
      );

      expect(retrievedImageLoadObject).toBeUndefined();
    });

    it('should allow cachedObject to be removed (removeImageLoadObject)', async () => {
      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      expect(cache.getCacheSize()).not.toBe(0);
      cache.removeImageLoadObject(image.imageId);

      expect(cache.getCacheSize()).toBe(0);

      expect(cache.getImageLoadObject(image.imageId)).toBeUndefined();
    });

    it('should fail if imageId is not defined (removeImageLoadObject)', () => {
      expect(function () {
        cache.removeImageLoadObject(undefined);
      }).toThrow();
    });

    it('should fail if imageId is not in cache (removeImageLoadObject)', () => {
      expect(function () {
        cache.removeImageLoadObject('RandomImageId');
      }).toThrow();
    });

    it('should fail if resolved image does not have sizeInBytes (putImageLoadObject)', async () => {
      const image1 = {
        imageId: 'anImageId1',
        sizeInBytes: undefined,
      };

      const imageLoadObject1 = {
        promise: Promise.resolve(image1),
        cancelFn: undefined,
      };

      await expectAsync(
        cache.putImageLoadObject(image1.imageId, imageLoadObject1)
      ).toBeRejected();

      expect(cache.getImageLoadObject(image1.imageId)).not.toBeDefined();

      const cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(0);
    });

    it("should fail if resolved image's sizeInBytes is not a number(putImageLoadObject)", async () => {
      const image1 = {
        imageId: 'anImageId1',
        sizeInBytes: '123',
      };

      const imageLoadObject1 = {
        promise: Promise.resolve(image1),
        cancelFn: undefined,
      };

      await expectAsync(
        cache.putImageLoadObject(image1.imageId, imageLoadObject1)
      ).toBeRejected();

      expect(cache.getImageLoadObject(image1.imageId)).not.toBeDefined();

      const cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(0);
    });

    it('should not cache the imageId if the imageId has been decached before loading(putImageLoadObject)', async () => {
      const image1 = {
        imageId: 'anImageId1',
        sizeInBytes: 1234,
      };

      const imageLoadObject1 = {
        promise: Promise.resolve(image1),
        cancelFn: undefined,
      };

      const promise = cache.putImageLoadObject(
        image1.imageId,
        imageLoadObject1
      );

      cache.removeImageLoadObject(image1.imageId);

      await promise;

      expect(cache.getImageLoadObject(image1.imageId)).not.toBeDefined();

      const cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(0);
    });

    it('should be able to purge the entire cache', async () => {
      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      cache.purgeCache();

      expect(cache.getCacheSize()).toBe(0);
    });

    it('should cache images when there is enough volatile + unallocated space', async () => {
      const maxCacheSize = cache.getMaxCacheSize();
      const image1SizeInBytes = maxCacheSize - 10000;
      const image2SizeInBytes = 9000;

      const image1 = {
        imageId: 'anImageId1',
        sizeInBytes: image1SizeInBytes,
      };

      const imageLoadObject1 = {
        promise: Promise.resolve(image1),
        cancelFn: undefined,
      };

      const image2 = {
        imageId: 'anImageId2',
        sizeInBytes: image2SizeInBytes,
      };

      const imageLoadObject2 = {
        promise: Promise.resolve(image2),
        cancelFn: undefined,
      };

      cache.putImageLoadObject(image1.imageId, imageLoadObject1);
      await imageLoadObject1.promise;

      let cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(image1.sizeInBytes);

      cache.putImageLoadObject(image2.imageId, imageLoadObject2);
      await imageLoadObject2.promise;

      cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(image1.sizeInBytes + image2.sizeInBytes);
    });
  });
});
