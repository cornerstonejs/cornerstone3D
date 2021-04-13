import EVENTS from './enums/events'
import ERROR_CODES from './enums/errorCodes'
//
import ORIENTATION from './constants/orientation'
import VIEWPORT_TYPE from './constants/viewportType'
//
import RenderingEngine from './RenderingEngine'
import VolumeViewport from './RenderingEngine/VolumeViewport'
import eventTarget from './eventTarget'
import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine'
import cache from './cache'
import { ImageVolume } from './cache/classes/ImageVolume'
import {
  loadImage,
  loadAndCacheImage,
  registerImageLoader,
  registerUnknownImageLoader,
  unregisterAllImageLoaders,
} from './imageLoader'
import { registerWebImageLoader } from '../../cornerstone-streaming-image-volume-loader/src/registerWebImageLoader'
import requestPoolManager from './requestPool/requestPoolManager'
import {
  createAndCacheVolume,
  registerVolumeLoader,
  registerUnknownVolumeLoader,
} from './volumeLoader'
import getEnabledElement from './getEnabledElement'
import configuration from './configuration'
import metaData from './metaData'

// Namespaces
import * as Types from './types'
import * as Utilities from './utilities'
import triggerEvent from './utilities/triggerEvent'

const getVolume = cache.getVolume

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
  VolumeViewport,
  RenderingEngine,
  getRenderingEngine,
  getRenderingEngines,
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
  unregisterAllImageLoaders,
  registerWebImageLoader,
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
  requestPoolManager,
  ImageVolume,
}
