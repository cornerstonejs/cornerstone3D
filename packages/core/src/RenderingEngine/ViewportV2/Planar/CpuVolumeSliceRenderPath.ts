import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import CanvasActor from '../../CanvasActor';
import { Events, ViewportStatus, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { ICamera, IImageData, Point2, Point3 } from '../../../types';
import type { IViewport } from '../../../types/IViewport';
import triggerEvent from '../../../utilities/triggerEvent';
import createVolumeActor from '../../helpers/createVolumeActor';
import { createCanvas } from '../../helpers/getOrCreateCanvas';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import setToPixelCoordinateSystem from '../../helpers/cpuFallback/rendering/setToPixelCoordinateSystem';
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
} from './PlanarViewportTypes';
import type { PlanarCpuVolumeRendering } from './planarRuntimeTypes';
import PlanarCPUVolumeSampler from './PlanarCPUVolumeSampler';
import {
  canvasToWorldPlanarCamera,
  getCanvasCssDimensions,
  worldToCanvasPlanarCamera,
} from './planarAdapterCoordinateTransforms';
import {
  applyPlanarRenderCameraToRenderer,
  resolvePlanarRenderCamera,
} from './planarRenderCamera';
import { applyPlanarVolumePresentation } from './planarVolumePresentation';
import {
  createPlanarCpuVolumeSliceBasis,
  createPlanarVolumeSliceBasis,
  resolvePlanarVolumeImageIdIndex,
  shouldUsePlanarCpuVolumeSliceBasis,
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
        '[PlanarViewport] CPU volume rendering requires a prepared image volume'
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
    let rendering: PlanarCpuVolumeRendering;
    const compatibilityActor = new CanvasActor(
      {
        getImageData: () => this.getImageData(rendering),
      } as unknown as IViewport,
      payload.imageVolume.imageIds?.length
        ? { imageId: payload.imageVolume.imageIds[0] }
        : {}
    );

    compatibilityActor.setVisibility(true);

    ctx.vtk.renderer.addVolume(actor);
    ctx.display.activateRenderMode('cpuVolume');

    rendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'cpuVolume',
      actor,
      mapper,
      compatibilityActor,
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
      compositeActor: typeof payload.representationUID === 'string',
      removeStreamingSubscriptions: (() => {
        let isActive = true;
        let pendingAnimationFrameId: number | undefined;
        const unsubscribe = subscribeToVolumeEvents(
          payload.volumeId,
          (eventType) => {
            if (!isActive) {
              return;
            }

            const shouldResampleOnDeferredPass =
              eventType === Events.IMAGE_VOLUME_LOADING_COMPLETED;

            payload.imageVolume.voxelManager?.invalidateCache?.();
            this.sampler.clearCachedScalarRange(
              payload.imageVolume.voxelManager
            );
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

              if (shouldResampleOnDeferredPass) {
                // The completion event can arrive before the streamed voxel
                // buffer is fully stable for CPU sampling. Retry one frame
                // later, but keep progressive IMAGE_VOLUME_MODIFIED updates on
                // their lighter redraw path.
                rendering.sampledSliceState = undefined;
                rendering.renderingInvalidated = true;
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
        this.updateDataPresentation(ctx, rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, camera);
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
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    props: unknown
  ): void {
    const previousInterpolationType =
      rendering.dataPresentation?.interpolationType;
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

    if (
      previousInterpolationType !==
      rendering.dataPresentation?.interpolationType
    ) {
      this.syncRenderCamera(ctx, rendering, rendering.requestedCamera);
      return;
    }

    rendering.renderingInvalidated = true;
  }

  private updateCamera(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    cameraInput: unknown
  ): void {
    ctx.display.activateRenderMode('cpuVolume');
    this.syncRenderCamera(
      ctx,
      rendering,
      cameraInput as PlanarCamera | undefined
    );
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

    const { canvasWidth, canvasHeight } = getCanvasCssDimensions(
      ctx.cpu.canvas
    );

    return canvasToWorldPlanarCamera({
      camera: {
        focalPoint: renderCamera.focalPoint,
        parallelScale: renderCamera.parallelScale,
        viewPlaneNormal: renderCamera.viewPlaneNormal,
        viewUp: renderCamera.viewUp,
      },
      canvasWidth,
      canvasHeight,
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

    const { canvasWidth, canvasHeight } = getCanvasCssDimensions(
      ctx.cpu.canvas
    );

    return worldToCanvasPlanarCamera({
      camera: {
        focalPoint: renderCamera.focalPoint,
        parallelScale: renderCamera.parallelScale,
        viewPlaneNormal: renderCamera.viewPlaneNormal,
        viewUp: renderCamera.viewUp,
      },
      canvasWidth,
      canvasHeight,
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
    const hasStreamedFrameData = hasStreamedVolumeData(runtime.imageVolume);
    const isVolumeReady =
      loadStatus === undefined ||
      loadStatus.loaded === true ||
      hasStreamedFrameData;

    if (!isVolumeReady) {
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

    if (shouldResample) {
      runtime.compatibilityActor
        .getMapper()
        .getInputData()
        .setDerivedImage(sampledSliceState.image);
    }

    if (runtime.compositeActor) {
      renderCanvasActorLayer(runtime);
    } else {
      drawImageSync(runtime.enabledElement, runtime.renderingInvalidated);
    }

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
    this.syncRenderCamera(ctx, rendering, rendering.requestedCamera);
  }

  private removeData(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }

  private syncRenderCamera(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    camera: PlanarCamera | undefined
  ): void {
    const requestedCamera = camera ?? rendering.requestedCamera;
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      this.resolveVolumeSliceBasis(ctx, rendering, requestedCamera);

    rendering.requestedCamera = requestedCamera;
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

  private resolveVolumeSliceBasis(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    camera: PlanarCamera | undefined
  ) {
    const createSliceBasis = shouldUsePlanarCpuVolumeSliceBasis(
      rendering.dataPresentation?.interpolationType
    )
      ? createPlanarCpuVolumeSliceBasis
      : createPlanarVolumeSliceBasis;

    return createSliceBasis({
      canvasHeight: ctx.cpu.canvas.height,
      canvasWidth: ctx.cpu.canvas.width,
      imageIdIndex: resolvePlanarVolumeImageIdIndex({
        camera,
        fallbackImageIdIndex: rendering.currentImageIdIndex,
      }),
      imageVolume: rendering.imageVolume,
      orientation: camera?.orientation,
    });
  }
}

function subscribeToVolumeEvents(
  volumeId: string,
  onUpdate: (
    eventType:
      | Events.IMAGE_VOLUME_MODIFIED
      | Events.IMAGE_VOLUME_LOADING_COMPLETED
  ) => void
): () => void {
  const handleUpdate = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onUpdate(
      evt.type as
        | Events.IMAGE_VOLUME_MODIFIED
        | Events.IMAGE_VOLUME_LOADING_COMPLETED
    );
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, handleUpdate);
  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleUpdate
  );

  return () => {
    eventTarget.removeEventListener(Events.IMAGE_VOLUME_MODIFIED, handleUpdate);
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handleUpdate
    );
  };
}

function hasStreamedVolumeData(imageVolume: unknown): boolean {
  const streamingState = imageVolume as {
    framesLoaded?: number;
    framesProcessed?: number;
    framesUpdated?: number;
  };

  return Boolean(
    (streamingState.framesLoaded ?? 0) > 0 ||
      (streamingState.framesProcessed ?? 0) > 0 ||
      (streamingState.framesUpdated ?? 0) > 0
  );
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

function renderCanvasActorLayer(rendering: PlanarCpuVolumeRendering): void {
  const enabledElement = rendering.enabledElement;

  if (!enabledElement) {
    return;
  }

  const context = rendering.layerCanvas.getContext('2d');

  if (!context) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(
    0,
    0,
    rendering.layerCanvas.width,
    rendering.layerCanvas.height
  );
  context.imageSmoothingEnabled = !enabledElement.viewport.pixelReplication;
  setToPixelCoordinateSystem(enabledElement, context);
  rendering.compatibilityActor.render(undefined as never, context);
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
