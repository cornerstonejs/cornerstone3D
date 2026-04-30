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
  ViewportNext,
} from './ViewportNext';
import ECGViewportNext, {
  CanvasECGPath,
  createDefaultECGRenderPaths,
  createECGRenderPathResolver,
  DefaultECGDataProvider,
} from './ViewportNext/ECG';
import VideoViewportNext, {
  createDefaultVideoRenderPaths,
  createVideoRenderPathResolver,
  DefaultVideoDataProvider,
  HtmlVideoPath,
} from './ViewportNext/Video';
import PlanarViewport, {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
  CpuImageSlicePath,
  DefaultPlanarDataProvider,
  VtkImageMapperPath,
  VtkVolumeSlicePath,
} from './ViewportNext/Planar';
import VolumeViewport3DV2, {
  createDefaultVolume3DRenderPaths,
  createVolume3DRenderPathResolver,
  DefaultVolume3DDataProvider,
  VtkGeometry3DPath,
  VtkVolume3DPath,
} from './ViewportNext/Volume3D';
import WSIViewportNext, {
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DefaultWSIDataProvider,
  DicomMicroscopyPath,
} from './ViewportNext/WSI';
export * from './helpers';

const renderingEngineExportsV2 = {
  ViewportNext,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ECGViewportNext,
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
  WSIViewportNext,
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
  ViewportNext,
  DefaultRenderPathResolver,
  defaultRenderPathResolver,
  ECGViewportNext,
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
  WSIViewportNext,
  createDefaultWSIRenderPaths,
  createWSIRenderPathResolver,
  DicomMicroscopyPath,
  DefaultWSIDataProvider,
  renderingEngineExportsV2,
};

export default RenderingEngine;
