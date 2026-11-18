import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';

/**
 * The slab thickness of the presentation of a display set of a next viewport.
 */
function getPresentationSlabThickness(
  viewport: Types.IGenericViewport,
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
 * Between next viewports it gives the slab thickness of the presentation of
 * the source display set of the source viewport to each display set of the
 * target viewport whose slab differs, as the legacy synchronizer gave it to
 * every volume of the target. A next planar viewport fires CAMERA_MODIFIED
 * when a slab changes, as the legacy volume viewport did.
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
  const sViewport = renderingEngine.getViewport(sourceViewport.viewportId);

  if (
    utilities.isGenericViewport(sViewport) &&
    utilities.isGenericViewport(tViewport)
  ) {
    if (
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
          getPresentationSlabThickness(tViewport, displaySetId) !==
          slabThickness
      );

    if (!targetDataIds.length) {
      return;
    }

    targetDataIds.forEach((displaySetId) => {
      tViewport.setDisplaySetPresentation(displaySetId, { slabThickness });
    });
    tViewport.render();
    return;
  }

  const slabThickness = (
    sViewport as Types.IVolumeViewport
  ).getSlabThickness?.();
  if (!slabThickness) {
    return;
  }
  (tViewport as Types.IVolumeViewport).setSlabThickness?.(slabThickness);
  tViewport.render();
}
