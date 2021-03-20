import * as cornerstone3D from '../src/index'

// import { User } from ... doesn't work right now since we don't have named exports set up
const {
  cache,
  Utilities
} = cornerstone3D

const {
  createUint8SharedArray,
  createFloat32SharedArray
} = Utilities

describe('cache', () => {
  beforeEach(() => {
    cache.purgeCache()
  })

  it('purged cache to have size zero', () => {
    const cacheSize = cache.getCacheSize()

    expect(cacheSize).toEqual(0)
  })

  it('should cache two volumes and decache one correctly', () => {
    let expectedCacheSize = 0

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)

    const volumeOneProps = {
      metadata: {},
      dimensions: [512, 512, 512],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: createFloat32SharedArray(512 * 512 * 512),
    }

    cache.makeAndCacheLocalImageVolume(volumeOneProps)

    expectedCacheSize = 512 * 512 * 512 * 4 // Float32

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)

    const volumeTwoProps = {
      metadata: {},
      dimensions: [256, 256, 256],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: createUint8SharedArray(256 * 256 * 256),
    }

    const volumeTwoUID = 'volumeTwoUID'

    cache.makeAndCacheLocalImageVolume(volumeTwoProps, volumeTwoUID)

    expectedCacheSize += 256 * 256 * 256 // Uint8

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)

    cache.decacheVolume(volumeTwoUID)

    // Should now just be the size of the first volume.
    expectedCacheSize = 512 * 512 * 512 * 4 // Float32

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)
  })

  it('should derive an image with deep-copied metadata properties', () => {
    let expectedCacheSize = 0

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)

    const volumeOneProps = {
      metadata: { FrameOfReferenceUID: '0.1.2.3' },
      dimensions: [512, 512, 512],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: createFloat32SharedArray(512 * 512 * 512),
    }

    const volumeOneUID = 'volumeOneUID'

    cache.makeAndCacheLocalImageVolume(volumeOneProps, volumeOneUID)

    const derivedVolumeBlank = cache.makeAndCacheDerivedVolume(
      volumeOneUID
    )

    expect(derivedVolumeBlank.metadata.FrameOfReferenceUID).toEqual(
      volumeOneProps.metadata.FrameOfReferenceUID
    )

    derivedVolumeBlank.metadata.FrameOfReferenceUID = '1.2.3.4'

    expect(derivedVolumeBlank.metadata.FrameOfReferenceUID).not.toEqual(
      volumeOneProps.metadata.FrameOfReferenceUID
    )
  })

  it('should allow us to derive with data of equal length to source', () => {
    let expectedCacheSize = 0

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)

    const volumeOneProps = {
      metadata: { FrameOfReferenceUID: '0.1.2.3' },
      dimensions: [512, 512, 512],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: createFloat32SharedArray(512 * 512 * 512),
    }

    const volumeOneUID = 'volumeOneUID'

    cache.makeAndCacheLocalImageVolume(volumeOneProps, volumeOneUID)

    const derivedScalarDataOfSameLength = createUint8SharedArray(
      512 * 512 * 512
    )

    let derivedVolumeBlank

    derivedVolumeBlank = cache.makeAndCacheDerivedVolume(volumeOneUID, {
      volumeScalarData: derivedScalarDataOfSameLength,
    })

    expect(derivedVolumeBlank.scalarData instanceof Uint8Array).toEqual(true)
  })

  it('should throw when trying to derive data with volumeScalarData of the wrong length', () => {
    let expectedCacheSize = 0

    expect(cache.getCacheSize()).toEqual(expectedCacheSize)

    const volumeOneProps = {
      metadata: { FrameOfReferenceUID: '0.1.2.3' },
      dimensions: [512, 512, 512],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: createFloat32SharedArray(512 * 512 * 512),
    }

    const volumeOneUID = 'volumeOneUID'

    cache.makeAndCacheLocalImageVolume(volumeOneProps, volumeOneUID)

    const derivedScalarDataOfSameLength = createUint8SharedArray(12345)

    let failed = false

    try {
      cache.makeAndCacheDerivedVolume(volumeOneUID, {
        volumeScalarData: derivedScalarDataOfSameLength,
      })
    } catch (error) {
      failed = true
    }

    expect(failed).toEqual(true)
  })
})
