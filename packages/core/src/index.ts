import * as Enums from './enums';
import * as CONSTANTS from './constants';
import { Events } from './enums';
//
import {
  createVolumeActor,
  createVolumeMapper,
  getOrCreateCanvas,
} from './RenderingEngine';
import RenderingEngine from './RenderingEngine';
import VolumeViewport from './RenderingEngine/VolumeViewport';
import BaseVolumeViewport from './RenderingEngine/BaseVolumeViewport';
import StackViewport from './RenderingEngine/StackViewport';
import Viewport from './RenderingEngine/Viewport';
import eventTarget from './eventTarget';
import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine';
import cache, { ImageVolume } from './cache';
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager';
import imageLoadPoolManager from './requestPool/imageLoadPoolManager';

import getEnabledElement, {
  getEnabledElementByIds,
  getEnabledElements,
} from './getEnabledElement';
import * as metaData from './metaData';
import {
  init,
  getShouldUseCPURendering,
  getShouldUseSharedArrayBuffer,
  isCornerstoneInitialized,
  setUseCPURendering,
  setUseSharedArrayBuffer,
  resetUseCPURendering,
  resetUseSharedArrayBuffer,
} from './init';

// Classes
import Settings from './Settings';

// Namespaces
import * as volumeLoader from './loaders/volumeLoader';
import * as imageLoader from './loaders/imageLoader';
import * as geometryLoader from './loaders/geometryLoader';
import * as Types from './types';
import * as utilities from './utilities';
import { registerImageLoader } from './loaders/imageLoader'; // since it is used by CSWIL right now

import triggerEvent from './utilities/triggerEvent';

import {
  setVolumesForViewports,
  addVolumesToViewports,
} from './RenderingEngine/helpers';

export type { Types };

export {
  init,
  isCornerstoneInitialized,
  // enums
  Enums,
  CONSTANTS,
  Events as EVENTS, // CornerstoneWADOImageLoader uses this, Todo: remove it after fixing wado
  //
  Settings,
  // Rendering Engine
  BaseVolumeViewport,
  VolumeViewport,
  Viewport,
  StackViewport,
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
  resetUseCPURendering,
  // SharedArrayBuffer
  getShouldUseSharedArrayBuffer,
  setUseSharedArrayBuffer,
  resetUseSharedArrayBuffer,
  // Geometry Loader
  geometryLoader,
};
