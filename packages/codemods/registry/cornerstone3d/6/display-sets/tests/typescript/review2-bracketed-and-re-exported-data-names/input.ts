import { RenderingEngine } from '@cornerstonejs/core';

export { setVolumesForViewports, addVolumesToViewports } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export async function show(imageIds: string[]) {
  const viewport = engine.getViewport('ct');

  await viewport['setStack'](imageIds);

  return typeof viewport['setVolumes'] === 'function';
}

export async function spread(args: [string[], number]) {
  const viewport = engine.getViewport('ct');

  await viewport.setStack(...args);
}
