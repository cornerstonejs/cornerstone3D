import { OrientationAxis } from '../../../enums';
import type { ICamera, Point3 } from '../../../types';
import {
  cloneVolume3DCamera,
  getVolume3DProjectionPan,
  getVolume3DProjectionPosition,
  getVolume3DProjectionRotation,
  getVolume3DProjectionScale,
  getVolume3DProjectionZoom,
} from './volume3DProjectionCamera';
import { getOrientationVectors } from './vtkVolume3DInitialCamera';
import {
  VOLUME3D_PROJECTION_ID,
  type Volume3DProjectionRequest,
  type Volume3DProjectionSnapshot,
} from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

/**
 * The view up of rotation 0 of each 3D viewport whose options name no
 * orientation or the acquisition plane, where the orientation gives none.
 */
const zeroRotationViewUps = new WeakMap<object, Point3>();

/**
 * Keeps the view up of rotation 0 of a 3D viewport: the view up of its
 * camera after the mount of its first display set, as the legacy viewport
 * kept the view up of its orientation.
 *
 * @internal
 */
export function setVolume3DZeroRotationViewUp(
  viewport: object,
  viewUp: Point3
): void {
  zeroRotationViewUps.set(viewport, [...viewUp] as Point3);
}

/**
 * The view up of rotation 0 of a 3D viewport: the view up of the
 * orientation of its options, or else the one kept at its mount. A viewport
 * without one keeps the view up of the camera now, so a rotation is measured
 * from the same view up at every later read and write.
 */
function getZeroRotationViewUp(
  viewport: Volume3DProjectionRequest['viewport'],
  camera: Volume3DCamera & ICamera
): Point3 | undefined {
  const orientation = viewport.defaultOptions?.orientation;

  if (orientation && orientation !== OrientationAxis.ACQUISITION) {
    return getOrientationVectors({
      fallbackViewPlaneNormal: camera.viewPlaneNormal,
      fallbackViewUp: camera.viewUp,
      orientation,
    }).viewUp;
  }

  if (!zeroRotationViewUps.has(viewport) && camera.viewUp) {
    setVolume3DZeroRotationViewUp(viewport, camera.viewUp);
  }

  return zeroRotationViewUps.get(viewport);
}

/**
 * Builds the capability-based Volume3D projection snapshot for a viewport-like
 * object or explicit 3D camera request.
 */
export function getVolume3DProjectionSnapshot(
  request: Volume3DProjectionRequest
): Volume3DProjectionSnapshot | undefined {
  const { viewport } = request;
  const resolvedView = request.resolvedView ?? viewport.getResolvedView?.();
  const viewState = request.camera ?? viewport.getViewState?.();
  const rendererCamera = resolvedView?.toICamera() ?? viewState;

  if (!rendererCamera) {
    return;
  }

  const camera = cloneVolume3DCamera(
    rendererCamera as Volume3DCamera & ICamera
  );
  const canvasWidth =
    request.canvasWidth ??
    viewport.canvas?.clientWidth ??
    viewport.element?.clientWidth ??
    1;
  const canvasHeight =
    request.canvasHeight ??
    viewport.canvas?.clientHeight ??
    viewport.element?.clientHeight ??
    1;
  const frameOfReferenceUID =
    request.frameOfReferenceUID ??
    resolvedView?.getFrameOfReferenceUID() ??
    viewport.getFrameOfReferenceUID?.();
  const fit = request.fit ?? resolvedView?.fit;
  const rawPan = fit
    ? getVolume3DProjectionPan(camera, fit, canvasHeight)
    : undefined;
  const referenceViewUp = getZeroRotationViewUp(viewport, camera);

  return {
    kind: VOLUME3D_PROJECTION_ID,
    adapterId: VOLUME3D_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    dataId: request.dataId,
    fit,
    frameOfReferenceUID,
    presentation: {
      camera: cloneVolume3DCamera(camera),
      pan: rawPan,
      position: getVolume3DProjectionPosition(camera),
      rawPan,
      rotation: getVolume3DProjectionRotation(camera, referenceViewUp),
      scale: getVolume3DProjectionScale({ camera, canvasHeight }),
      zoom: fit ? getVolume3DProjectionZoom(camera, fit) : undefined,
    },
    rendererCamera: cloneVolume3DCamera(camera),
    resolvedView,
    spaces: {
      canvas: Boolean(resolvedView),
      renderer: true,
      world: Boolean(resolvedView || camera.focalPoint),
    },
    transforms: resolvedView
      ? {
          canvasToWorld: (point) => resolvedView.canvasToWorld(point),
          worldToCanvas: (point) => resolvedView.worldToCanvas(point),
        }
      : undefined,
    viewState: cloneVolume3DCamera(camera),
    viewportType: viewport.type,
  };
}
