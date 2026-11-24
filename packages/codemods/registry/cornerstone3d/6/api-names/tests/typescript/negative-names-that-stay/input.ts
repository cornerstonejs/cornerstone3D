import { Enums, RenderingEngine, eventTarget } from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

export async function run(displaySetId: string, onImage: () => void) {
  const renderingEngine = new RenderingEngine('engine');
  const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

  eventTarget.addEventListener(Enums.Events.NEW_IMAGE, onImage);
  await viewport.setDisplaySets({ displaySetId });
  viewport.render();
}
