import type { ICamera } from '../../../types';
import {
  cloneVolume3DCamera,
  getVolume3DProjectionPosition,
  getVolume3DProjectionScale,
} from './volume3DProjectionCamera';
import {
  VOLUME3D_PROJECTION_ID,
  type Volume3DProjectionRequest,
  type Volume3DProjectionSnapshot,
} from './Volume3DProjectionTypes';
import type { Volume3DCamera } from './viewport3DTypes';

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

  return {
    kind: VOLUME3D_PROJECTION_ID,
    adapterId: VOLUME3D_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    dataId: request.dataId,
    frameOfReferenceUID,
    presentation: {
      camera: cloneVolume3DCamera(camera),
      position: getVolume3DProjectionPosition(camera),
      rotation: camera.rotation,
      scale: getVolume3DProjectionScale({ camera, canvasHeight }),
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
