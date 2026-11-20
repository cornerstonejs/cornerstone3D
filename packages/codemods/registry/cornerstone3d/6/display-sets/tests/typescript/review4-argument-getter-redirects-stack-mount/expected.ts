import { utilities } from '@cornerstonejs/core';
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
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: imageIds2,
    initialImageIdIndex: 0,
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
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId2, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: pick(),
  });
  await viewport3.setDisplaySets({ displaySetId: displaySetId2 });
}

export async function writtenParameter(
  viewport: Types.IViewport,
  next: () => string[]
) {
  const viewport4 = viewport as Types.IStackViewport;
  const imageIds3 = next();
  const displaySetId3 = JSON.stringify([viewport4.renderingEngineId, viewport4.id, imageIds3[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId3, {
    kind: 'planar',
    imageIds: imageIds3,
    initialImageIdIndex: 0,
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
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId4, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 2,
  });
  await (viewport as Types.IStackViewport).setDisplaySets({ displaySetId: displaySetId4 });
  viewport = undefined;
}
