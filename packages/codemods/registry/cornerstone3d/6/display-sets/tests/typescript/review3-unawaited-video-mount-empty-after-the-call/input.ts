import type { VideoViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';

export async function show(imageId: string) {
  const engine = getRenderingEngine('engine');
  const viewport = engine.getViewport<VideoViewport>('video');

  viewport.setVideo(imageId, 10);
  viewport.play();
}

export function showLater(imageId: string, onShown: () => void) {
  const engine = getRenderingEngine('engine');
  const viewport = engine.getViewport<VideoViewport>('video');

  viewport.setVideo(imageId).then(onShown);
  viewport.play();
}
