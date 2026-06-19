import RenderingEngine from './RenderingEngine';
import BaseRenderingEngine from './BaseRenderingEngine';
import TiledRenderingEngine from './TiledRenderingEngine';
import ContextPoolRenderingEngine from './ContextPoolRenderingEngine';
import getRenderingEngine from './getRenderingEngine';
import VolumeViewport from './VolumeViewport';
import StackViewport from './StackViewport';
import VolumeViewport3D from './VolumeViewport3D';
import {
  defaultRenderPathResolver,
  DefaultRenderPathResolver,
  GenericViewport,
  ViewportProjectionService,
  viewportProjection,
} from './GenericViewport';
import ECGGenericViewport, {
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
} from './GenericViewport/ECG';
import VideoGenericViewport, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  videoProjection,
} from './GenericViewport/Video';
import PlanarViewport, {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
} from './GenericViewport/Planar';
import GenericVolumeViewport3D, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
} from './GenericViewport/Volume3D';
import WSIGenericViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
} from './GenericViewport/WSI';
export * from './helpers';
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
  ViewportProjectionAdapter,
} from './GenericViewport';
export type {
  ECGProjectionPresentation,
  ECGProjectionRequest,
  ECGProjectionSnapshot,
  ECGViewState,
} from './GenericViewport/ECG';
export type {
  VideoProjectionPresentation,
  VideoProjectionRequest,
  VideoProjectionSnapshot,
  VideoViewState,
} from './GenericViewport/Video';
export type {
  PlanarDisplayArea,
  PlanarProjectionPresentation,
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarViewState,
} from './GenericViewport/Planar';
export type {
  WSIProjectionPresentation,
  WSIProjectionRequest,
  WSIProjectionSnapshot,
  WSIViewState,
} from './GenericViewport/WSI';
export type {
  Volume3DCamera,
  Volume3DProjectionPresentation,
  Volume3DProjectionRequest,
  Volume3DProjectionSnapshot,
} from './GenericViewport/Volume3D';

const renderingEngineExportsV2 = {
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ViewportProjectionService,
  viewportProjection,
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

export {
  getRenderingEngine,
  RenderingEngine,
  BaseRenderingEngine,
  TiledRenderingEngine,
  ContextPoolRenderingEngine,
  VolumeViewport,
  LegacyVolumeViewport3D,
  StackViewport,
  GenericVolumeViewport3D,
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ViewportProjectionService,
  viewportProjection,
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
  VolumeViewport3D,
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
};

export default RenderingEngine;
