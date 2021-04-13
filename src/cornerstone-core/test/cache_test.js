import * as cornerstoneStreamingImageVolumeLoader from '../../cornerstone-streaming-image-volume-loader/src'
import * as cornerstone from '@cornerstone'

// import { User } from ... doesn't work right now since we don't have named exports set up
const { cache, Utilities, EVENTS } = cornerstone
const { StreamingImageVolume } = cornerstoneStreamingImageVolumeLoader

function setupLoaders() {
  const imageIds = [
    'fakeImageLoader:imageId1',
    'fakeImageLoader:imageId2',
    'fakeImageLoader:imageId3',
    'fakeImageLoader:imageId4',
    'fakeImageLoader:imageId5',
  ]

  const imageLoader = (imageId) => {
    const pixelData = new Uint8Array(100 * 100)

    const image = {
      rows: 100,
      columns: 100,
      getPixelData: () => pixelData,
      sizeInBytes: 10000, // 100 * 100 * 1
    }

    return {
      promise: Promise.resolve(image),
    }
  }

  cornerstone.registerImageLoader('fakeImageLoader', imageLoader)

  const volumeLoader = (volumeId) => {
    const dimensions = [100, 100, 5]

    const volumeMetadata = {
      BitsAllocated: 8,
      PixelRepresentation: 0,
      PhotometricInterpretation: 'MONOCHROME1',
      ImageOrientationPatient: [0, 0, 1, 1, 0, 0, 0, 1, 0],
      PixelSpacing: [1, 1],
      Columns: dimensions[0],
      Rows: dimensions[1],
    }

    const scalarData = new Uint8Array(
      dimensions[0] * dimensions[1] * dimensions[2]
    )

    const streamingImageVolume = new StreamingImageVolume(
      // ImageVolume properties
      {
        uid: volumeId, // TODO: should we differentiate between volumeId and a volume's UID?
        metadata: volumeMetadata,
        dimensions: dimensions,
        spacing: [1, 1, 1],
        origin: [0, 0, 0],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        scalarData,
        sizeInBytes: scalarData.byteLength,
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
    )

    return {
      promise: Promise.resolve(streamingImageVolume),
    }
  }

  cornerstone.registerVolumeLoader('fakeVolumeLoader', volumeLoader)

  return {
    imageIds,
  }
}

describe('Set maximum cache size', function () {
  beforeEach(() => {
    cache.purgeCache()
  })
  it('should start by allocating 1GB of cache size', function () {
    // Arrange
    const maximumSizeInBytes = 1073741824 // 1GB

    expect(cache.getMaxCacheSize()).toBe(maximumSizeInBytes)
  })

  it('should fail if numBytes is not defined', function () {
    expect(function () {
      cache.setMaxCacheSize(undefined)
    }).toThrow()
  })

  it('should fail if numBytes is not a number', function () {
    expect(function () {
      cache.setMaxCacheSize('10000')
    }).toThrow()
  })
})

describe('Image Cache: Store, retrieve, and remove imagePromises from the cache', function () {
  beforeAll(function () {
    // Act
    cache.purgeCache()
    const { imageIds } = setupLoaders()

    this.imageIds = imageIds
  })

  beforeEach(function () {
    // Arrange
    this.image = {
      imageId: 'anImageId',
      sizeInBytes: 100,
    }

    this.imageLoadObject = {
      promise: Promise.resolve(this.image),
      cancelFn: undefined,
    }
  })

  afterEach(function () {
    cache.purgeCache()
  })

  it('should allow image promises to be added to the cache (putImageLoadObject)', async function () {
    // Act
    const image = this.image
    const imageLoadObject = this.imageLoadObject

    await cache.putImageLoadObject(image.imageId, imageLoadObject)
    // Assert
    const cacheSize = cache.getCacheSize()

    expect(cacheSize).toBe(image.sizeInBytes)

    const imageLoad = cache.getImageLoadObject(image.imageId)
    expect(imageLoad).toBeDefined()
  })

  // it('should not change cache size if sizeInBytes is undefined (putImagePromise)', function (done) {
  //   // Arrange
  //   this.image.sizeInBytes = undefined
  //   cache.putImageLoadObject(this.image.imageId, this.imageLoadObject)

  //   // Act
  //   this.imageLoadObject.promise.then(() => {
  //     const cacheInfo = getCacheInfo()

  //     // Assert
  //     expect(cache.getCacheSize()).toBe(0)

  //     done()
  //   })
  // })

  // it('should not change cache size if sizeInBytes is not a number (putImagePromise)', function (done) {
  //   // Arrange
  //   this.image.sizeInBytes = '10000'
  //   putImageLoadObject(this.image.imageId, this.imageLoadObject)

  //   // Act
  //   this.imageLoadObject.promise.then(() => {
  //     const cacheInfo = getCacheInfo()

  //     // Assert
  //     assert.equal(cacheInfo.numberOfImagesCached, 1)
  //     assert.equal(cacheInfo.cacheSizeInBytes, 0)

  //     done()
  //   })
  // })

  it('should throw an error if imageId is not defined (putImageLoadObject)', function () {
    // Assert
    expect(function () {
      cache.putImageLoadObject(undefined, this.imageLoadObject)
    }).toThrow()
  })

  it('should throw an error if imagePromise is not defined (putImageLoadObject)', function () {
    // Assert
    expect(function () {
      cache.putImageLoadObject(this.image.imageId, undefined)
    }).toThrow()
  })

  it('should throw an error if imageId is already in the cache (putImageLoadObject)', function () {
    // Arrange
    cache.putImageLoadObject(this.image.imageId, this.imageLoadObject)

    // Assert
    expect(function () {
      cache.putImageLoadObject(this.image.imageId, this.imageLoadObject)
    }).toThrow()
  })

  it('should allow image promises to be retrieved from the cache (getImageLoadObject()', function () {
    const image = this.image
    const imageLoadObject = this.imageLoadObject

    // Act
    cache.putImageLoadObject(image.imageId, imageLoadObject)

    // Assert
    const retrievedImageLoadObject = cache.getImageLoadObject(image.imageId)

    expect(retrievedImageLoadObject).toBe(imageLoadObject)
  })

  it('should throw an error if imageId is not defined (getImageLoadObject()', function () {
    // Assert
    expect(function () {
      cache.getImageLoadObject(undefined)
    }).toThrow()
  })

  it('should fail silently to retrieve a promise for an imageId not in the cache', function () {
    // Act
    const retrievedImageLoadObject = cache.getImageLoadObject(
      'AnImageIdNotInCache'
    )

    // Assert
    expect(retrievedImageLoadObject).toBeUndefined()
  })

  it('should allow cachedObject to be removed (removeImageLoadObject)', async function () {
    const image = this.image
    const imageLoadObject = this.imageLoadObject

    // Arrange
    await cache.putImageLoadObject(image.imageId, imageLoadObject)

    expect(cache.getCacheSize()).not.toBe(0)
    // Act
    cache.removeImageLoadObject(image.imageId)

    // Assert
    expect(cache.getCacheSize()).toBe(0)

    expect(cache.getImageLoadObject(this.image.imageId)).toBeUndefined()
  })

  it('should fail if imageId is not defined (removeImagePromise)', function () {
    expect(function () {
      cache.removeImageLoadObject(undefined)
    }).toThrow()
  })

  it('should fail if imageId is not in cache (removeImagePromise)', function () {
    expect(function () {
      cache.removeImageLoadObject('RandomImageId')
    }).toThrow()
  })

  it('should be able to purge the entire cache', async function (done) {
    const image = this.image
    const imageLoadObject = this.imageLoadObject

    // Arrange
    await cache.putImageLoadObject(image.imageId, imageLoadObject)

    cache.purgeCache()

    expect(cache.getCacheSize()).toBe(0)
  })
})

// it('should be able to kick the oldest image out of the cache', function (done) {
//   // Arrange
//   const promises = []

//   for (let i = 0; i < 10; i++) {
//     // Create the image
//     const image = {
//       imageId: `imageId-${i}`,
//       sizeInBytes: 100,
//     }

//     image.decache = () => console.log('decaching image')

//     const imageLoadObject = {
//       promise: new Promise((resolve) => {
//         resolve(image)
//       }),
//       cancelFn: undefined,
//     }

//     // Add it to the cache
//     cache.putImageLoadObject(image.imageId, imageLoadObject)
//     promises.push(imageLoadObject.promise)
//   }

//   // Retrieve a few of the imagePromises in order to bump their timestamps
//   cache.getImageLoadObject('imageId-5')
//   cache.getImageLoadObject('imageId-4')
//   cache.getImageLoadObject('imageId-6')

//   // Setup event listeners to check that the promise removed and cache full events have fired properly
//   events.addEventListener(EVENTS.IMAGE_CACHE_IMAGE_REMOVED, (event) => {
//     const imageId = event.detail.imageId

//     // Detect that the earliest image added has been removed

//     // TODO: Figure out how to change the test setup to ensure the same
//     // image is always kicked out of the cache. It looks like timestamps
//     // are not in the expected order, probably since handling the promise
//     // resolving is async
//     // assert.equal(imageId, 'imageId-0');
//     assert.isDefined(imageId)
//     done()
//   })

//   events.addEventListener('cornerstoneimagecachefull', (event) => {
//     assert.equal(event.detail.numberOfImagesCached, 10)
//     assert.equal(event.detail.cacheSizeInBytes, maxCacheSize)
//     done()
//   })

//   // Act
//   // Create another image which will push us over the cache limit
//   const extraImage = {
//     imageId: 'imageId-11',
//     sizeInBytes: 100,
//   }

//   const extraImageLoadObject = {
//     promise: new Promise((resolve) => {
//       resolve(extraImage)
//     }),
//     cancelFn: undefined,
//   }

//   Promise.all(promises).then(() => {
//     // Add it to the cache
//     putImageLoadObject(extraImage.imageId, extraImageLoadObject)

//     // Make sure that the cache has pushed out the first image
//     const cacheInfo = getCacheInfo()

//     assert.equal(cacheInfo.numberOfImagesCached, 10)
//     assert.equal(cacheInfo.cacheSizeInBytes, 1000)

//     done()
//   })
// })
// })
