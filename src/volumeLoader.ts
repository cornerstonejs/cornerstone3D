import cache from './cache/cache';
import EVENTS from './enums/events';
import eventTarget from './eventTarget';
import triggerEvent from './utilities/triggerEvent';

import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

function createInternalVTKRepresentation(volume) {
  const { dimensions, spacing, direction, origin, scalarData } = volume;

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

  return imageData;
}

/**
 * This module deals with VolumeLoaders and loading volumes
 * @module VolumeLoader
 */


const volumeLoaders = {};

let unknownVolumeLoader;

/**
 * Load a volume using a registered Cornerstone Volume Loader.
 *
 * The volume loader that is used will be
 * determined by the volume loader scheme matching against the volumeId.
 *
 * @param {String} volumeId A Cornerstone Volume Object's volumeId
 * @param {Object} [options] Options to be passed to the Volume Loader
 *
 * @returns {VolumeLoadObject} An Object which can be used to act after a volume is loaded or loading fails
 * @memberof VolumeLoader
 */
function loadVolumeFromVolumeLoader (volumeId, options) {
  const colonIndex = volumeId.indexOf(':');
  const scheme = volumeId.substring(0, colonIndex);
  const loader = volumeLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (unknownVolumeLoader !== undefined) {
      return unknownVolumeLoader(volumeId);
    }

    throw new Error('loadVolumeFromVolumeLoader: no volume loader for volumeId');
  }

  const volumeLoadObject = loader(volumeId, options);

  // Broadcast a volume loaded event once the image is loaded
  volumeLoadObject.promise.then(function (volume) {
    triggerEvent(eventTarget, EVENTS.IMAGE_LOADED, { volume });
  }, function (error) {
    const errorObject = {
      volumeId,
      error
    };

    triggerEvent(eventTarget, EVENTS.IMAGE_LOAD_FAILED, errorObject);
  });

  return volumeLoadObject;
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
export function loadVolume (volumeId, options) {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined');
  }

  const volumeLoadObject = cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  return loadVolumeFromVolumeLoader(volumeId, options).promise.then(volume => {
    const vtkImageData = createInternalVTKRepresentation(volume);

    volume.vtkImageData = vtkImageData;
  });
}

export function getVolume (volumeId, options) {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined');
  }

  return cache.getVolume(volumeId);
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
export function createAndCacheVolume (volumeId, options) {
  if (volumeId === undefined) {
    throw new Error('createAndCacheVolume: parameter volumeId must not be undefined');
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);

  // TODO: Make sure this doesn't run multiple times
  volumeLoadObject.promise.then(volume => {
    const vtkImageData = createInternalVTKRepresentation(volume);

    volume.vtkImageData = vtkImageData;
  });

  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return volumeLoadObject.promise;
}

/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} volumeLoader A Cornerstone Volume Loader function
 * @returns {void}
 * @memberof VolumeLoader
 */
export function registerVolumeLoader (scheme, volumeLoader) {
  volumeLoaders[scheme] = volumeLoader;
}

/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param {Function} volumeLoader A Cornerstone Volume Loader
 *
 * @returns {Function|Undefined} The previous Unknown Volume Loader
 * @memberof VolumeLoader
 */
export function registerUnknownVolumeLoader (volumeLoader) {
  const oldVolumeLoader = unknownVolumeLoader;

  unknownVolumeLoader = volumeLoader;

  return oldVolumeLoader;
}
