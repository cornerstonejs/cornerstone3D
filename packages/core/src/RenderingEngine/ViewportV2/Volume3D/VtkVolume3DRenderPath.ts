import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { IImageData, Point2, Point3 } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
import createVolumeActor from '../../helpers/createVolumeActor';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from '../../helpers/vtkCanvasCoordinateTransforms';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DViewportRenderContext,
  Volume3DVolumePayload,
  Volume3DVolumeRendering,
  Volume3DVtkVolumeAdapterContext,
} from './3dViewportTypes';
import applyVolume3DCamera from './applyVolume3DCamera';
import { getInitialVolume3DCamera } from './vtkVolume3DInitialCamera';

export class VtkVolume3DRenderPath
  implements RenderPath<Volume3DVtkVolumeAdapterContext>
{
  async attach(
    ctx: Volume3DVtkVolumeAdapterContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<Volume3DVolumeRendering> {
    const payload = data.payload as Volume3DVolumePayload;
    const hadVolume = ctx.vtk.renderer.getVolumes().length > 0;
    const actor = await createVolumeActor(
      {
        volumeId: payload.volumeId,
      },
      ctx.viewport.element,
      ctx.viewportId,
      true
    );
    const mapper = actor.getMapper() as vtkVolumeMapper;

    ctx.vtk.renderer.addVolume(actor);
    if (!hadVolume) {
      const initialCamera = getInitialVolume3DCamera(ctx, payload.imageVolume);

      if (initialCamera) {
        applyCamera(ctx, initialCamera);
      }
    }
    setCameraClippingRange(ctx);

    const defaultRange = actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'vtkVolume3d',
      runtime: {
        actor,
        defaultVOIRange: defaultRange
          ? { lower: defaultRange[0], upper: defaultRange[1] }
          : undefined,
        imageVolume: payload.imageVolume,
        mapper,
        payload,
        removeStreamingSubscriptions: subscribeToVolumeEvents(
          payload.volumeId,
          () => {
            ctx.display.requestRender();
          }
        ),
      },
    };
  }

  updateDataPresentation(
    _ctx: Volume3DVtkVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyDataPresentation(
      rendering as Volume3DVolumeRendering,
      props as Volume3DDataPresentation | undefined
    );
  }

  updateCamera(
    ctx: Volume3DVtkVolumeAdapterContext,
    _rendering: MountedRendering,
    camera: unknown
  ): void {
    applyCamera(ctx, camera as Partial<Volume3DCamera> | undefined);
  }

  canvasToWorld(
    ctx: Volume3DVtkVolumeAdapterContext,
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
    ctx: Volume3DVtkVolumeAdapterContext,
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
    _ctx: Volume3DVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): string | undefined {
    return (rendering as Volume3DVolumeRendering).runtime.imageVolume.metadata
      ?.FrameOfReferenceUID;
  }

  getImageData(
    _ctx: Volume3DVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): IImageData | undefined {
    return buildVolumeImageData(
      (rendering as Volume3DVolumeRendering).runtime.imageVolume
    );
  }

  render(ctx: Volume3DVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  resize(ctx: Volume3DVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  detach(
    ctx: Volume3DVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = (
      rendering as Volume3DVolumeRendering
    ).runtime;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }
}

export class VtkVolume3DPath
  implements
    RenderPathDefinition<
      Volume3DViewportRenderContext,
      Volume3DVtkVolumeAdapterContext
    >
{
  readonly id = 'volume3d:vtk-volume';
  readonly type = ViewportType.VOLUME_3D_V2;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'image' && options.renderMode === 'vtkVolume3d';
  }

  createRenderPath() {
    return new VtkVolume3DRenderPath();
  }

  selectContext(
    rootContext: Volume3DViewportRenderContext
  ): Volume3DVtkVolumeAdapterContext {
    return rootContext;
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

  return () => {
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      handleProgress
    );
  };
}

function applyDataPresentation(
  rendering: Volume3DVolumeRendering,
  props?: Volume3DDataPresentation
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

  if (props?.sampleDistanceMultiplier !== undefined) {
    applySampleDistanceMultiplier(
      rendering.runtime.mapper,
      props.sampleDistanceMultiplier
    );
  }
}

function applyCamera(
  ctx: Volume3DVtkVolumeAdapterContext,
  camera?: Partial<Volume3DCamera>
): void {
  applyVolume3DCamera(ctx, camera);

  if (camera && camera.clippingRange === undefined) {
    setCameraClippingRange(ctx);
  }
}

function applySampleDistanceMultiplier(
  mapper: vtkVolumeMapper,
  multiplier: number
): void {
  const imageData = mapper.getInputData?.();

  if (!imageData) {
    return;
  }

  const spacing = imageData.getSpacing();
  const defaultSampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;

  mapper.setSampleDistance(defaultSampleDistance * (multiplier || 1));
}

function setCameraClippingRange(ctx: Volume3DVtkVolumeAdapterContext): void {
  const activeCamera = ctx.vtk.renderer.getActiveCamera();

  if (activeCamera.getParallelProjection()) {
    activeCamera.setClippingRange(
      -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
    );
  } else {
    activeCamera.setClippingRange(
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
    );
  }

  ctx.vtk.renderer.resetCameraClippingRange();
}

function buildVolumeImageData(imageVolume): IImageData | undefined {
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
