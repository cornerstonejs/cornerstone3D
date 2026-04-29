import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import CanvasActor from '../../CanvasActor';
import { Events, ViewportStatus, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { ActorRenderMode } from '../../../types';
import type { IImageData, Point2, Point3 } from '../../../types';
import type { IViewport } from '../../../types/IViewport';
import triggerEvent from '../../../utilities/triggerEvent';
import { createCanvas } from '../../helpers/getOrCreateCanvas';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import setToPixelCoordinateSystem from '../../helpers/cpuFallback/rendering/setToPixelCoordinateSystem';
import { getDefaultVolumeVOIRange } from '../../helpers/setDefaultVolumeVOI';
import { getConfiguration } from '../../../init';
import uuidv4 from '../../../utilities/uuidv4';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  PlanarViewState,
  PlanarDataPresentation,
  PlanarCpuVolumeAdapterContext,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarCpuVolumeRendering } from './planarRuntimeTypes';
import PlanarCPUVolumeSampler from './PlanarCPUVolumeSampler';
import {
  canvasToWorldPlanarViewState,
  getCanvasCssDimensions,
  worldToCanvasPlanarViewState,
} from './planarAdapterCoordinateTransforms';
import { triggerPlanarVolumeNewImage } from './planarImageEvents';
import { resolvePlanarRenderPathProjection } from './planarRenderPathProjection';

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

    const defaultVOIRange = await getDefaultVolumeVOIRange(payload.imageVolume);
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

    ctx.display.activateRenderMode(ActorRenderMode.CPU_VOLUME);

    rendering = {
      renderMode: ActorRenderMode.CPU_VOLUME,
      actorEntryUID: uuidv4(),
      compatibilityActor,
      imageVolume: payload.imageVolume,
      imageIds: payload.imageIds,
      acquisitionOrientation: payload.acquisitionOrientation,
      layerCanvas: createCanvas(
        null,
        ctx.cpu.canvas.width,
        ctx.cpu.canvas.height
      ),
      currentImageIdIndex: payload.initialImageIdIndex,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange,
      renderingInvalidated: true,
      compositeActor: payload.reference?.kind === 'segmentation',
      removeStreamingSubscriptions: (() => {
        let isActive = true;
        let pendingAnimationFrameId: number | undefined;
        let pendingVolumeModifiedTimeoutId: number | undefined;
        let lastVolumeModifiedRenderTime = -Infinity;
        const volumeModifiedThrottleMs = getCpuVolumeModifiedThrottleMs();
        const renderVolumeModified = () => {
          if (!isActive) {
            return;
          }

          lastVolumeModifiedRenderTime = performance.now();
          ctx.display.renderNow();
        };
        const scheduleVolumeModifiedRender = () => {
          if (volumeModifiedThrottleMs <= 0) {
            renderVolumeModified();
            return;
          }

          if (pendingVolumeModifiedTimeoutId !== undefined) {
            return;
          }

          const remainingDelay = Math.max(
            0,
            volumeModifiedThrottleMs -
              (performance.now() - lastVolumeModifiedRenderTime)
          );

          if (remainingDelay === 0) {
            renderVolumeModified();
            return;
          }

          pendingVolumeModifiedTimeoutId = window.setTimeout(() => {
            pendingVolumeModifiedTimeoutId = undefined;
            renderVolumeModified();
          }, remainingDelay);
        };
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

            if (eventType === Events.IMAGE_VOLUME_MODIFIED) {
              scheduleVolumeModifiedRender();
            } else {
              if (pendingVolumeModifiedTimeoutId !== undefined) {
                window.clearTimeout(pendingVolumeModifiedTimeoutId);
                pendingVolumeModifiedTimeoutId = undefined;
              }
              ctx.display.renderNow();
            }

            if (!isActive) {
              return;
            }

            if (!shouldResampleOnDeferredPass) {
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

          if (pendingVolumeModifiedTimeoutId !== undefined) {
            window.clearTimeout(pendingVolumeModifiedTimeoutId);
            pendingVolumeModifiedTimeoutId = undefined;
          }

          unsubscribe();
        };
      })(),
    };

    triggerPlanarVolumeNewImage(ctx, {
      camera: ctx.viewport.getViewState(),
      acquisitionOrientation: rendering.acquisitionOrientation,
      imageIds: rendering.imageIds,
      imageIdIndex: rendering.currentImageIdIndex,
    });

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(ctx, rendering, data.id, props);
      },
      applyViewState: (camera) => {
        this.applyViewState(ctx, rendering, data.id, camera);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getActorEntry: (data) => {
        const planarData = data as LoadedData<PlanarPayload>;

        return buildPlanarActorEntry(planarData, {
          actor: rendering.compatibilityActor,
          renderMode: ActorRenderMode.CPU_VOLUME,
          uid: rendering.actorEntryUID,
          referencedIdFallback: planarData.volumeId,
        });
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(ctx, rendering);
      },
      resize: () => {
        this.resize(ctx, rendering, data.id);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private updateDataPresentation(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    dataId: string,
    props: unknown
  ): void {
    const previousInterpolationType =
      rendering.dataPresentation?.interpolationType;
    const { slabThickness: _slabThickness, ...dataPresentation } =
      (props as PlanarDataPresentation | undefined) || {};

    rendering.dataPresentation = Object.keys(dataPresentation).length
      ? (dataPresentation as PlanarCpuVolumeRendering['dataPresentation'])
      : undefined;

    if (
      previousInterpolationType !==
      rendering.dataPresentation?.interpolationType
    ) {
      this.syncRenderCamera(
        ctx,
        rendering,
        dataId,
        ctx.viewport.getViewState()
      );
      return;
    }

    rendering.renderingInvalidated = true;
  }

  private applyViewState(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    dataId: string,
    cameraInput: unknown
  ): void {
    ctx.display.activateRenderMode(ActorRenderMode.CPU_VOLUME);
    this.syncRenderCamera(
      ctx,
      rendering,
      dataId,
      cameraInput as PlanarViewState | undefined
    );
  }

  private canvasToWorld(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    canvasPos: Point2
  ): Point3 {
    const activeSourceICamera = ctx.view.activeSourceICamera;

    if (
      !activeSourceICamera?.focalPoint ||
      !activeSourceICamera.parallelScale ||
      !activeSourceICamera.viewPlaneNormal ||
      !activeSourceICamera.viewUp
    ) {
      return [0, 0, 0];
    }

    const { canvasWidth, canvasHeight } = getCanvasCssDimensions(
      ctx.cpu.canvas
    );

    return canvasToWorldPlanarViewState({
      camera: {
        focalPoint: activeSourceICamera.focalPoint,
        parallelScale: activeSourceICamera.parallelScale,
        presentationScale: activeSourceICamera.presentationScale,
        viewPlaneNormal: activeSourceICamera.viewPlaneNormal,
        viewUp: activeSourceICamera.viewUp,
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
    const activeSourceICamera = ctx.view.activeSourceICamera;

    if (
      !activeSourceICamera?.focalPoint ||
      !activeSourceICamera.parallelScale ||
      !activeSourceICamera.viewPlaneNormal ||
      !activeSourceICamera.viewUp
    ) {
      return [0, 0];
    }

    const { canvasWidth, canvasHeight } = getCanvasCssDimensions(
      ctx.cpu.canvas
    );

    return worldToCanvasPlanarViewState({
      camera: {
        focalPoint: activeSourceICamera.focalPoint,
        parallelScale: activeSourceICamera.parallelScale,
        presentationScale: activeSourceICamera.presentationScale,
        viewPlaneNormal: activeSourceICamera.viewPlaneNormal,
        viewUp: activeSourceICamera.viewUp,
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

    ctx.display.activateRenderMode(ActorRenderMode.CPU_VOLUME);
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

    const activeSourceICamera = ctx.view.activeSourceICamera;

    if (!activeSourceICamera) {
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
        camera: activeSourceICamera,
        dataPresentation: runtime.dataPresentation,
      });

    const sampledSliceState = shouldResample
      ? (runtime.sampledSliceState = this.sampler.sampleSliceImage({
          volume: runtime.imageVolume,
          width: ctx.cpu.canvas.width,
          height: ctx.cpu.canvas.height,
          camera: activeSourceICamera,
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
      camera: activeSourceICamera,
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
    rendering: PlanarCpuVolumeRendering,
    dataId: string
  ): void {
    this.syncRenderCamera(ctx, rendering, dataId, ctx.viewport.getViewState());
  }

  private removeData(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering
  ): void {
    const { removeStreamingSubscriptions } = rendering;

    removeStreamingSubscriptions?.();
  }

  private syncRenderCamera(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: PlanarCpuVolumeRendering,
    dataId: string,
    camera: PlanarViewState | undefined
  ): void {
    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      rendering,
      viewState: camera,
    });

    if (!projection) {
      return;
    }

    const { currentImageIdIndex, maxImageIdIndex } = projection;
    const imageIdIndexChanged =
      currentImageIdIndex !== rendering.currentImageIdIndex;

    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    rendering.renderingInvalidated = true;

    if (imageIdIndexChanged) {
      triggerPlanarVolumeNewImage(ctx, {
        camera,
        acquisitionOrientation: rendering.acquisitionOrientation,
        imageIds: rendering.imageIds,
        imageIdIndex: rendering.currentImageIdIndex,
      });
    }
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

function getCpuVolumeModifiedThrottleMs(): number {
  const throttleMs =
    getConfiguration().rendering?.planar?.cpuVolume?.volumeModifiedThrottleMs;

  if (!Number.isFinite(throttleMs)) {
    return 0;
  }

  return Math.max(0, Math.trunc(throttleMs));
}

export class CpuVolumeSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuVolumeAdapterContext
    >
{
  readonly id = 'planar:cpu-volume-slice';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' && options.renderMode === ActorRenderMode.CPU_VOLUME
    );
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
      renderPath: rootContext.renderPath,
      view: rootContext.view,
      display: rootContext.display,
      cpu: rootContext.cpu,
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
