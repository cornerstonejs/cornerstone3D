import type {
  PlanarViewport,
  Types,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import { RenderingEngine, VideoViewport, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('stack');
const threeD: VolumeViewport3D = renderingEngine.getViewport('3d');
const any: Types.IViewport = renderingEngine.getViewport('any');

if (utilities.viewportIsInStackMode(any) || any instanceof VideoViewport) {
  console.log(viewport, threeD);
}
