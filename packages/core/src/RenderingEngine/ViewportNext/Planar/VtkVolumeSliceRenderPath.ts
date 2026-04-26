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
  PlanarViewState,
  PlanarDataPresentation,
  PlanarPayload,
  PlanarResolvedICamera,
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
  applyPlanarICameraToActor,
  applyPlanarICameraToRenderer,
  resolvePlanarICamera,
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
    const shouldInvalidateFullTextureOnVolumeModified =
      options.role === 'overlay' &&
      typeof payload.representationUID === 'string';

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
        (eventType) => {
          if (eventType === Events.IMAGE_VOLUME_MODIFIED) {
            if (shouldInvalidateFullTextureOnVolumeModified) {
              imageVolume.vtkOpenGLTexture?.modified?.();
            }

            mapper.modified();
          }

          ctx.display.requestRender();
        }
      ),
    };
    imageVolume.load(() => {
      ctx.display.requestRender();
    });

    triggerPlanarVolumeNewImage(ctx, {
      camera: ctx.viewport.getViewState(),
      acquisitionOrientation: rendering.acquisitionOrientation,
      imageIds: rendering.imageIds,
      imageIdIndex: rendering.currentImageIdIndex,
    });

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(ctx, rendering, props);
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
    updateVolumeSlicePlane(rendering.mapper, ctx.view.activeSourceICamera);
    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera: ctx.view.activeSourceICamera,
    });
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      ctx.view.activeSourceICamera,
      rendering.overlayOrder
    );
    ctx.vtk.renderer.resetCameraClippingRange();
  }

  private applyViewState(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    dataId: string,
    cameraInput: unknown
  ): void {
    const camera = cameraInput as PlanarViewState | undefined;
    const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
    const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        viewState: camera,
        canvasHeight,
        canvasWidth,
        imageIdIndex: resolvePlanarVolumeImageIdIndex({
          viewState: camera,
          fallbackImageIdIndex: rendering.currentImageIdIndex,
        }),
        imageVolume: rendering.imageVolume,
        orientation: camera?.orientation,
      });

    ctx.display.activateRenderMode(ActorRenderMode.VTK_VOLUME_SLICE);
    const resolvedICamera = resolvePlanarICamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
    const isSourceBinding = ctx.viewport.isCurrentDataId(dataId);

    if (isSourceBinding) {
      ctx.view.activeSourceICamera = resolvedICamera;
      applyPlanarICameraToRenderer({
        renderer: ctx.vtk.renderer,
        activeSourceICamera: resolvedICamera,
      });
    }
    const activeSourceICamera = isSourceBinding
      ? resolvedICamera
      : ctx.view.activeSourceICamera || resolvedICamera;

    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera,
    });
    const imageIdIndexChanged =
      currentImageIdIndex !== rendering.currentImageIdIndex;
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;

    updateVolumeSlicePlane(rendering.mapper, activeSourceICamera);
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      activeSourceICamera,
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
    const camera = ctx.viewport.getViewState();
    const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
    const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;
    const { sliceBasis, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeSliceBasis({
        viewState: camera,
        canvasWidth,
        canvasHeight,
        imageIdIndex: resolvePlanarVolumeImageIdIndex({
          viewState: camera,
          fallbackImageIdIndex: rendering.currentImageIdIndex,
        }),
        imageVolume: rendering.imageVolume,
        orientation: camera?.orientation,
      });
    const resolvedICamera = resolvePlanarICamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
    const isSourceBinding = ctx.viewport.isCurrentDataId(dataId);

    if (isSourceBinding) {
      ctx.view.activeSourceICamera = resolvedICamera;
      applyPlanarICameraToRenderer({
        renderer: ctx.vtk.renderer,
        activeSourceICamera: resolvedICamera,
      });
    }
    const activeSourceICamera = isSourceBinding
      ? resolvedICamera
      : ctx.view.activeSourceICamera || resolvedICamera;

    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera,
    });
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    updateVolumeSlicePlane(rendering.mapper, activeSourceICamera);
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      activeSourceICamera,
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
      view: rootContext.view,
      display: rootContext.display,
      vtk: rootContext.vtk,
    };
  }
}

function subscribeToVolumeEvents(
  volumeId: string,
  onProgress: (
    eventType:
      | Events.IMAGE_VOLUME_MODIFIED
      | Events.IMAGE_VOLUME_LOADING_COMPLETED
  ) => void
): () => void {
  const handleProgress = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onProgress(
      evt.type as
        | Events.IMAGE_VOLUME_MODIFIED
        | Events.IMAGE_VOLUME_LOADING_COMPLETED
    );
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
  activeSourceICamera?: Pick<
    PlanarResolvedICamera,
    'focalPoint' | 'viewPlaneNormal'
  >
): void {
  if (
    !activeSourceICamera?.focalPoint ||
    !activeSourceICamera.viewPlaneNormal
  ) {
    return;
  }

  const slicePlane = ensureSlicePlane(mapper);
  slicePlane.setOrigin(...activeSourceICamera.focalPoint);
  slicePlane.setNormal(...activeSourceICamera.viewPlaneNormal);
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
  activeSourceICamera?: Pick<PlanarResolvedICamera, 'viewPlaneNormal'>,
  overlayOrder = 0
): void {
  if (!activeSourceICamera?.viewPlaneNormal || overlayOrder <= 0) {
    actor.setPosition(0, 0, 0);
    return;
  }

  const [x, y, z] = activeSourceICamera.viewPlaneNormal;
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
