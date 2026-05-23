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
  CanvasECGPath,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
} from './GenericViewport/ECG';
import VideoGenericViewport, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  HtmlVideoPath,
} from './GenericViewport/Video';
import PlanarViewport, {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  CpuImageSlicePath,
  DefaultPlanarDataProvider,
  VtkImageMapperPath,
  VtkVolumeSlicePath,
} from './GenericViewport/Planar';
import VolumeViewport3DV2, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  VtkGeometry3DPath,
  VtkVolume3DPath,
} from './GenericViewport/Volume3D';
import WSIGenericViewport, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  DicomMicroscopyPath,
} from './GenericViewport/WSI';
export * from './helpers';

const renderingEngineExportsV2 = {
  GenericViewport,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ECGGenericViewport,
  CanvasECGPath,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  VideoGenericViewport,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  HtmlVideoPath,
  DefaultVideoDataProvider,
  PlanarViewport,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
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
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DicomMicroscopyPath,
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
  CanvasECGPath,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
  VideoGenericViewport,
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  HtmlVideoPath,
  DefaultVideoDataProvider,
  PlanarViewport,
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
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
  WSIGenericViewport,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DicomMicroscopyPath,
  DefaultWSIDataProvider,
  renderingEngineExportsV2,
};

export default RenderingEngine;
