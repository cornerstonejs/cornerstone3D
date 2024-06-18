import * as cornerstoneStreamingImageVolumeLoader from '@cornerstonejs/streaming-image-volume-loader';
import * as cornerstone from '../src/index.js';
import { createFloat32SharedArray } from '../src/utilities/index.js';

// import { User } from ... doesn't work right now since we don't have named exports set up
const { cache, Enums } = cornerstone;
const { StreamingImageVolume } = cornerstoneStreamingImageVolumeLoader;

describe('Cache', () => {
  beforeAll(() => {
    // initialize the library
    cornerstone.init();
    // Use max instance size for max cache size so they don't interfere
    cache.setMaxCacheSize(cache.getMaxInstanceSize());
  });

  describe('Set maximum cache size', function () {
    afterEach(function () {
      cache.purgeCache();
    });

    it('Maximum cache size should be at least 1 GB', function () {
      // Arrange
      const maximumSizeInBytes = 1073741824; // 1GB

      expect(cache.getMaxCacheSize()).toBeGreaterThanOrEqual(
        maximumSizeInBytes
      );
    });

    it('should fail if numBytes is not defined', function () {
      expect(cache.setMaxCacheSize.bind(cache, undefined)).toThrow();
    });

    it('should fail if numBytes is not a number', function () {
      expect(cache.setMaxCacheSize.bind(cache, '10000')).toThrow();
    });
  });

  describe('Image Cache: Store, retrieve, and remove imagePromises from the cache', function () {
    beforeEach(function () {
      // Arrange
      this.image = {
        imageId: 'anImageId',
        sizeInBytes: 100,
      };

      this.imageLoadObject = {
        promise: Promise.resolve(this.image),
        cancelFn: undefined,
      };
    });

    afterEach(function () {
      cache.purgeCache();
    });

    it('should allow image promises to be added to the cache (putImageLoadObject)', async function () {
      const image = this.image;
      const imageLoadObject = this.imageLoadObject;

      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;
      const cacheSize = cache.getCacheSize();

      expect(cacheSize).toBe(image.sizeInBytes);

      const imageLoad = cache.getImageLoadObject(image.imageId);
      expect(imageLoad).toBeDefined();
    });

    it('should throw an error if imageId is not defined (putImageLoadObject)', function () {
      expect(function () {
        cache.putImageLoadObject(undefined, this.imageLoadObject);
      }).toThrow();
    });

    it('should throw an error if imagePromise is not defined (putImageLoadObject)', function () {
      expect(function () {
        cache.putImageLoadObject(this.image.imageId, undefined);
      }).toThrow();
    });

    it('should throw an error if imageId is already in the cache (putImageLoadObject)', async function () {
      const image = this.image;
      const imageLoadObject = this.imageLoadObject;

      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      expect(function () {
        cache.putImageLoadObject(image.imageId, imageLoadObject);
      }).toThrow();
    });

    it('should allow image promises to be retrieved from the cache (getImageLoadObject()', async function () {
      const image = this.image;
      const imageLoadObject = this.imageLoadObject;

      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      const retrievedImageLoadObject = cache.getImageLoadObject(image.imageId);

      expect(retrievedImageLoadObject).toBe(imageLoadObject);
    });

    it('should throw an error if imageId is not defined (getImageLoadObject()', function () {
      expect(function () {
        cache.getImageLoadObject(undefined);
      }).toThrow();
    });

    it('should fail silently to retrieve a promise for an imageId not in the cache', function () {
      const retrievedImageLoadObject = cache.getImageLoadObject(
        'AnImageIdNotInCache'
      );

      expect(retrievedImageLoadObject).toBeUndefined();
    });

    it('should allow cachedObject to be removed (removeImageLoadObject)', async function () {
      const image = this.image;
      const imageLoadObject = this.imageLoadObject;

      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      expect(cache.getCacheSize()).not.toBe(0);
      cache.removeImageLoadObject(image.imageId);

      expect(cache.getCacheSize()).toBe(0);

      expect(cache.getImageLoadObject(this.image.imageId)).toBeUndefined();
    });

    it('should fail if imageId is not defined (removeImageLoadObject)', function () {
      expect(function () {
        cache.removeImageLoadObject(undefined);
      }).toThrow();
    });

    it('should fail if imageId is not in cache (removeImageLoadObject)', function () {
      expect(function () {
        cache.removeImageLoadObject('RandomImageId');
      }).toThrow();
    });

    it('should fail if resolved image does not have sizeInBytes (putImageLoadObject)', async function () {
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

    it("should fail if resolved image's sizeInBytes is not a number(putImageLoadObject)", async function () {
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

    it('should not cache the imageId if the imageId has been decached before loading(putImageLoadObject)', async function () {
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

    it('should be able to purge the entire cache', async function () {
      const image = this.image;
      const imageLoadObject = this.imageLoadObject;

      cache.putImageLoadObject(image.imageId, imageLoadObject);
      await imageLoadObject.promise;

      cache.purgeCache();

      expect(cache.getCacheSize()).toBe(0);
    });

    it('should cache images when there is enough volatile + unallocated space', async function () {
      // Use max instance size for max cache size so they don't interfere
      cache.setMaxCacheSize(cache.getMaxInstanceSize());
      const maxCacheSize = cache.getMaxCacheSize();

      const image1SizeInBytes = maxCacheSize - 10000;
      const image2SizeInBytes = 9000;

      // Act
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

    it('should unsuccessfully caching an image when there is not enough volatile + unallocated space', async function () {
      const maxCacheSize = cache.getMaxCacheSize();

      const volumeSizeInBytes = maxCacheSize - 10000;
      const image1SizeInBytes = 11000;

      const volumeId = 'aVolumeId';

      const dimensions = [10, 10, 10];
      const scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      );

      // Arrange
      const volume = new StreamingImageVolume(
        // ImageVolume properties
        {
          volumeId,
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          dimensions,
          sizeInBytes: volumeSizeInBytes,
          scalarData,
          metadata: {
            voiLut: [
              { windowCenter: 500, windowWidth: 500 },
              { windowCenter: 1500, windowWidth: 1500 },
            ],
            PhotometricInterpretation: 'MONOCHROME2',
          },
        },
        // Streaming properties
        {
          imageIds: ['imageid1', 'imageid2'],
          loadStatus: {
            loaded: false,
            loading: false,
            cachedFrames: [],
            callbacks: [],
          },
        }
      );

      const volumeLoadObject = {
        promise: Promise.resolve(volume),
        cancelFn: undefined,
      };

      const image1 = {
        imageId: 'anImageId1',
        sizeInBytes: image1SizeInBytes,
      };

      const imageLoadObject1 = {
        promise: Promise.resolve(image1),
        cancelFn: undefined,
      };

      cache.putVolumeLoadObject(volume.volumeId, volumeLoadObject);
      await volumeLoadObject.promise;

      let cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(volume.sizeInBytes);

      await expectAsync(
        cache.putImageLoadObject(image1.imageId, imageLoadObject1)
      ).toBeRejectedWithError(Enums.Events.CACHE_SIZE_EXCEEDED);

      expect(cache.getImageLoadObject(image1.imageId)).not.toBeDefined();

      cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(volume.sizeInBytes);
    });
  });

  describe('Volume Cache: ', function () {
    beforeEach(function () {
      const imageIds = [
        'fakeImageLoader:imageId1',
        'fakeImageLoader:imageId2',
        'fakeImageLoader:imageId3',
        'fakeImageLoader:imageId4',
        'fakeImageLoader:imageId5',
      ];

      const volumeId = 'aVolumeId';

      const dimensions = [10, 10, 10];
      const scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      );
      // Arrange
      this.volume = new StreamingImageVolume(
        // ImageVolume properties
        {
          volumeId,
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          dimensions,
          sizeInBytes: 1000000,
          scalarData,
          metadata: {
            voiLut: [
              { windowCenter: 500, windowWidth: 500 },
              { windowCenter: 1500, windowWidth: 1500 },
            ],
            PhotometricInterpretation: 'MONOCHROME2',
          },
        },
        // Streaming properties
        {
          imageIds,
          loadStatus: {
            loaded: false,
            loading: false,
            cachedFrames: [],
            callbacks: [],
          },
        }
      );

      this.volumeLoadObject = {
        promise: Promise.resolve(this.volume),
        cancelFn: undefined,
      };
    });

    afterEach(function () {
      cache.purgeCache();
    });

    it('should allow volume promises to be added to the cache (putVolumeLoadObject)', async function () {
      const volume = this.volume;
      const volumeLoadObject = this.volumeLoadObject;

      cache.putVolumeLoadObject(volume.volumeId, volumeLoadObject);
      await volumeLoadObject.promise;

      const cacheSize = cache.getCacheSize();

      expect(cacheSize).toBe(volume.sizeInBytes);

      const volumeLoad = cache.getVolumeLoadObject(volume.volumeId);
      expect(volumeLoad).toBeDefined();
    });

    it('should throw an error if volumeId is not defined (putVolumeLoadObject)', function () {
      expect(function () {
        cache.putVolumeLoadObject(undefined, this.volumeLoadObject);
      }).toThrow();
    });

    it('should throw an error if volumeLoadObject is not defined (putVolumeLoadObject)', function () {
      // Assert
      expect(function () {
        cache.putVolumeLoadObject.bind(cache, this.volume.volumeId, undefined);
      }).toThrow();
    });

    it('should throw an error if volumeId is already in the cache (putVolumeLoadObject)', async function () {
      // Arrange
      cache.putImageLoadObject(this.volume.volumeId, this.volumeLoadObject);
      await this.volumeLoadObject.promise;

      // Assert
      expect(function () {
        cache.putImageLoadObject(this.volume.volumeId, this.volumeLoadObject);
      }).toThrow();
    });

    it('should allow volume promises to be retrieved from the cache (getVolumeLoadObject()', async function () {
      const volume = this.volume;
      const volumeLoadObject = this.volumeLoadObject;

      // Act
      cache.putVolumeLoadObject(volume.volumeId, volumeLoadObject);
      await volumeLoadObject.promise;

      // Assert
      const retrievedVolumeLoadObject = cache.getVolumeLoadObject(
        volume.volumeId
      );

      expect(retrievedVolumeLoadObject).toBe(volumeLoadObject);
    });

    it('should throw an error if volumeId is not defined (getVolumeLoadObject()', function () {
      // Assert
      expect(function () {
        cache.getVolumeLoadObject(undefined);
      }).toThrow();
    });

    it('should fail silently to retrieve a promise for an volumeId not in the cache', function () {
      // Act
      const retrievedVolumeLoadObject = cache.getVolumeLoadObject(
        'AVolumeIdNotInCache'
      );

      // Assert
      expect(retrievedVolumeLoadObject).toBeUndefined();
    });

    it('should allow cachedObject to be removed for volume (removeVolumeLoadObject)', async function () {
      const volume = this.volume;
      const volumeLoadObject = this.volumeLoadObject;

      // Arrange
      cache.putVolumeLoadObject(volume.volumeId, volumeLoadObject);
      await volumeLoadObject.promise;

      expect(cache.getCacheSize()).not.toBe(0);
      // Act
      cache.removeVolumeLoadObject(volume.volumeId);

      // Assert
      expect(cache.getCacheSize()).toBe(0);

      expect(cache.getVolumeLoadObject(this.volume.volumeId)).toBeUndefined();
    });

    it('should fail if volumeId is not defined (removeVolumeLoadObject)', function () {
      expect(function () {
        cache.removeVolumeLoadObject(undefined);
      }).toThrow();
    });

    it('should fail if imageId is not in cache (removeImagePromise)', function () {
      expect(function () {
        cache.removeVolumeLoadObject('RandomImageId');
      }).toThrow();
    });

    it('should be able to purge the entire cache', async function () {
      const volume = this.volume;
      const volumeLoadObject = this.volumeLoadObject;

      // Arrange
      await cache.putVolumeLoadObject(volume.volumeId, volumeLoadObject);

      cache.purgeCache();

      expect(cache.getCacheSize()).toBe(0);
    });

    it('should successfully caching a volume when there is enough volatile + unallocated space', async function () {
      const maxCacheSize = cache.getMaxCacheSize();

      const image1SizeInBytes = maxCacheSize - 1;
      const volumeSizeInBytes = maxCacheSize;

      const volumeId = 'aVolumeId';

      const dimensions = [10, 10, 10];
      const scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      );

      // Arrange
      const volume = new StreamingImageVolume(
        // ImageVolume properties
        {
          volumeId,
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          dimensions,
          sizeInBytes: volumeSizeInBytes,
          scalarData,
          metadata: {
            PhotometricInterpretation: 'MONOCHROME2',
          },
        },
        // Streaming properties
        {
          imageIds: ['imageid1', 'imageid2'],
          loadStatus: {
            loaded: false,
            loading: false,
            cachedFrames: [],
            callbacks: [],
          },
        }
      );

      const volumeLoadObject = {
        promise: Promise.resolve(volume),
        cancelFn: undefined,
      };

      const image1 = {
        imageId: 'anImageId1',
        sizeInBytes: image1SizeInBytes,
      };

      const imageLoadObject1 = {
        promise: Promise.resolve(image1),
        cancelFn: undefined,
      };

      cache.putImageLoadObject(image1.imageId, imageLoadObject1);
      await imageLoadObject1.promise;

      let cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(image1.sizeInBytes);

      expect(function () {
        cache.putVolumeLoadObject(volume.volumeId, volumeLoadObject);
      }).not.toThrow();

      await volumeLoadObject.promise;
      cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(volume.sizeInBytes); // it should remove the image (volatile)
    });

    it('should unsuccessfully cache a volume when there is not enough volatile + unallocated space', async function () {
      const maxCacheSize = cache.getMaxCacheSize();

      const volume1SizeInBytes = maxCacheSize - 10000;
      const volume2SizeInBytes = maxCacheSize;

      const dimensions = [10, 10, 10];
      const scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      );

      const volumeId1 = 'aVolumeId1';
      const volumeId2 = 'aVolumeId2';

      // Arrange
      const volume1 = new StreamingImageVolume(
        // ImageVolume properties
        {
          volumeId: volumeId1,
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          dimensions,
          scalarData,
          sizeInBytes: volume1SizeInBytes,
          metadata: {},
        },
        // Streaming properties
        {
          imageIds: ['imageid1', 'imageid2'],
          loadStatus: {
            loaded: false,
            loading: false,
            cachedFrames: [],
            callbacks: [],
          },
        }
      );

      const volumeLoadObject1 = {
        promise: Promise.resolve(volume1),
        cancelFn: undefined,
      };

      const volume2 = new StreamingImageVolume(
        // ImageVolume properties
        {
          volumeId: volumeId2,
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          sizeInBytes: volume2SizeInBytes,
          dimensions,
          scalarData,
          metadata: {},
        },
        // Streaming properties
        {
          imageIds: ['imageid11', 'imageid22'],
          loadStatus: {
            loaded: false,
            loading: false,
            cachedFrames: [],
            callbacks: [],
          },
        }
      );

      const volumeLoadObject2 = {
        promise: Promise.resolve(volume2),
        cancelFn: undefined,
      };

      const promise1 = cache.putVolumeLoadObject(
        volume1.volumeId,
        volumeLoadObject1
      );
      await promise1;

      let cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(volume1.sizeInBytes);

      await expectAsync(
        cache.putImageLoadObject(volume2.volumeId, volumeLoadObject2)
      ).toBeRejectedWithError(Enums.Events.CACHE_SIZE_EXCEEDED);

      expect(cache.getVolumeLoadObject(volume2.volumeId)).not.toBeDefined();

      cacheSize = cache.getCacheSize();
      expect(cacheSize).toBe(volume1.sizeInBytes);
    });
  });
});
