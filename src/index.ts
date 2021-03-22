import EVENTS from './enums/events'
import ERROR_CODES from './enums/errorCodes'
//
import ORIENTATION from './constants/orientation'
import VIEWPORT_TYPE from './constants/viewportType'
//
import RenderingEngine from './RenderingEngine'
import eventTarget from './eventTarget'
import getRenderingEngine from './RenderingEngine/getRenderingEngine'
import cache from './cache'
import { loadImage, loadAndCacheImage, registerImageLoader, registerUnknownImageLoader } from './imageLoader'
import { createAndCacheVolume, registerVolumeLoader, registerUnknownVolumeLoader } from './volumeLoader'
import getEnabledElement from './getEnabledElement'
import configuration from './configuration'
import metaData from './metaData'

// TODO: Figure out what we want to export from here, if anything (should this be another package?)
import cornerstoneStreamingImageVolumeLoader from './streamingImageVolume/cornerstoneStreamingImageVolumeLoader'

// Namespaces
import * as Types from './types'
import * as Utilities from './utilities'
import triggerEvent from './utilities/triggerEvent'

const getVolume = cache.getVolume;

/** NAMED EXPORTS */
export {
  // enums
  ERROR_CODES,
  EVENTS,
  // constants
  ORIENTATION,
  VIEWPORT_TYPE,
  //
  configuration,
  Types,
  //
  RenderingEngine,
  getRenderingEngine,
  //
  cache,
  getEnabledElement,
  //
  eventTarget,
  triggerEvent,
  //
  loadImage,
  loadAndCacheImage,
  registerImageLoader,
  registerUnknownImageLoader,
  //
  getVolume,
  createAndCacheVolume, // naming may not be perfect? async createAndCacheVolume? // createAndCacheVolume(id, options).then(volume => volume.load())
  registerVolumeLoader,
  registerUnknownVolumeLoader,
  //
  metaData,
  //
  Utilities,
  //
  cornerstoneStreamingImageVolumeLoader
}
