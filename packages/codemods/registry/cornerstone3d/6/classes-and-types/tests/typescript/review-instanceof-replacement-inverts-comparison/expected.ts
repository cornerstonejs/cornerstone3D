import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

export async function check(vp: Types.IViewport, displaySetId: string) {
  await vp.setDisplaySets({ displaySetId });

  const isVolume = true === (utilities.getViewportContentMode(vp) === 'volume');
  const notStack = !(utilities.viewportIsInStackMode(vp));

  return isVolume && notStack;
}
