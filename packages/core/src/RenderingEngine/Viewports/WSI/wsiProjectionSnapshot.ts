import type { Point2, Point3 } from '../../../types';
import type { ProjectionScale } from '../ViewportProjectionTypes';
import {
  WSI_PROJECTION_ID,
  type WSIProjectionRequest,
  type WSIProjectionSnapshot,
  type WSIResolvedViewLike,
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
 * The zoom of the view against the fit, as on every family: the resolution
 * at which the microscopy viewer fits the slide over the resolution of the
 * map, 1 at the fit and 2 when the slide shows twice as large. Undefined
 * without a fit.
 */
function getZoomAgainstFit(
  resolvedView: WSIResolvedViewLike | undefined,
  viewState: WSIViewState
): number | undefined {
  const fitResolution = resolvedView?.state?.fitResolution;
  const resolution =
    resolvedView?.state?.view?.getResolution?.() ?? viewState.resolution;

  if (!fitResolution || !resolution) {
    return;
  }

  return fitResolution / resolution;
}

/**
 * Builds the WSI projection snapshot for a viewport-like object. The zoom of
 * its presentation is a factor against the fit, see `getZoomAgainstFit`.
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
  const zoom = getZoomAgainstFit(resolvedView, viewState);
  const rotation = viewState.rotation ?? 0;
  const rawPan = resolvedView?.pan ?? [0, 0];
  const frameOfReferenceUID =
    request.frameOfReferenceUID ??
    resolvedView?.getFrameOfReferenceUID() ??
    viewport.getFrameOfReferenceUID?.();

  return {
    kind: WSI_PROJECTION_ID,
    adapterId: WSI_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    displaySetId: request.displaySetId,
    frameOfReferenceUID,
    presentation: {
      position: {
        kind: 'anchor',
        worldPoint,
        canvasPoint: clonePoint2(canvasPoint),
      },
      pan: clonePoint2(rawPan),
      rawPan: clonePoint2(rawPan),
      rotation,
      scale: getScale({ canvasHeight, rendererCamera, zoom: zoom ?? 1 }),
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
