import { RenderingEngine } from '@cornerstonejs/core';

const first = new RenderingEngine('a:b');
const second = new RenderingEngine('a');

export async function show(imageIds: string[]) {
  const left = first.getViewport('c');
  const right = second.getViewport('b:c');

  await left.setStack(imageIds, 0);
  await right.setStack(imageIds, 5);
}
