import { ActorRenderMode } from '../../../types';
import type { Point2, Point3 } from '../../../types';
import {
  canvasToWorldPlanarViewState,
  getCanvasCssDimensions,
  worldToCanvasPlanarViewState,
} from './planarAdapterCoordinateTransforms';
import {
  resolvePlanarStackImageIdIndex,
  resolvePlanarViewportView,
  type PlanarViewResolutionRenderContext,
} from './PlanarResolvedView';
import type { DerivedPlanarPresentation } from './planarRenderCamera';
import type {
  PlanarActiveViewRuntime,
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewState,
} from './PlanarViewportTypes';
import type { PlanarRendering } from './planarRuntimeTypes';

type PlanarRenderPathProjectionContext = PlanarViewResolutionRenderContext & {
  viewport: {
    isCurrentDataId(dataId: string): boolean;
  };
  view: PlanarActiveViewRuntime;
};

type PlanarProjectionResolvedView = NonNullable<
  ReturnType<typeof resolvePlanarViewportView>
>;

export type PlanarRenderPathProjectionCamera = PlanarResolvedICamera &
  Required<
    Pick<
      PlanarResolvedICamera,
      'focalPoint' | 'parallelScale' | 'viewPlaneNormal' | 'viewUp'
    >
  >;

export interface PlanarRenderPathProjection {
  activeSourceICamera: PlanarResolvedICamera;
  currentImageIdIndex: number;
  isSourceBinding: boolean;
  maxImageIdIndex: number;
  presentation: DerivedPlanarPresentation;
  resolvedICamera: PlanarResolvedICamera;
  resolvedView: PlanarProjectionResolvedView;
}

export { resolvePlanarStackImageIdIndex };

export function resolvePlanarRenderPathCurrentImageIdIndex(args: {
  projection?: PlanarRenderPathProjection;
  rendering: Pick<PlanarRendering, 'currentImageIdIndex' | 'renderMode'>;
  viewState?: PlanarViewState;
}): number {
  const { projection, rendering, viewState } = args;

  if (projection) {
    return projection.currentImageIdIndex;
  }

  if (
    rendering.renderMode === ActorRenderMode.CPU_IMAGE ||
    rendering.renderMode === ActorRenderMode.VTK_IMAGE
  ) {
    return resolvePlanarStackImageIdIndex({
      fallbackImageIdIndex: rendering.currentImageIdIndex,
      viewState,
    });
  }

  return rendering.currentImageIdIndex;
}

export function getPlanarRenderPathActiveSourceICamera(args: {
  view: PlanarActiveViewRuntime;
}): PlanarRenderPathProjectionCamera | undefined {
  const activeSourceICamera = args.view.activeSourceICamera;

  if (
    !activeSourceICamera?.focalPoint ||
    typeof activeSourceICamera.parallelScale !== 'number' ||
    !activeSourceICamera.viewPlaneNormal ||
    !activeSourceICamera.viewUp
  ) {
    return;
  }

  return activeSourceICamera as PlanarRenderPathProjectionCamera;
}

export function canvasToWorldPlanarRenderPathProjection(args: {
  canvas: HTMLCanvasElement;
  canvasPos: Point2;
  ctx: Pick<PlanarRenderPathProjectionContext, 'view'>;
}): Point3 {
  const activeSourceICamera = getPlanarRenderPathActiveSourceICamera(args.ctx);

  if (!activeSourceICamera) {
    return [0, 0, 0];
  }

  const { canvasWidth, canvasHeight } = getCanvasCssDimensions(args.canvas);

  return canvasToWorldPlanarViewState({
    camera: activeSourceICamera,
    canvasWidth,
    canvasHeight,
    canvasPos: args.canvasPos,
  });
}

export function worldToCanvasPlanarRenderPathProjection(args: {
  canvas: HTMLCanvasElement;
  ctx: Pick<PlanarRenderPathProjectionContext, 'view'>;
  worldPos: Point3;
}): Point2 {
  const activeSourceICamera = getPlanarRenderPathActiveSourceICamera(args.ctx);

  if (!activeSourceICamera) {
    return [0, 0];
  }

  const { canvasWidth, canvasHeight } = getCanvasCssDimensions(args.canvas);

  return worldToCanvasPlanarViewState({
    camera: activeSourceICamera,
    canvasWidth,
    canvasHeight,
    worldPos: args.worldPos,
  });
}

export function resolvePlanarRenderPathProjection(args: {
  ctx: PlanarRenderPathProjectionContext;
  data?: PlanarPayload;
  dataId: string;
  frameOfReferenceUID?: string;
  imageIds?: string[];
  rendering: PlanarRendering;
  sliceIndex?: number;
  viewState?: PlanarViewState;
}): PlanarRenderPathProjection | undefined {
  const {
    ctx,
    data,
    dataId,
    frameOfReferenceUID,
    imageIds,
    rendering,
    sliceIndex,
    viewState = {},
  } = args;
  const resolvedView = resolvePlanarViewportView({
    viewState,
    data,
    frameOfReferenceUID,
    imageIds,
    rendering,
    renderContext: ctx,
    sliceIndex,
  });

  if (!resolvedView) {
    return;
  }

  const resolvedICamera = resolvedView.toICamera();
  const isSourceBinding = ctx.viewport.isCurrentDataId(dataId);

  if (isSourceBinding) {
    ctx.view.activeSourceICamera = resolvedICamera;
  }

  const activeSourceICamera = isSourceBinding
    ? resolvedICamera
    : getPlanarRenderPathActiveSourceICamera(ctx) || resolvedICamera;

  return {
    activeSourceICamera,
    currentImageIdIndex: resolvedView.state.currentImageIdIndex,
    isSourceBinding,
    maxImageIdIndex: resolvedView.state.maxImageIdIndex,
    presentation: getPlanarResolvedViewPresentation(resolvedView),
    resolvedICamera,
    resolvedView,
  };
}

function getPlanarResolvedViewPresentation(
  resolvedView: PlanarProjectionResolvedView
): DerivedPlanarPresentation {
  return {
    pan: resolvedView.pan,
    zoom: resolvedView.zoom,
    scale: resolvedView.scale as Point2,
    rotation: resolvedView.rotation,
    flipHorizontal: resolvedView.state.viewState.flipHorizontal ?? false,
    flipVertical: resolvedView.state.viewState.flipVertical ?? false,
  };
}
