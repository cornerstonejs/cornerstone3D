import '@kitware/vtk.js/Rendering/Profiles/Volume';
import { RENDERING_DEFAULTS } from '../../../constants';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import createVolumeActor from '../../helpers/createVolumeActor';
import type { IImageData, Point2, Point3 } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
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
  async addData(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
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
      actor,
      imageVolume,
      mapper,
      currentImageIdIndex: payload.initialImageIdIndex,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      baseCamera: undefined,
      camera: undefined,
      viewState: undefined,
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

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(ctx, rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, camera);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(ctx, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(ctx, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(ctx);
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
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeMapperRendering,
    props: unknown
  ): void {
    applyDataPresentation(
      ctx,
      rendering,
      props as PlanarDataPresentation | undefined
    );
  }

  private updateCamera(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeMapperRendering,
    camera: unknown
  ): void {
    const viewState = camera as PlanarCamera | undefined;
    const { baseCamera, currentImageIdIndex, maxImageIdIndex } =
      createPlanarVolumeCameraState({
        canvasHeight: ctx.vtk.canvas.clientHeight,
        canvasWidth: ctx.vtk.canvas.clientWidth,
        imageIdIndex: viewState?.imageIdIndex,
        imageVolume: rendering.imageVolume,
        orientation: viewState?.orientation,
      });

    ctx.display.activateRenderMode('vtkVolume');
    rendering.baseCamera = baseCamera;
    rendering.camera = applyPlanarVolumeCameraToRenderer({
      baseCamera,
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      viewState,
    });
    rendering.currentImageIdIndex = currentImageIdIndex;
    rendering.maxImageIdIndex = maxImageIdIndex;
    rendering.viewState = viewState;

    if (rendering.camera?.focalPoint && rendering.camera.viewPlaneNormal) {
      updatePlanarVolumeClippingPlanes({
        camera: {
          focalPoint: rendering.camera.focalPoint,
          viewPlaneNormal: rendering.camera.viewPlaneNormal,
        },
        mapper: rendering.mapper,
        slabThickness: resolveSlabThickness(
          rendering.dataPresentation?.slabThickness
        ),
      });
      setPlanarVolumeCameraClippingRange(ctx.vtk.renderer);
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
    rendering: PlanarVolumeMapperRendering
  ): string | undefined {
    return rendering.imageVolume.metadata?.FrameOfReferenceUID;
  }

  private getImageData(
    rendering: PlanarVolumeMapperRendering
  ): IImageData | undefined {
    return buildPlanarVolumeImageData(rendering.imageVolume);
  }

  private render(ctx: PlanarVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  private resize(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeMapperRendering
  ): void {
    rendering.camera = applyPlanarVolumeCameraToRenderer({
      baseCamera: rendering.baseCamera,
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      viewState: rendering.viewState,
    });

    if (rendering.camera?.focalPoint && rendering.camera.viewPlaneNormal) {
      updatePlanarVolumeClippingPlanes({
        camera: {
          focalPoint: rendering.camera.focalPoint,
          viewPlaneNormal: rendering.camera.viewPlaneNormal,
        },
        mapper: rendering.mapper,
        slabThickness: resolveSlabThickness(
          rendering.dataPresentation?.slabThickness
        ),
      });
      setPlanarVolumeCameraClippingRange(ctx.vtk.renderer);
    }

    ctx.display.requestRender();
  }

  private removeData(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeMapperRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

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

  matches(data: LoadedData, options: DataAddOptions): boolean {
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
  const { actor, defaultVOIRange, mapper } = rendering;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;
  const slabThickness = resolveSlabThickness(props?.slabThickness);

  rendering.dataPresentation = props;

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

  if (slabThickness !== undefined) {
    mapper.setBlendModeToMaximumIntensity();
  } else {
    mapper.setBlendModeToComposite();
  }

  if (rendering.camera?.focalPoint && rendering.camera.viewPlaneNormal) {
    updatePlanarVolumeClippingPlanes({
      camera: {
        focalPoint: rendering.camera.focalPoint,
        viewPlaneNormal: rendering.camera.viewPlaneNormal,
      },
      mapper,
      slabThickness,
    });
    setPlanarVolumeCameraClippingRange(ctx.vtk.renderer);
  }
}

function resolveSlabThickness(slabThickness?: number): number | undefined {
  if (typeof slabThickness !== 'number' || slabThickness <= 0) {
    return;
  }

  return Math.max(slabThickness, RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS);
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
