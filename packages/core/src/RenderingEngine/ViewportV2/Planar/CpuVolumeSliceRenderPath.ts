import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { Events, ViewportStatus, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { ICamera, IImageData, Point2, Point3 } from '../../../types';
import triggerEvent from '../../../utilities/triggerEvent';
import createVolumeActor from '../../helpers/createVolumeActor';
import { createCanvas } from '../../helpers/getOrCreateCanvas';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarDataPresentation,
  PlanarCpuVolumeAdapterContext,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportV2Types';
import type { PlanarCpuVolumeRendering } from './planarRuntimeTypes';
import PlanarCPUVolumeSampler from './PlanarCPUVolumeSampler';
import {
  canvasToWorldPlanarCamera,
  worldToCanvasPlanarCamera,
} from './planarAdapterCoordinateTransforms';
import {
  applyPlanarRenderCameraToRenderer,
  resolvePlanarRenderCamera,
} from './planarRenderCamera';
import { applyPlanarVolumePresentation } from './planarVolumePresentation';
import {
  createPlanarVolumeSliceBasis,
  resolvePlanarVolumeImageIdIndex,
} from './planarSliceBasis';

export class CpuVolumeSliceRenderPath
  implements RenderPath<PlanarCpuVolumeAdapterContext>
{
  private readonly sampler = new PlanarCPUVolumeSampler();

  async addData(
    ctx: PlanarCpuVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.imageVolume) {
      throw new Error(
        '[PlanarViewportV2] CPU volume rendering requires a prepared image volume'
      );
    }

    const actor = await createVolumeActor(
      {
        volumeId: payload.volumeId,
      },
      ctx.viewport.element,
      ctx.viewportId,
      true
    );
    const mapper = actor.getMapper() as vtkVolumeMapper;
    const defaultRange = actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    ctx.vtk.renderer.addVolume(actor);
    ctx.display.activateRenderMode('cpuVolume');

    const rendering: PlanarCpuVolumeRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'cpuVolume',
      actor,
      mapper,
      imageVolume: payload.imageVolume,
      layerCanvas: createCanvas(
        null,
        ctx.cpu.canvas.width,
        ctx.cpu.canvas.height
      ),
      currentImageIdIndex: payload.initialImageIdIndex,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      requestedCamera: undefined,
      renderCamera: undefined,
      renderingInvalidated: true,
      removeStreamingSubscriptions: (() => {
        let isActive = true;
        let pendingAnimationFrameId: number | undefined;
        const unsubscribe = subscribeToVolumeLoadCompletion(
          payload.volumeId,
          () => {
            if (!isActive) {
              return;
            }

            rendering.pendingVolumeLoadCallback = false;
            rendering.sampledSliceState = undefined;
            rendering.renderingInvalidated = true;
            ctx.display.renderNow();
            if (!isActive) {
              return;
            }

            pendingAnimationFrameId = window.requestAnimationFrame(() => {
              pendingAnimationFrameId = undefined;

              if (!isActive) {
                return;
              }

              ctx.display.renderNow();
            });
          }
        );

        return () => {
          isActive = false;
          rendering.pendingVolumeLoadCallback = false;
          rendering.sampledSliceState = undefined;

          if (pendingAnimationFrameId !== undefined) {
            window.cancelAnimationFrame(pendingAnimationFrameId);
            pendingAnimationFrameId = undefined;
          }

          unsubscribe();
        };
      })(),
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, camera);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(ctx, rendering, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(ctx, rendering, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(ctx, rendering);
      },
      resize: () => {
        this.resize(ctx, rendering);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private updateDataPresentation(
    rendering: PlanarCpuVolumeRendering,
    props: unknown
  ): void {
    const { slabThickness: _slabThickness, ...dataPresentation } =
      (props as PlanarDataPresentation | undefined) || {};

    rendering.dataPresentation = Object.keys(dataPresentation).length
      ? (dataPresentation as PlanarCpuVolumeRendering['dataPresentation'])
      : undefined;
    applyPlanarVolumePresentation({
      actor: rendering.actor,
      mapper: rendering.mapper,
      defaultVOIRange: rendering.defaultVOIRange,
      props: rendering.dataPresentation,
    });
  }

  private updateCamera(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    cameraInput: unknown
  ): void {
    const camera = cameraInput as PlanarCamera | undefined;
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        canvasHeight: ctx.cpu.canvas.height,
        canvasWidth: ctx.cpu.canvas.width,
        imageIdIndex: resolvePlanarVolumeImageIdIndex({
          camera,
          fallbackImageIdIndex: rendering.currentImageIdIndex,
        }),
        imageVolume: rendering.imageVolume,
        orientation: camera?.orientation,
      });

    ctx.display.activateRenderMode('cpuVolume');
    rendering.requestedCamera = camera;
    rendering.renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera: rendering.requestedCamera,
      canvasWidth: ctx.cpu.canvas.width,
      canvasHeight: ctx.cpu.canvas.height,
    });
    applyPlanarRenderCameraToRenderer({
      renderer: ctx.vtk.renderer,
      renderCamera: rendering.renderCamera,
    });
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    rendering.renderingInvalidated = true;
  }

  private canvasToWorld(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    canvasPos: Point2
  ): Point3 {
    const renderCamera = getDisplayCamera(ctx, rendering);

    if (
      !renderCamera?.focalPoint ||
      !renderCamera.parallelScale ||
      !renderCamera.viewPlaneNormal ||
      !renderCamera.viewUp
    ) {
      return [0, 0, 0];
    }

    return canvasToWorldPlanarCamera({
      camera: {
        focalPoint: renderCamera.focalPoint,
        parallelScale: renderCamera.parallelScale,
        viewPlaneNormal: renderCamera.viewPlaneNormal,
        viewUp: renderCamera.viewUp,
      },
      canvasWidth: ctx.cpu.canvas.width,
      canvasHeight: ctx.cpu.canvas.height,
      canvasPos,
    });
  }

  private worldToCanvas(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    worldPos: Point3
  ): Point2 {
    const renderCamera = getDisplayCamera(ctx, rendering);

    if (
      !renderCamera?.focalPoint ||
      !renderCamera.parallelScale ||
      !renderCamera.viewPlaneNormal ||
      !renderCamera.viewUp
    ) {
      return [0, 0];
    }

    return worldToCanvasPlanarCamera({
      camera: {
        focalPoint: renderCamera.focalPoint,
        parallelScale: renderCamera.parallelScale,
        viewPlaneNormal: renderCamera.viewPlaneNormal,
        viewUp: renderCamera.viewUp,
      },
      canvasWidth: ctx.cpu.canvas.width,
      canvasHeight: ctx.cpu.canvas.height,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: PlanarCpuVolumeRendering
  ): string | undefined {
    return rendering.imageVolume.metadata?.FrameOfReferenceUID;
  }

  private getImageData(
    rendering: PlanarCpuVolumeRendering
  ): IImageData | undefined {
    return buildPlanarVolumeImageData(rendering.imageVolume);
  }

  private render(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering
  ): void {
    const runtime = rendering;

    ctx.display.activateRenderMode('cpuVolume');
    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = '1';

    if (runtime.dataPresentation?.visible === false) {
      beginCompositePass(ctx);
      return;
    }

    const loadStatus = (
      runtime.imageVolume as { loadStatus?: { loaded?: boolean } }
    ).loadStatus;

    if (!loadStatus?.loaded) {
      if (!runtime.pendingVolumeLoadCallback) {
        runtime.pendingVolumeLoadCallback = true;
        runtime.imageVolume.load();
      }
      return;
    }

    runtime.pendingVolumeLoadCallback = false;

    if (!ctx.cpu.canvas.width || !ctx.cpu.canvas.height) {
      return;
    }

    const renderCamera = getDisplayCamera(ctx, runtime);

    if (!renderCamera) {
      return;
    }

    beginCompositePass(ctx);

    const layerCanvasWasResized = syncLayerCanvasSize(
      runtime.layerCanvas,
      ctx.cpu.canvas
    );

    if (layerCanvasWasResized) {
      runtime.renderingInvalidated = true;
    }
    const shouldResample =
      runtime.renderingInvalidated ||
      this.sampler.needsResample({
        sampledSliceState: runtime.sampledSliceState,
        width: ctx.cpu.canvas.width,
        height: ctx.cpu.canvas.height,
        camera: renderCamera,
        dataPresentation: runtime.dataPresentation,
      });

    const sampledSliceState = shouldResample
      ? (runtime.sampledSliceState = this.sampler.sampleSliceImage({
          volume: runtime.imageVolume,
          width: ctx.cpu.canvas.width,
          height: ctx.cpu.canvas.height,
          camera: renderCamera,
          dataPresentation: runtime.dataPresentation,
        }))
      : runtime.sampledSliceState;

    if (!sampledSliceState) {
      return;
    }

    if (shouldResample) {
      runtime.renderingInvalidated = true;
    }

    runtime.enabledElement = this.sampler.createOrUpdateEnabledElement({
      enabledElement: runtime.enabledElement,
      canvas: runtime.layerCanvas,
      image: sampledSliceState.image,
      modality: runtime.imageVolume.metadata?.Modality,
    });
    this.sampler.updateCPUFallbackViewport({
      enabledElement: runtime.enabledElement,
      sampledSliceState,
      camera: renderCamera,
      dataPresentation: runtime.dataPresentation,
      defaultVOIRange: runtime.defaultVOIRange,
    });
    runtime.defaultVOIRange ||= this.sampler.getResolvedVOIRange(
      runtime.dataPresentation?.voiRange,
      sampledSliceState.image.minPixelValue ?? 0,
      sampledSliceState.image.maxPixelValue ?? 1
    );
    drawImageSync(runtime.enabledElement, runtime.renderingInvalidated);
    runtime.renderingInvalidated = false;
    compositeLayerCanvas(ctx, runtime);
    triggerEvent(ctx.viewport.element, Events.IMAGE_RENDERED, {
      element: ctx.viewport.element,
      viewportId: ctx.viewportId,
      renderingEngineId: ctx.renderingEngineId,
      viewportStatus: ViewportStatus.RENDERED,
    });
  }

  private resize(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering
  ): void {
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth: ctx.cpu.canvas.width,
      canvasHeight: ctx.cpu.canvas.height,
      imageIdIndex: rendering.currentImageIdIndex,
      imageVolume: rendering.imageVolume,
      orientation: rendering.requestedCamera?.orientation,
    });
    rendering.renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera: rendering.requestedCamera,
      canvasWidth: ctx.cpu.canvas.width,
      canvasHeight: ctx.cpu.canvas.height,
    });
    applyPlanarRenderCameraToRenderer({
      renderer: ctx.vtk.renderer,
      renderCamera: rendering.renderCamera,
    });
    rendering.renderingInvalidated = true;
  }

  private removeData(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }
}

