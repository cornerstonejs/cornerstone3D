import {
  StackViewport,
  VolumeViewport,
  BaseVolumeViewport,
  VideoGenericViewport,
  GenericVolumeViewport3D as Next3D,
  ECGGenericViewport,
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

function asStack(viewport: unknown): StackViewport {
  return viewport as StackViewport;
}

const video: VideoGenericViewport | undefined = undefined;
const isThreeD = (viewport: unknown) => viewport instanceof Next3D;
const isEcg = (viewport: unknown) =>
  viewport instanceof ECGGenericViewport || viewport instanceof ECGViewport;

console.log(describe, asStack, video, isThreeD, isEcg);
