import { ActorRenderMode } from '../../../types';
import type { IImage, IImageVolume, Point2, Point3 } from '../../../types';
import clonePoint3 from '../../../utilities/clonePoint3';
import ResolvedViewportView from '../ResolvedViewportView';
import {
  canvasToWorldPlanarViewState,
  getCanvasCssDimensions,
  worldToCanvasPlanarViewState,
} from './planarAdapterCoordinateTransforms';
import {
  derivePlanarPresentation,
  resolvePlanarICamera,
} from './planarRenderCamera';
import {
  createPlanarCpuImageSliceBasis,
  createPlanarCpuVolumeSliceBasis,
  createPlanarImageSliceBasis,
  createPlanarVolumeSliceBasis,
  type PlanarSliceBasis,
  resolvePlanarVolumeImageIdIndex,
  shouldUsePlanarCpuVolumeSliceBasis,
} from './planarSliceBasis';
import {
  createDefaultPlanarViewState,
  normalizePlanarViewState,
} from './planarViewState';
import {
  normalizePlanarScale,
  type PlanarScaleInput,
} from './planarCameraScale';
import type {
  PlanarViewState,
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarRendering } from './planarRuntimeTypes';

type PlanarViewResolutionRenderContext = Partial<
  Pick<PlanarViewportRenderContext, 'cpu' | 'vtk'>
>;

type BasePlanarResolvedViewState = {
  viewState: PlanarViewState;
  canvasWidth: number;
  canvasHeight: number;
  frameOfReferenceUID?: string;
};

type PlanarStackResolvedViewState = BasePlanarResolvedViewState & {
  currentImageIdIndex: number;
  image: IImage;
  maxImageIdIndex: number;
  usePixelGridCenter: boolean;
};

type PlanarVolumeResolvedViewState = BasePlanarResolvedViewState & {
  currentImageIdIndex: number;
  imageVolume: IImageVolume;
  maxImageIdIndex: number;
  usePixelGridCenter: boolean;
};

export function resolvePlanarStackImageIdIndex(args: {
  fallbackImageIdIndex: number;
  viewState?: PlanarViewState;
}): number {
  const { fallbackImageIdIndex, viewState } = args;

  return viewState?.slice?.kind === 'stackIndex'
    ? viewState.slice.imageIdIndex
    : fallbackImageIdIndex;
}

function clonePoint2(point: Point2): Point2 {
  return [point[0], point[1]];
}

abstract class BasePlanarResolvedView<
  TState extends BasePlanarResolvedViewState,
> extends ResolvedViewportView<TState, PlanarResolvedICamera> {
  private cachedSliceBasis?: PlanarSliceBasis;
  private cachedPresentation?: ReturnType<typeof derivePlanarPresentation>;

  get pan(): Point2 {
    return clonePoint2(this.getPresentation().pan);
  }

  get zoom(): number {
    return this.getPresentation().zoom;
  }

  get scale(): Point2 {
    return clonePoint2(this.getPresentation().scale);
  }

  get rotation(): number {
    return this.getPresentation().rotation;
  }

  getSliceBasis(): PlanarSliceBasis {
    this.cachedSliceBasis ||= this.buildSliceBasis();

    return this.cachedSliceBasis;
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    return canvasToWorldPlanarViewState({
      camera: this.requireResolvedICamera(),
      canvasHeight: this.state.canvasHeight,
      canvasPos,
      canvasWidth: this.state.canvasWidth,
    });
  }

  worldToCanvas(worldPos: Point3): Point2 {
    return worldToCanvasPlanarViewState({
      camera: this.requireResolvedICamera(),
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      worldPos,
    });
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  withZoom(zoom: number, canvasPoint?: Point2): BasePlanarResolvedView<TState> {
    return this.withScale(zoom, canvasPoint);
  }

  withScale(
    scale: PlanarScaleInput,
    canvasPoint?: Point2
  ): BasePlanarResolvedView<TState> {
    const nextScale = normalizePlanarScale(scale);

    if (!canvasPoint) {
      return this.cloneWithViewState({
        ...this.state.viewState,
        displayArea: undefined,
        scale: nextScale,
        scaleMode: 'fit',
      });
    }

    const worldPoint = this.canvasToWorld(canvasPoint);

    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.canvasWidth, 1),
        canvasPoint[1] / Math.max(this.state.canvasHeight, 1),
      ],
      anchorWorld: worldPoint,
      displayArea: undefined,
      scale: nextScale,
      scaleMode: 'fit',
    });
  }

  withPan(pan: Point2): BasePlanarResolvedView<TState> {
    const currentPan = this.pan;
    const [anchorX, anchorY] = this.state.viewState.anchorCanvas ?? [0.5, 0.5];

    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorCanvas: [
        anchorX +
          (pan[0] - currentPan[0]) / Math.max(this.state.canvasWidth, 1),
        anchorY +
          (pan[1] - currentPan[1]) / Math.max(this.state.canvasHeight, 1),
      ],
      displayArea: undefined,
    });
  }

  flipHorizontal(): BasePlanarResolvedView<TState> {
    return this.cloneWithViewState({
      ...this.state.viewState,
      flipHorizontal: !this.state.viewState.flipHorizontal,
    });
  }

  flipVertical(): BasePlanarResolvedView<TState> {
    return this.cloneWithViewState({
      ...this.state.viewState,
      flipVertical: !this.state.viewState.flipVertical,
    });
  }

  indexToWorld(_index: Point3): Point3 | undefined {
    return;
  }

  protected buildICamera(): PlanarResolvedICamera {
    return resolvePlanarICamera({
      camera: this.state.viewState,
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      sliceBasis: this.getSliceBasis(),
    });
  }

  protected getPresentation() {
    this.cachedPresentation ||= derivePlanarPresentation({
      camera: this.state.viewState,
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      sliceBasis: this.getSliceBasis(),
    });

    return this.cachedPresentation;
  }

  protected requireResolvedICamera(): Required<
    Pick<
      PlanarResolvedICamera,
      'focalPoint' | 'parallelScale' | 'viewPlaneNormal' | 'viewUp'
    >
  > &
    Pick<PlanarResolvedICamera, 'presentationScale'> {
    const viewState = this.toICamera();

    if (
      !viewState.focalPoint ||
      typeof viewState.parallelScale !== 'number' ||
      !viewState.viewPlaneNormal ||
      !viewState.viewUp
    ) {
      throw new Error(
        '[PlanarResolvedView] Failed to compute planar viewState'
      );
    }

    return {
      focalPoint: clonePoint3(viewState.focalPoint),
      parallelScale: viewState.parallelScale,
      presentationScale: viewState.presentationScale
        ? clonePoint2(viewState.presentationScale)
        : undefined,
      viewPlaneNormal: clonePoint3(viewState.viewPlaneNormal),
      viewUp: clonePoint3(viewState.viewUp),
    };
  }

  protected createViewStateState(viewState: PlanarViewState): TState {
    return {
      ...this.state,
      viewState: normalizePlanarViewState(viewState),
    };
  }

  protected abstract buildSliceBasis(): PlanarSliceBasis;

  protected abstract cloneWithViewState(
    viewState: PlanarViewState
  ): BasePlanarResolvedView<TState>;
}

