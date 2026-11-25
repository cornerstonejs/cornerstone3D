import type { PlanarViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

export function boundsOf(viewportId: string) {
  const viewport =
    getRenderingEngine('engine').getViewport<PlanarViewport>(viewportId);

  return viewport.getImageData()?.imageData.getBounds?.();
}

export function volumeIdsOf(viewportId: string) {
  const viewport =
    getRenderingEngine('engine').getViewport<PlanarViewport>(viewportId);

  return viewport.getVolumeIds({ includeSegmentations: true });
}
