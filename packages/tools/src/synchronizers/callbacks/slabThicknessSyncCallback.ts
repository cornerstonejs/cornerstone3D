import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';

/**
 * The slab thickness of the appearance of a display set of a next viewport.
 */
function getAppearanceSlabThickness(
  viewport: Types.IViewport,
  displaySetId: string
): number | undefined {
  return (
    viewport.getDisplaySetAppearance(displaySetId) as
      | { slabThickness?: number }
      | undefined
  )?.slabThickness;
}

/**
 * Synchronizer callback to synchronize the slab thickness.
 *
 * It acts on a DISPLAY_SET_APPEARANCE_CHANGED of the source display set of
 * the source viewport whose changed keys name `slabThickness`, of any cause
 * but `'default'`: a slab thickness has no default other than none, so the
 * slab of a mount is one that a caller set. It gives that slab thickness to
 * each display set of the target viewport whose slab differs, as the legacy
 * synchronizer gave it to every volume of the target. Each viewport is read
 * from its own rendering engine, and a disabled source or target does
 * nothing. Only a source that shows a volume gives its slab, as the legacy
 * synchronizer read the slab of a volume viewport only: a stack, which draws
 * no slab, leaves the slab of the targets as it is. A volume source whose
 * slab was removed clears the slab of the targets.
 */
export default function slabThicknessSyncCallback(
  _synchronizerInstance,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  appearanceEvent: Types.EventTypes.DisplaySetAppearanceChangedEvent
): void {
  const { cause, changedKeys, role } = appearanceEvent.detail;

  if (
    cause === 'default' ||
    role !== 'source' ||
    !changedKeys.includes('slabThickness')
  ) {
    return;
  }

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
    !utilities.viewportSupportsDisplaySetAppearance(sViewport) ||
    !utilities.viewportSupportsDisplaySetAppearance(tViewport)
  ) {
    return;
  }

  const sourceDisplaySetId = sViewport.getSourceDisplaySetId();

  if (!sourceDisplaySetId) {
    return;
  }

  const slabThickness = getAppearanceSlabThickness(
    sViewport,
    sourceDisplaySetId
  );
  const targetDisplaySetIds = tViewport
    .getDisplaySets()
    .map(({ displaySetId }) => displaySetId)
    .filter(
      (displaySetId) =>
        getAppearanceSlabThickness(tViewport, displaySetId) !== slabThickness
    );

  if (!targetDisplaySetIds.length) {
    return;
  }

  targetDisplaySetIds.forEach((displaySetId) => {
    tViewport.setDisplaySetAppearance(displaySetId, { slabThickness });
  });
  tViewport.render();
}