class PlanarStackResolvedView extends BasePlanarResolvedView<PlanarStackResolvedViewState> {
  constructor(
    state: Omit<PlanarStackResolvedViewState, 'viewState'> & {
      viewState?: PlanarViewState;
    }
  ) {
    super({
      ...state,
      viewState: normalizePlanarViewState(
        state.viewState || createDefaultPlanarViewState()
      ),
    });
  }

  protected buildSliceBasis(): PlanarSliceBasis {
    const args = {
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      image: this.state.image,
    };

    if (this.state.usePixelGridCenter) {
      return createPlanarCpuImageSliceBasis(args);
    }

    return createPlanarImageSliceBasis(args);
  }

  protected cloneWithViewState(
    viewState: PlanarViewState
  ): PlanarStackResolvedView {
    return new PlanarStackResolvedView(this.createViewStateState(viewState));
  }
}

class PlanarVolumeResolvedView extends BasePlanarResolvedView<PlanarVolumeResolvedViewState> {
  constructor(
    state: Omit<PlanarVolumeResolvedViewState, 'viewState'> & {
      viewState?: PlanarViewState;
    }
  ) {
    super({
      ...state,
      viewState: normalizePlanarViewState(
        state.viewState || createDefaultPlanarViewState()
      ),
    });
  }

  indexToWorld(index: Point3): Point3 | undefined {
    return this.state.imageVolume.imageData?.indexToWorld(index) as
      | Point3
      | undefined;
  }

  protected buildSliceBasis(): PlanarSliceBasis {
    const createSliceBasis = this.state.usePixelGridCenter
      ? createPlanarCpuVolumeSliceBasis
      : createPlanarVolumeSliceBasis;

    return createSliceBasis({
      viewState: this.state.viewState,
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      imageIdIndex: resolvePlanarVolumeImageIdIndex({
        viewState: this.state.viewState,
        fallbackImageIdIndex: this.state.currentImageIdIndex,
      }),
      imageVolume: this.state.imageVolume,
      orientation: this.state.viewState.orientation,
    }).sliceBasis;
  }

  protected cloneWithViewState(
    viewState: PlanarViewState
  ): PlanarVolumeResolvedView {
    return new PlanarVolumeResolvedView(this.createViewStateState(viewState));
  }
}

function getCurrentSliceIndex(rendering: PlanarRendering): number {
  return rendering.currentImageIdIndex;
}

