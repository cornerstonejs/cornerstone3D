import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import { Events } from '../../../enums';
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
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type {
  Volume3DCamera,
  Volume3DPresentationProps,
  Volume3DProperties,
  Volume3DViewportRenderContext,
  Volume3DVolumePayload,
  Volume3DVolumeRendering,
  Volume3DVtkVolumeAdapterContext,
} from './3dViewportTypes';
import { getInitialVolume3DCamera } from './vtkVolume3DInitialCamera';

export class VtkVolume3DRenderingAdapter
  implements RenderingAdapter<Volume3DVtkVolumeAdapterContext>
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
      dataId: data.id,
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

  updatePresentation(
    _ctx: Volume3DVtkVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as Volume3DVolumeRendering,
      props as Volume3DPresentationProps | undefined
    );
  }

  updateCamera(
    ctx: Volume3DVtkVolumeAdapterContext,
    _rendering: MountedRendering,
    camera: unknown
  ): void {
    applyCamera(ctx, camera as Partial<Volume3DCamera> | undefined);
  }

  updateProperties(
    _ctx: Volume3DVtkVolumeAdapterContext,
    rendering: MountedRendering,
    properties: unknown
  ): void {
    applyProperties(
      rendering as Volume3DVolumeRendering,
      properties as Volume3DProperties | undefined
    );
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
  readonly type = '3d' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'image' && options.renderMode === 'vtkVolume3d';
  }

  createAdapter() {
    return new VtkVolume3DRenderingAdapter();
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

function applyPresentation(
  rendering: Volume3DVolumeRendering,
  props?: Volume3DPresentationProps
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
}

function applyCamera(
  ctx: Volume3DVtkVolumeAdapterContext,
  camera?: Partial<Volume3DCamera>
): void {
  if (!camera) {
    return;
  }

  const vtkCamera = ctx.vtk.renderer.getActiveCamera();

  if (camera.parallelProjection !== undefined) {
    vtkCamera.setParallelProjection(camera.parallelProjection);
  }

  if (camera.viewUp) {
    vtkCamera.setViewUp(...camera.viewUp);
  }

  if (camera.viewPlaneNormal) {
    vtkCamera.setDirectionOfProjection(
      -camera.viewPlaneNormal[0],
      -camera.viewPlaneNormal[1],
      -camera.viewPlaneNormal[2]
    );
  }

  if (camera.position) {
    vtkCamera.setPosition(...camera.position);
  }

  if (camera.focalPoint) {
    vtkCamera.setFocalPoint(...camera.focalPoint);
  }

  if (camera.parallelScale !== undefined) {
    vtkCamera.setParallelScale(camera.parallelScale);
  }

  if (camera.viewAngle !== undefined) {
    vtkCamera.setViewAngle(camera.viewAngle);
  }

  if (camera.clippingRange !== undefined) {
    vtkCamera.setClippingRange(...camera.clippingRange);
  } else {
    setCameraClippingRange(ctx);
  }
}

function applyProperties(
  rendering: Volume3DVolumeRendering,
  properties?: Volume3DProperties
): void {
  const { actor, mapper } = rendering.runtime;

  if (properties?.interpolationType !== undefined) {
    const property = actor.getProperty();

    property.setInterpolationType(
      properties.interpolationType as Parameters<
        typeof property.setInterpolationType
      >[0]
    );
  }

  if (properties?.sampleDistanceMultiplier !== undefined) {
    applySampleDistanceMultiplier(mapper, properties.sampleDistanceMultiplier);
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
