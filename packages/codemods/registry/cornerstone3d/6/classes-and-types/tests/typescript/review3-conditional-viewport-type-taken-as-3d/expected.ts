import type { VolumeViewport3D } from '@cornerstonejs/core';
import { Enums, RenderingEngine, type Types } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export function conditionalType(element: HTMLDivElement, flag: boolean) {
  engine.enableElement({
    viewportId: 'main',
    type: flag ? Enums.ViewportType.VOLUME_3D : Enums.ViewportType.PLANAR,
    element,
  });

  return engine.getViewport('main') as Types.IVolumeViewport;
}

export function mixedTypes(first: HTMLDivElement, second: HTMLDivElement) {
  engine.enableElement({
    viewportId: 'shared',
    type: Enums.ViewportType.VOLUME_3D,
    element: first,
  });
  engine.enableElement({
    viewportId: 'shared',
    type: Enums.ViewportType.PLANAR,
    element: second,
  });

  return engine.getViewport('shared') as Types.IVolumeViewport;
}

export function staticType(element: HTMLDivElement) {
  engine.enableElement({
    viewportId: 'volume',
    type: Enums.ViewportType.VOLUME_3D,
    element,
  });

  return engine.getViewport<VolumeViewport3D>('volume');
}
