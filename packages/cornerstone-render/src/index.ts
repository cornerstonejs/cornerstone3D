import EVENTS from './enums/events'
import ERROR_CODES from './enums/errorCodes'
import REQUEST_TYPE from './enums/requestType'
import VIEWPORT_TYPE from './enums/viewportType'
import INTERPOLATION_TYPE from './enums/interpolationType'
//
import ORIENTATION from './constants/orientation'
//
import {
  createVolumeActor,
  createVolumeMapper,
  getOrCreateCanvas,
} from './RenderingEngine'
import { renderToCanvas } from './RenderingEngine'
import RenderingEngine from './RenderingEngine'
import VolumeViewport from './RenderingEngine/VolumeViewport'
import StackViewport from './RenderingEngine/StackViewport'
import Viewport from './RenderingEngine/Viewport'
import eventTarget from './eventTarget'
import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine'
import cache, { Cache } from './cache'
import { ImageVolume } from './cache/classes/ImageVolume'
import {
  loadImage,
  loadAndCacheImage,
  loadAndCacheImages,
  registerImageLoader,
  registerUnknownImageLoader,
  unregisterAllImageLoaders,
  cancelLoadAll,
  cancelLoadImage,
  cancelLoadImages,
} from './imageLoader'
import { RequestPoolManager } from './requestPool/requestPoolManager'
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager'
import imageLoadPoolManager from './requestPool/imageLoadPoolManager'
import { setMaxSimultaneousRequests } from './requestPool/getMaxSimultaneousRequests'
import cpuColormaps from './RenderingEngine/helpers/cpuFallback/colors/colormaps'

import {
  createAndCacheVolume,
  createAndCacheDerivedVolume,
  createLocalVolume,
  registerVolumeLoader,
  registerUnknownVolumeLoader,
} from './volumeLoader'
import getEnabledElement, { getEnabledElementByUIDs } from './getEnabledElement'
import configuration from './configuration'
import metaData from './metaData'
import {
  init,
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  setUseCPURenderingOnlyForDebugOrTests,
  resetCPURenderingOnlyForDebugOrTests,
} from './init'

// Classes
import Settings from './Settings'

// Namespaces
import * as Types from './types'
import * as Utilities from './utilities'

import triggerEvent from './utilities/triggerEvent'

import {
  setVolumesOnViewports,
  addVolumesOnViewports,
  getVolumeViewportsContainingSameVolumes,
  getVolumeViewportsContainingVolumeUID,
} from './RenderingEngine/helpers'

/** Cache getVolume, returns a volume from cache given the volumeUID {@link cache} */
const getVolume = cache.getVolume
/**
 * @packageDocumentation
 * @module cornerstone-render
 */
export {
  // enums
  ERROR_CODES,
  EVENTS,
  VIEWPORT_TYPE,
  // constants
  ORIENTATION,
  INTERPOLATION_TYPE,
  REQUEST_TYPE,
  //
  configuration,
  Types,
  Settings,
  // Rendering Engine
  VolumeViewport,
  Viewport,
  StackViewport,
  RenderingEngine,
  // Rendering Engine Helpers
  getRenderingEngine,
  getRenderingEngines,
  createVolumeActor,
  getOrCreateCanvas,
  createVolumeMapper,
  getVolumeViewportsContainingSameVolumes,
  getVolumeViewportsContainingVolumeUID,
  //
  cache,
  Cache,
  getEnabledElement,
  getEnabledElementByUIDs,
  renderToCanvas,
  //
  eventTarget,
  triggerEvent,
  // Image Loaders
  loadImage,
  loadAndCacheImage,
  loadAndCacheImages,
  cancelLoadAll,
  cancelLoadImage,
  cancelLoadImages,
  registerImageLoader,
  registerUnknownImageLoader,
  unregisterAllImageLoaders,
  //
  createAndCacheVolume, // naming may not be perfect? async createAndCacheVolume? // createAndCacheVolume(id, options).then(volume => volume.load())
  createAndCacheDerivedVolume, // naming may not be perfect? async createAndCacheVolume? // createAndCacheVolume(id, options).then(volume => volume.load())
  createLocalVolume,
  registerVolumeLoader,
  registerUnknownVolumeLoader,
  //
  getVolume,
  //
  metaData,
  //
  Utilities,
  setVolumesOnViewports,
  addVolumesOnViewports,
  //
  imageLoadPoolManager as requestPoolManager,
  imageRetrievalPoolManager,
  imageLoadPoolManager,
  RequestPoolManager,
  setMaxSimultaneousRequests,
  ImageVolume,
  // CPU Rendering
  init,
  isCornerstoneInitialized,
  getShouldUseCPURendering,
  setUseCPURenderingOnlyForDebugOrTests,
  resetCPURenderingOnlyForDebugOrTests,
  cpuColormaps,
}
