import type {
  ICamera,
  IImage,
  IImageVolume,
  Point2,
  Point3,
} from '../../../types';
import ViewportComputedCamera from '../ViewportComputedCamera';
import {
  canvasToWorldPlanarCamera,
  getCanvasCssDimensions,
  worldToCanvasPlanarCamera,
} from './planarAdapterCoordinateTransforms';
import {
  derivePlanarPresentation,
  resolvePlanarRenderCamera,
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
  createDefaultPlanarCamera,
  normalizePlanarCamera,
} from './planarViewportCamera';
import type {
  PlanarCamera,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarRendering } from './planarRuntimeTypes';

type BasePlanarViewportCameraState = {
  camera: PlanarCamera;
  canvasWidth: number;
  canvasHeight: number;
  frameOfReferenceUID?: string;
};

type PlanarStackViewportCameraState = BasePlanarViewportCameraState & {
  currentImageIdIndex: number;
  image: IImage;
  maxImageIdIndex: number;
  usePixelGridCenter: boolean;
};

type PlanarVolumeViewportCameraState = BasePlanarViewportCameraState & {
  currentImageIdIndex: number;
  imageVolume: IImageVolume;
  maxImageIdIndex: number;
  usePixelGridCenter: boolean;
};

function clonePoint2(point: Point2): Point2 {
  return [point[0], point[1]];
}

function clonePoint3(point: Point3): Point3 {
  return [point[0], point[1], point[2]];
}

abstract class BasePlanarViewportCamera<
  TState extends BasePlanarViewportCameraState,
