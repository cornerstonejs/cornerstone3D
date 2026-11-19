import { RenderingEngine } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export function find(imageId: string, reference: Types.ViewReference) {
  const viewport = engine.getViewport<PlanarViewport>('CT');
  const index = viewport.getSliceIndexForImage(imageId);
  const fromReference = viewport.getSliceIndexForImage(reference);

  return index !== undefined ? index : fromReference;
}