function subscribeToVolumeLoadCompletion(
  volumeId: string,
  onComplete: () => void
): () => void {
  const handleComplete = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onComplete();
  };

  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleComplete
  );

  return () => {
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handleComplete
    );
  };
}

export class CpuVolumeSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuVolumeAdapterContext
    >
{
  readonly id = 'planar:cpu-volume-slice';
  readonly type = ViewportType.PLANAR_V2;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'image' && options.renderMode === 'cpuVolume';
  }

  createRenderPath() {
    return new CpuVolumeSliceRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarCpuVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      renderingEngineId: rootContext.renderingEngineId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      display: rootContext.display,
      cpu: rootContext.cpu,
      vtk: rootContext.vtk,
    };
  }
}

function clearToBackground(ctx: PlanarCpuVolumeAdapterContext): void {
  ctx.cpu.context.setTransform(1, 0, 0, 1, 0, 0);
  ctx.cpu.context.clearRect(0, 0, ctx.cpu.canvas.width, ctx.cpu.canvas.height);
  ctx.cpu.context.fillStyle = '#000';
  ctx.cpu.context.fillRect(0, 0, ctx.cpu.canvas.width, ctx.cpu.canvas.height);
}

function beginCompositePass(ctx: PlanarCpuVolumeAdapterContext): void {
  if (
    ctx.cpu.composition.clearedRenderPassId === ctx.cpu.composition.renderPassId
  ) {
    return;
  }

  clearToBackground(ctx);
  ctx.cpu.composition.clearedRenderPassId = ctx.cpu.composition.renderPassId;
}

