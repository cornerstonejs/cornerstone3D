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
} from './GenericViewport/ECG';
import VideoGenericViewport, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
} from './GenericViewport/Video';
import PlanarViewport, {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
} from './GenericViewport/Planar';
import VolumeViewport3DV2, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
} from './GenericViewport/Volume3D';
import WSIGenericViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
} from './GenericViewport/WSI';
export * from './helpers';
export type {
  ProjectionPosition,
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionScale,
  ProjectionSnapshot,
  ProjectionSpaces,
  ProjectionTransforms,
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from './GenericViewport';
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
  VideoGenericViewport,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  PlanarViewport,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
  VolumeViewport3DV2,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
};

export {
  getRenderingEngine,
  RenderingEngine,
  BaseRenderingEngine,
  TiledRenderingEngine,
  ContextPoolRenderingEngine,
  VolumeViewport,
  VolumeViewport3D,
  StackViewport,
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ViewportProjectionService,
  viewportProjection,
  ECGGenericViewport,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  VideoGenericViewport,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  PlanarViewport,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  DefaultPlanarDataProvider,
  planarProjection,
  VolumeViewport3DV2,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  volume3DProjection,
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  renderingEngineExportsV2,
};

export default RenderingEngine;
