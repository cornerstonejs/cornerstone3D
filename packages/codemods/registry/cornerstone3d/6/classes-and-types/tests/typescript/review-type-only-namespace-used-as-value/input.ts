import type * as CS from '@cornerstonejs/core';
import { StackViewport } from '@cornerstonejs/core';

export async function isStack(vp: CS.Types.IViewport, displaySetId: string) {
  await vp.setDisplaySets({ displaySetId });

  return vp instanceof StackViewport;
}
