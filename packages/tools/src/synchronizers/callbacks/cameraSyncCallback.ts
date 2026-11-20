import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { Enums, getRenderingEngine, utilities } from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';
import {
  applyViewportPresentation,
  getViewportPresentation,
} from '../../utilities/viewportPresentation';

// A ViewReference deliberately excludes zoom/pan (see IViewport ViewReference
// docs), so for Generic ("next") viewports we transport them separately to match
// the legacy setCamera(camera) path, which carried parallelScale (zoom) + the
// in-plane focal point (pan). Mirrors zoomPanSyncCallback's selector.
const ZOOM_PAN_SELECTOR: Types.ViewPresentationSelector = {
  pan: true,
  zoom: true,
};

/** The fields of a planar presentation that turn and flip the view. */
const ROTATION_FLIP_SELECTOR: Types.ViewPresentationSelector = {
  rotation: true,
  flipHorizontal: true,
  flipVertical: true,
};

/** The vector that points the other way. */
function negated(vector: Types.Point3): Types.Point3 {
  return [-vector[0], -vector[1], -vector[2]];
}

/**
 * The rotation and the flips that give a planar target the view up and the
 * view plane normal of a planar source, as the 5.x `setCamera` of the
 * target did. The vertical flip is the one of the source, and the
 * horizontal one also turns the target to the side of the plane that the
 * source looks from. A planar view flips first and turns after, about the
 * normal that it shows, so the rotation turns the view up of the target,
 * negated when its vertical flip changes, to the one of the source about
 * the normal of the source; the rotation of the target counts the other way
 * when its normal is the opposite of the one of the source. A target whose
 * view before its rotation is the one of the source, within 1e-4 degrees as
 * float32 vectors of a view reference allow, takes the rotation of the
 * source as it is. Undefined when one of the two is not planar, or when they
 * do not show parallel planes, as a target of another plane that its view
 * reference could not turn.
 *
 * @param sourceViewReference - The view reference of the source.
 */
function getPlanarViewUpPresentation(
  sViewport: Types.IViewport,
  tViewport: Types.IViewport,
  sourceViewReference: Types.ViewReference | undefined
): Types.ViewPresentation | undefined {
  if (
    sViewport.type !== Enums.ViewportType.PLANAR ||
    tViewport.type !== Enums.ViewportType.PLANAR
  ) {
    return;
  }

  const source = getViewportPresentation(sViewport, ROTATION_FLIP_SELECTOR) as
    | Types.ViewPresentation
    | undefined;
  const target = getViewportPresentation(tViewport, ROTATION_FLIP_SELECTOR) as
    | Types.ViewPresentation
    | undefined;
  const sourceViewUp = sourceViewReference?.viewUp;
  const sourceNormal = sourceViewReference?.viewPlaneNormal;
  const targetViewReference = tViewport.getViewReference();
  const targetViewUp = targetViewReference?.viewUp;
  const targetNormal = targetViewReference?.viewPlaneNormal;

  if (
    !source ||
    !target ||
    !sourceViewUp ||
    !sourceNormal ||
    !targetViewUp ||
    !targetNormal
  ) {
    return;
  }

  const opposite = utilities.isOpposite(targetNormal, sourceNormal);

  if (!opposite && !utilities.isEqual(targetNormal, sourceNormal)) {
    return;
  }

  const flipVertical = Boolean(source.flipVertical);
  const flipHorizontal =
    flipVertical !==
    (opposite !==
      (Boolean(target.flipHorizontal) !== Boolean(target.flipVertical)));
  const from =
    flipVertical !== Boolean(target.flipVertical)
      ? negated(targetViewUp)
      : targetViewUp;
  const turn =
    (Math.atan2(
      vec3.dot(vec3.cross(vec3.create(), from, sourceViewUp), sourceNormal),
      vec3.dot(from, sourceViewUp)
    ) *
      180) /
    Math.PI;
  const rotation =
    (opposite ? -(target.rotation ?? 0) : (target.rotation ?? 0)) + turn;
  const sourceRotation = source.rotation ?? 0;
  const offset = ((((rotation - sourceRotation) % 360) + 540) % 360) - 180;

  return {
    flipHorizontal,
    flipVertical,
    rotation:
      Math.abs(offset) < 1e-4 ? sourceRotation : ((rotation % 360) + 360) % 360,
  };
}

/**
 * Synchronizer callback to synchronize the camera by updating all camera
 * values.  See also zoomPanSyncCallback
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, never
 *   the same as sourceViewport.
 * @param _cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  _cameraModifiedEvent: CustomEvent
): void {
  const renderingEngine = getRenderingEngine(targetViewport.renderingEngineId);
  if (!renderingEngine) {
    throw new Error(
      `No RenderingEngine for Id: ${targetViewport.renderingEngineId}`
    );
  }

  const tViewport = renderingEngine.getViewport(targetViewport.viewportId);

  // Direct Generic ("next") viewports do not expose setCamera. Camera-position
  // synchronization across viewports is expressed natively by copying the
  // source viewport's spatial view reference onto the target. The CAMERA_MODIFIED
  // event detail only carries an ICamera (no ViewReference), so we read the
  // reference live from the source viewport rather than from the event snapshot;
  // any sync lag from the live read is inherent to the event not carrying one.
  // Resolve the source viewport through its own rendering engine: when source
  // and target live in different engines, the target's engine returns undefined
  // for the source id and the reads below would throw. Bail out if it cannot be
  // resolved.
  const sourceRenderingEngine = getRenderingEngine(
    sourceViewport.renderingEngineId
  );
  const sViewport = sourceRenderingEngine?.getViewport(
    sourceViewport.viewportId
  );
  if (!sViewport) {
    return;
  }
  const viewReference = sViewport.getViewReference();
  tViewport.setViewReference(viewReference);

  // Slice/orientation come from the view reference above; copy zoom + pan
  // (and, between planar viewports of parallel planes, the view up and the
  // normal through the rotation and the flips) explicitly so they stay in
  // lockstep like the legacy full-camera copy did. applyViewportPresentation
  // is a no-op for targets without a projection adapter, so this is safe for
  // any next-viewport family.
  const zoomPanPresentation = getViewportPresentation(
    sViewport,
    ZOOM_PAN_SELECTOR
  );
  const viewUpPresentation = getPlanarViewUpPresentation(
    sViewport,
    tViewport,
    viewReference
  );
  applyViewportPresentation(
    tViewport,
    viewUpPresentation
      ? {
          ...(zoomPanPresentation as Types.ViewPresentation),
          ...viewUpPresentation,
        }
      : zoomPanPresentation
  );

  tViewport.render();
}
