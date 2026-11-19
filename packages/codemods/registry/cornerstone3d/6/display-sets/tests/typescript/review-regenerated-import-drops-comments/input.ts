import {
  RenderingEngine,
  /* retain this license */
  Enums, // eslint-disable-line
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ids: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  await viewport.setStack(ids);

  return Enums;
}
