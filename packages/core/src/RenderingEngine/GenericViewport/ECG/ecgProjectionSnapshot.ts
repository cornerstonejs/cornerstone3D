import type { Point2, Point3 } from '../../../types';
import type { ProjectionScale } from '../ViewportProjectionTypes';
import {
  ECG_PROJECTION_ID,
  type ECGProjectionRequest,
  type ECGProjectionSnapshot,
} from './ECGProjectionTypes';
import { normalizeECGViewState } from './ecgViewportCamera';

/**
 * Clones a canvas-space point so projection snapshots cannot leak mutable
 * tuple references from resolved views.
 */
function clonePoint2(point: Point2): Point2 {
  return [point[0], point[1]];
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
 * Derives signal-space sampling density from the resolved canvas transform.
 *
 * The finite difference starts at `canvasPoint`, which is the centre of the
 * canvas, and not at the canvas origin. `canvasToWorld` clamps a sample index
 * to the signal, and the ECG content is centred, so the canvas origin normally
 * lies outside the drawn content. Both samples then clamped to sample 0 and the
 * reported density was 0.
 */
function getSignalScale(
  resolvedView: NonNullable<ECGProjectionSnapshot['resolvedView']>,
  canvasPoint: Point2
): ProjectionScale {
  const origin = resolvedView.canvasToWorld(canvasPoint);
  const nextSample = resolvedView.canvasToWorld([
    canvasPoint[0] + 1,
    canvasPoint[1],
  ]);
  const nextValue = resolvedView.canvasToWorld([
    canvasPoint[0],
    canvasPoint[1] + 1,
  ]);

  return {
    kind: 'signal',
    samplesPerCanvasPixel: Math.abs(nextSample[0] - origin[0]) || 0,
    valueUnitsPerCanvasPixel: Math.abs(nextValue[1] - origin[1]) || 0,
  };
}

/**
 * Returns the best available ECG projection scale for the snapshot.
 */
function getScale(
  resolvedView: ECGProjectionSnapshot['resolvedView'],
  zoom: number,
  canvasPoint: Point2
): ProjectionScale {
  if (!resolvedView) {
    return { kind: 'fit', value: zoom };
  }

  return getSignalScale(resolvedView, canvasPoint);
}

/**
 * Converts an ECG world tuple into a tagged signal projection position.
 */
function getSignalPosition(
  worldPoint: Point3 | undefined,
  canvasPoint: Point2
): ECGProjectionSnapshot['presentation']['position'] | undefined {
  if (!worldPoint) {
    return;
  }

  return {
    kind: 'signalPoint',
    sampleIndex: worldPoint[0],
    value: worldPoint[1],
    channelIndex: worldPoint[2],
    canvasPoint,
  };
}

/**
 * Builds the signal-space ECG projection snapshot for a viewport-like object.
 */
export function getECGProjectionSnapshot(
  request: ECGProjectionRequest
): ECGProjectionSnapshot | undefined {
  const { viewport } = request;
  const currentViewState = request.viewState ?? viewport.getViewState?.();

  if (!currentViewState) {
    return;
  }

  const viewState = normalizeECGViewState(currentViewState);
  const resolvedView = request.resolvedView ?? viewport.getResolvedView?.();
  const canvasWidth =
    request.canvasWidth ??
    resolvedView?.state?.canvas?.clientWidth ??
    viewport.canvas?.clientWidth ??
    viewport.element?.clientWidth ??
    1;
  const canvasHeight =
    request.canvasHeight ??
    resolvedView?.state?.canvas?.clientHeight ??
    viewport.canvas?.clientHeight ??
    viewport.element?.clientHeight ??
    1;
  const canvasPoint = getCenterCanvasPoint(canvasWidth, canvasHeight);
  const signalPoint = resolvedView?.canvasToWorld(canvasPoint);
  const zoom = resolvedView?.zoom ?? Math.max(viewState.scale ?? 1, 0.001);
  const rawPan = resolvedView?.pan ?? [0, 0];
  const rendererCamera = resolvedView?.toICamera();
  const frameOfReferenceUID =
    request.frameOfReferenceUID ??
    resolvedView?.getFrameOfReferenceUID() ??
    viewport.getFrameOfReferenceUID?.();

  return {
    kind: ECG_PROJECTION_ID,
    adapterId: ECG_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    dataId: request.dataId,
    frameOfReferenceUID,
    presentation: {
      pan: clonePoint2(rawPan),
      position: getSignalPosition(signalPoint, canvasPoint),
      rawPan: clonePoint2(rawPan),
      scale: getScale(resolvedView, zoom, canvasPoint),
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
