import { getRenderingEngine, Types } from '@cornerstonejs/core';

import { Synchronizer } from '../../store';
import { jumpToSlice } from '../../utilities';

export default async function frameViewSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): Promise<void> {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }
  const sViewport = renderingEngine.getViewport(
    sourceViewport.viewportId
  ) as Types.IStackViewport;

  const { viewportIndex: targetViewportIndex } =
    synchronizerInstance.getOptions(targetViewport.viewportId);

  const { viewportIndex: sourceViewportIndex } =
    synchronizerInstance.getOptions(sourceViewport.viewportId);

  if (targetViewportIndex === undefined || sourceViewportIndex === undefined) {
    throw new Error('No viewportIndex provided');
  }

  const tViewport = renderingEngine.getViewport(
    targetViewport.viewportId
  ) as Types.IStackViewport;

  const sourceSliceIndex = sViewport.getSliceIndex();
  const sliceDifference =
    Number(targetViewportIndex) - Number(sourceViewportIndex);
  const targetSliceIndex = sourceSliceIndex + sliceDifference;

  if (targetSliceIndex === tViewport.getSliceIndex()) {
    return;
  }

  jumpToSlice(tViewport.element, {
    imageIndex: targetSliceIndex,
  });
}
