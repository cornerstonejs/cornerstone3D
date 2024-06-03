import * as Enums from './enums/index.js';
import * as CONSTANTS from './constants/index.js';
import { Events } from './enums/index.js';
//
import {
  createVolumeActor,
  createVolumeMapper,
  getOrCreateCanvas,
} from './RenderingEngine/index.js';
import RenderingEngine from './RenderingEngine/index.js';
import VolumeViewport from './RenderingEngine/VolumeViewport.js';
import VolumeViewport3D from './RenderingEngine/VolumeViewport3D.js';
import BaseVolumeViewport from './RenderingEngine/BaseVolumeViewport.js';
import StackViewport from './RenderingEngine/StackViewport.js';
import VideoViewport from './RenderingEngine/VideoViewport.js';
import Viewport from './RenderingEngine/Viewport.js';
import eventTarget from './eventTarget.js';
import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine.js';
import cache, { ImageVolume } from './cache/index.js';
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager.js';
import imageLoadPoolManager from './requestPool/imageLoadPoolManager.js';

import getEnabledElement, {
  getEnabledElementByIds,
  getEnabledElements,
} from './getEnabledElement.js';
import * as metaData from './metaData.js';
import {
  init,
  getShouldUseCPURendering,
  getShouldUseSharedArrayBuffer,
  isCornerstoneInitialized,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  setUseSharedArrayBuffer,
  resetUseCPURendering,
  resetUseSharedArrayBuffer,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
} from './init.js';

// Classes
import Settings from './Settings.js';

// Namespaces
import * as volumeLoader from './loaders/volumeLoader.js';
import * as imageLoader from './loaders/imageLoader.js';
import * as geometryLoader from './loaders/geometryLoader.js';
import * as Types from './types/index.js';
import * as utilities from './utilities/index.js';
import { registerImageLoader } from './loaders/imageLoader.js'; // since it is used by CSWIL right now

import triggerEvent from './utilities/triggerEvent.js';

import {
  setVolumesForViewports,
  addVolumesToViewports,
} from './RenderingEngine/helpers/index.js';

export type { Types };

export {
  // init
  init,
  isCornerstoneInitialized,
  // configs
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  // enums
  Enums,
  CONSTANTS,
  Events as EVENTS, // CornerstoneDICOMImageLoader uses this, Todo: remove it after fixing wado
  //
  Settings,
  // Rendering Engine
  BaseVolumeViewport,
  VolumeViewport,
  VolumeViewport3D,
  Viewport,
  StackViewport,
  VideoViewport,
  RenderingEngine,
  ImageVolume,
  // Helpers
  getRenderingEngine,
  getRenderingEngines,
  getEnabledElement,
  getEnabledElementByIds,
  getEnabledElements,
  createVolumeActor,
  getOrCreateCanvas,
  createVolumeMapper,
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
  // CPU Rendering
  getShouldUseCPURendering,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  // SharedArrayBuffer
  getShouldUseSharedArrayBuffer,
  setUseSharedArrayBuffer,
  resetUseSharedArrayBuffer,
  // Geometry Loader
  geometryLoader,
};
