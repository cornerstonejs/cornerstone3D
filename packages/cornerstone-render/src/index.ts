import EVENTS from './enums/events'
import ERROR_CODES from './enums/errorCodes'
import REQUEST_TYPE from './enums/requestType'
//
import ORIENTATION from './constants/orientation'
import VIEWPORT_TYPE from './constants/viewportType'
import INTERPOLATION_TYPE from './constants/interpolationType'
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

import {
  vtkSharedVolumeMapper,
  vtkStreamingOpenGLTexture,
} from './RenderingEngine/vtkClasses/index'

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
  REQUEST_TYPE,
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
  getOrCreateCanvas,
  createVolumeMapper,
  //
  cache,
  Cache,
  getEnabledElement,
  renderToCanvas,
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
  // probably not how we want to export it
  vtkSharedVolumeMapper,
  vtkStreamingOpenGLTexture,
}
