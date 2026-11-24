import * as Enums from './enums';
import * as CONSTANTS from './constants';
import { Events, RenderBackends } from './enums';
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
export {
  attachFidelityIndicator,
  maybeAttachFidelityIndicator,
  detachFidelityIndicator,
  canReportFidelity,
} from './RenderingEngine/helpers/fidelityIndicator';
import {
  defaultRenderPathResolver,
  DefaultRenderPathResolver,
  viewportHasCanvasWorldTransform,
  viewportHasFrameOfReferenceUID,
  viewportHasPan,
  viewportHasZoom,
  BaseViewport,
  ViewportProjectionService,
  viewportProjection,
} from './RenderingEngine/Viewports';
import ECGViewport, {
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
  registerECGTraceLayout,
  getECGTraceLayout,
  getECGTraceLayoutNames,
  resolveDefaultECGTraceLayout,
  ECG_CLINICAL_SWEEP_SPEEDS,
  ECG_CLINICAL_SENSITIVITIES,
  type ECGClinicalSweepSpeed,
  type ECGClinicalSensitivity,
  type ECGTraceLayout,
  type ECGTraceLayoutContext,
  type ECGTraceLayoutDefinition,
  type ECGTraceLayoutFactory,
  type ECGTraceLayoutName,
  type ECGTraceLayoutRegistry,
  type ECGTraceRegion,
  type ECGProperties,
} from './RenderingEngine/Viewports/ECG';
import VideoViewport, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  videoProjection,
} from './RenderingEngine/Viewports/Video';
import PlanarViewport, {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
} from './RenderingEngine/Viewports/Planar';
import VolumeViewport3D, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
} from './RenderingEngine/Viewports/Volume3D';
import WSIViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
} from './RenderingEngine/Viewports/WSI';
export type {
  BuiltInViewportProjectionByKind,
  BuiltInViewportProjectionByType,
  BuiltInViewportProjectionKind,
  BuiltInViewportProjectionType,
  ProjectionFramingForKind,
  ProjectionFramingForViewport,
  ProjectionFramingForViewportType,
  ProjectionPosition,
  ProjectionFraming,
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
  PlanarDisplaySetAppearance,
  Volume3DDisplaySetAppearance,
  VideoDisplaySetAppearance,
  WSIDisplaySetAppearance,
  ECGDisplaySetAppearance,
} from './RenderingEngine/Viewports';
export type { DisplaySetDescriptor } from './types/DisplaySetDescriptor';
export type {
  ECGProjectionFraming,
  ECGProjectionRequest,
  ECGProjectionSnapshot,
  ECGViewState,
  ECGClinicalSweepSpeed,
  ECGClinicalSensitivity,
} from './RenderingEngine/Viewports/ECG';
export type {
  VideoProjectionFraming,
  VideoProjectionRequest,
  VideoProjectionSnapshot,
  VideoViewState,
} from './RenderingEngine/Viewports/Video';
export type {
  PlanarResolvedICamera,
  PlanarSliceBasis,
  PlanarDisplayArea,
  PlanarProjectionFraming,
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
  PlanarViewFraming,
  PlanarViewFramingSelector,
  PlanarViewState,
  RenderPlanChangedEventDetail,
  RenderPlanLayer,
  RenderPlanReason,
} from './RenderingEngine/Viewports/Planar';
export type {
  WSIProjectionFraming,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
  WSIViewState,
} from './RenderingEngine/Viewports/WSI';
export type {
  Volume3DCamera,
  Volume3DProjectionFraming,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './RenderingEngine/Viewports/Volume3D';
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
  VolumeTextureSet,
  VolumeTextureStore,
  volumeTextureStore,
} from './cache';
export type {
  FixedVolumeTextureSlot,
  ProvisionTextureSetOptions,
  VolumeTextureSlot,
} from './cache';
export {
  getGpuSettingsPreset,
  getGpuSettingsPresets,
  getActiveGpuSettings,
  setGpuSettingsPreset,
  resetGpuSettingsPreset,
  gridLimitsOfGpuSettings,
  gpuSettingsForRender,
} from './utilities/gpuSettingsPresets';
export type {
  GpuSettings,
  GpuSettingsPresetId,
  GpuSpeedIndex,
} from './utilities/gpuSettingsPresets';
export {
  defaultVolumeStrategyProvider,
  provisionFullResolutionStrategy,
  provisionReducedResolutionStrategy,
  selectFirstReadyStrategy,
  reducedStrategyName,
} from './RenderingEngine/helpers/volumeRenderStrategy';
export type {
  IVolumeRenderStrategy,
  SelectVolumeStrategy,
  SelectVolumeStrategyContext,
  StrategyBinding,
  StrategyBindingRole,
  VolumeStrategyProvider,
  VolumeStrategyProvisionContext,
  VolumeStrategyProvisionReason,
} from './RenderingEngine/helpers/volumeRenderStrategy';
import cache from './cache/cache';
import imageRetrievalPoolManager from './requestPool/imageRetrievalPoolManager';
import imageLoadPoolManager from './requestPool/imageLoadPoolManager';

