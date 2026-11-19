import { RenderingEngine, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ids: string[], utilities: string) {
  const viewport = renderingEngine.getViewport('CT');

  await viewport.setStack(ids);

  return utilities;
}

export const isStack = utilities.viewportIsInStackMode;
