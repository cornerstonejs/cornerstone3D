import EVENTS from './enums/events'
import ERROR_CODES from './enums/errorCodes'
//
import ORIENTATION from './constants/orientation'
import VIEWPORT_TYPE from './constants/viewportType'
import INTERPOLATION_TYPE from './constants/interpolationType'
//
import { createVolumeActor, createVolumeMapper } from './RenderingEngine'
import RenderingEngine from './RenderingEngine'
import VolumeViewport from './RenderingEngine/VolumeViewport'
import StackViewport from './RenderingEngine/StackViewport'
import Viewport from './RenderingEngine/Viewport'
import Scene from './RenderingEngine/Scene'
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
import requestPoolManager from './requestPool/requestPoolManager'
import { setMaxSimultaneousRequests } from './requestPool/getMaxSimultaneousRequests'
import cpuColormaps from './RenderingEngine/helpers/cpuFallback/colors/colormaps'
import {
  createAndCacheVolume,
  registerVolumeLoader,
  registerUnknownVolumeLoader,
} from './volumeLoader'
import getEnabledElement from './getEnabledElement'
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

const getVolume = cache.getVolume

/**
 * @packageDocumentation
 * @module cornerstone-render
 */
export {
  // enums
  ERROR_CODES,
  EVENTS,
  // constants
  ORIENTATION,
  VIEWPORT_TYPE,
  INTERPOLATION_TYPE,
  //
  configuration,
  Types,
  Settings,
  //
  VolumeViewport,
  Viewport,
  StackViewport,
  Scene,
  RenderingEngine,
  getRenderingEngine,
  getRenderingEngines,
  createVolumeActor,
  createVolumeMapper,
  //
  cache,
  Cache,
  getEnabledElement,
  //
  eventTarget,
  triggerEvent,
  //
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
  registerVolumeLoader,
  registerUnknownVolumeLoader,
  //
  getVolume,
  //
  metaData,
  //
  Utilities,
  //
  requestPoolManager,
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
