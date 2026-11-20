import { getEnabledElement, type Types, utilities } from '@cornerstonejs/core';

interface Holder {
  viewport: Types.IViewport;
  images: string[];
}

export async function fromGetter(holder: Holder) {
  const viewport = holder.viewport as Types.IStackViewport;
  const imageIds = holder.images;
  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
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
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId2, {
    kind: 'planar',
    imageIds: ids,
    initialImageIdIndex: 0,
  });
  await viewport2.setDisplaySets({ displaySetId: displaySetId2 });
}
