import vtkPlaneFactory from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import createVolumeSliceActor from '../../helpers/createVolumeSliceActor';
import { ActorRenderMode } from '../../../types';
import type { IImageData, Point2, Point3 } from '../../../types';
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
  PlanarPayload,
  PlanarViewportRenderContext,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportTypes';
import type { PlanarVolumeSliceRendering } from './planarRuntimeTypes';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from './planarAdapterCoordinateTransforms';
import { triggerPlanarVolumeNewImage } from './planarImageEvents';
import {
  applyPlanarRenderCameraToActor,
  applyPlanarRenderCameraToRenderer,
  resolvePlanarRenderCamera,
} from './planarRenderCamera';
import {
  createPlanarVolumeSliceBasis,
  resolvePlanarVolumeImageIdIndex,
} from './planarSliceBasis';
import { applyPlanarVolumePresentation } from './planarVolumePresentation';

const SLICE_OVERLAY_DEPTH_EPSILON = 1e-4;

export class VtkVolumeSliceRenderPath
  implements RenderPath<PlanarVtkVolumeAdapterContext>
{
  async addData(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
    const imageVolume = payload.imageVolume;

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewport] Volume rendering requires a prepared image volume'
      );
    }

    const { actor } = await createVolumeSliceActor(
      {
        volumeId: payload.volumeId,
      },
      ctx.viewport.element,
      ctx.viewportId,
      true
    );
    const mapper = actor.getMapper() as vtkImageResliceMapper;

    ctx.display.activateRenderMode(ActorRenderMode.VTK_VOLUME_SLICE);
    ctx.vtk.renderer.addActor(actor);

    const transferFunction = actor.getProperty().getRGBTransferFunction(0);
    const defaultRange = transferFunction?.getRange?.();

    const rendering: PlanarVolumeSliceRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
      actor,
      overlayOrder: getImageSliceOverlayOrder(ctx.vtk.renderer, actor),
      imageVolume,
      imageIds: payload.imageIds,
      acquisitionOrientation: payload.acquisitionOrientation,
      mapper,
      currentImageIdIndex: payload.initialImageIdIndex,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      dataPresentation: undefined,
      removeStreamingSubscriptions: subscribeToVolumeEvents(
        payload.volumeId,
        () => {
          ctx.display.requestRender();
        }
      ),
    };
    imageVolume.load(() => {
      ctx.display.requestRender();
    });

    triggerPlanarVolumeNewImage(ctx, {
      camera: ctx.viewport.getCameraState(),
      acquisitionOrientation: rendering.acquisitionOrientation,
      imageIds: rendering.imageIds,
      imageIdIndex: rendering.currentImageIdIndex,
    });

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(ctx, rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, data.id, camera);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getActorEntry: (data) => {
        const planarData = data as LoadedData<PlanarPayload>;

        return buildPlanarActorEntry(planarData, {
          actor: rendering.actor,
          mapper: rendering.mapper,
          renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
          uidFallback: planarData.volumeId,
          referencedIdFallback: planarData.volumeId,
        });
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(ctx);
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
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    props: unknown
  ): void {
    rendering.dataPresentation = props as PlanarDataPresentation | undefined;
    applyPlanarVolumePresentation({
      actor: rendering.actor,
      defaultVOIRange: rendering.defaultVOIRange,
      mapper: rendering.mapper,
      props: rendering.dataPresentation,
    });
    updateVolumeSlicePlane(rendering.mapper, ctx.renderPath.renderCamera);
    applyPlanarRenderCameraToActor({
      actor: rendering.actor,
      renderCamera: ctx.renderPath.renderCamera,
    });
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      ctx.renderPath.renderCamera,
      rendering.overlayOrder
    );
    ctx.vtk.renderer.resetCameraClippingRange();
  }

  private updateCamera(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    dataId: string,
    cameraInput: unknown
  ): void {
    const camera = cameraInput as PlanarCamera | undefined;
    const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
    const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        camera,
        canvasHeight,
        canvasWidth,
        imageIdIndex: resolvePlanarVolumeImageIdIndex({
          camera,
          fallbackImageIdIndex: rendering.currentImageIdIndex,
        }),
        imageVolume: rendering.imageVolume,
        orientation: camera?.orientation,
      });

    ctx.display.activateRenderMode(ActorRenderMode.VTK_VOLUME_SLICE);
    const renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
    if (
      ctx.viewport.isCurrentDataId(dataId) ||
      ctx.renderPath.renderCamera === undefined
    ) {
      ctx.renderPath.renderCamera = renderCamera;
    }
    if (ctx.viewport.isCurrentDataId(dataId)) {
      applyPlanarRenderCameraToRenderer({
        renderer: ctx.vtk.renderer,
        renderCamera,
      });
    }
    applyPlanarRenderCameraToActor({
      actor: rendering.actor,
      renderCamera,
    });
    const imageIdIndexChanged =
      currentImageIdIndex !== rendering.currentImageIdIndex;
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;

    updateVolumeSlicePlane(rendering.mapper, ctx.renderPath.renderCamera);
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      ctx.renderPath.renderCamera,
      rendering.overlayOrder
    );
    ctx.vtk.renderer.resetCameraClippingRange();

    if (imageIdIndexChanged) {
      triggerPlanarVolumeNewImage(ctx, {
        camera,
        acquisitionOrientation: rendering.acquisitionOrientation,
        imageIds: rendering.imageIds,
        imageIdIndex: rendering.currentImageIdIndex,
      });
    }
  }

  private canvasToWorld(
    ctx: PlanarVtkVolumeAdapterContext,
    canvasPos: Point2
  ): Point3 {
    return canvasToWorldContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      canvasPos,
    });
  }

  private worldToCanvas(
    ctx: PlanarVtkVolumeAdapterContext,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: PlanarVolumeSliceRendering
  ): string | undefined {
    return rendering.imageVolume.metadata?.FrameOfReferenceUID;
  }

  private getImageData(
    rendering: PlanarVolumeSliceRendering
  ): IImageData | undefined {
    return buildPlanarVolumeImageData(rendering.imageVolume);
  }

  private render(ctx: PlanarVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  private resize(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    dataId: string
  ): void {
    const camera = ctx.viewport.getCameraState();
    const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
    const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        camera,
        canvasWidth,
        canvasHeight,
        imageIdIndex: rendering.currentImageIdIndex,
        imageVolume: rendering.imageVolume,
        orientation: camera?.orientation,
      });
    const renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
    if (
      ctx.viewport.isCurrentDataId(dataId) ||
      ctx.renderPath.renderCamera === undefined
    ) {
      ctx.renderPath.renderCamera = renderCamera;
    }
    if (ctx.viewport.isCurrentDataId(dataId)) {
      applyPlanarRenderCameraToRenderer({
        renderer: ctx.vtk.renderer,
        renderCamera,
      });
    }
    applyPlanarRenderCameraToActor({
      actor: rendering.actor,
      renderCamera,
    });
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    updateVolumeSlicePlane(rendering.mapper, ctx.renderPath.renderCamera);
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      ctx.renderPath.renderCamera,
      rendering.overlayOrder
    );
    ctx.vtk.renderer.resetCameraClippingRange();
    ctx.display.requestRender();
  }

  private removeData(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeActor(actor);
  }
}

