import { RenderingEngine } from '@cornerstonejs/core';

const engineA = new RenderingEngine('A');
const engineB = new RenderingEngine('B');

export async function show(seriesA: string[], seriesB: string[]) {
  const viewport = engineA.getViewport('axial');
  const twin = engineB.getViewport('axial');

  await viewport.setStack(seriesA);
  await viewport.setStack(seriesB, 3);
  await twin.setStack(seriesA);
  await viewport.setStack(getSeries(), 1);
}

declare function getSeries(): string[];
