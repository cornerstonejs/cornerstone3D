import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import createVolumeActor from '../../helpers/createVolumeActor';
import type { IImageData, Point2, Point3, VOIRange } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarDataPresentation,
  PlanarPayload,
  PlanarViewportRenderContext,
  PlanarVolumeMapperRendering,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportV2Types';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from './planarAdapterCoordinateTransforms';
import {
  applyPlanarVolumeCameraToRenderer,
  createPlanarVolumeCameraState,
  setPlanarVolumeCameraClippingRange,
  updatePlanarVolumeClippingPlanes,
} from './planarVolumeCameraState';

export class VtkVolumeMapperRenderPath
  implements RenderPath<PlanarVtkVolumeAdapterContext>
{
  async attach(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarVolumeMapperRendering> {
    const payload = data.payload as PlanarPayload;
    const imageVolume = payload.imageVolume;

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewportV2] Volume rendering requires a prepared image volume'
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

    ctx.display.activateRenderMode('vtkVolume');
    ctx.vtk.renderer.addVolume(actor);

    const defaultRange = actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    const rendering: PlanarVolumeMapperRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'vtkVolume',
      runtime: {
        actor,
        imageVolume,
        mapper,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        maxImageIdIndex: payload.imageIds.length - 1,
        defaultVOIRange: defaultRange
          ? { lower: defaultRange[0], upper: defaultRange[1] }
          : undefined,
        baseCamera: undefined,
        camera: undefined,
        viewState: undefined,
        removeStreamingSubscriptions: subscribeToVolumeEvents(
          payload.volumeId,
          () => {
            ctx.display.requestRender();
          }
        ),
      },
    };
    imageVolume.load(() => {
      ctx.display.requestRender();
    });

    return rendering;
  }

  updateDataPresentation(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyDataPresentation(
      ctx,
      rendering as PlanarVolumeMapperRendering,
      props as PlanarDataPresentation | undefined
    );
  }

  updateCamera(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const runtime = (rendering as PlanarVolumeMapperRendering).runtime;
    const viewState = camera as PlanarCamera | undefined;
    const { baseCamera, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeCameraState({
        canvasHeight:
          ctx.vtk.canvas.clientHeight ||
          ctx.vtk.canvas.height ||
          ctx.viewport.element.clientHeight,
        canvasWidth:
          ctx.vtk.canvas.clientWidth ||
          ctx.vtk.canvas.width ||
          ctx.viewport.element.clientWidth,
        imageIdIndex: viewState?.imageIdIndex,
        imageVolume: runtime.imageVolume,
        orientation: viewState?.orientation,
      });

    ctx.display.activateRenderMode('vtkVolume');
    runtime.baseCamera = baseCamera;
    runtime.camera = applyPlanarVolumeCameraToRenderer({
      baseCamera,
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      viewState,
    });
    runtime.currentImageIdIndex = currentImageIdIndex;
    runtime.maxImageIdIndex = maxImageIdIndex;
    runtime.viewState = viewState;

    if (runtime.camera?.focalPoint && runtime.camera.viewPlaneNormal) {
      updatePlanarVolumeClippingPlanes({
        camera: {
          focalPoint: runtime.camera.focalPoint,
          viewPlaneNormal: runtime.camera.viewPlaneNormal,
        },
        mapper: runtime.mapper,
      });
      setPlanarVolumeCameraClippingRange(ctx.vtk.renderer);
    }
  }

  canvasToWorld(
    ctx: PlanarVtkVolumeAdapterContext,
    _rendering: MountedRendering,
    canvasPos: Point2
  ): Point3 {
    return canvasToWorldContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      canvasPos,
    });
  }

  worldToCanvas(
    ctx: PlanarVtkVolumeAdapterContext,
    _rendering: MountedRendering,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      worldPos,
    });
  }

  getFrameOfReferenceUID(
    _ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): string | undefined {
    return (rendering as PlanarVolumeMapperRendering).runtime.imageVolume
      .metadata?.FrameOfReferenceUID;
  }

  getImageData(
    _ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): IImageData | undefined {
    return buildPlanarVolumeImageData(
      (rendering as PlanarVolumeMapperRendering).runtime.imageVolume
    );
  }

  render(ctx: PlanarVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  resize(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const runtime = (rendering as PlanarVolumeMapperRendering).runtime;

    runtime.camera = applyPlanarVolumeCameraToRenderer({
      baseCamera: runtime.baseCamera,
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      viewState: runtime.viewState,
    });

    if (runtime.camera?.focalPoint && runtime.camera.viewPlaneNormal) {
      updatePlanarVolumeClippingPlanes({
        camera: {
          focalPoint: runtime.camera.focalPoint,
          viewPlaneNormal: runtime.camera.viewPlaneNormal,
        },
        mapper: runtime.mapper,
      });
      setPlanarVolumeCameraClippingRange(ctx.vtk.renderer);
    }

    ctx.display.requestRender();
  }

  detach(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = (
      rendering as PlanarVolumeMapperRendering
    ).runtime;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }
}

export class VtkVolumeMapperPath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkVolumeAdapterContext
    >
{
  readonly id = 'planar:vtk-volume-mapper';
  readonly type = ViewportType.PLANAR_V2;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'image' && options.renderMode === 'vtkVolume';
  }

  createRenderPath() {
    return new VtkVolumeMapperRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarVtkVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      type: rootContext.type,
      viewport: rootContext.viewport,
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

function applyDataPresentation(
  ctx: PlanarVtkVolumeAdapterContext,
  rendering: PlanarVolumeMapperRendering,
  props?: PlanarDataPresentation
): void {
  const { actor, defaultVOIRange } = rendering.runtime;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;

  actor.setVisibility(props?.visible === false ? false : true);

  if (props?.opacity !== undefined) {
    updateVolumeOpacity(actor, props.opacity);
  }

  if (!voiRange) {
    return;
  }

  const transferFunction = createLinearRGBTransferFunction(voiRange);

  if (props?.invert) {
    invertRgbTransferFunction(transferFunction);
  }

  property.setRGBTransferFunction(0, transferFunction);

  if (props?.interpolationType !== undefined) {
    property.setInterpolationType(
      props.interpolationType as Parameters<
        typeof property.setInterpolationType
      >[0]
    );
  }

  if (
    rendering.runtime.camera?.focalPoint &&
    rendering.runtime.camera.viewPlaneNormal
  ) {
    updatePlanarVolumeClippingPlanes({
      camera: {
        focalPoint: rendering.runtime.camera.focalPoint,
        viewPlaneNormal: rendering.runtime.camera.viewPlaneNormal,
      },
      mapper: rendering.runtime.mapper,
      slabThickness: props?.slabThickness,
    });
    setPlanarVolumeCameraClippingRange(ctx.vtk.renderer);
  }
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
