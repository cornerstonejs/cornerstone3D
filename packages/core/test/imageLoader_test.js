import {
  cleanupTestEnvironment,
  setupTestEnvironment,
} from '../../../utils/test/testUtils';
import * as cornerstone3D from '../src/index';

const { imageLoader, cache } = cornerstone3D;

describe('imageLoader -- ', function () {
  afterEach(() => {
    cleanupTestEnvironment();
  });

  beforeEach(function () {
    setupTestEnvironment();
    const [rows1, columns1] = [100, 100];
    const scalarData1 = new Uint8Array(rows1[0] * columns1[1]);
    this.image1 = {
      imageId: 'image1',
      getPixelData: scalarData1,
      sizeInBytes: scalarData1.byteLength,
      rows: rows1,
      columns: columns1,
    };

    this.exampleImageLoader1 = (imageId, options) => {
      console.log('loading via exampleImageLoader1');
      console.log(options);

      return {
        promise: Promise.resolve(this.image1),
        cancelFn: undefined,
      };
    };

    // Another image loader
    const [rows2, columns2] = [200, 200];
    const scalarData2 = new Uint8Array(rows2[0] * columns2[1]);

    this.image2 = {
      imageId: 'image2',
      getPixelData: scalarData2,
      sizeInBytes: scalarData2.byteLength,
      rows: rows2,
      columns: columns2,
    };

    this.exampleImageLoader2 = (imageId, options) => {
      console.log('loading via exampleImageLoader2');
      console.log(options);

      return {
        promise: Promise.resolve(this.image2),
        cancelFn: undefined,
      };
    };

    this.exampleScheme1 = 'example1';
    this.exampleScheme2 = 'example2';

    this.exampleScheme1ImageId = `${this.exampleScheme1}://image1`;
    this.exampleScheme2ImageId = `${this.exampleScheme2}://image2`;
  });

  describe('imageLoader registration module', function () {
    it('allows registration of new image loader', async function () {
      imageLoader.registerImageLoader(
        this.exampleScheme1,
        this.exampleImageLoader1
      );
      imageLoader.registerImageLoader(
        this.exampleScheme2,
        this.exampleImageLoader2
      );

      await imageLoader.loadAndCacheImage(
        this.exampleScheme1ImageId,
        this.options
      );

      await imageLoader.loadAndCacheImage(
        this.exampleScheme2ImageId,
        this.options
      );

      expect(
        cache.getImageLoadObject(this.exampleScheme1ImageId)
      ).toBeDefined();
      expect(
        cache.getImageLoadObject(this.exampleScheme2ImageId)
      ).toBeDefined();
    });

    it('allows registration of unknown image loader', function () {
      let oldUnknownImageLoader = imageLoader.registerUnknownImageLoader(
        this.exampleImageLoader1
      );

      expect(oldUnknownImageLoader).not.toBeDefined();

      // Check that it returns the old value for the unknown image loader
      oldUnknownImageLoader = imageLoader.registerUnknownImageLoader(
        this.exampleImageLoader1
      );

      expect(oldUnknownImageLoader).toBe(this.exampleImageLoader1);
    });
  });

  describe('imageLoader loading module', function () {
    it('allows loading with storage in image cache (loadImage)', async function () {
      imageLoader.registerImageLoader(
        this.exampleScheme1,
        this.exampleImageLoader1
      );
      const imageLoadObject = imageLoader.loadAndCacheImage(
        this.exampleScheme1ImageId,
        this.options
      );

      await expectAsync(imageLoadObject).toBeResolvedTo(this.image1);
    });

    it('allows loading without storage in image cache (imageLoader.loadAndCacheImage)', async function () {
      imageLoader.registerImageLoader(
        this.exampleScheme2,
        this.exampleImageLoader2
      );
      const imageLoadObject = imageLoader.loadImage(
        this.exampleScheme2ImageId,
        this.options
      );

      await expectAsync(imageLoadObject).toBeResolvedTo(this.image2);
    });

    it('falls back to the unknownImageLoader if no appropriate scheme is present', async function () {
      imageLoader.registerImageLoader(
        this.exampleScheme1,
        this.exampleImageLoader1
      );
      imageLoader.registerUnknownImageLoader(this.exampleImageLoader2);
      const imageLoadObject = imageLoader.loadAndCacheImage(
        this.exampleScheme2ImageId,
        this.options
      );

      await expectAsync(imageLoadObject).toBeResolvedTo(this.image2);
    });
  });

  describe('imageLoader cancelling images', function () {
    it('allows loading with storage in image cache (imageLoader.loadAndCacheImage)', async function () {
      imageLoader.registerImageLoader(
        this.exampleScheme1,
        this.exampleImageLoader1
      );
      const imageLoadObject = imageLoader.loadAndCacheImage(
        this.exampleScheme1ImageId,
        this.options
      );

      await expectAsync(imageLoadObject).toBeResolvedTo(this.image1);
    });
  });
});
