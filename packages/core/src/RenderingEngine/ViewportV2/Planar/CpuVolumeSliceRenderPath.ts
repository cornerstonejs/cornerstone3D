import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { Events, ViewportStatus, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { IImageData, Point2, Point3 } from '../../../types';
import triggerEvent from '../../../utilities/triggerEvent';
import createVolumeActor from '../../helpers/createVolumeActor';
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
import { resolvePlanarRenderCamera } from './planarRenderCamera';
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
      currentImageIdIndex: payload.initialImageIdIndex,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      requestedCamera: undefined,
      renderCamera: undefined,
      renderingInvalidated: true,
      removeStreamingSubscriptions: subscribeToVolumeLoadCompletion(
        payload.volumeId,
        () => {
          const rerenderLoadedSlice = () => {
            rendering.pendingVolumeLoadCallback = false;
            rendering.sampledSliceState = undefined;
            rendering.renderingInvalidated = true;
            this.render(ctx, rendering);
          };

          rerenderLoadedSlice();
          window.requestAnimationFrame(() => {
            rerenderLoadedSlice();
          });
        }
      ),
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
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    rendering.renderingInvalidated = true;
  }

  private canvasToWorld(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    canvasPos: Point2
  ): Point3 {
    const renderCamera = rendering.renderCamera;

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
    const renderCamera = rendering.renderCamera;

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

    if (runtime.dataPresentation?.visible === false) {
      ctx.cpu.canvas.style.display = 'none';
      return;
    }

    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = String(
      runtime.dataPresentation?.opacity ?? 1
    );

    const loadStatus = (
      runtime.imageVolume as { loadStatus?: { loaded?: boolean } }
    ).loadStatus;

    if (!loadStatus?.loaded) {
      clearToBackground(ctx);
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

    const renderCamera = runtime.renderCamera;
    const zoom = Math.max(runtime.requestedCamera?.frame?.scale ?? 1, 0.001);

    if (!renderCamera) {
      clearToBackground(ctx);
      return;
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

    if (shouldResample) {
      runtime.sampledSliceState = this.sampler.sampleSliceImage({
        volume: runtime.imageVolume,
        width: ctx.cpu.canvas.width,
        height: ctx.cpu.canvas.height,
        camera: renderCamera,
        dataPresentation: runtime.dataPresentation,
      });
      runtime.renderingInvalidated = true;
    }

    if (!runtime.sampledSliceState) {
      clearToBackground(ctx);
      return;
    }

    runtime.enabledElement = this.sampler.createOrUpdateEnabledElement({
      enabledElement: runtime.enabledElement,
      canvas: ctx.cpu.canvas,
      image: runtime.sampledSliceState.image,
      modality: runtime.imageVolume.metadata?.Modality,
    });
    this.sampler.updateCPUFallbackViewport({
      enabledElement: runtime.enabledElement,
      sampledSliceState: runtime.sampledSliceState,
      camera: renderCamera,
      dataPresentation: runtime.dataPresentation,
      defaultVOIRange: runtime.defaultVOIRange,
      zoom,
    });
    runtime.defaultVOIRange ||= this.sampler.getResolvedVOIRange(
      runtime.dataPresentation?.voiRange,
      runtime.sampledSliceState.image.minPixelValue ?? 0,
      runtime.sampledSliceState.image.maxPixelValue ?? 1
    );
    drawImageSync(runtime.enabledElement, runtime.renderingInvalidated);
    runtime.renderingInvalidated = false;
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
