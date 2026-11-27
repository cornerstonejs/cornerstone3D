import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';

/** The distance in millimetres under which two positions are one. */
export const POSITION_TOLERANCE = 1e-4;

/** The relative difference under which two parallel scales are one. */
const SCALE_TOLERANCE = 1e-6;

/**
 * The viewports of each synchronizer that are in step with its group, by
 * `renderingEngineId:viewportId`: a viewport that drove the group, or that
 * the group wrote or found in step.
 */
const viewportsInStep = new WeakMap<Synchronizer, Set<string>>();

/**
 * The member of the group whose view a source takes for a camera event that
 * changed no camera, by synchronizer and event, so that every target of one
 * event reads the same answer. `null` when there is none.
 */
const groupMemberOfEvent = new WeakMap<
  Synchronizer,
  WeakMap<object, unknown>
>();

/** Whether two parallel scales are one. */
export function isSameScale(scale: number, other: number): boolean {
  return (
    Math.abs(scale - other) <=
    SCALE_TOLERANCE * Math.max(Math.abs(scale), Math.abs(other))
  );
}

/** The key of a viewport in the viewports in step of a synchronizer. */
export function viewportKey({
  renderingEngineId,
  viewportId,
}: Types.IViewportId): string {
  return `${renderingEngineId}:${viewportId}`;
}

/** Records that a viewport is in step with the group of a synchronizer. */
export function setInStep(
  synchronizer: Synchronizer,
  viewport: Types.IViewportId
): void {
  let viewports = viewportsInStep.get(synchronizer);

  if (!viewports) {
    viewports = new Set();
    viewportsInStep.set(synchronizer, viewports);
  }

  viewports.add(viewportKey(viewport));
}

/**
 * Whether a CAMERA_MODIFIED event changed the camera of its viewport. A
 * mount fires the camera that the view opens with, and a resize keeps the
 * camera, so neither changes it. An event without its two cameras counts as
 * a change.
 */
export function changesCamera(
  detail?: Types.EventTypes.CameraModifiedEventDetail
): boolean {
  const { camera, previousCamera } = detail ?? {};

  if (
    !camera?.focalPoint ||
    !camera.viewPlaneNormal ||
    !previousCamera?.focalPoint ||
    !previousCamera.viewPlaneNormal
  ) {
    return true;
  }

  return (
    vec3.distance(camera.focalPoint, previousCamera.focalPoint) >
      POSITION_TOLERANCE ||
    !isSameScale(camera.parallelScale, previousCamera.parallelScale) ||
    (camera.parallelProjection === false &&
      (!camera.position ||
        !previousCamera.position ||
        vec3.distance(camera.position, previousCamera.position) >
          POSITION_TOLERANCE ||
        camera.viewAngle !== previousCamera.viewAngle)) ||
    !utilities.isEqual(
      camera.viewPlaneNormal,
      previousCamera.viewPlaneNormal
    ) ||
    (camera.viewUp && previousCamera.viewUp
      ? !utilities.isEqual(camera.viewUp, previousCamera.viewUp)
      : camera.viewUp !== previousCamera.viewUp)
  );
}

/**
 * The member of the group of a synchronizer whose view a source takes when
 * its camera event changed no camera (a mount, a resize): the first target
 * of the synchronizer other than the source, in the order the viewports
 * were added, that `getMember` gives and that is in step with the group.
 * When none is in step and `getMember` gives one other target alone, the
 * group is that target: a viewport that was placed while it was alone in
 * the group (`Synchronizer.fireEvent` skips the source, so the events of a
 * lone viewport reach no callback), or that was mounted before it was
 * added. Undefined when there is none, or several none of which is in step.
 * The answer is kept for the event, so that the targets of one event read
 * one answer.
 *
 * @param getMember - The member for the ids of a target, undefined for a
 *   target that cannot be the group (it shows no data).
 */
export function getGroupMember<T>(
  synchronizer: Synchronizer,
  sourceId: Types.IViewportId,
  event: object | undefined,
  getMember: (id: Types.IViewportId) => T | undefined
): T | undefined {
  let ofEvent = groupMemberOfEvent.get(synchronizer);

  if (event && ofEvent?.has(event)) {
    return (ofEvent.get(event) as T | null) ?? undefined;
  }

  const inStep = viewportsInStep.get(synchronizer);
  const sourceKey = viewportKey(sourceId);
  const placed: T[] = [];
  let member: T | undefined;

  for (const id of synchronizer.getTargetViewports()) {
    const key = viewportKey(id);
    const candidate = key === sourceKey ? undefined : getMember(id);

    if (candidate === undefined) {
      continue;
    }

    if (inStep?.has(key)) {
      member = candidate;
      break;
    }

    placed.push(candidate);
  }

  member ??= placed.length === 1 ? placed[0] : undefined;

  if (event) {
    if (!ofEvent) {
      ofEvent = new WeakMap();
      groupMemberOfEvent.set(synchronizer, ofEvent);
    }

    ofEvent.set(event, member ?? null);
  }

  return member;
}
