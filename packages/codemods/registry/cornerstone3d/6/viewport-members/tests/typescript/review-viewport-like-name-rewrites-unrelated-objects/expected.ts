import { RenderingEngine } from '@cornerstonejs/core';

export function unrelated(viewport: { resetCamera(): void; uid: string }) {
  viewport.resetCamera();

  return viewport.uid;
}

export const engine = new RenderingEngine('engine');
