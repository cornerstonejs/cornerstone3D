import type { Point2, Point3 } from '../../../types';
import type { ProjectionScale } from '../ViewportProjectionTypes';
import {
  WSI_PROJECTION_ID,
  type WSIProjectionRequest,
  type WSIProjectionSnapshot,
} from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

/**
 * Clones a canvas-space point so snapshots do not expose mutable tuples.
 */
function clonePoint2(point: Point2): Point2 {
  return [point[0], point[1]];
}

/**
 * Returns a normalized WSI view state suitable for projection snapshots.
 */
function normalizeWSIProjectionViewState(
  viewState: WSIViewState
): WSIViewState {
  return {
    ...viewState,
    centerIndex: viewState.centerIndex
      ? [viewState.centerIndex[0], viewState.centerIndex[1]]
      : undefined,
    resolution:
      typeof viewState.resolution === 'number'
        ? Math.max(viewState.resolution, 0.000001)
        : undefined,
    rotation: viewState.rotation ?? 0,
    zoom: Math.max(viewState.zoom ?? 1, 0.001),
  };
}

/**
 * Returns the center canvas point used as the default projection anchor.
 */
function getCenterCanvasPoint(
  canvasWidth: number,
  canvasHeight: number
): Point2 {
  return [canvasWidth / 2, canvasHeight / 2];
}

/**
 * Derives the physical world scale from a renderer-compatible WSI camera.
 * WSI camera compatibility has historically stored the full viewport height in
 * `parallelScale`, not VTK's half-height parallel-scale convention.
 */
function getScale(args: {
  canvasHeight: number;
  rendererCamera?: WSIProjectionSnapshot['rendererCamera'];
  zoom: number;
}): ProjectionScale {
  const { canvasHeight, rendererCamera, zoom } = args;

  if (typeof rendererCamera?.parallelScale === 'number') {
    return {
      kind: 'physical',
      mmPerCanvasPixel:
        rendererCamera.parallelScale / Math.max(canvasHeight, 1),
    };
  }

  return { kind: 'fit', value: zoom };
}

/**
 * Builds the WSI projection snapshot for a viewport-like object.
 */
export function getWSIProjectionSnapshot(
  request: WSIProjectionRequest
): WSIProjectionSnapshot | undefined {
  const { viewport } = request;
  const currentViewState = request.viewState ?? viewport.getViewState?.();

  if (!currentViewState) {
    return;
  }

  const viewState = normalizeWSIProjectionViewState(currentViewState);
  const resolvedView = request.resolvedView ?? viewport.getResolvedView?.();
  const canvasWidth =
    request.canvasWidth ??
    resolvedView?.state?.canvasWidth ??
    viewport.element?.clientWidth ??
    1;
  const canvasHeight =
    request.canvasHeight ??
    resolvedView?.state?.canvasHeight ??
    viewport.element?.clientHeight ??
    1;
  const canvasPoint = getCenterCanvasPoint(canvasWidth, canvasHeight);
  const worldPoint = resolvedView?.canvasToWorld(canvasPoint);
  const rendererCamera = resolvedView?.toICamera();
  const view = resolvedView?.state?.view;
  const zoom = Math.max(view?.getZoom?.() ?? viewState.zoom ?? 1, 0.001);
  const rotation = view?.getRotation?.() ?? viewState.rotation ?? 0;
  const frameOfReferenceUID =
    request.frameOfReferenceUID ??
    resolvedView?.getFrameOfReferenceUID() ??
    viewport.getFrameOfReferenceUID?.();

  return {
    kind: WSI_PROJECTION_ID,
    adapterId: WSI_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    dataId: request.dataId,
    frameOfReferenceUID,
    presentation: {
      position: {
        kind: 'anchor',
        worldPoint,
        canvasPoint: clonePoint2(canvasPoint),
      },
      rotation,
      scale: getScale({ canvasHeight, rendererCamera, zoom }),
      zoom,
    },
    rendererCamera,
    resolvedView,
    spaces: {
      canvas: Boolean(resolvedView),
      image: true,
      renderer: Boolean(rendererCamera),
      world: Boolean(resolvedView),
    },
    transforms: resolvedView
      ? {
          canvasToWorld: (point) => resolvedView.canvasToWorld(point),
          worldToCanvas: (point: Point3) => resolvedView.worldToCanvas(point),
        }
      : undefined,
    viewState,
    viewportType: viewport.type,
  };
}
