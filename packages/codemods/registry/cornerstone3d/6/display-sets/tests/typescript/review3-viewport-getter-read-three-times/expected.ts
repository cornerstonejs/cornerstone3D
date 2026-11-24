import {
  getEnabledElement,
  type Types,
  displaySetRegistry,
} from '@cornerstonejs/core';

interface Holder {
  viewport: Types.IViewport;
  images: string[];
}

export async function fromGetter(holder: Holder) {
  const viewport = holder.viewport as Types.IStackViewport;
  const imageIds = holder.images;
  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds,
    initialImageIdIndex: 1,
  });
  await viewport.setDisplaySets({ displaySetId });
}

export async function fromEnabledElement(
  element: HTMLDivElement,
  ids: string[]
) {
  const enabledElement = getEnabledElement(element);

  const viewport2 = enabledElement.viewport;
  const displaySetId2 = JSON.stringify([viewport2.renderingEngineId, viewport2.id, ids[0]]);
  displaySetRegistry.add(displaySetId2, {
    imageIds: ids,
    initialImageIdIndex: 0,
  });
  await viewport2.setDisplaySets({ displaySetId: displaySetId2 });
}