function syncLayerCanvasSize(
  layerCanvas: HTMLCanvasElement,
  sharedCanvas: HTMLCanvasElement
): boolean {
  if (
    layerCanvas.width === sharedCanvas.width &&
    layerCanvas.height === sharedCanvas.height
  ) {
    return false;
  }

  layerCanvas.width = sharedCanvas.width;
  layerCanvas.height = sharedCanvas.height;

  return true;
}

function compositeLayerCanvas(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering
): void {
  const compositeOpacity = rendering.dataPresentation?.opacity ?? 1;

  if (compositeOpacity <= 0) {
    return;
  }

  ctx.cpu.context.save();
  ctx.cpu.context.globalAlpha = compositeOpacity;
  ctx.cpu.context.drawImage(rendering.layerCanvas, 0, 0);
  ctx.cpu.context.restore();
}

function buildPlanarVolumeImageData(imageVolume): IImageData | undefined {
  const vtkImageData = imageVolume.imageData;

  if (!vtkImageData) {
    return;
  }

  return {
    dimensions: vtkImageData.getDimensions(),
    spacing: vtkImageData.getSpacing(),
    origin: vtkImageData.getOrigin(),
    direction: vtkImageData.getDirection(),
    imageData: vtkImageData,
    metadata: {
      Modality: imageVolume.metadata?.Modality,
      FrameOfReferenceUID: imageVolume.metadata?.FrameOfReferenceUID,
    },
    get scalarData() {
      return imageVolume.voxelManager?.getScalarData();
    },
    scaling: imageVolume.scaling,
    hasPixelSpacing: imageVolume.hasPixelSpacing,
    voxelManager: imageVolume.voxelManager,
  };
}

function getDisplayCamera(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering
): ICamera | undefined {
  const activeCamera = ctx.vtk.renderer.getActiveCamera?.();
  const focalPoint = activeCamera?.getFocalPoint?.();
  const parallelScale = activeCamera?.getParallelScale?.();
  const viewPlaneNormal = activeCamera?.getViewPlaneNormal?.();
  const viewUp = activeCamera?.getViewUp?.();

  if (
    focalPoint?.length === 3 &&
    Number.isFinite(parallelScale) &&
    viewPlaneNormal?.length === 3 &&
    viewUp?.length === 3
  ) {
    return {
      focalPoint: [...focalPoint] as Point3,
      parallelScale,
      viewPlaneNormal: [...viewPlaneNormal] as Point3,
      viewUp: [...viewUp] as Point3,
    } as ICamera;
  }

  return rendering.renderCamera;
}
