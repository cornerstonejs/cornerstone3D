import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ids: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  await viewport?.setStack(ids);
  viewport.setStack?.(ids);
  renderingEngine.getViewport('PT')?.setStack(ids);
}
