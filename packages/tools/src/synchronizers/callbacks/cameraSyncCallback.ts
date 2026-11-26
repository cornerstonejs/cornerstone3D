import { vec3 } from 'gl-matrix';
import type {
  PlanarViewport,
  PlanarViewState,
  Types,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import { Enums, getRenderingEngine, utilities } from '@cornerstonejs/core';
import type { Synchronizer } from '../../store';
import {
  applyViewportFraming,
  getViewportFraming,
} from '../../utilities/viewportFraming';

/**
 * The framing that a viewport of another family than planar takes from its
 * source with the view reference: a view reference holds no zoom and no
 * pan, as `zoomPanSyncCallback` carries them.
 */
const ZOOM_PAN_SELECTOR: Types.ViewFramingSelector = {
  pan: true,
  zoom: true,
};

/** The families of viewports whose cameras `syncPanes` keeps in step. */
const SYNCED_VIEWPORT_TYPES: string[] = [
  Enums.ViewportType.PLANAR,
  Enums.ViewportType.VOLUME_3D,
];

/** The fields of a planar framing that turn and flip the view. */
const ROTATION_FLIP_SELECTOR: Types.ViewFramingSelector = {
  rotation: true,
  flipHorizontal: true,
  flipVertical: true,
};

/** The distance in millimetres under which two positions are one. */
const POSITION_TOLERANCE = 1e-4;

/** The relative difference under which two parallel scales are one. */
const SCALE_TOLERANCE = 1e-6;

/**
 * How far past half a slice a position still counts as on that slice, in
 * slices, so a position half way between two slices keeps the slice on
 * display.
 */
const HALF_SLICE_TOLERANCE = 1e-6;

/** The difference in degrees under which two rotations are one. */
const ROTATION_TOLERANCE = 1e-6;

/** A planar viewport of a synchronizer, its ids and its camera. */
type PlanarPane = {
  id: Types.IViewportId;
  viewport: PlanarViewport;
  camera: Types.ICamera;
};

/** A 3D viewport of a synchronizer, its ids and its camera. */
type Volume3DPane = {
  id: Types.IViewportId;
  viewport: VolumeViewport3D;
  camera: Types.ICamera;
};

/** A planar or a 3D viewport of a synchronizer that shows data. */
type Pane = PlanarPane | Volume3DPane;

/** The framing of a view that is not turned in its plane nor flipped. */
const UNTURNED_FRAMING: Types.ViewFraming = {
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
};

/**
 * The panes of each synchronizer that are in step with its group, by
 * `renderingEngineId:viewportId`: a pane that drove the group, or that the
 * group wrote or found in step.
 */
const panesInStep = new WeakMap<Synchronizer, Set<string>>();

/**
 * The pane whose view a camera event that changed no camera takes, by
 * event, so that every target of one event reads the same answer. `null`
 * when the source drives the group.
 */
const groupPaneOfEvent = new WeakMap<object, Pane | null>();

/** The key of a pane in `panesInStep`. */
function paneKey({ renderingEngineId, viewportId }: Types.IViewportId): string {
  return `${renderingEngineId}:${viewportId}`;
}

/** Records that a pane is in step with the group of a synchronizer. */
function setInStep(synchronizer: Synchronizer, pane: Types.IViewportId): void {
  let panes = panesInStep.get(synchronizer);

  if (!panes) {
    panes = new Set();
    panesInStep.set(synchronizer, panes);
  }

  panes.add(paneKey(pane));
}

/** The vector that points the other way. */
function negated(vector: Types.Point3): Types.Point3 {
  return [-vector[0], -vector[1], -vector[2]];
}

/** The distance from one point to another along a normal. */
function distanceAlong(
  normal: Types.Point3,
  from: Types.Point3,
  to: Types.Point3
): number {
  return vec3.dot(vec3.sub(vec3.create(), to, from), normal);
}

/** Whether two parallel scales are one. */
function isSameScale(scale: number, other: number): boolean {
  return (
    Math.abs(scale - other) <=
    SCALE_TOLERANCE * Math.max(Math.abs(scale), Math.abs(other))
  );
}

/** Whether a pane is a 3D viewport. */
function is3DPane(pane: Pane): pane is Volume3DPane {
  return pane.viewport.type === Enums.ViewportType.VOLUME_3D;
}

/** The tangent of half an angle in degrees. */
function tanOfHalf(degrees: number): number {
  return Math.tan((degrees * Math.PI) / 360);
}

/**
 * Half the world height of the canvas at the focal point of a camera: the
 * parallel scale of a parallel camera, and for a perspective camera the
 * distance of its position from the focal point times the tangent of half
 * its view angle.
 */
function getHalfHeight(camera: Types.ICamera): number {
  return camera.parallelProjection === false
    ? vec3.distance(camera.position, camera.focalPoint) *
        tanOfHalf(camera.viewAngle)
    : camera.parallelScale;
}

/** Whether two normals are parallel, in the same or the other direction. */
function areParallel(normal: Types.Point3, other: Types.Point3): boolean {
  return (
    utilities.isEqual(normal, other) || utilities.isOpposite(normal, other)
  );
}

/**
 * The camera of a planar viewport that shows data, from its resolved view:
 * the focal point is the world point at the centre of the canvas, its place
 * along the normal the position of the view, between two slices of a volume
 * when the view was put there.
 */
function getPlanarCamera(
  viewport: Types.IViewport | undefined
): Types.ICamera | undefined {
  if (viewport?.type !== Enums.ViewportType.PLANAR) {
    return;
  }

  const camera = (viewport as PlanarViewport).getResolvedView()?.toICamera() as
    | Types.ICamera
    | undefined;

  return camera?.focalPoint && camera.viewPlaneNormal && camera.parallelScale
    ? camera
    : undefined;
}

/**
 * Whether a CAMERA_MODIFIED event changed the camera of its viewport. A
 * mount fires the camera that the view opens with, and a resize keeps the
 * camera, so neither changes it. An event without its two cameras counts as
 * a change.
 */
function changesCamera(detail?: Types.EventTypes.CameraModifiedEventDetail) {
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
 * Whether a CAMERA_MODIFIED event moved its viewport along the normal: a
 * scroll, a jump, a move of the crosshairs, a reset or another plane, and
 * not a zoom, a pan, a rotation in the plane, a flip or a resize. An event
 * without its two cameras counts as a move.
 */
function movesAlongNormal(
  detail?: Types.EventTypes.CameraModifiedEventDetail
): boolean {
  const { camera, previousCamera } = detail ?? {};

  if (
    !camera?.focalPoint ||
    !camera.viewPlaneNormal ||
    !previousCamera?.focalPoint ||
    !previousCamera.viewPlaneNormal ||
    !utilities.isEqual(camera.viewPlaneNormal, previousCamera.viewPlaneNormal)
  ) {
    return true;
  }

  return (
    Math.abs(
      distanceAlong(
        camera.viewPlaneNormal,
        previousCamera.focalPoint,
        camera.focalPoint
      )
    ) > POSITION_TOLERANCE
  );
}

/**
 * The slice that puts a planar view on the slice of its own grid nearest to
 * a point, as a view state patch, or undefined when the view shows that
 * slice already. A stack goes to its image nearest to the point. A volume
 * takes the point itself and draws its slice nearest to it, so the position
 * of the view is the point: a pane that reads it back finds itself on its
 * own nearest slice and does not move. A point within half a slice of the
 * slice on display, or past the first or the last slice when the view is
 * there, is on it.
 */
function getSliceTowards(
  viewport: PlanarViewport,
  camera: Types.ICamera,
  point: Types.Point3
): PlanarViewState['slice'] | undefined {
  if (viewport.getCurrentMode() === 'stack') {
    const imageIdIndex = utilities.getClosestStackImageIndexForPoint(
      point,
      viewport
    );

    return typeof imageIdIndex === 'number' &&
      imageIdIndex !== viewport.getCurrentImageIdIndex()
      ? { kind: 'stackIndex', imageIdIndex }
      : undefined;
  }

  const normal = camera.viewPlaneNormal;
  const count = viewport.getNumberOfSlices();

  if (count < 2) {
    return;
  }

  const first = viewport.getViewReference({ sliceIndex: 0 })?.cameraFocalPoint;
  const last = viewport.getViewReference({
    sliceIndex: count - 1,
  })?.cameraFocalPoint;
  const step =
    first && last ? distanceAlong(normal, first, last) / (count - 1) : 0;
  const onSlice = step
    ? Math.abs(
        utilities.clip(
          distanceAlong(normal, first, point) / step,
          0,
          count - 1
        ) - viewport.getSliceIndex()
      ) <=
      0.5 + HALF_SLICE_TOLERANCE
    : Math.abs(distanceAlong(normal, camera.focalPoint, point)) <=
      POSITION_TOLERANCE;

  return onSlice
    ? undefined
    : {
        kind: 'volumePoint',
        sliceWorldPoint: [point[0], point[1], point[2]],
      };
}

/**
 * The view state patch that gives a planar view the parallel scale of a
 * camera (the same world height of the canvas) and, in one frame of
 * reference, the world point at the centre of its canvas, or undefined when
 * it has both. The view keeps the stretch of its axes, and a display area of
 * the view gives way to the scale that it showed.
 */
function getFramingTowards(
  viewport: PlanarViewport,
  camera: Types.ICamera,
  fromCamera: Types.ICamera,
  sameFrame: boolean
): Partial<PlanarViewState> | undefined {
  const normal = camera.viewPlaneNormal;
  const offset = vec3.sub(
    vec3.create(),
    fromCamera.focalPoint,
    camera.focalPoint
  );
  const inPlane = vec3.scaleAndAdd(
    vec3.create(),
    offset,
    normal,
    -vec3.dot(offset, normal)
  );
  const movesCentre = sameFrame && vec3.length(inPlane) > POSITION_TOLERANCE;

  if (
    !movesCentre &&
    isSameScale(camera.parallelScale, fromCamera.parallelScale)
  ) {
    return;
  }

  const ratio = camera.parallelScale / fromCamera.parallelScale;
  const [scaleX, scaleY] = viewport.getScale();
  const centre = movesCentre
    ? vec3.add(vec3.create(), camera.focalPoint, inPlane)
    : camera.focalPoint;

  return {
    anchorWorld: [centre[0], centre[1], centre[2]],
    anchorCanvas: [0.5, 0.5],
    scale: [scaleX * ratio, scaleY * ratio],
    scaleMode: 'fit',
    displayArea: undefined,
  };
}

/**
 * The rotation and the flips that give a planar view the view up and the
 * view plane normal of another planar view, as the 5.x `setCamera` of the
 * target did, or undefined when it has them. The vertical flip is the one of
 * the other view, and the horizontal one also turns the view to the side of
 * the plane that the other view looks from. A planar view flips first and
 * turns after, about the normal that it shows, so the rotation turns the
 * view up of the view, negated when its vertical flip changes, to the one of
 * the other view about the normal of the other view; the rotation counts the
 * other way when its normal is the opposite of the other one. A view whose
 * view before its rotation is the one of the other view, within 1e-4
 * degrees, takes the rotation of the other view as it is. The two views show
 * parallel planes.
 */
function getViewUpFramingTowards(
  viewport: PlanarViewport,
  camera: Types.ICamera,
  fromViewport: Types.IViewport,
  fromCamera: Types.ICamera
): Partial<PlanarViewState> | undefined {
  const source =
    fromViewport.type === Enums.ViewportType.PLANAR
      ? (getViewportFraming(fromViewport, ROTATION_FLIP_SELECTOR) as
          | Types.ViewFraming
          | undefined)
      : UNTURNED_FRAMING;
  const target = getViewportFraming(viewport, ROTATION_FLIP_SELECTOR) as
    | Types.ViewFraming
    | undefined;
  const sourceViewUp = fromCamera.viewUp;
  const sourceNormal = fromCamera.viewPlaneNormal;
  const targetViewUp = camera.viewUp;

  if (!source || !target || !sourceViewUp || !targetViewUp) {
    return;
  }

  const opposite = utilities.isOpposite(camera.viewPlaneNormal, sourceNormal);
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
  const targetRotation = target.rotation ?? 0;
  const rotation = (opposite ? -targetRotation : targetRotation) + turn;
  const sourceRotation = source.rotation ?? 0;
  const offset = ((((rotation - sourceRotation) % 360) + 540) % 360) - 180;
  const nextRotation =
    Math.abs(offset) < 1e-4 ? sourceRotation : ((rotation % 360) + 360) % 360;
  const rotationOffset =
    ((((nextRotation - targetRotation) % 360) + 540) % 360) - 180;

  if (
    Math.abs(rotationOffset) < ROTATION_TOLERANCE &&
    flipHorizontal === Boolean(target.flipHorizontal) &&
    flipVertical === Boolean(target.flipVertical)
  ) {
    return;
  }

  return { rotation: nextRotation, flipHorizontal, flipVertical };
}

/**
 * Gives the planar view of `to` the view of `from` in one write of its view
 * state: the parallel scale, the world point at the centre of the canvas,
 * the view up, and with `moveSlice` the slice of its own grid nearest to the
 * position of `from`. A view of one frame of reference that shows another
 * plane turns to the plane of `from` first, through a view reference of the
 * plane and the point, as the 5.x camera did; a stack cannot turn and takes
 * nothing. A view of another frame of reference takes the parallel scale
 * only. Nothing is written when `to` has all of it. A 3D view as `from` is
 * a view of its direction, its view up and its focal point, neither turned
 * in its plane nor flipped, whose scale is the half height of its canvas at
 * the focal point (`getHalfHeight`).
 *
 * @returns Whether `to` shows the view of `from`.
 */
function followPlanarView(
  from: Pane,
  to: PlanarPane,
  moveSlice: boolean
): boolean {
  const frameOfReferenceUID = from.viewport.getFrameOfReferenceUID();
  const sameFrame =
    frameOfReferenceUID === to.viewport.getFrameOfReferenceUID();
  let camera = to.camera;

  if (
    sameFrame &&
    !areParallel(camera.viewPlaneNormal, from.camera.viewPlaneNormal)
  ) {
    if (to.viewport.getCurrentMode() === 'stack') {
      return false;
    }

    to.viewport.setViewReference({
      FrameOfReferenceUID: frameOfReferenceUID,
      viewPlaneNormal: [...from.camera.viewPlaneNormal] as Types.Point3,
      viewUp: from.camera.viewUp
        ? ([...from.camera.viewUp] as Types.Point3)
        : undefined,
      cameraFocalPoint: [...from.camera.focalPoint] as Types.Point3,
    });
    camera = getPlanarCamera(to.viewport);

    if (
      !camera ||
      !areParallel(camera.viewPlaneNormal, from.camera.viewPlaneNormal)
    ) {
      return false;
    }
  }

  const keepsPlace = !sameFrame;
  const slice =
    moveSlice && !keepsPlace
      ? getSliceTowards(to.viewport, camera, from.camera.focalPoint)
      : undefined;
  const patch: Partial<PlanarViewState> = {
    ...(slice ? { slice } : {}),
    ...getFramingTowards(to.viewport, camera, from.camera, sameFrame),
    ...(keepsPlace
      ? {}
      : getViewUpFramingTowards(
          to.viewport,
          camera,
          from.viewport,
          from.camera
        )),
  };

  if (Object.keys(patch).length) {
    to.viewport.setViewState(patch);
  }

  return true;
}

/**
 * Gives the 3D view of `to` the view of `from` in one write of its camera, as
 * the 5.18.3 `setCamera` of the camera of `from` did, so that both show the
 * same world point at the centre of the canvas from the same side at the same
 * scale:
 *
 * - the direction (view plane normal) and the view up of `from`;
 * - the focal point of a 3D `from`; of a planar `from`, the world point at
 *   the centre of its canvas at the depth of `to` along the normal, as the
 *   slice of a planar view means nothing to a 3D camera, so a scroll of the
 *   planar view writes no 3D view;
 * - the scale as the half height of the canvas at the focal point
 *   (`getHalfHeight`): a parallel `to` takes it as its parallel scale, and
 *   the distance of the position of a 3D `from` (5.18.3 copied the
 *   position); a perspective `to` keeps its view angle, or takes the one of a
 *   perspective `from` (5.18.3 copied it, so two perspective views have one
 *   camera), and the distance that gives the half height.
 *
 * The projection of `to` (parallel or perspective) stays, as 5.18.3 did not
 * copy it; the clipping range is fitted by the viewport. A view of another
 * frame of reference takes the scale only. Nothing is written when `to` has
 * all of it.
 *
 * @returns Whether `to` shows the view of `from`.
 */
function followVolume3DView(from: Pane, to: Volume3DPane): boolean {
  const source = from.camera;
  const target = to.camera;
  const sameFrame =
    from.viewport.getFrameOfReferenceUID() ===
    to.viewport.getFrameOfReferenceUID();
  const normal = sameFrame ? source.viewPlaneNormal : target.viewPlaneNormal;
  const viewUp = sameFrame ? source.viewUp : target.viewUp;
  const focalPoint = !sameFrame
    ? target.focalPoint
    : is3DPane(from)
      ? source.focalPoint
      : vec3.scaleAndAdd(
          vec3.create(),
          source.focalPoint,
          normal,
          distanceAlong(normal, source.focalPoint, target.focalPoint)
        );
  const halfHeight = getHalfHeight(source);
  const perspective = target.parallelProjection === false;
  const viewAngle =
    perspective && sameFrame && source.parallelProjection === false
      ? source.viewAngle
      : target.viewAngle;
  const placed = sameFrame && is3DPane(from) ? source : target;
  const distance = perspective
    ? halfHeight / tanOfHalf(viewAngle)
    : vec3.distance(placed.position, placed.focalPoint);
  const position = vec3.scaleAndAdd(
    vec3.create(),
    focalPoint,
    normal,
    distance
  );
  const parallelScale = perspective ? target.parallelScale : halfHeight;

  if (
    utilities.isEqual(normal, target.viewPlaneNormal) &&
    (!viewUp || !target.viewUp || utilities.isEqual(viewUp, target.viewUp)) &&
    vec3.distance(focalPoint, target.focalPoint) <= POSITION_TOLERANCE &&
    vec3.distance(position, target.position) <= POSITION_TOLERANCE &&
    isSameScale(parallelScale, target.parallelScale) &&
    viewAngle === target.viewAngle
  ) {
    return true;
  }

  to.viewport.setViewState({
    viewPlaneNormal: [...normal] as Types.Point3,
    viewUp: viewUp ? ([...viewUp] as Types.Point3) : undefined,
    focalPoint: [focalPoint[0], focalPoint[1], focalPoint[2]],
    position: [position[0], position[1], position[2]],
    parallelScale,
    viewAngle,
  });

  return true;
}

/**
 * Gives the view of `to` the view of `from`: `followPlanarView` for a planar
 * view, with the half height of the canvas of `from` as its scale, and
 * `followVolume3DView` for a 3D view.
 *
 * @returns Whether `to` shows the view of `from`.
 */
function followView(from: Pane, to: Pane, moveSlice: boolean): boolean {
  if (is3DPane(to)) {
    return followVolume3DView(from, to);
  }

  return followPlanarView(
    {
      ...from,
      camera: { ...from.camera, parallelScale: getHalfHeight(from.camera) },
    },
    to,
    moveSlice
  );
}

/**
 * A pane of a synchronizer, with its camera, or undefined when it is not a
 * planar or a 3D viewport that shows data.
 */
function getPane(id: Types.IViewportId): Pane | undefined {
  const viewport = getRenderingEngine(id.renderingEngineId)?.getViewport(
    id.viewportId
  );

  if (viewport?.type === Enums.ViewportType.VOLUME_3D) {
    const volume3D = viewport as VolumeViewport3D;

    return volume3D.getDisplaySets().length
      ? { id, viewport: volume3D, camera: volume3D.getViewState() }
      : undefined;
  }

  const camera = getPlanarCamera(viewport);

  return camera
    ? { id, viewport: viewport as PlanarViewport, camera }
    : undefined;
}

/**
 * The pane of the group whose scale, centre and view up a source takes when
 * its camera event changed no camera: the first target of the synchronizer, in the order the
 * viewports were added, that is in step with the group, shows data and has
 * the frame of reference of the source. Undefined when there is none: then
 * the source drives the group.
 */
function getGroupPane(
  synchronizer: Synchronizer,
  source: Pane
): Pane | undefined {
  const inStep = panesInStep.get(synchronizer);
  const sourceKey = paneKey(source.id);
  const frameOfReferenceUID = source.viewport.getFrameOfReferenceUID();

  for (const id of synchronizer.getTargetViewports()) {
    const key = paneKey(id);

    if (key === sourceKey || !inStep?.has(key)) {
      continue;
    }

    const pane = getPane(id);

    if (pane?.viewport.getFrameOfReferenceUID() === frameOfReferenceUID) {
      return pane;
    }
  }
}

/**
 * The camera position sync between two planar or 3D viewports, as the 5.x
 * camera copy kept them, whatever the grids and the extents of their
 * volumes. A target follows the source with `followView`.
 *
 * A camera event that changed the camera of the source (a zoom, a pan, a
 * rotation, a flip, a scroll, a jump, a reset) gives every target the
 * parallel scale of the source, the world point at the centre of its canvas
 * and its view up, in one write; a target takes the slice of its own grid
 * nearest to the position of the source only when the event moved the
 * source along its normal, and is not written for it when it shows that
 * slice already. A zoom, a pan or a rotation of a pane of a coarse grid so
 * never moves a pane of a fine grid along its normal, and a write that comes
 * back from a target never moves the source.
 *
 * A camera event that changed no camera (the mount of the source, a resize,
 * which keeps the camera) moves no pane along its normal and writes no
 * other pane: the source takes the scale, the centre and the view up of the
 * group instead, from the first pane of the group in step with it, and
 * keeps its slice. A pane that joins a group at its mount so takes the scale
 * and the centre of the group; the slice it opens on is the one of its
 * mount, and a move of it along its normal then moves the group. When no
 * pane of the group is in step yet, the source drives the scale and the
 * centre of the group. The slice of a pane of a coarse grid that was not
 * written can lie up to half a slice of it from the position of a pane of a
 * fine grid, so a slice taken from it at a resize would move the fine pane.
 */
function syncPanes(
  synchronizer: Synchronizer,
  sourceId: Types.IViewportId,
  targetId: Types.IViewportId,
  cameraModifiedEvent: CustomEvent | undefined
): void {
  const source = getPane(sourceId);

  if (!source) {
    return;
  }

  const detail = cameraModifiedEvent?.detail as
    | Types.EventTypes.CameraModifiedEventDetail
    | undefined;

  if (!changesCamera(detail)) {
    if (cameraModifiedEvent && !groupPaneOfEvent.has(cameraModifiedEvent)) {
      groupPaneOfEvent.set(
        cameraModifiedEvent,
        getGroupPane(synchronizer, source) ?? null
      );
    }

    const group = cameraModifiedEvent
      ? groupPaneOfEvent.get(cameraModifiedEvent)
      : getGroupPane(synchronizer, source);

    if (group) {
      if (paneKey(group.id) === paneKey(targetId)) {
        followView(group, source, false);
        setInStep(synchronizer, sourceId);
      }

      return;
    }
  }

  setInStep(synchronizer, sourceId);

  const target = getPane(targetId);

  if (target && followView(source, target, movesAlongNormal(detail))) {
    setInStep(synchronizer, targetId);
  }
}

/**
 * Synchronizer callback of the camera position synchronizer: the target
 * shows what the source shows.
 *
 * Between planar and 3D viewports, see `syncPanes`: the panes of one group
 * show the same scale (the same world height of the canvas at the focal
 * point, so the same millimetres per canvas pixel on panes of one size) and
 * the same world point at the centre of the canvas, whatever the extents of
 * their volumes, so the zoom that each pane reports against its own fit
 * differs between panes of other extents; each planar pane shows the slice
 * of its own grid nearest to the position of the pane that moved along its
 * normal. Two 3D panes have one camera (`followVolume3DView`); a 3D pane
 * takes the plane, the centre and the scale of a planar pane, and a planar
 * pane the ones of a 3D pane, as the 5.18.3 camera copy turned them.
 *
 * A target or a source of another family (a video, a whole slide, an ECG)
 * takes the view reference of the source and its zoom and pan against the
 * fit.
 *
 * @param synchronizerInstance - The Instance of the Synchronizer
 * @param sourceViewport - The list of IDs defining the source viewport.
 * @param targetViewport - The list of IDs defining the target viewport, never
 *   the same as sourceViewport.
 * @param cameraModifiedEvent - The CAMERA_MODIFIED event.
 */
export default function cameraSyncCallback(
  synchronizerInstance: Synchronizer,
  sourceViewport: Types.IViewportId,
  targetViewport: Types.IViewportId,
  cameraModifiedEvent: CustomEvent
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

  if (!sViewport || !tViewport) {
    return;
  }

  if (
    SYNCED_VIEWPORT_TYPES.includes(sViewport.type) &&
    SYNCED_VIEWPORT_TYPES.includes(tViewport.type)
  ) {
    syncPanes(
      synchronizerInstance,
      sourceViewport,
      targetViewport,
      cameraModifiedEvent
    );
    return;
  }

  tViewport.setViewReference(sViewport.getViewReference());
  applyViewportFraming(
    tViewport,
    getViewportFraming(sViewport, ZOOM_PAN_SELECTOR)
  );
  tViewport.render();
}
