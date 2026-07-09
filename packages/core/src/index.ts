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
  GenericViewport,
  ViewportProjectionService,
  viewportProjection,
} from './RenderingEngine/GenericViewport';
import ECGGenericViewport, {
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
} from './RenderingEngine/GenericViewport/ECG';
import VideoGenericViewport, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  videoProjection,
} from './RenderingEngine/GenericViewport/Video';
import PlanarViewport, {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
} from './RenderingEngine/GenericViewport/Planar';
import GenericVolumeViewport3D, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
} from './RenderingEngine/GenericViewport/Volume3D';
import WSIGenericViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
} from './RenderingEngine/GenericViewport/WSI';
export type {
  BuiltInViewportProjectionByKind,
  BuiltInViewportProjectionByType,
  BuiltInViewportProjectionKind,
  BuiltInViewportProjectionType,
  ProjectionPresentationForKind,
  ProjectionPresentationForViewport,
  ProjectionPresentationForViewportType,
  ProjectionPosition,
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionScale,
  ProjectionSnapshotForKind,
  ProjectionSnapshotForViewport,
  ProjectionSnapshotForViewportType,
  ProjectionSnapshot,
  ProjectionSpaces,
  ProjectionTransforms,
  ProjectionViewStateForKind,
  ProjectionViewStateForViewport,
  ProjectionViewStateForViewportType,
  ProjectionWriteOptions,
  ViewportDataReference,
  ViewportProjectionAdapter,
} from './RenderingEngine/GenericViewport';
export type {
  ECGProjectionPresentation,
  ECGProjectionRequest,
  ECGProjectionSnapshot,
  ECGViewState,
} from './RenderingEngine/GenericViewport/ECG';
export type {
  VideoProjectionPresentation,
  VideoProjectionRequest,
  VideoProjectionSnapshot,
  VideoViewState,
} from './RenderingEngine/GenericViewport/Video';
export type {
  PlanarResolvedICamera,
  PlanarSliceBasis,
  PlanarDisplayArea,
  PlanarProjectionPresentation,
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarViewState,
} from './RenderingEngine/GenericViewport/Planar';
export type {
  WSIProjectionPresentation,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
  WSIViewState,
} from './RenderingEngine/GenericViewport/WSI';
export type {
  Volume3DCamera,
  Volume3DProjectionPresentation,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './RenderingEngine/GenericViewport/Volume3D';
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
  getUseGenericViewport,
  isCornerstoneInitialized,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  getRenderBackend,
  setRenderBackend,
  getEffectiveRenderBackend,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
  peerImport,
  resetInitialization,
} from './init';
import {
  getRenderingCapabilities,
  detectRenderingCapabilities,
} from './utilities/renderingCapabilities';

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
  getProjectionScaleMatrix,
} from './RenderingEngine/helpers';
import {
  registerViewportType,
  isRegisteredViewportType,
} from './RenderingEngine/helpers/viewportTypeToViewportClass';
import {
  registerRenderBackend,
  isRegisteredRenderBackend,
} from './RenderingEngine/helpers/renderBackendRegistry';
export type {
  ViewportType,
  ViewportTypeConstants,
  ViewportTypeRegistry,
} from './types/ViewportTypeRegistry';
export type { ViewportTypesMap } from './enums/ViewportTypes';
export type {
  EffectiveRenderBackend,
  RenderBackendConstants,
  RenderBackendRegistry,
} from './types/RenderBackendRegistry';
export type { RenderBackendsMap } from './enums/RenderBackends';
export type {
  RegisterRenderBackendOptions,
  RenderBackendDefinition,
  RenderBackendRenderModes,
  RenderSurface,
} from './RenderingEngine/helpers/renderBackendRegistry';

export * from './loaders/decimatedVolumeLoader';

const renderingEngineExportsV2 = {
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ECGGenericViewport,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
  VideoGenericViewport,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  videoProjection,
  PlanarViewport,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
  VolumeViewport3D: GenericVolumeViewport3D,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
};

const LegacyVolumeViewport3D = VolumeViewport3D;

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
  LegacyVolumeViewport3D,
  VolumeViewport3D,
  GenericVolumeViewport3D,
  Viewport,
  StackViewport,
  VideoViewport,
  WSIViewport,
  ECGViewport,
  ECGGenericViewport,
  GenericViewport,
  ViewportProjectionService,
  viewportProjection,
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
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
  VideoGenericViewport,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  videoProjection,
  PlanarViewport,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
  renderingEngineExportsV2,
  getProjectionScaleMatrix,
  registerViewportType,
  isRegisteredViewportType,
  registerRenderBackend,
  isRegisteredRenderBackend,
  //
  imageLoadPoolManager as requestPoolManager,
  imageRetrievalPoolManager,
  imageLoadPoolManager,
  // CPU Rendering
  getShouldUseCPURendering,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  // Render backend (gpu | cpu | auto) + capability detection
  getRenderBackend,
  setRenderBackend,
  getEffectiveRenderBackend,
  getRenderingCapabilities,
  detectRenderingCapabilities,
  // GenericViewport
  getUseGenericViewport,
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
