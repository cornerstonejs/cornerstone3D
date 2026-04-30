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
  ResolvedViewportView,
  ViewportNext,
} from './RenderingEngine/ViewportNext';
import ECGViewportNext, {
  CanvasECGPath,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ECGResolvedView,
} from './RenderingEngine/ViewportNext/ECG';
import VideoViewportNext, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  HtmlVideoPath,
  VideoResolvedView,
} from './RenderingEngine/ViewportNext/Video';
import PlanarViewport, {
  BasePlanarResolvedView,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  CpuImageSlicePath,
  DefaultPlanarDataProvider,
  PlanarStackResolvedView,
  PlanarVolumeResolvedView,
  VtkImageMapperPath,
  VtkVolumeSlicePath,
} from './RenderingEngine/ViewportNext/Planar';
import VolumeViewport3DV2, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  Volume3DResolvedView,
  VtkGeometry3DPath,
  VtkVolume3DPath,
} from './RenderingEngine/ViewportNext/Volume3D';
import WSIViewportNext, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  DicomMicroscopyPath,
  WSIResolvedView,
} from './RenderingEngine/ViewportNext/WSI';
export type { ViewportDataReference } from './RenderingEngine/ViewportNext';
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
// eslint-disable-next-line import/no-duplicates
import { ActorRenderMode } from './types';
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
  ResolvedViewportView,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ECGViewportNext,
  CanvasECGPath,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ECGResolvedView,
  VideoViewportNext,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  HtmlVideoPath,
  DefaultVideoDataProvider,
  VideoResolvedView,
  PlanarViewport,

  BasePlanarResolvedView,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  PlanarStackResolvedView,
  PlanarVolumeResolvedView,
  CpuImageSlicePath,
  VtkImageMapperPath,
  VtkVolumeSlicePath,
  DefaultPlanarDataProvider,
  VolumeViewport3DV2,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  VtkVolume3DPath,
  VtkGeometry3DPath,
  DefaultVolume3DDataProvider,
  Volume3DResolvedView,
  WSIViewportNext,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DicomMicroscopyPath,
  DefaultWSIDataProvider,
  WSIResolvedView,
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
  ECGResolvedView,
  ViewportNext,
  ResolvedViewportView,
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
  VideoResolvedView,
  Volume3DResolvedView,
  WSIResolvedView,
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
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  VideoViewportNext,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  HtmlVideoPath,
  DefaultVideoDataProvider,
  PlanarViewport,
  BasePlanarResolvedView,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  PlanarStackResolvedView,
  PlanarVolumeResolvedView,
  CpuImageSlicePath,
  VtkImageMapperPath,
  VtkVolumeSlicePath,
  DefaultPlanarDataProvider,
  VolumeViewport3DV2,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  VtkVolume3DPath,
  VtkGeometry3DPath,
  DefaultVolume3DDataProvider,
  WSIViewportNext,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
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
  ActorRenderMode,
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
  StreamingDynamicImageVolume,
  StreamingImageVolume,
  convertMapperToNotSharedMapper,
  // Version
  version,
};
