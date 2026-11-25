import { getRenderingEngine } from '@cornerstonejs/core';
import type { Types, VolumeViewport3D } from '@cornerstonejs/core';

export function families(renderingEngineId: string) {
  const engine = getRenderingEngine(renderingEngineId);
  const threeD = engine.getViewport('3D') as Types.IVolumeViewport3D;
  const volume = engine.getViewport('3D_TYPED') as VolumeViewport3D;
  const planar = engine.getViewport('CT') as Types.IStackViewport;
  const video = engine.getViewport('VIDEO') as Types.IVideoViewport;
  const ecg = engine.getViewport('ECG') as Types.IECGViewport;
  const viewport = engine.getViewport('ANY');

  volume.setOrientation('axial');
  volume.getImageActor();
  volume.getNumberOfSlices();
  volume.scroll(1);
  planar.getNumberOfSlices();
  planar.scroll(1);
  planar.getCanvas();
  video.end();
  video.getNumberOfSlices();
  ecg.getNumberOfSlices();
  ecg.getCanvas();
  viewport.getNumberOfSlices();
  viewport.end();
  threeD.getSliceIndex();

  return [planar.getSliceIndex(), video.hasImageURI('uri')];
}
