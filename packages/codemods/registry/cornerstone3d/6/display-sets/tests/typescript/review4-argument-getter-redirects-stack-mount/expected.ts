import { displaySetRegistry } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export async function getterInTheList(
  first: Types.IViewport,
  second: Types.IViewport
) {
  let viewport = first;
  const holder = {
    get images() {
      viewport = second;

      return ['image'];
    },
  };

  const viewport2 = viewport as Types.IStackViewport;
  const imageIds2 = holder.images;
  const displaySetId = JSON.stringify([viewport2.renderingEngineId, viewport2.id, imageIds2[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds: imageIds2,
  });
  await viewport2.setDisplaySets({ displaySetId });
}

export async function callInTheIndex(
  first: Types.IViewport,
  second: Types.IViewport,
  imageIds: string[]
) {
  let viewport = first;
  const pick = () => {
    viewport = second;

    return 0;
  };

  const viewport3 = viewport as Types.IStackViewport;
  const displaySetId2 = JSON.stringify([viewport3.renderingEngineId, viewport3.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId2, {
    imageIds,
  });
  await viewport3.setDisplaySets({ displaySetId: displaySetId2, options: { initialImageIdIndex: pick() } });
}

export async function writtenParameter(
  viewport: Types.IViewport,
  next: () => string[]
) {
  const viewport4 = viewport as Types.IStackViewport;
  const imageIds3 = next();
  const displaySetId3 = JSON.stringify([viewport4.renderingEngineId, viewport4.id, imageIds3[0]]);
  displaySetRegistry.add(displaySetId3, {
    imageIds: imageIds3,
  });
  await viewport4.setDisplaySets({ displaySetId: displaySetId3 });
  viewport = undefined;
}

export async function plainArguments(
  first: Types.IViewport,
  imageIds: string[]
) {
  let viewport = first;

  const displaySetId4 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId4, {
    imageIds,
  });
  await (viewport as Types.IStackViewport).setDisplaySets({ displaySetId: displaySetId4, options: { initialImageIdIndex: 2 } });
  viewport = undefined;
}
