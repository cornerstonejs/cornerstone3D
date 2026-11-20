import type { Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export function card(cardType: string, id: string) {
  if (cardType === 'volume3d') {
    const viewport = engine.getViewport(id) as Types.IVolumeViewport;

    return viewport.getSliceIndex();
  }
}

export function shadowedReceiver(viewport: Types.IViewport, id: string) {
  if (viewport.type === Enums.ViewportType.VOLUME_3D) {
    const viewport = engine.getViewport(id) as Types.IVolumeViewport;

    return viewport;
  }
}

export function sameReceiver(viewport: Types.IViewport) {
  if (viewport.type === Enums.ViewportType.VOLUME_3D) {
    return viewport as Types.IVolumeViewport;
  }
}

export function insideCallback(viewport: Types.IViewport, ids: string[]) {
  if (viewport.type === Enums.ViewportType.VOLUME_3D) {
    return ids.map(() => viewport as Types.IVolumeViewport);
  }
}

export function typeOfReceiver(viewport: Types.IViewport) {
  const { type } = viewport;

  if (type === Enums.ViewportType.VOLUME_3D) {
    return viewport as Types.IVolumeViewport;
  }
}
