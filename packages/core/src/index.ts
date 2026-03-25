import * as Enums from './enums';
import * as CONSTANTS from './constants';
import { Events } from './enums';
import RenderingEngine, {
  BaseRenderingEngine,
  TiledRenderingEngine,
  ContextPoolRenderingEngine,
} from './RenderingEngine';
import createVolumeActor from './RenderingEngine/helpers/createVolumeActor';
import createVolumeMapper, {
  convertMapperToNotSharedMapper,
} from './RenderingEngine/helpers/createVolumeMapper';
export * from './RenderingEngine/helpers/getOrCreateCanvas';
import VolumeViewport from './RenderingEngine/VolumeViewport';
import VolumeViewport3D from './RenderingEngine/VolumeViewport3D';
import BaseVolumeViewport from './RenderingEngine/BaseVolumeViewport';
import StackViewport from './RenderingEngine/StackViewport';
import VideoViewport from './RenderingEngine/VideoViewport';
import WSIViewport from './RenderingEngine/WSIViewport';
import ECGViewport from './RenderingEngine/ECGViewport';
import {
  defaultRenderPathResolver,
  DefaultRenderPathResolver,
  viewportHasCanvasWorldTransform,
  viewportHasFrameOfReferenceUID,
  viewportHasPan,
  viewportHasZoom,
  ViewportComputedCamera,
  ViewportNext,
} from './RenderingEngine/ViewportNext';
import ECGViewportNext, {
  CanvasECGPath,
  DefaultECGDataProvider,
  ECGComputedCamera,
} from './RenderingEngine/ViewportNext/ECG';
import VideoViewportNext, {
  DefaultVideoDataProvider,
  HtmlVideoPath,
  VideoComputedCamera,
} from './RenderingEngine/ViewportNext/Video';
import PlanarViewport, {
  BasePlanarViewportCamera,
  CpuImageSlicePath,
  DefaultPlanarDataProvider,
  PlanarStackViewportCamera,
  PlanarVolumeViewportCamera,
  VtkImageMapperPath,
  VtkVolumeMapperPath,
} from './RenderingEngine/ViewportNext/Planar';
import VolumeViewport3DV2, {
  DefaultVolume3DDataProvider,
  Volume3DComputedCamera,
  VtkGeometry3DPath,
  VtkVolume3DPath,
} from './RenderingEngine/ViewportNext/Volume3D';
import WSIViewportNext, {
  DefaultWSIDataProvider,
  DicomMicroscopyPath,
  WSIComputedCamera,
} from './RenderingEngine/ViewportNext/WSI';
import Viewport from './RenderingEngine/Viewport';
import eventTarget from './eventTarget';
import { version } from './version';

import {
  getRenderingEngine,
  getRenderingEngines,
} from './RenderingEngine/getRenderingEngine';
import {
  ImageVolume,
  Surface,
  StreamingDynamicImageVolume,
  StreamingImageVolume,
} from './cache';
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
  getUseViewportNext,
  isCornerstoneInitialized,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
  peerImport,
  resetInitialization,
} from './init';

// Classes
import Settings from './Settings';

// Namespaces
import * as volumeLoader from './loaders/volumeLoader';
import * as imageLoader from './loaders/imageLoader';
import * as geometryLoader from './loaders/geometryLoader';
import ProgressiveRetrieveImages from './loaders/ProgressiveRetrieveImages';
import { decimatedVolumeLoader } from './loaders/decimatedVolumeLoader';
// eslint-disable-next-line import/no-duplicates
import type * as Types from './types';
import type {
  IRetrieveConfiguration,
  IImagesLoader,
  RetrieveOptions,
  RetrieveStage,
  ImageLoadListener,
  // eslint-disable-next-line import/no-duplicates
} from './types';
import * as utilities from './utilities';
import { registerImageLoader } from './loaders/imageLoader'; // since it is used by CSWIL right now

import triggerEvent from './utilities/triggerEvent';
import { convertColorArrayToRgbString } from './utilities/convertColorArrayToRgbString';
import { cornerstoneStreamingImageVolumeLoader } from './loaders/cornerstoneStreamingImageVolumeLoader';
import { cornerstoneStreamingDynamicImageVolumeLoader } from './loaders/cornerstoneStreamingDynamicImageVolumeLoader';
import { cornerstoneMeshLoader } from './loaders/cornerstoneMeshLoader';

import {
  setVolumesForViewports,
  addVolumesToViewports,
  addImageSlicesToViewports,
} from './RenderingEngine/helpers';

export * from './loaders/decimatedVolumeLoader';

const renderingEngineExportsV2 = {
  ViewportNext,
  ViewportComputedCamera,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ECGViewportNext,
  CanvasECGPath,
  DefaultECGDataProvider,
  ECGComputedCamera,
  VideoViewportNext,
  HtmlVideoPath,
  DefaultVideoDataProvider,
  VideoComputedCamera,
  PlanarViewport,

  BasePlanarViewportCamera,
  PlanarStackViewportCamera,
  PlanarVolumeViewportCamera,
  CpuImageSlicePath,
  VtkImageMapperPath,
  VtkVolumeMapperPath,
  DefaultPlanarDataProvider,
  VolumeViewport3DV2,
  VtkVolume3DPath,
  VtkGeometry3DPath,
  DefaultVolume3DDataProvider,
  Volume3DComputedCamera,
  WSIViewportNext,
  DicomMicroscopyPath,
  DefaultWSIDataProvider,
  WSIComputedCamera,
};

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
  resetInitialization,
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
  ECGViewport,
  ECGViewportNext,
  ECGComputedCamera,
  ViewportNext,
  ViewportComputedCamera,
  viewportHasCanvasWorldTransform,
  viewportHasFrameOfReferenceUID,
  viewportHasPan,
  viewportHasZoom,
  RenderingEngine,
  BaseRenderingEngine,
  TiledRenderingEngine,
  ContextPoolRenderingEngine,
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
  createVolumeMapper,
  VideoComputedCamera,
  Volume3DComputedCamera,
  WSIComputedCamera,
  // cache
  cache,
  // event helpers
  eventTarget,
  triggerEvent,
  convertColorArrayToRgbString,
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
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  CanvasECGPath,
  DefaultECGDataProvider,
  VideoViewportNext,
  HtmlVideoPath,
  DefaultVideoDataProvider,
  PlanarViewport,
  BasePlanarViewportCamera,
  PlanarStackViewportCamera,
  PlanarVolumeViewportCamera,
  CpuImageSlicePath,
  VtkImageMapperPath,
  VtkVolumeMapperPath,
  DefaultPlanarDataProvider,
  VolumeViewport3DV2,
  VtkVolume3DPath,
  VtkGeometry3DPath,
  DefaultVolume3DDataProvider,
  WSIViewportNext,
  DicomMicroscopyPath,
  DefaultWSIDataProvider,
  renderingEngineExportsV2,
  //
  imageLoadPoolManager as requestPoolManager,
  imageRetrievalPoolManager,
  imageLoadPoolManager,
  // CPU Rendering
  getShouldUseCPURendering,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  // ViewportNext
  getUseViewportNext,
  // Geometry Loader
  geometryLoader,
  cornerstoneMeshLoader,
  ProgressiveRetrieveImages,
  decimatedVolumeLoader,
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
  StreamingDynamicImageVolume,
  StreamingImageVolume,
  convertMapperToNotSharedMapper,
  // Version
  version,
};
