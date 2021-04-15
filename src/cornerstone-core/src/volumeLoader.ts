import { ImageVolume } from './cache'
import {
  IVolume,
  VolumeLoadObject,
  VolumeLoaderFn,
} from 'src/cornerstone-core/src/types'
import cache from './cache/cache'
import EVENTS from './enums/events'
import eventTarget from './eventTarget'
import triggerEvent from './utilities/triggerEvent'
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData'
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'

interface VolumeLoaderOptions {
  imageIds: Array<string>
}

function createInternalVTKRepresentation({
  dimensions,
  metadata,
  spacing,
  direction,
  origin,
  scalarData,
}) {
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
 * @returns {VolumeLoadObject} An Object which can be used to act after a volume is loaded or loading fails
 * @memberof VolumeLoader
 */
function loadVolumeFromVolumeLoader(
  volumeId: string,
  options: VolumeLoaderOptions
): VolumeLoadObject {
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
 * @returns {VolumeLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @memberof VolumeLoader
 */
export function loadVolume(
  volumeId: string,
  options: VolumeLoaderOptions = { imageIds: [] }
): ImageVolume {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined')
  }

  const volumeLoadObject = cache.getVolumeLoadObject(volumeId)

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise
  }

  return loadVolumeFromVolumeLoader(volumeId, options).promise.then(
    (volume) => {
      volume.vtkImageData = createInternalVTKRepresentation(volume)
    }
  )
}

export function getVolume(volumeId: string): IVolume {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined')
  }

  return cache.getVolume(volumeId)
}

//

/**
 * Loads an image given an volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred. The image is stored in the cache.
 *
 * @param {String} volumeId A Cornerstone Image Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {VolumeLoadObject} Volume Loader Object
 * @memberof VolumeLoader
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

  volumeLoadObject.promise.then((volume) => {
    volume.vtkImageData = createInternalVTKRepresentation(volume)
  })

  cache.putVolumeLoadObject(volumeId, volumeLoadObject)

  return volumeLoadObject.promise
}

/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} volumeLoader A Cornerstone Volume Loader function
 * @returns {void}
 * @memberof VolumeLoader
 */
export function registerVolumeLoader(
  scheme: string,
  volumeLoader: VolumeLoaderFn
): void {
  volumeLoaders[scheme] = volumeLoader
}

/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param {Function} volumeLoader A Cornerstone Volume Loader
 *
 * @returns {Function|Undefined} The previous Unknown Volume Loader
 * @memberof VolumeLoader
 */
export function registerUnknownVolumeLoader(
  volumeLoader: VolumeLoaderFn
): VolumeLoaderFn | undefined {
  const oldVolumeLoader = unknownVolumeLoader

  unknownVolumeLoader = volumeLoader

  return oldVolumeLoader
}
