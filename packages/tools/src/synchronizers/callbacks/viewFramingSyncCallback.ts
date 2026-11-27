import type { Types } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';
import {
  applyViewportFraming,
  getViewportFraming,
} from '../../utilities/viewportFraming';
import {
  changesCamera,
  getGroupMember,
  setInStep,
  viewportKey,
} from './synchronizerGroup';

/**
 * The fields of a framing that a selector names, or the whole
 * framing without a selector. The 3D family gives every field whatever
 * the selector, its camera too, and a camera in a patch replaces the camera
 * of the target.
 */
function selectedFieldsOf(
  framing: unknown,
  selector?: Types.ViewFramingSelector
): unknown {
  if (!selector || !framing || typeof framing !== 'object') {
    return framing;
  }

  return Object.fromEntries(
    Object.entries(framing).filter(
      ([key]) => selector[key as keyof Types.ViewFramingSelector]
    )
  );
}

/**
 * Gives one viewport the framing of another, the fields that a selector
 * names, and renders it when it took them.
 */
function copyViewFraming(
  from: Types.IViewport | undefined,
  to: Types.IViewport | undefined,
  selector: Types.ViewFramingSelector | undefined
): void {
  const viewFraming = selectedFieldsOf(
    getViewportFraming(from, selector),
    selector
  );

  if (!applyViewportFraming(to, viewFraming)) {
    return;
  }

  to.render();
}

/** The viewport of the ids of a synchronizer member, when it is enabled. */
function getViewportOf(id: Types.IViewportId): Types.IViewport | undefined {
  return getRenderingEngine(id.renderingEngineId)?.getViewport(id.viewportId);
}

/** The ids and the viewport of a member, when it shows data. */
function getMemberShowingData(
  id: Types.IViewportId
): { id: Types.IViewportId; viewport: Types.IViewport } | undefined {
  const viewport = getViewportOf(id);

  return viewport?.getDisplaySets?.().length ? { id, viewport } : undefined;
}

/**
 * Synchronizer callback to synchronize the camera. Synchronization
 *
 * targetViewport.options.syncZoom set to false to not sync the zoom
 * targetViewport.options.syncPan set to false to not sync the pan
 *
 * Each viewport is read from its own rendering engine.
 *
 * A camera event that changed no camera (the mount of the source, which
 * fires the camera that it opens with, or a resize, which keeps the camera)
 * is not a change of the group, as the camera position synchronizer reads
 * it: it writes no other viewport, and the source takes the framing of the
 * group from the first other viewport of the group in step with it
 * (`getGroupMember`). With no such viewport the source keeps its own. A pane
 * that joins a group at its mount so takes the framing of the group; 5.x
 * and the 6.0 betas gave the group the fit of the joining pane.

 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, different
 *   from sourceViewport
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 * @param options - The options of the synchronizer: `viewFraming` is the
 *   selector of the framing to copy, all of it when not given.
 */
export default function viewFramingSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent?: CustomEvent,
  options?: { viewFraming?: Types.ViewFramingSelector }
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);
  const sViewport = getViewportOf(sourceViewport);
  const selector = options?.viewFraming;

  if (!changesCamera(cameraModifiedEvent?.detail)) {
    const group = getGroupMember(
      synchronizerInstance,
      sourceViewport,
      cameraModifiedEvent,
      getMemberShowingData
    );

    if (group && viewportKey(group.id) === viewportKey(targetViewport)) {
      copyViewFraming(group.viewport, sViewport, selector);
      setInStep(synchronizerInstance, group.id);
      setInStep(synchronizerInstance, sourceViewport);
    }

    return;
  }

  copyViewFraming(sViewport, tViewport, selector);
  setInStep(synchronizerInstance, sourceViewport);
  setInStep(synchronizerInstance, targetViewport);
}
