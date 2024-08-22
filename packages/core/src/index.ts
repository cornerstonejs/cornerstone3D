import * as Enums from './enums';
import * as CONSTANTS from './constants';
import { Events } from './enums';
import RenderingEngine from './RenderingEngine';
import createVolumeActor from './RenderingEngine/helpers/createVolumeActor';
import createVolumeMapper from './RenderingEngine/helpers/createVolumeMapper';
import getOrCreateCanvas from './RenderingEngine/helpers/getOrCreateCanvas';
import VolumeViewport from './RenderingEngine/VolumeViewport';
import VolumeViewport3D from './RenderingEngine/VolumeViewport3D';
import BaseVolumeViewport from './RenderingEngine/BaseVolumeViewport';
import StackViewport from './RenderingEngine/StackViewport';
import VideoViewport from './RenderingEngine/VideoViewport';
import WSIViewport from './RenderingEngine/WSIViewport';
import Viewport from './RenderingEngine/Viewport';
import eventTarget from './eventTarget';
import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine';
import { ImageVolume, Surface } from './cache';
import cache from './cache/cache';
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager';
import imageLoadPoolManager from './requestPool/imageLoadPoolManager';

import getEnabledElement, {
  getEnabledElementByIds,
  getEnabledElementByViewportId,
  getEnabledElements,
} from './getEnabledElement';
import * as metaData from './metaData';
import {
  init,
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
  peerImport,
} from './init';

// Classes
import Settings from './Settings';

// Namespaces
import * as volumeLoader from './loaders/volumeLoader';
import * as imageLoader from './loaders/imageLoader';
import * as geometryLoader from './loaders/geometryLoader';
import ProgressiveRetrieveImages from './loaders/ProgressiveRetrieveImages';
import type * as Types from './types';
import type {
  IRetrieveConfiguration,
  IImagesLoader,
  RetrieveOptions,
  RetrieveStage,
  ImageLoadListener,
} from './types';
import * as utilities from './utilities';
import { registerImageLoader } from './loaders/imageLoader'; // since it is used by CSWIL right now

import triggerEvent from './utilities/triggerEvent';
import { streamingImageVolumeLoader } from './loaders/streamingImageVolumeLoader';
import { streamingDynamicImageVolumeLoader } from './loaders/streamingDynamicImageVolumeLoader';

import {
  setVolumesForViewports,
  addVolumesToViewports,
  addImageSlicesToViewports,
} from './RenderingEngine/helpers';

// Add new types here so that they can be imported singly as required.
export type {
  Types,
  IRetrieveConfiguration,
  RetrieveOptions,
  RetrieveStage,
  ImageLoadListener,
  IImagesLoader,
};

export {
  // init
  init,
  isCornerstoneInitialized,
  peerImport,
  // configs
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
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
  WSIViewport,
  RenderingEngine,
  ImageVolume,
  Surface,
  // Helpers
  getRenderingEngine,
  getRenderingEngines,
  getEnabledElement,
  getEnabledElementByIds,
  getEnabledElements,
  getEnabledElementByViewportId,
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
  addImageSlicesToViewports,
  //
  imageLoadPoolManager as requestPoolManager,
  imageRetrievalPoolManager,
  imageLoadPoolManager,
  // CPU Rendering
  getShouldUseCPURendering,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  // Geometry Loader
  geometryLoader,
  ProgressiveRetrieveImages,
  streamingImageVolumeLoader,
  streamingDynamicImageVolumeLoader,
};
