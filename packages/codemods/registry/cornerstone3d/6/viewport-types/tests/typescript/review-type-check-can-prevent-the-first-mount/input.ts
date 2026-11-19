import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(imageIds: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  if (viewport.type === Enums.ViewportType.STACK) {
    await viewport.setStack(imageIds);
  }

  if (viewport?.type !== Enums.ViewportType.STACK) {
    return 'volume';
  }

  return viewport.type === 'stack' ? 'stack' : 'other';
}

export async function afterMount(imageIds: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  await viewport.setStack(imageIds);

  if (viewport.type !== 'orthographic') {
    return viewport?.type === Enums.ViewportType.STACK;
  }
}
