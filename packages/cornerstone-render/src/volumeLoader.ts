import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import cloneDeep from 'lodash.clonedeep'

import { ImageVolume } from './cache/classes/ImageVolume'
import ERROR_CODES from './enums/errorCodes'
import * as Types from './types'
import cache from './cache/cache'
import EVENTS from './enums/events'
import eventTarget from './eventTarget'
import triggerEvent from './utilities/triggerEvent'
import { uuidv4 } from './utilities'
import { Point3, Metadata } from './types'

interface VolumeLoaderOptions {
  imageIds: Array<string>
}

interface DerivedVolumeOptions {
  uid: string
  targetBuffer?: {
    type: 'Float32Array' | 'Uint8Array'
  }
}
interface LocalVolumeOptions {
  scalarData: Float32Array | Uint8Array
  metadata: Metadata
  dimensions: Point3
  spacing: Point3
  origin: Point3
  direction: Float32Array
}

function createInternalVTKRepresentation({
  dimensions,
  metadata,
  spacing,
  direction,
  origin,
  scalarData,
}): vtkImageData {
  const { PhotometricInterpretation } = metadata

  let numComponents = 1
  if (PhotometricInterpretation === 'RGB') {
    numComponents = 3
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: numComponents,
    values: scalarData,
  })

  const imageData = vtkImageData.newInstance()

  imageData.setDimensions(dimensions)
  imageData.setSpacing(spacing)
  imageData.setDirection(direction)
  imageData.setOrigin(origin)
  imageData.getPointData().setScalars(scalarArray)

  return imageData
}

/**
 * This module deals with VolumeLoaders and loading volumes
 * @module VolumeLoader
 */

const volumeLoaders = {}

let unknownVolumeLoader

/**
 * Load a volume using a registered Cornerstone Volume Loader.
 *
 * The volume loader that is used will be
 * determined by the volume loader scheme matching against the volumeId.
 *
 * @param {String} volumeId A Cornerstone Volume Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader. Options
 * contain the ImageIds that is passed to the loader
 *
 * @returns {Types.VolumeLoadObject} An Object which can be used to act after a volume is loaded or loading fails
 *
 */
function loadVolumeFromVolumeLoader(
  volumeId: string,
  options: VolumeLoaderOptions
): Types.VolumeLoadObject {
  const colonIndex = volumeId.indexOf(':')
  const scheme = volumeId.substring(0, colonIndex)
  const loader = volumeLoaders[scheme]

  if (loader === undefined || loader === null) {
    if (unknownVolumeLoader !== undefined) {
      return unknownVolumeLoader(volumeId, options)
    }

    throw new Error('loadVolumeFromVolumeLoader: no volume loader for volumeId')
  }

  const volumeLoadObject = loader(volumeId, options)

  // Broadcast a volume loaded event once the image is loaded
  volumeLoadObject.promise.then(
    function (volume) {
      triggerEvent(eventTarget, EVENTS.IMAGE_LOADED, { volume })
    },
    function (error) {
      const errorObject = {
        volumeId,
        error,
      }

      triggerEvent(eventTarget, EVENTS.IMAGE_LOAD_FAILED, errorObject)
    }
  )

  return volumeLoadObject
}

/**
 * Loads a volume given a volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred.  The loaded image is not stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {Types.VolumeLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @category VolumeLoader
 */
export function loadVolume(
  volumeId: string,
  options: VolumeLoaderOptions = { imageIds: [] }
): Promise<Types.IImageVolume> {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined')
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId)

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options)

  return volumeLoadObject.promise.then((volume: Types.IImageVolume) => {
    volume.imageData = createInternalVTKRepresentation(volume)
    return volume
  })
}

/**
 * Loads an image given an volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred. The image is stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {Types.VolumeLoadObject} Volume Loader Object
 * @category VolumeLoader
 */
export function createAndCacheVolume(
  volumeId: string,
  options: VolumeLoaderOptions
): Promise<Record<string, any>> {
  if (volumeId === undefined) {
    throw new Error(
      'createAndCacheVolume: parameter volumeId must not be undefined'
    )
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId)

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options)

  volumeLoadObject.promise.then((volume: Types.IImageVolume) => {
    volume.imageData = createInternalVTKRepresentation(volume)
  })

  cache.putVolumeLoadObject(volumeId, volumeLoadObject).catch((err) => {
    throw err
  })

  return volumeLoadObject.promise
}

/**
 * Based on a referencedVolumeUID, it will build and cache a new volume. If
 * no scalarData is specified in the options, an empty derived volume will be
 * created that matches the image metadata of the referenceVolume. If scalarData
 * is given, it will be used to generate the intensity values for the derivedVolume.
 * Finally, it will save the volume in the cache.
 * @param referencedVolumeUID the volumeUID from which the new volume will get its metadata
 * @param options DerivedVolumeOptions {uid: derivedVolumeUID, targetBuffer: { type: FLOAT32Array | Uint8Array}, scalarData: if provided}
 * @returns ImageVolume
 */