export function getPlanarViewStateCanvasDimensions(args: {
  rendering: PlanarRendering;
  renderContext: PlanarViewResolutionRenderContext;
}): {
  canvasHeight: number;
  canvasWidth: number;
} {
  const { renderContext, rendering } = args;

  if (
    rendering.renderMode === ActorRenderMode.CPU_IMAGE ||
    rendering.renderMode === ActorRenderMode.CPU_VOLUME
  ) {
    if (!renderContext.cpu) {
      throw new Error(
        '[PlanarResolvedView] CPU render paths require a CPU canvas context'
      );
    }

    return getCanvasCssDimensions(renderContext.cpu.canvas);
  }

  if (!renderContext.vtk) {
    throw new Error(
      '[PlanarResolvedView] VTK render paths require a VTK canvas context'
    );
  }

  return {
    canvasHeight:
      renderContext.vtk.canvas.clientHeight || renderContext.vtk.canvas.height,
    canvasWidth:
      renderContext.vtk.canvas.clientWidth || renderContext.vtk.canvas.width,
  };
}

export function resolvePlanarViewportView(args: {
  viewState: PlanarViewState;
  data?: PlanarPayload;
  frameOfReferenceUID?: string;
  imageIds?: string[];
  rendering?: PlanarRendering;
  renderContext: PlanarViewResolutionRenderContext;
  sliceIndex?: number;
}): PlanarStackResolvedView | PlanarVolumeResolvedView | undefined {
  const {
    data,
    frameOfReferenceUID,
    imageIds,
    renderContext,
    rendering,
    sliceIndex,
  } = args;

  if (!rendering) {
    return;
  }

  const { canvasHeight, canvasWidth } = getPlanarViewStateCanvasDimensions({
    renderContext,
    rendering,
  });
  const requestedViewState = args.viewState;

  if (
    rendering.renderMode === ActorRenderMode.CPU_IMAGE ||
    rendering.renderMode === ActorRenderMode.VTK_IMAGE
  ) {
    const image =
      (rendering.renderMode === ActorRenderMode.CPU_IMAGE
        ? rendering.enabledElement?.image
        : rendering.currentImage) || data?.image;

    if (!image) {
      return;
    }

    const currentImageIdIndex = resolvePlanarStackImageIdIndex({
      fallbackImageIdIndex: getCurrentSliceIndex(rendering),
      viewState: requestedViewState,
    });
    const imageIdCount = imageIds?.length ?? data?.imageIds.length;
    const maxImageIdIndex =
      typeof imageIdCount === 'number' && imageIdCount > 0
        ? imageIdCount - 1
        : Math.max(currentImageIdIndex, getCurrentSliceIndex(rendering), 0);

    return new PlanarStackResolvedView({
      viewState: requestedViewState,
      canvasHeight,
      canvasWidth,
      currentImageIdIndex,
      frameOfReferenceUID,
      image,
      maxImageIdIndex,
      usePixelGridCenter: rendering.renderMode === ActorRenderMode.CPU_IMAGE,
    });
  }

  if (
    rendering.renderMode === ActorRenderMode.CPU_VOLUME ||
    rendering.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
  ) {
    const resolvedViewState =
      typeof sliceIndex === 'number'
        ? {
            ...requestedViewState,
            slice: {
              kind: 'stackIndex' as const,
              imageIdIndex: sliceIndex,
            },
          }
        : requestedViewState;
    const createSliceBasis = shouldUsePlanarCpuVolumeSliceBasis(
      rendering.dataPresentation?.interpolationType
    )
      ? createPlanarCpuVolumeSliceBasis
      : createPlanarVolumeSliceBasis;
    const resolvedImageIdIndex =
      typeof sliceIndex === 'number'
        ? sliceIndex
        : resolvePlanarVolumeImageIdIndex({
            viewState: resolvedViewState,
            fallbackImageIdIndex: rendering.currentImageIdIndex,
          });
    const { currentImageIdIndex, maxImageIdIndex } = createSliceBasis({
      viewState: resolvedViewState,
      canvasHeight,
      canvasWidth,
      imageIdIndex: resolvedImageIdIndex,
      imageVolume: rendering.imageVolume,
      orientation: resolvedViewState.orientation,
    });

    return new PlanarVolumeResolvedView({
      viewState: resolvedViewState,
      canvasHeight,
      canvasWidth,
      currentImageIdIndex,
      frameOfReferenceUID,
      imageVolume: rendering.imageVolume,
      maxImageIdIndex,
      usePixelGridCenter:
        rendering.renderMode === ActorRenderMode.CPU_VOLUME &&
        shouldUsePlanarCpuVolumeSliceBasis(
          rendering.dataPresentation?.interpolationType
        ),
    });
  }
}

export type {
  BasePlanarResolvedViewState,
  PlanarStackResolvedViewState,
  PlanarViewResolutionRenderContext,
  PlanarVolumeResolvedViewState,
};
export {
  BasePlanarResolvedView,
  PlanarStackResolvedView,
  PlanarVolumeResolvedView,
};
