import type { ECGViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

export async function show(imageId: string, onLoadStarted: () => void) {
  const engine = getRenderingEngine('engine');
  const viewport = engine.getViewport<ECGViewport>('ecg');

  viewport.setEcg(imageId);
  onLoadStarted();
}

export function showOnClick(imageId: string) {
  const engine = getRenderingEngine('engine');
  const viewport = engine.getViewport<ECGViewport>('ecg');

  void viewport.setEcg(imageId);
  viewport.render();
}
