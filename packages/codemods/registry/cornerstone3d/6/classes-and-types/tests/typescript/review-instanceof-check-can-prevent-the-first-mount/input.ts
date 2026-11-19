import {
  StackViewport,
  VolumeViewport,
  BaseVolumeViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export async function show(viewport: Types.IViewport, imageIds: string[]) {
  if (viewport instanceof StackViewport) {
    await viewport.setStack(imageIds);
  }
}

export async function afterMount(
  viewport: Types.IViewport,
  displaySetId: string
) {
  await viewport.setDisplaySets({ displaySetId });

  return [
    viewport instanceof StackViewport,
    viewport instanceof VolumeViewport,
    viewport instanceof BaseVolumeViewport,
  ];
}
