import type { ICamera, Point2, Point3 } from '../../../types';
import type DisplayArea from '../../../types/displayArea';
import type { ProjectionScale } from '../ViewportProjectionTypes';
import { clonePlanarScale, getPlanarScaleZoom } from './planarCameraScale';
import { getPlanarProjectionFallbackPan } from './planarProjectionFallback';
import {
  PLANAR_PROJECTION_ID,
  type PlanarProjectionRequest,
  type PlanarProjectionSnapshot,
} from './PlanarProjectionTypes';
import { normalizePlanarRotation } from './planarViewPresentation';
import { cloneDisplayArea, normalizePlanarViewState } from './planarViewState';
import type { PlanarDisplayArea, PlanarViewState } from './PlanarViewportTypes';

function clonePoint2(point: Point2): Point2 {
  return [point[0], point[1]];
}

function clonePoint3(point: Point3): Point3 {
  return [point[0], point[1], point[2]];
}

function getProjectionScale(args: {
  displayArea?: PlanarDisplayArea;
  scaleMode?: PlanarViewState['scaleMode'];
  zoom: number;
}): ProjectionScale {
  const { displayArea, scaleMode, zoom } = args;

  if (displayArea) {
    return {
      kind: 'displayArea',
      value: zoom,
      area: displayArea as unknown as DisplayArea,
    };
  }

  if (scaleMode === 'fitWidth') {
    return { kind: 'fitWidth', value: zoom };
  }

  if (scaleMode === 'fitHeight') {
    return { kind: 'fitHeight', value: zoom };
  }

  return { kind: 'fit', value: zoom };
}

function getProjectionPosition(
  viewState: PlanarViewState,
  rendererCamera?: ICamera<unknown>
) {
  if (viewState.anchorWorld) {
    return {
      kind: 'anchor' as const,
      worldPoint: clonePoint3(viewState.anchorWorld),
      canvasPoint: clonePoint2(viewState.anchorCanvas ?? [0.5, 0.5]),
    };
  }

  if (rendererCamera?.focalPoint) {
    return {
      kind: 'focalPoint' as const,
      worldPoint: clonePoint3(rendererCamera.focalPoint as Point3),
    };
  }

  return {
    kind: 'anchor' as const,
    canvasPoint: clonePoint2(viewState.anchorCanvas ?? [0.5, 0.5]),
  };
}

/**
 * Builds the capability-based Planar projection snapshot for a viewport-like
 * object or an explicit view-state request.
 */
export function getPlanarProjectionSnapshot(
  request: PlanarProjectionRequest
): PlanarProjectionSnapshot | undefined {
  const { viewport } = request;
  const viewState = normalizePlanarViewState(
    request.viewState ?? viewport.getViewState?.() ?? {}
  );
  const resolvedView =
    request.resolvedView ??
    (request.viewState && request.resolveViewState
      ? request.resolveViewState(viewState)
      : viewport.getResolvedView?.({
          frameOfReferenceUID: request.frameOfReferenceUID,
          sliceIndex: request.sliceIndex,
        }));
  const canvasWidth =
    request.canvasWidth ??
    resolvedView?.state.canvasWidth ??
    viewport.element?.clientWidth ??
    1;
  const canvasHeight =
    request.canvasHeight ??
    resolvedView?.state.canvasHeight ??
    viewport.element?.clientHeight ??
    1;
  const displayArea =
    request.displayArea ?? viewport.getDisplayArea?.() ?? viewState.displayArea;
  const scaleVector = resolvedView?.scale ?? clonePlanarScale(viewState.scale);
  const zoom = resolvedView?.zoom ?? getPlanarScaleZoom(viewState.scale);
  const rawPan =
    resolvedView?.pan ??
    getPlanarProjectionFallbackPan(viewState, canvasWidth, canvasHeight);
  const rendererCamera = resolvedView?.toICamera();
  const frameOfReferenceUID =
    request.frameOfReferenceUID ??
    resolvedView?.getFrameOfReferenceUID() ??
    viewport.getFrameOfReferenceUID?.();

  return {
    kind: PLANAR_PROJECTION_ID,
    adapterId: PLANAR_PROJECTION_ID,
    canvasHeight,
    canvasWidth,
    dataId: request.dataId,
    displayArea: cloneDisplayArea(displayArea),
    frameOfReferenceUID,
    presentation: {
      displayArea: cloneDisplayArea(displayArea),
      flipHorizontal: viewState.flipHorizontal === true,
      flipVertical: viewState.flipVertical === true,
      pan: clonePoint2(rawPan),
      position: getProjectionPosition(viewState, rendererCamera),
      rawPan: clonePoint2(rawPan),
      rotation:
        resolvedView?.rotation ?? normalizePlanarRotation(viewState.rotation),
      scale: getProjectionScale({
        displayArea,
        scaleMode: viewState.scaleMode,
        zoom,
      }),
      scaleVector: clonePoint2(scaleVector),
      zoom,
    },
    rendererCamera,
    resolveViewState: request.resolveViewState,
    resolvedView,
    spaces: {
      canvas: true,
      image: true,
      renderer: Boolean(rendererCamera),
      world: Boolean(resolvedView),
    },
    transforms: resolvedView
      ? {
          canvasToWorld: (point) => resolvedView.canvasToWorld(point),
          worldToCanvas: (point) => resolvedView.worldToCanvas(point),
        }
      : undefined,
    viewState,
    viewportType: viewport.type,
  };
}

/**
 * Reads the legacy uniform zoom value from a Planar projection snapshot.
 */
export function getPlanarProjectionZoom(
  snapshot: PlanarProjectionSnapshot
): number {
  return snapshot.presentation.zoom ?? 1;
}

/**
 * Reads the native two-axis Planar scale from a projection snapshot.
 */
export function getPlanarProjectionScale(
  snapshot: PlanarProjectionSnapshot
): Point2 {
  return clonePoint2(snapshot.presentation.scaleVector);
}

/**
 * Reads raw canvas-space pan from a projection snapshot.
 */
export function getPlanarProjectionPan(
  snapshot: PlanarProjectionSnapshot
): Point2 {
  return clonePoint2(snapshot.presentation.rawPan);
}
