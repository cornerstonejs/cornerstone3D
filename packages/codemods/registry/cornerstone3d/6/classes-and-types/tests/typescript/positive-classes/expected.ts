import type { PlanarViewport } from '@cornerstonejs/core';
import {
  StackViewport,
  VolumeViewport,
  BaseVolumeViewport,
  VideoViewport,
  VolumeViewport3D as Next3D,
  ECGViewport,
  getEnabledElement,
} from '@cornerstonejs/core';

function describe(element: HTMLDivElement): string {
  const { viewport } = getEnabledElement(element);

  if (viewport instanceof StackViewport) {
    return 'stack';
  }

  if (!(viewport instanceof VolumeViewport)) {
    return 'other';
  }

  return viewport instanceof BaseVolumeViewport ? 'volume' : 'none';
}

function asStack(viewport: unknown): PlanarViewport {
  return viewport as PlanarViewport;
}

const video: VideoViewport | undefined = undefined;
const isThreeD = (viewport: unknown) => viewport instanceof Next3D;
const isEcg = (viewport: unknown) =>
  viewport instanceof ECGViewport || viewport instanceof ECGViewport;

console.log(describe, asStack, video, isThreeD, isEcg);
