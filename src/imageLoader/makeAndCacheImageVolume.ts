import { vec3 } from 'gl-matrix';
import cache from '../cache/cache';
import makeVolumeMetadata from '../cache/helpers/makeVolumeMetadata';
import sortImageIdsAndGetSpacing from '../cache/helpers/sortImageIdsAndGetSpacing';
import StreamingImageVolume from '../cache/classes/StreamingImageVolume';

function makeAndCacheImageVolume = (
  imageIds: Array<string>,
  volumeId: string
): ImageVolume | StreamingImageVolume => {
  if (volumeId === undefined) {
    volumeId = uuidv4()
  }

  const volumeLoadObject = cache.getVolumeLoadObject(volumeId)

  if (cachedVolume) {
    return volumeLoadObject.promise
  }

  const volumeMetadata = makeVolumeMetadata(imageIds)

  const {
    BitsAllocated,
    PixelRepresentation,
    ImageOrientationPatient,
    PixelSpacing,
    Columns,
    Rows,
  } = volumeMetadata

  const rowCosineVec = vec3.fromValues(
    ImageOrientationPatient[0],
    ImageOrientationPatient[1],
    ImageOrientationPatient[2]
  )
  const colCosineVec = vec3.fromValues(
    ImageOrientationPatient[3],
    ImageOrientationPatient[4],
    ImageOrientationPatient[5]
  )

  const scanAxisNormal = vec3.create()

  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec)

  const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  )

  const numFrames = imageIds.length

  // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
  const spacing = [PixelSpacing[1], PixelSpacing[0], zSpacing]
  const dimensions = <Point3>[Columns, Rows, numFrames]
  const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal]
  const signed = PixelRepresentation === 1

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = this.getCacheSize()

  // TODO Improve this when we have support for more types
  const bytesPerVoxel = BitsAllocated === 16 ? 4 : 1

  const byteLength =
    bytesPerVoxel * dimensions[0] * dimensions[1] * dimensions[2]

  cache.checkCacheSizeCanSupportVolume(byteLength);

  let scalarData

  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        )
      } else {
        scalarData = createUint8SharedArray(
          dimensions[0] * dimensions[1] * dimensions[2]
        )
      }

      break

    case 16:
      scalarData = createFloat32SharedArray(
        dimensions[0] * dimensions[1] * dimensions[2]
      )

      break
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  })

  const imageData = vtkImageData.newInstance()

  imageData.setDimensions(...dimensions)
  imageData.setSpacing(...spacing)
  imageData.setDirection(...direction)
  imageData.setOrigin(...origin)
  imageData.getPointData().setScalars(scalarArray)

  const streamingImageVolume = new StreamingImageVolume(
    // ImageVolume properties
    {
      uid,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      vtkImageData: imageData,
      scalarData,
    },
    // Streaming properties
    {
      imageIds: sortedImageIds,
      loadStatus: {
        loaded: false,
        loading: false,
        cachedFrames: [],
        callbacks: [],
      },
    }
  )

  cache.putVolumeLoadObject(volumeId,{
    promise: Promise.resolve(streamingImageVolume)
    //decache
    //cancel: cancelLoadStreamingVolume
  });

  return streamingImageVolume
}

private _hasLoaded = (
  streamingImageVolume: StreamingImageVolume
): boolean => {
  const { loadStatus, imageIds } = streamingImageVolume
  const numFrames = imageIds.length

  for (let i = 0; i < numFrames; i++) {
    if (!loadStatus.cachedFrames[i]) {
      return false
    }
  }

  return true
}



public loadVolume = (volumeUID: string, callback: Function) => {
  const volume = this._get(volumeUID)

  if (!volume) {
    throw new Error(
      `Cannot load volume: volume with UID ${volumeUID} does not exist.`
    )
  }

  if (!(volume instanceof StreamingImageVolume)) {
    // Callback saying whole volume is loaded.
    if (callback) {
      callback({ success: true, framesLoaded: 1, numFrames: 1 })
    }

    return
  }

  const streamingVolume = <StreamingImageVolume>volume

  const { imageIds, loadStatus } = streamingVolume

  if (loadStatus.loading) {
    return // Already loading, will get callbacks from main load.
  }

  const { loaded } = streamingVolume.loadStatus
  const numFrames = imageIds.length

  if (loaded) {
    if (callback) {
      callback({
        success: true,
        framesLoaded: numFrames,
        numFrames,
        framesProcessed: numFrames,
      })
    }
    return
  }

  if (callback) {
    streamingVolume.loadStatus.callbacks.push(callback)
  }

  prefetchImageIds(streamingVolume)
}

