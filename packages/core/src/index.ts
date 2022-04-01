import * as Enums from './enums';
import * as CONSTANTS from './constants';
//
import {
  createVolumeActor,
  createVolumeMapper,
  getOrCreateCanvas,
} from './RenderingEngine';
import { renderToCanvas } from './RenderingEngine';
import RenderingEngine from './RenderingEngine';
import VolumeViewport from './RenderingEngine/VolumeViewport';
import StackViewport from './RenderingEngine/StackViewport';
import Viewport from './RenderingEngine/Viewport';
import eventTarget from './eventTarget';
import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine';
import cache from './cache';
import { ImageVolume } from './cache/classes/ImageVolume';
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager';
import imageLoadPoolManager from './requestPool/imageLoadPoolManager';
import { setMaxSimultaneousRequests } from './requestPool/getMaxSimultaneousRequests';

import getEnabledElement, { getEnabledElementByIds } from './getEnabledElement';
import * as metaData from './metaData';
import {
  init,
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  setUseCPURendering,
  resetUseCPURendering,
} from './init';

// Classes
import Settings from './Settings';

// Namespaces
import * as volumeLoader from './volumeLoader';
import * as imageLoader from './imageLoader';
import * as Types from './types';
import * as utilities from './utilities';
import { registerImageLoader } from './imageLoader'; // since it is used by CSWIL right now

import triggerEvent from './utilities/triggerEvent';

import {
  setVolumesForViewports,
  addVolumesToViewports,
} from './RenderingEngine/helpers';

// CornerstoneWADOImageLoader uses this, Todo: remove it after fixing wado
const EVENTS = Enums.Events;

export type { Types };

export {
  init,
  isCornerstoneInitialized,
  // enums
  Enums,
  CONSTANTS,
  EVENTS,
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
  getEnabledElementByIds,
  createVolumeActor,
  getOrCreateCanvas,
  createVolumeMapper,
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
};
