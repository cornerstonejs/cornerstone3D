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
import cache from './cache'
import { ImageVolume } from './cache/classes/ImageVolume'
import { RequestPoolManager } from './requestPool/requestPoolManager'
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager'
import imageLoadPoolManager from './requestPool/imageLoadPoolManager'
import { setMaxSimultaneousRequests } from './requestPool/getMaxSimultaneousRequests'
import cpuColormaps from './RenderingEngine/helpers/cpuFallback/colors/colormaps'

import getEnabledElement, { getEnabledElementByUIDs } from './getEnabledElement'
import metaData from './metaData'
import {
  init,
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  setUseCPURendering,
  resetUseCPURendering,
} from './init'

// Classes
import Settings from './Settings'

// Namespaces
import * as volumeLoader from './volumeLoader'
import * as imageLoader from './imageLoader'
import * as Types from './types'
import * as utilities from './utilities'
import { registerImageLoader } from './imageLoader' // since it is used by CSWIL right now

import triggerEvent from './utilities/triggerEvent'

import {
  setVolumesForViewports,
  addVolumesToViewports,
  getVolumeViewportsContainingSameVolumes,
  getVolumeViewportsContainingVolumeUID,
} from './RenderingEngine/helpers'

const Enums = {
  ERROR_CODES,
  EVENTS,
  VIEWPORT_TYPE,
  // constants
  ORIENTATION,
  INTERPOLATION_TYPE,
  REQUEST_TYPE,
}

export type { Types }

export {
  init,
  isCornerstoneInitialized,
  // enums
  Enums,
  EVENTS, // CornerstoneWADOImageLoader uses this, Todo: remove it after fixing wado
  //
  Settings,
  // Rendering Engine
  VolumeViewport,
  Viewport,
  StackViewport,
  RenderingEngine,
  ImageVolume,
  // Helpers
  getRenderingEngine,
  getRenderingEngines,
  getEnabledElement,
  getEnabledElementByUIDs,
  createVolumeActor,
  getOrCreateCanvas,
  createVolumeMapper,
  getVolumeViewportsContainingSameVolumes,
  getVolumeViewportsContainingVolumeUID,
  renderToCanvas,
  // cache
  cache,
  // event helpers
  eventTarget,
  triggerEvent,
  // Image Loader
  imageLoader,
  registerImageLoader, // Todo: remove this after CSWIL uses imageLoader now
  // Volume Loader
  volumeLoader,
  //
  metaData,
  //
  utilities,
  setVolumesForViewports,
  addVolumesToViewports,
  //
  imageLoadPoolManager as requestPoolManager,
  imageRetrievalPoolManager,
  imageLoadPoolManager,
  setMaxSimultaneousRequests,
  // CPU Rendering
  getShouldUseCPURendering,
  setUseCPURendering,
  resetUseCPURendering,
  cpuColormaps,
}
