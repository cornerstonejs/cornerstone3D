import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import {
  cloneVolume3DCamera,
  withVolume3DProjectionZoomPan,
} from './volume3DProjectionCamera';
import type {
  Volume3DProjectionPresentation,
  Volume3DProjectionSnapshot,
} from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * The camera fields of a presentation patch: its `camera`, or else the patch
 * itself as a raw camera patch, without its zoom and its pan.
 */
function getCameraPatch(
  presentation: Partial<Volume3DProjectionPresentation>
): Partial<Volume3DCamera> {
  if (hasOwn(presentation, 'camera')) {
    return presentation.camera ?? {};
  }

  const {
    zoom: _zoom,
    pan: _pan,
    rawPan: _rawPan,
    ...cameraPatch
  } = presentation;

  return cameraPatch as unknown as Partial<Volume3DCamera>;
}

/**
 * Converts a Volume3D projection snapshot to the presentation of a 3D
 * viewport: the camera, and the zoom and the pan against the fit when the
 * viewport shows something to fit. The pan is in canvas pixels at zoom 1, as
 * on the planar viewport. The selector is not read: every field comes back.
 */
export function getVolume3DProjectionPresentation(
  snapshot: Volume3DProjectionSnapshot
): Volume3DProjectionPresentation {
  const { rawPan, zoom, ...presentation } = snapshot.presentation;

  return {
    ...presentation,
    camera: cloneVolume3DCamera(snapshot.presentation.camera),
    pan: rawPan && zoom ? [rawPan[0] / zoom, rawPan[1] / zoom] : undefined,
    zoom,
  };
}

/**
 * Applies a presentation patch to the camera of the snapshot and returns the
 * view state. A patch with a `camera` applies that camera and nothing else,
 * so a presentation that was read comes back as it was. A patch without one
 * applies its camera fields, then its `zoom` and its `pan` against the fit,
 * see `Volume3DProjectionPresentation`. A zoom without a pan keeps the world
 * point of `options.anchorCanvas` under that canvas point. A zoom and a pan
 * do nothing when the viewport shows nothing to fit.
 */
export function withVolume3DProjectionPresentation(
  snapshot: Volume3DProjectionSnapshot,
  presentation: Partial<Volume3DProjectionPresentation>,
  options: ProjectionWriteOptions = {}
): Volume3DCamera {
  const camera = cloneVolume3DCamera({
    ...snapshot.presentation.camera,
    ...getCameraPatch(presentation),
  } as Volume3DCamera);
  const zoom = hasOwn(presentation, 'zoom') ? presentation.zoom : undefined;
  const pan = hasOwn(presentation, 'pan') ? presentation.pan : undefined;

  if (
    hasOwn(presentation, 'camera') ||
    !snapshot.fit ||
    (zoom === undefined && !pan)
  ) {
    return camera;
  }

  return {
    ...camera,
    ...withVolume3DProjectionZoomPan(
      camera,
      snapshot.fit,
      { width: snapshot.canvasWidth, height: snapshot.canvasHeight },
      { zoom, pan, anchorCanvas: options.anchorCanvas }
    ),
  };
}
