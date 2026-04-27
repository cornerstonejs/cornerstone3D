import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { IImageData, Point2, Point3 } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
import uuidv4 from '../../../utilities/uuidv4';
import createVolumeActor from '../../helpers/createVolumeActor';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from '../../helpers/vtkCanvasCoordinateTransforms';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
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
  async addData(
    ctx: Volume3DVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<Volume3DDataPresentation>> {
    const payload: Volume3DVolumePayload =
      data as unknown as LoadedData<Volume3DVolumePayload>;
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

    const rendering: Volume3DVolumeRendering = {
      renderMode: 'vtkVolume3d',
      actorEntryUID: uuidv4(),
      actor,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      imageVolume: payload.imageVolume,
      mapper,
      removeStreamingSubscriptions: subscribeToVolumeEvents(
        payload.volumeId,
        () => {
          ctx.display.requestRender();
        }
      ),
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      applyViewState: (camera) => {
        this.applyViewState(ctx, camera);
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
        this.resize(ctx);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private updateDataPresentation(
    rendering: Volume3DVolumeRendering,
    props: unknown
  ): void {
    applyDataPresentation(
      rendering,
      props as Volume3DDataPresentation | undefined
    );
  }

  private applyViewState(
    ctx: Volume3DVtkVolumeAdapterContext,
    camera: unknown
  ): void {
    applyCamera(ctx, camera as Partial<Volume3DCamera> | undefined);
  }

  private canvasToWorld(
    ctx: Volume3DVtkVolumeAdapterContext,
    canvasPos: Point2
  ): Point3 {
    return canvasToWorldContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      canvasPos,
    });
  }

  private worldToCanvas(
    ctx: Volume3DVtkVolumeAdapterContext,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: Volume3DVolumeRendering
  ): string | undefined {
    return rendering.imageVolume.metadata?.FrameOfReferenceUID;
  }

  private getImageData(
    rendering: Volume3DVolumeRendering
  ): IImageData | undefined {
    return buildVolumeImageData(rendering.imageVolume);
  }

  private render(ctx: Volume3DVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  private resize(ctx: Volume3DVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  private removeData(
    ctx: Volume3DVtkVolumeAdapterContext,
    rendering: Volume3DVolumeRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

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
  readonly type = ViewportType.VOLUME_3D_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
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
  const { actor, defaultVOIRange } = rendering;
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
      rendering.mapper,
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
  const safeMultiplier = Number.isFinite(multiplier)
    ? Math.max(multiplier, 0.001)
    : 1;

  mapper.setSampleDistance(defaultSampleDistance * safeMultiplier);
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
