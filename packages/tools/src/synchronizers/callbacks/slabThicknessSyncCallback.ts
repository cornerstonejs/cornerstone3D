import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';

/**
 * The slab thickness of the presentation of a display set of a next viewport.
 */
function getPresentationSlabThickness(
  viewport: Types.IViewport,
  displaySetId: string
): number | undefined {
  return (
    viewport.getDisplaySetPresentation(displaySetId) as
      | { slabThickness?: number }
      | undefined
  )?.slabThickness;
}

/**
 * Synchronizer callback to synchronize the slab thickness.
 *
 * It gives the slab thickness of the presentation of the source display set
 * of the source viewport to each display set of the target viewport whose
 * slab differs, as the legacy synchronizer gave it to every volume of the
 * target. A planar viewport fires CAMERA_MODIFIED when a slab changes, as the
 * legacy volume viewport did. Each viewport is read from its own rendering
 * engine, and a disabled source or target does nothing. Only a source that
 * shows a volume gives its slab, as the legacy synchronizer read the slab of
 * a volume viewport only: a stack, which draws no slab, leaves the slab of
 * the targets as it is. A volume source without a slab clears the slab of
 * the targets.
 */
export default function slabThicknessSyncCallback(
  _synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = getRenderingEngine(
    sourceViewport.renderingEngineId
  )?.getViewport(sourceViewport.viewportId);

  if (
    !utilities.viewportIsInVolumeMode(sViewport) ||
    !utilities.viewportSupportsDisplaySetPresentation(sViewport) ||
    !utilities.viewportSupportsDisplaySetPresentation(tViewport)
  ) {
    return;
  }

  const sourceDataId = sViewport.getSourceDataId();

  if (!sourceDataId) {
    return;
  }

  const slabThickness = getPresentationSlabThickness(sViewport, sourceDataId);
  const targetDataIds = tViewport
    .getDisplaySets()
    .map(({ displaySetId }) => displaySetId)
    .filter(
      (displaySetId) =>
        getPresentationSlabThickness(tViewport, displaySetId) !== slabThickness
    );

  if (!targetDataIds.length) {
    return;
  }

  targetDataIds.forEach((displaySetId) => {
    tViewport.setDisplaySetPresentation(displaySetId, { slabThickness });
  });
  tViewport.render();
}
