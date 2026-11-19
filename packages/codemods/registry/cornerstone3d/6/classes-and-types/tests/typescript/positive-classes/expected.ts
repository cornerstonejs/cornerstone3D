import type { PlanarViewport } from '@cornerstonejs/core';
import {
  VideoViewport,
  VolumeViewport3D as Next3D,
  ECGViewport,
  getEnabledElement,
  utilities,
} from '@cornerstonejs/core';

function describe(element: HTMLDivElement): string {
  const { viewport } = getEnabledElement(element);

  if (utilities.viewportIsInStackMode(viewport)) {
    return 'stack';
  }

  if (!(utilities.getViewportContentMode(viewport) === 'volume')) {
    return 'other';
  }

  return utilities.viewportIsInVolumeMode(viewport) ? 'volume' : 'none';
}

function asStack(viewport: unknown): PlanarViewport {
  return viewport as PlanarViewport;
}

const video: VideoViewport | undefined = undefined;
const isThreeD = (viewport: unknown) => viewport instanceof Next3D;
const isEcg = (viewport: unknown) =>
  viewport instanceof ECGViewport || viewport instanceof ECGViewport;

console.log(describe, asStack, video, isThreeD, isEcg);
