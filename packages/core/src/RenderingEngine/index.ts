import RenderingEngine from './RenderingEngine';
import BaseRenderingEngine from './BaseRenderingEngine';
import TiledRenderingEngine from './TiledRenderingEngine';
import ContextPoolRenderingEngine from './ContextPoolRenderingEngine';
import getRenderingEngine from './getRenderingEngine';
import {
  defaultRenderPathResolver,
  DefaultRenderPathResolver,
  GenericViewport,
  ViewportProjectionService,
  viewportProjection,
} from './GenericViewport';
import ECGViewport, {
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
} from './GenericViewport/ECG';
import VideoViewport, {
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
import VolumeViewport3D, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
} from './GenericViewport/Volume3D';
import WSIViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
} from './GenericViewport/WSI';
import {
  ECGGenericViewport,
  GenericVolumeViewport3D,
  VideoGenericViewport,
  WSIGenericViewport,
} from './GenericViewport/deprecatedViewportClassNames';
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
  ECGViewport,
  /** @deprecated Use `ECGViewport`: the same class. */
  ECGGenericViewport,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
  VideoViewport,
  /** @deprecated Use `VideoViewport`: the same class. */
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
  WSIViewport,
  /** @deprecated Use `WSIViewport`: the same class. */
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
};

export {
  getRenderingEngine,
  RenderingEngine,
  BaseRenderingEngine,
  TiledRenderingEngine,
  ContextPoolRenderingEngine,
  VolumeViewport3D,
  GenericVolumeViewport3D,
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ViewportProjectionService,
  viewportProjection,
  ECGViewport,
  ECGGenericViewport,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  ecgProjection,
  VideoViewport,
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
  WSIViewport,
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  wsiProjection,
  renderingEngineExportsV2,
};

export default RenderingEngine;
