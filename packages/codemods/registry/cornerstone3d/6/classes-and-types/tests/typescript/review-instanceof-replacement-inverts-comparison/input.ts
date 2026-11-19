import type { Types } from '@cornerstonejs/core';
import { VolumeViewport, StackViewport } from '@cornerstonejs/core';

export async function check(vp: Types.IViewport, displaySetId: string) {
  await vp.setDisplaySets({ displaySetId });

  const isVolume = true === vp instanceof VolumeViewport;
  const notStack = !(vp instanceof StackViewport);

  return isVolume && notStack;
}