> extends ViewportComputedCamera<TState> {
  private cachedSliceBasis?: PlanarSliceBasis;
  private cachedPresentation?: ReturnType<typeof derivePlanarPresentation>;

  get pan(): Point2 {
    return clonePoint2(this.getPresentation().pan);
  }

  get zoom(): number {
    return this.getPresentation().zoom;
  }

  get rotation(): number {
    return this.getPresentation().rotation;
  }

  getSliceBasis(): PlanarSliceBasis {
    this.cachedSliceBasis ||= this.buildSliceBasis();

    return this.cachedSliceBasis;
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    return canvasToWorldPlanarCamera({
      camera: this.requireResolvedICamera(),
      canvasHeight: this.state.canvasHeight,
      canvasPos,
      canvasWidth: this.state.canvasWidth,
    });
  }

  worldToCanvas(worldPos: Point3): Point2 {
    return worldToCanvasPlanarCamera({
      camera: this.requireResolvedICamera(),
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      worldPos,
    });
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  withZoom(
    zoom: number,
    canvasPoint?: Point2
  ): BasePlanarViewportCamera<TState> {
    const nextZoom = Math.max(zoom, 0.001);

    if (!canvasPoint) {
      return this.cloneWithCamera({
        ...this.state.camera,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }

    const worldPoint = this.canvasToWorld(canvasPoint);

    return this.cloneWithCamera({
      ...this.state.camera,
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.canvasWidth, 1),
        canvasPoint[1] / Math.max(this.state.canvasHeight, 1),
      ],
      anchorWorld: worldPoint,
      scale: nextZoom,
      scaleMode: 'fit',
    });
  }

  withPan(pan: Point2): BasePlanarViewportCamera<TState> {
    const currentPan = this.pan;
    const [anchorX, anchorY] = this.state.camera.anchorCanvas ?? [0.5, 0.5];

    return this.cloneWithCamera({
      ...this.state.camera,
      anchorCanvas: [
        anchorX +
          (pan[0] - currentPan[0]) / Math.max(this.state.canvasWidth, 1),
        anchorY +
          (pan[1] - currentPan[1]) / Math.max(this.state.canvasHeight, 1),
      ],
    });
  }

  flipHorizontal(): BasePlanarViewportCamera<TState> {
    return this.cloneWithCamera({
      ...this.state.camera,
      flipHorizontal: !this.state.camera.flipHorizontal,
    });
  }

  flipVertical(): BasePlanarViewportCamera<TState> {
    return this.cloneWithCamera({
      ...this.state.camera,
      flipVertical: !this.state.camera.flipVertical,
    });
  }

  indexToWorld(_index: Point3): Point3 | undefined {
    return;
  }

  protected buildICamera(): ICamera {
    return resolvePlanarRenderCamera({
      camera: this.state.camera,
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      sliceBasis: this.getSliceBasis(),
    });
  }

  protected getPresentation() {
    this.cachedPresentation ||= derivePlanarPresentation({
      camera: this.state.camera,
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      sliceBasis: this.getSliceBasis(),
    });

    return this.cachedPresentation;
  }

  protected requireResolvedICamera(): Required<
    Pick<ICamera, 'focalPoint' | 'parallelScale' | 'viewPlaneNormal' | 'viewUp'>
  > {
    const camera = this.toICamera();

    if (
      !camera.focalPoint ||
      typeof camera.parallelScale !== 'number' ||
      !camera.viewPlaneNormal ||
      !camera.viewUp
    ) {
      throw new Error('[PlanarComputedCamera] Failed to compute planar camera');
    }

    return {
      focalPoint: clonePoint3(camera.focalPoint),
      parallelScale: camera.parallelScale,
      viewPlaneNormal: clonePoint3(camera.viewPlaneNormal),
      viewUp: clonePoint3(camera.viewUp),
    };
  }

  protected createCameraState(camera: PlanarCamera): TState {
    return {
      ...this.state,
      camera: normalizePlanarCamera(camera),
    };
  }

  protected abstract buildSliceBasis(): PlanarSliceBasis;

  protected abstract cloneWithCamera(
    camera: PlanarCamera
  ): BasePlanarViewportCamera<TState>;
}

class PlanarStackViewportCamera extends BasePlanarViewportCamera<PlanarStackViewportCameraState> {
  constructor(
    state: Omit<PlanarStackViewportCameraState, 'camera'> & {
      camera?: PlanarCamera;
    }
  ) {
    super({
      ...state,
      camera: normalizePlanarCamera(
        state.camera || createDefaultPlanarCamera()
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

  protected cloneWithCamera(camera: PlanarCamera): PlanarStackViewportCamera {
    return new PlanarStackViewportCamera(this.createCameraState(camera));
  }
}

class PlanarVolumeViewportCamera extends BasePlanarViewportCamera<PlanarVolumeViewportCameraState> {
  constructor(
    state: Omit<PlanarVolumeViewportCameraState, 'camera'> & {
      camera?: PlanarCamera;
    }
  ) {
    super({
      ...state,
      camera: normalizePlanarCamera(
        state.camera || createDefaultPlanarCamera()
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
      camera: this.state.camera,
      canvasHeight: this.state.canvasHeight,
      canvasWidth: this.state.canvasWidth,
      imageIdIndex: this.state.currentImageIdIndex,
      imageVolume: this.state.imageVolume,
      orientation: this.state.camera.orientation,
    }).sliceBasis;
  }

  protected cloneWithCamera(camera: PlanarCamera): PlanarVolumeViewportCamera {
    return new PlanarVolumeViewportCamera(this.createCameraState(camera));
  }
}

function getCurrentSliceIndex(rendering: PlanarRendering): number {
  return rendering.currentImageIdIndex;
}

export function getPlanarCameraCanvasDimensions(args: {
  rendering: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
}): {
  canvasHeight: number;
  canvasWidth: number;
} {
  const { renderContext, rendering } = args;

  if (
    rendering.renderMode === 'cpuImage' ||
    rendering.renderMode === 'cpuVolume'
  ) {
    return getCanvasCssDimensions(renderContext.cpu.canvas);
  }

  return {
    canvasHeight:
      renderContext.vtk.canvas.clientHeight || renderContext.vtk.canvas.height,
    canvasWidth:
      renderContext.vtk.canvas.clientWidth || renderContext.vtk.canvas.width,
  };
}

export function computePlanarViewportCamera(args: {
  camera: PlanarCamera;
  data?: PlanarPayload;
  frameOfReferenceUID?: string;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  sliceIndex?: number;
}): PlanarStackViewportCamera | PlanarVolumeViewportCamera | undefined {
  const { data, frameOfReferenceUID, renderContext, rendering, sliceIndex } =
    args;

  if (!rendering) {
    return;
  }

  const { canvasHeight, canvasWidth } = getPlanarCameraCanvasDimensions({
    renderContext,
    rendering,
  });
  const requestedCamera = args.camera;

  if (
    rendering.renderMode === 'cpuImage' ||
    rendering.renderMode === 'vtkImage'
  ) {
    const image =
      (rendering.renderMode === 'cpuImage'
        ? rendering.enabledElement?.image
        : rendering.currentImage) || data?.image;

    if (!image) {
      return;
    }

    return new PlanarStackViewportCamera({
      camera: requestedCamera,
      canvasHeight,
      canvasWidth,
      currentImageIdIndex: getCurrentSliceIndex(rendering),
      frameOfReferenceUID,
      image,
      maxImageIdIndex: Math.max(
        rendering.currentImageIdIndex,
        (data?.imageIds.length || 1) - 1
      ),
      usePixelGridCenter: rendering.renderMode === 'cpuImage',
    });
  }

  if (
    rendering.renderMode === 'cpuVolume' ||
    rendering.renderMode === 'vtkVolumeSlice'
  ) {
    const currentImageIdIndex =
      typeof sliceIndex === 'number'
        ? sliceIndex
        : (resolvePlanarVolumeImageIdIndex({
            camera: requestedCamera,
            fallbackImageIdIndex: rendering.currentImageIdIndex,
          }) ?? rendering.currentImageIdIndex);

    return new PlanarVolumeViewportCamera({
      camera: {
        ...requestedCamera,
        imageIdIndex: currentImageIdIndex,
      },
      canvasHeight,
      canvasWidth,
      currentImageIdIndex,
      frameOfReferenceUID,
      imageVolume: rendering.imageVolume,
      maxImageIdIndex: rendering.maxImageIdIndex,
      usePixelGridCenter:
        rendering.renderMode === 'cpuVolume' &&
        shouldUsePlanarCpuVolumeSliceBasis(
          rendering.dataPresentation?.interpolationType
        ),
    });
  }
}

export type {
  BasePlanarViewportCameraState,
  PlanarStackViewportCameraState,
  PlanarVolumeViewportCameraState,
};
export {
  BasePlanarViewportCamera,
  PlanarStackViewportCamera,
  PlanarVolumeViewportCamera,
};
