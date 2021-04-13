import * as cornerstoneStreamingImageVolumeLoader from '../src'
import * as cornerstone from '@cornerstone'

const { cache } = cornerstone
// import { User } from ... doesn't work right now since we don't have named exports set up
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

describe('StreamingImageVolume', function () {
  beforeAll(function () {
    const { imageIds } = setupLoaders()

    this.imageIds = imageIds
  })

  beforeEach(function (done) {
    cornerstone
      .createAndCacheVolume('fakeVolumeLoader:VOLUME', {
        imageIds: this.imageIds,
      })
      .finally(done)
  })

  it('load: correctly streams pixel data from Images into Volume', async function (done) {
    const volume = await cornerstone.getVolume('fakeVolumeLoader:VOLUME')

    function callback(loadStatus) {
      console.log(loadStatus)

      done()
    }

    volume.load(callback)

    // todo: create some synthetic image data and actually check to make sure
    // the pixel values are in the right places in the volume
  })

  it('load: leverages images already in the cache during loading', async function () {
    // create some fake images and load them into the cache
    // create a volume including the same imageIds that are in the cache
    // verify that the loadStatusCallbacks progress reports properly log that
    // the images were already loaded
  })

  it('cancelLoading: ', async function () {
    const volumeId = 'fakeVolumeLoader:VOLUME'
    const volume = cornerstone.getVolume(volumeId)
    const completelyRemove = false

    volume.load()
    let pool = cornerstone.requestPoolManager.getRequestPool()
    console.log(pool)

    // TODO: this is showing up as zero, probably because the requests
    // are immediately processed so the pool is empty. Not sure
    // how to avoid that.

    // let numImagesInPool = pool['prefetch'].length
    // expect(numImagesInPool).toEqual(5)
    // expect(volume.loadStatus.loading).toEqual(true)

    volume.cancelLoading()

    pool = cornerstone.requestPoolManager.getRequestPool()
    let numImagesInPool = pool['prefetch'].length
    expect(numImagesInPool).toEqual(0)

    expect(volume.loadStatus.loaded).toEqual(false)
    expect(volume.loadStatus.loading).toEqual(false)
    expect(volume.loadStatus.callbacks.length).toEqual(0)
  })

  it('decache: properly decaches the Volume into a set of Images', async function () {
    const volumeId = 'fakeVolumeLoader:VOLUME'
    const volume = cornerstone.getVolume(volumeId)
    const completelyRemove = false

    volume.load()

    const cacheSizeBeforeDecache = cache.getCacheSize()

    volume.decache(completelyRemove)

    const cacheSizeAfterDecache = cache.getCacheSize()

    // Gets the volume
    const volAfterDecache = cornerstone.getVolume(volumeId)
    expect(volAfterDecache).not.toBeDefined()

    // Todo: the following doesn't work since we are not awaiting the putImageLoadObject
    // expect(cacheSizeAfterDecache - cacheSizeBeforeDecache).toBe(50000)

    for (let imageId of this.imageIds) {
      const cachedImage = cornerstone.cache.getImageLoadObject(imageId)

      expect(cachedImage).toBeDefined()

      const image = await cachedImage.promise
      expect(image.columns).toBe(100)
      expect(image.rows).toBe(100)
      expect(image.sizeInBytes).toBe(10000)
      expect(image.invert).toBe(true)
    }
  })

  it('decache: completely removes the Volume from the cache', async function () {
    const volumeId = 'fakeVolumeLoader:VOLUME'
    const volume = cornerstone.getVolume(volumeId)

    const completelyRemove = true

    volume.load()

    const cacheSizeBeforePurge = cache.getCacheSize()
    expect(cacheSizeBeforePurge).toBe(50000)

    volume.decache(completelyRemove)

    // Gets the volume
    const volAfterDecache = cornerstone.getVolume(volumeId)
    expect(volAfterDecache).not.toBeDefined()

    const cacheSizeAfterPurge = cache.getCacheSize()
    expect(cacheSizeAfterPurge).toBe(0)

    const cachedImage0 = cornerstone.cache.getImageLoadObject(this.imageIds[0])

    expect(cachedImage0).not.toBeDefined()
  })

  afterEach(function () {
    cornerstone.cache.purgeCache()
  })
})
