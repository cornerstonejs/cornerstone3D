import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import {
  cloneVolume3DCamera,
  rollVolume3DCamera,
  withVolume3DProjectionZoomPan,
} from './volume3DProjectionCamera';
import type {
  Volume3DProjectionFraming,
  Volume3DProjectionSnapshot,
} from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** The fields of a camera that a raw camera patch can set. */
const CAMERA_PATCH_KEYS = [
  'focalPoint',
  'parallelProjection',
  'parallelScale',
  'viewAngle',
  'viewPlaneNormal',
  'viewUp',
] as const;

/**
 * The camera fields of a framing patch: its `camera`, or else the fields of
 * a camera that the patch has itself, as a raw camera patch. The `position`
 * of a framing is a projection position and its `scale` a projection scale,
 * which the reader gives and the writer does not apply, so a framing that was
 * read without its camera keeps the direction; a `position` that is a point
 * is the position of the camera.
 */
function getCameraPatch(
  framing: Partial<Volume3DProjectionFraming>
): Partial<Volume3DCamera> {
  if (hasOwn(framing, 'camera')) {
    return framing.camera ?? {};
  }

  const cameraPatch: Partial<Volume3DCamera> = {};
  const raw = framing as Record<string, unknown>;

  for (const key of CAMERA_PATCH_KEYS) {
    if (raw[key] !== undefined) {
      (cameraPatch as Record<string, unknown>)[key] = raw[key];
    }
  }

  if (Array.isArray(raw.position)) {
    cameraPatch.position = raw.position as Volume3DCamera['position'];
  }

  return cameraPatch;
}

/**
 * Converts a Volume3D projection snapshot to the framing of a 3D
 * viewport: the camera, and the zoom and the pan against the fit when the
 * viewport shows something to fit. The pan is in canvas pixels at zoom 1, as
 * on the planar viewport. The selector is not read: every field comes back.
 */
export function getVolume3DProjectionFraming(
  snapshot: Volume3DProjectionSnapshot
): Volume3DProjectionFraming {
  const { rawPan, zoom, ...framing } = snapshot.framing;

  return {
    ...framing,
    camera: cloneVolume3DCamera(snapshot.framing.camera),
    pan: rawPan && zoom ? [rawPan[0] / zoom, rawPan[1] / zoom] : undefined,
    zoom,
  };
}

/**
 * Applies a framing patch to the camera of the snapshot and returns the
 * view state. A patch with a `camera` applies that camera, and then its
 * `zoom` and its `pan` against the fit of the viewport for the direction of
 * that camera, so a framing that was read comes back as it was, and on a
 * viewport of another size gives the same zoom and pan against its fit. A
 * patch without one applies its camera fields, then its `rotation`, then its
 * `zoom` and its `pan` against the fit, see `Volume3DProjectionFraming`. The rotation
 * is absolute, as on the legacy 3D viewport: the view up turns about the view
 * plane normal until the rotation of the snapshot, measured from the view up
 * of the orientation of the viewport options, is the one asked for. A zoom
 * without a pan keeps the world point of `options.anchorCanvas` under that
 * canvas point. A zoom and a pan do nothing when the viewport shows nothing
 * to fit.
 */
export function withVolume3DProjectionFraming(
  snapshot: Volume3DProjectionSnapshot,
  framing: Partial<Volume3DProjectionFraming>,
  options: ProjectionWriteOptions = {}
): Volume3DCamera {
  const patchedCamera = cloneVolume3DCamera({
    ...snapshot.framing.camera,
    ...getCameraPatch(framing),
  } as Volume3DCamera);
  const rotation =
    !hasOwn(framing, 'camera') && typeof framing.rotation === 'number'
      ? framing.rotation
      : undefined;
  const camera =
    rotation === undefined
      ? patchedCamera
      : rollVolume3DCamera(
          patchedCamera,
          rotation - (snapshot.framing.rotation ?? 0)
        );
  const zoom = hasOwn(framing, 'zoom') ? framing.zoom : undefined;
  const pan = hasOwn(framing, 'pan') ? framing.pan : undefined;
  const fit = hasOwn(framing, 'camera')
    ? (snapshot.resolvedView?.getFitFor?.(camera) ?? snapshot.fit)
    : snapshot.fit;

  if (!fit || (zoom === undefined && !pan)) {
    return camera;
  }

  return {
    ...camera,
    ...withVolume3DProjectionZoomPan(
      camera,
      fit,
      { width: snapshot.canvasWidth, height: snapshot.canvasHeight },
      { zoom, pan, anchorCanvas: options.anchorCanvas }
    ),
  };
}
