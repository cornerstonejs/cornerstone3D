import type { Point2 } from '../../../types';
import {
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

export interface PlanarRenderPathProjection {
  activeSourceICamera: PlanarResolvedICamera;
  currentImageIdIndex: number;
  isSourceBinding: boolean;
  maxImageIdIndex: number;
  presentation: DerivedPlanarPresentation;
  resolvedICamera: PlanarResolvedICamera;
  resolvedView: PlanarProjectionResolvedView;
}

export function resolvePlanarStackImageIdIndex(args: {
  fallbackImageIdIndex: number;
  viewState?: PlanarViewState;
}): number {
  const { fallbackImageIdIndex, viewState } = args;

  return viewState?.slice?.kind === 'stackIndex'
    ? viewState.slice.imageIdIndex
    : fallbackImageIdIndex;
}

export function resolvePlanarRenderPathProjection(args: {
  ctx: PlanarRenderPathProjectionContext;
  data?: PlanarPayload;
  dataId: string;
  frameOfReferenceUID?: string;
  rendering: PlanarRendering;
  sliceIndex?: number;
  viewState?: PlanarViewState;
}): PlanarRenderPathProjection | undefined {
  const {
    ctx,
    data,
    dataId,
    frameOfReferenceUID,
    rendering,
    sliceIndex,
    viewState = {},
  } = args;
  const resolvedView = resolvePlanarViewportView({
    viewState,
    data,
    frameOfReferenceUID,
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

  return {
    activeSourceICamera: isSourceBinding
      ? resolvedICamera
      : ctx.view.activeSourceICamera || resolvedICamera,
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
