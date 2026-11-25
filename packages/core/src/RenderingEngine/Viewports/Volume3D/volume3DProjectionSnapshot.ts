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

/** The view up and the view plane normal of the view of rotation 0. */
type ZeroRotationView = Pick<Volume3DCamera, 'viewPlaneNormal' | 'viewUp'>;

/**
 * The view of rotation 0 of each 3D viewport whose options name no
 * orientation or the acquisition plane, where the orientation gives none.
 */
const zeroRotationViews = new WeakMap<object, ZeroRotationView>();

/**
 * Keeps the view of rotation 0 of a 3D viewport: the view up and the view
 * plane normal of its camera after the mount of its first display set, as
 * the legacy viewport kept the view up of its orientation. The view plane
 * normal gives the rotation where the camera looks along that view up.
 *
 * @internal
 */
export function setVolume3DZeroRotationViewUp(
  viewport: object,
  viewUp: Point3,
  viewPlaneNormal?: Point3
): void {
  zeroRotationViews.set(viewport, {
    viewUp: [...viewUp] as Point3,
    viewPlaneNormal: viewPlaneNormal && ([...viewPlaneNormal] as Point3),
  });
}

/**
 * The view of rotation 0 of a 3D viewport: the one of the orientation of its
 * options, or else the one kept at its mount. A viewport without one keeps
 * the view of the camera now, so a rotation is measured from the same view
 * at every later read and write.
 */
function getZeroRotationView(
  viewport: Volume3DProjectionRequest['viewport'],
  camera: Volume3DCamera & ICamera
): ZeroRotationView | undefined {
  const orientation = viewport.defaultOptions?.orientation;

  if (orientation && orientation !== OrientationAxis.ACQUISITION) {
    return getOrientationVectors({
      fallbackViewPlaneNormal: camera.viewPlaneNormal,
      fallbackViewUp: camera.viewUp,
      orientation,
    });
  }

  if (!zeroRotationViews.has(viewport) && camera.viewUp) {
    setVolume3DZeroRotationViewUp(
      viewport,
      camera.viewUp,
      camera.viewPlaneNormal
    );
  }

  return zeroRotationViews.get(viewport);
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
  const canvasSize = resolvedView?.canvasSize;
  const canvasWidth =
    request.canvasWidth ??
    canvasSize?.width ??
    viewport.canvas?.clientWidth ??
    viewport.element?.clientWidth ??
    1;
  const canvasHeight =
    request.canvasHeight ??
    canvasSize?.height ??
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
  const zeroRotationView = getZeroRotationView(viewport, camera);

  return {
    kind: VOLUME3D_PROJECTION_ID,
    adapterId: VOLUME3D_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    displaySetId: request.displaySetId,
    fit,
    frameOfReferenceUID,
    framing: {
      camera: cloneVolume3DCamera(camera),
      pan: rawPan,
      position: getVolume3DProjectionPosition(camera),
      rawPan,
      rotation: getVolume3DProjectionRotation(
        camera,
        zeroRotationView?.viewUp,
        zeroRotationView?.viewPlaneNormal
      ),
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