export function createAndCacheDerivedVolume(
  referencedVolumeUID: string,
  options: DerivedVolumeOptions
): ImageVolume {
  const referencedVolume = cache.getVolume(referencedVolumeUID)

  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with UID ${referencedVolumeUID} does not exist.`
    )
  }

  let { uid } = options
  const { targetBuffer } = options

  if (uid === undefined) {
    uid = uuidv4()
  }

  const { metadata, dimensions, spacing, origin, direction, scalarData } =
    referencedVolume
  const scalarLength = scalarData.length

  let numBytes, TypedArray

  // If target buffer is provided
  if (targetBuffer) {
    if (targetBuffer.type === 'Float32Array') {
      numBytes = scalarLength * 4
      TypedArray = Float32Array
    } else if (targetBuffer.type === 'Uint8Array') {
      numBytes = scalarLength
      TypedArray = Uint8Array
    } else {
      throw new Error('TargetBuffer should be Float32Array or Uint8Array')
    }
  } else {
    // Use float32 if no targetBuffer is provided
    numBytes = scalarLength * 4
    TypedArray = Float32Array
  }

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes)
  if (!isCacheable) {
    throw new Error(ERROR_CODES.CACHE_SIZE_EXCEEDED)
  }

  const volumeScalarData = new TypedArray(scalarLength)

  // Todo: handle more than one component for segmentation (RGB)
  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: volumeScalarData,
  })

  const derivedImageData = vtkImageData.newInstance()

  derivedImageData.setDimensions(dimensions)
  derivedImageData.setSpacing(spacing)
  derivedImageData.setDirection(direction)
  derivedImageData.setOrigin(origin)
  derivedImageData.getPointData().setScalars(scalarArray)

  const derivedVolume = new ImageVolume({
    uid,
    metadata: cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    vtkImageData: derivedImageData,
    scalarData: volumeScalarData,
    sizeInBytes: numBytes,
    referenceVolumeUID: referencedVolumeUID,
  })

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  }
  cache.putVolumeLoadObject(uid, volumeLoadObject)

  return derivedVolume
}

/**
 * Creates and cache a volume based on a set of provided properties including
 * dimensions, spacing, origin, direction, metadata, scalarData. It should be noted that
 * scalarData should be provided for this function to work. If a volume with the same
 * UID exists in the cache it returns it immediately.
 * @param options { scalarData, metadata, dimensions, spacing, origin, direction }
 * @param uid UID of the generated volume
 * @returns ImageVolume
 */
export function createAndCacheLocalVolume(
  options: LocalVolumeOptions,
  uid: string
): ImageVolume {
  const { scalarData, metadata, dimensions, spacing, origin, direction } =
    options

  if (
    !scalarData ||
    !(scalarData instanceof Uint8Array || scalarData instanceof Float32Array)
  ) {
    throw new Error(
      'To use createAndCacheLocalVolume you should pass scalarData of type Uint8Array or Float32Array'
    )
  }

  // Todo: handle default values for spacing, origin, direction if not provided
  if (uid === undefined) {
    uid = uuidv4()
  }

  const cachedVolume = cache.getVolume(uid)

  if (cachedVolume) {
    return cachedVolume
  }

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2]

  const numBytes = scalarData ? scalarData.buffer.byteLength : scalarLength * 4

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes)
  if (!isCacheable) {
    throw new Error(ERROR_CODES.CACHE_SIZE_EXCEEDED)
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  })

  const imageData = vtkImageData.newInstance()

  imageData.setDimensions(dimensions)
  imageData.setSpacing(spacing)
  imageData.setDirection(direction)
  imageData.setOrigin(origin)
  imageData.getPointData().setScalars(scalarArray)

  const derivedVolume = new ImageVolume({
    uid,
    metadata: cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    vtkImageData: imageData,
    scalarData,
    sizeInBytes: numBytes,
  })

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  }
  cache.putVolumeLoadObject(uid, volumeLoadObject)

  return derivedVolume
}

/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} volumeLoader A Cornerstone Volume Loader function
 * @returns {void}
 * @category VolumeLoader
 */
export function registerVolumeLoader(
  scheme: string,
  volumeLoader: Types.VolumeLoaderFn
): void {
  volumeLoaders[scheme] = volumeLoader
}

/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param {Function} volumeLoader A Cornerstone Volume Loader
 *
 * @returns {Function|Undefined} The previous Unknown Volume Loader
 * @category VolumeLoader
 */
export function registerUnknownVolumeLoader(
  volumeLoader: Types.VolumeLoaderFn
): Types.VolumeLoaderFn | undefined {
  const oldVolumeLoader = unknownVolumeLoader

  unknownVolumeLoader = volumeLoader

  return oldVolumeLoader
}
