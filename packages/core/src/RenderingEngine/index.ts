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
} from './GenericViewport/Planar';
import VolumeViewport3DV2, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
} from './GenericViewport/Volume3D';
import WSIGenericViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
} from './GenericViewport/WSI';
export * from './helpers';

const renderingEngineExportsV2 = {
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
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
  VolumeViewport3DV2,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
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
  VolumeViewport3DV2,
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  renderingEngineExportsV2,
};

export default RenderingEngine;
