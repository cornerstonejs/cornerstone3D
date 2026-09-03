import type { Point2, Point3 } from '../../../types';
import type { ProjectionScale } from '../ViewportProjectionTypes';
import {
  VIDEO_PROJECTION_ID,
  type VideoProjectionRequest,
  type VideoProjectionSnapshot,
} from './VideoProjectionTypes';
import { normalizeVideoViewState } from './videoViewportCamera';
import type { VideoViewState } from './VideoViewportTypes';

/**
 * Clones a canvas-space point so projection snapshots cannot leak mutable
 * tuple references from resolved views.
 */
function clonePoint2(point: Point2): Point2 {
  return [point[0], point[1]];
}

/**
 * Derives intrinsic media-pixel density from the resolved canvas transform.
 */
function getMediaPixelsPerCanvasPixel(
  resolvedView: NonNullable<VideoProjectionSnapshot['resolvedView']>
): number {
  const origin = resolvedView.canvasToWorld([0, 0]);
  const next = resolvedView.canvasToWorld([1, 0]);

  return Math.abs(next[0] - origin[0]) || 1;
}

/**
 * Returns the best available Video projection scale for the snapshot.
 */
function getScale(
  resolvedView: VideoProjectionSnapshot['resolvedView'],
  zoom: number
): ProjectionScale {
  if (!resolvedView) {
    return { kind: 'fit', value: zoom };
  }

  return {
    kind: 'nativePixel',
    pixelsPerCanvasPixel: getMediaPixelsPerCanvasPixel(resolvedView),
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
 * Resolves the media-space point displayed at the requested canvas point.
 */
function getCenterMediaPoint(
  resolvedView: VideoProjectionSnapshot['resolvedView'],
  canvasPoint: Point2,
  viewState: VideoViewState
): Point2 {
  if (resolvedView) {
    const worldPoint = resolvedView.canvasToWorld(canvasPoint);

    return [worldPoint[0], worldPoint[1]];
  }

  return viewState.anchorWorld ? clonePoint2(viewState.anchorWorld) : [0, 0];
}

/**
 * Builds the media-space Video projection snapshot for a viewport-like object.
 */
export function getVideoProjectionSnapshot(
  request: VideoProjectionRequest
): VideoProjectionSnapshot | undefined {
  const { viewport } = request;
  const viewState = normalizeVideoViewState(
    request.viewState ?? viewport.getViewState?.() ?? {}
  );
  const resolvedView = request.resolvedView ?? viewport.getResolvedView?.();
  const canvasWidth =
    request.canvasWidth ??
    resolvedView?.state?.containerWidth ??
    viewport.element?.clientWidth ??
    1;
  const canvasHeight =
    request.canvasHeight ??
    resolvedView?.state?.containerHeight ??
    viewport.element?.clientHeight ??
    1;
  const canvasPoint = getCenterCanvasPoint(canvasWidth, canvasHeight);
  const mediaPoint = getCenterMediaPoint(resolvedView, canvasPoint, viewState);
  const zoom = resolvedView?.zoom ?? Math.max(viewState.scale ?? 1, 0.001);
  const rawPan = resolvedView?.pan ?? [0, 0];
  const rendererCamera = resolvedView?.toICamera();
  const frameOfReferenceUID =
    request.frameOfReferenceUID ??
    resolvedView?.getFrameOfReferenceUID() ??
    viewport.getFrameOfReferenceUID?.();

  return {
    kind: VIDEO_PROJECTION_ID,
    adapterId: VIDEO_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    dataId: request.dataId,
    frameOfReferenceUID,
    presentation: {
      pan: clonePoint2(rawPan),
      position: {
        kind: 'mediaPoint',
        mediaPoint,
        canvasPoint,
      },
      rawPan: clonePoint2(rawPan),
      rotation: resolvedView?.rotation ?? viewState.rotation ?? 0,
      scale: getScale(resolvedView, zoom),
      zoom,
    },
    rendererCamera,
    resolvedView,
    spaces: {
      canvas: true,
      image: false,
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