import getEnabledElement, {
  getEnabledElementByIds,
  getEnabledElementByViewportId,
  getEnabledElements,
} from './getEnabledElement';
import * as metaData from './metaData';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import {
  init,
  isCornerstoneInitialized,
  setPreferSizeOverAccuracy,
  getRenderBackend,
  setRenderBackend,
  setSliceFirst,
  retryGpu,
  getEffectiveRenderBackend,
  getConfiguration,
  setConfiguration,
  getLossyDownsampling,
  setLossyDownsampling,
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
import {
  registerVoxelStatistic,
  isRegisteredVoxelStatistic,
} from './utilities/voxelGrid/voxelStatistics';
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
export type {
  RenderBackendsMap,
  RenderBackendValue,
} from './enums/RenderBackends';
export type {
  RegisterRenderBackendOptions,
  RenderBackendDefinition,
  RenderBackendRenderMode,
  RenderBackendRenderModes,
  RenderSurface,
} from './RenderingEngine/helpers/renderBackendRegistry';
export type {
  VoxelStatistic,
  VoxelStatisticConstants,
  VoxelStatisticRegistry,
} from './types/VoxelStatisticRegistry';
export type { VoxelStatisticsMap } from './enums/VoxelStatistics';
export type { RegisterVoxelStatisticOptions } from './utilities/voxelGrid/voxelStatistics';

export * from './loaders/decimatedVolumeLoader';

// Add new types here so that they can be imported singly as required.
export type {
  Types,
  IRetrieveConfiguration,
  RetrieveOptions,
  RetrieveStage,
  ImageLoadListener,
  IImagesLoader,
  ECGTraceLayout,
  ECGTraceLayoutContext,
  ECGTraceLayoutDefinition,
  ECGTraceLayoutFactory,
  ECGTraceLayoutName,
  ECGTraceLayoutRegistry,
  ECGTraceRegion,
  ECGProperties,
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
  getLossyDownsampling,
  setLossyDownsampling,
  getWebWorkerManager,
  canRenderFloatTextures,
  // enums
  Enums,
  CONSTANTS,
  Events as EVENTS, // CornerstoneDICOMImageLoader uses this, Todo: remove it after fixing wado
  //
  Settings,
  // Rendering Engine
  VolumeViewport3D,
  ECGViewport,
  BaseViewport,
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
  VolumeTextureSet,
  VolumeTextureStore,
  volumeTextureStore,
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
  displaySetRegistry,
  //
  utilities,
  addImageSlicesToViewports,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
  registerECGTraceLayout,
  getECGTraceLayout,
  getECGTraceLayoutNames,
  resolveDefaultECGTraceLayout,
  ECG_CLINICAL_SWEEP_SPEEDS,
  ECG_CLINICAL_SENSITIVITIES,
  VideoViewport,
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
  WSIViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
  getProjectionScaleMatrix,
  registerViewportType,
  isRegisteredViewportType,
  registerRenderBackend,
  isRegisteredRenderBackend,
  registerVoxelStatistic,
  isRegisteredVoxelStatistic,
  //
  imageLoadPoolManager as requestPoolManager,
  imageRetrievalPoolManager,
  imageLoadPoolManager,
  setPreferSizeOverAccuracy,
  // Render backend (gpu | cpu | auto) + capability detection
  RenderBackends,
  getRenderBackend,
  setRenderBackend,
  setSliceFirst,
  retryGpu,
  getEffectiveRenderBackend,
  getRenderingCapabilities,
  detectRenderingCapabilities,
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