export class VtkVolumeSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkVolumeAdapterContext
    >
{
  readonly id = 'planar:vtk-volume-slice';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' &&
      options.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
    );
  }

  createRenderPath() {
    return new VtkVolumeSliceRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarVtkVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      renderingEngineId: rootContext.renderingEngineId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      renderPath: rootContext.renderPath,
      display: rootContext.display,
      vtk: rootContext.vtk,
    };
  }
}

function subscribeToVolumeEvents(
  volumeId: string,
  onProgress: () => void
): () => void {
  const handleProgress = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onProgress();
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, handleProgress);
  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleProgress
  );

  return () => {
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      handleProgress
    );
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handleProgress
    );
  };
}

function ensureSlicePlane(mapper: vtkImageResliceMapper): vtkPlane {
  const existingSlicePlane = mapper.getSlicePlane?.();

  if (existingSlicePlane) {
    return existingSlicePlane;
  }

  const slicePlane = vtkPlaneFactory.newInstance();
  mapper.setSlicePlane(slicePlane);

  return slicePlane;
}

function updateVolumeSlicePlane(
  mapper: vtkImageResliceMapper,
  renderCamera?: Pick<PlanarCamera, 'focalPoint' | 'viewPlaneNormal'>
): void {
  if (!renderCamera?.focalPoint || !renderCamera.viewPlaneNormal) {
    return;
  }

  const slicePlane = ensureSlicePlane(mapper);
  slicePlane.setOrigin(...renderCamera.focalPoint);
  slicePlane.setNormal(...renderCamera.viewPlaneNormal);
}

function getImageSliceOverlayOrder(
  renderer: PlanarVtkVolumeAdapterContext['vtk']['renderer'],
  actor: PlanarVolumeSliceRendering['actor']
): number {
  const imageSliceActors = renderer
    .getActors()
    .filter(
      (currentActor) => currentActor?.getClassName?.() === 'vtkImageSlice'
    );

  return Math.max(0, imageSliceActors.indexOf(actor));
}

function updateVolumeSliceActorDepthOffset(
  actor: PlanarVolumeSliceRendering['actor'],
  renderCamera?: Pick<PlanarCamera, 'viewPlaneNormal'>,
  overlayOrder = 0
): void {
  if (!renderCamera?.viewPlaneNormal || overlayOrder <= 0) {
    actor.setPosition(0, 0, 0);
    return;
  }

  const [x, y, z] = renderCamera.viewPlaneNormal;
  const offset = overlayOrder * SLICE_OVERLAY_DEPTH_EPSILON;

  // Keep later slice actors microscopically closer to the camera to avoid
  // depth-buffer ties between coplanar fusion overlays.
  actor.setPosition(x * offset, y * offset, z * offset);
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
