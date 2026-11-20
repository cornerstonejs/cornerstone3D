import { RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export async function fromGetter(model: { imageIds: string[] }) {
  const viewport = engine.getViewport('getter');
  await viewport.setStack(model.imageIds);
}

export async function fromIndex(series: string[][], index: number) {
  const viewport = engine.getViewport('index');
  await viewport.setStack(series[index], index);
}

export async function fromArrayOfReads(model: { first: string }) {
  const viewport = engine.getViewport('array');
  await viewport.setStack([model.first, 'b']);
}

export async function fromSpread(ids: string[]) {
  const viewport = engine.getViewport('spread');
  await viewport.setStack([...ids]);
}

export async function fromName(imageIds: string[]) {
  const viewport = engine.getViewport('name');
  await viewport.setStack(imageIds, 2);
}