public clearLoadCallbacks = (volumeUID: string) => {
  const volume = this._get(volumeUID)

  if (!volume) {
    throw new Error(
      `Cannot load volume: volume with UID ${volumeUID} does not exist.`
    )
  }

  if (!(volume instanceof StreamingImageVolume)) {
    return
  }

  const streamingVolume = <StreamingImageVolume>volume

  streamingVolume.loadStatus.callbacks = []
}

public cancelLoadAllVolumes() {
  // Remove requests relating to this volume only.
  requestPoolManager.clearRequestStack(REQUEST_TYPE)

  // Get other volumes and if they are loading re-add their status
  const iterator = this._cache.values()

  /* eslint-disable no-constant-condition */
  while (true) {
    const { value: volume, done } = iterator.next()

    if (done) {
      break
    }

    if (volume instanceof StreamingImageVolume) {
      const streamingVolume = <StreamingImageVolume>volume
      const { loadStatus } = volume

      // Set to not loading.
      loadStatus.loading = false
      // Set to loaded if all data is there.
      loadStatus.loaded = this._hasLoaded(streamingVolume)
      // Remove all the callback listeners
      loadStatus.callbacks = []
    }
  }
}


public makeAndCacheDerivedVolume = (
  referencedVolumeUID,
  options: any = {}
): ImageVolume => {
  const referencedVolume = this._get(referencedVolumeUID)

  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with UID ${referencedVolumeUID} does not exist.`
    )
  }

  let { volumeScalarData, uid } = options

  if (uid === undefined) {
    uid = uuidv4()
  }

  const {
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
  } = referencedVolume

  const scalarLength = scalarData.length

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = this.getCacheSize()

  let byteLength

  if (volumeScalarData) {
    byteLength = volumeScalarData.buffer.byteLength
  } else {
    byteLength = scalarLength * 4
  }

  if (currentCacheSize + byteLength > this.getMaxCacheSize()) {
    throw new Error(ERROR_CODES.CACHE_SIZE_EXCEEDED)
  }

  if (volumeScalarData) {
    if (volumeScalarData.length !== scalarLength) {
      throw new Error(
        `volumeScalarData has incorrect length compared to source data. Length: ${volumeScalarData.length}, expected:scalarLength`
      )
    }

    if (
      !(volumeScalarData instanceof Uint8Array) &&
      !(volumeScalarData instanceof Float32Array)
    ) {
      throw new Error(
        `volumeScalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
      )
    }
  } else {
    volumeScalarData = new Float32Array(scalarLength)
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: volumeScalarData,
  })

  const derivedImageData = vtkImageData.newInstance()

  derivedImageData.setDimensions(...dimensions)
  derivedImageData.setSpacing(...spacing)
  derivedImageData.setDirection(...direction)
  derivedImageData.setOrigin(...origin)
  derivedImageData.getPointData().setScalars(scalarArray)

  const derivedVolume = new ImageVolume({
    uid,
    metadata: _cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing: [...spacing],
    origin: [...spacing],
    direction: [...direction],
    vtkImageData: derivedImageData,
    scalarData: volumeScalarData,
  })

  this._set(uid, derivedVolume)

  return derivedVolume
}

public makeAndCacheLocalImageVolume = (
  properties: any = {},
  uid: string
): ImageVolume => {
  if (uid === undefined) {
    uid = uuidv4()
  }

  const cachedVolume = this._get(uid)

  if (cachedVolume) {
    return cachedVolume
  }

  let {
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
  } = properties

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2]

  // Check if it fits in the cache before we allocate data
  const currentCacheSize = this.getCacheSize()

  const byteLength = scalarData
    ? scalarData.buffer.byteLength
    : scalarLength * 4

  if (currentCacheSize + byteLength > this.getMaxCacheSize()) {
    throw new Error(ERROR_CODES.CACHE_SIZE_EXCEEDED)
  }

  if (scalarData) {
    if (
      !(scalarData instanceof Uint8Array) &&
      !(scalarData instanceof Float32Array)
    ) {
      throw new Error(
        `scalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
      )
    }
  } else {
    scalarData = new Float32Array(scalarLength)
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  })

  const imageData = vtkImageData.newInstance()

  imageData.setDimensions(...dimensions)
  imageData.setSpacing(...spacing)
  imageData.setDirection(...direction)
  imageData.setOrigin(...origin)
  imageData.getPointData().setScalars(scalarArray)

  const volume = new ImageVolume({
    uid,
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    vtkImageData: imageData,
    scalarData: scalarData,
  })

  this._set(uid, volume)

  return volume
}

