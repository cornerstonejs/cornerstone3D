import '@kitware/vtk.js/Rendering/Profiles/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type {
  IImageData,
  IImageVolume,
  Point2,
  Point3,
  VoxelQualityRecord,
} from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
import uuidv4 from '../../../utilities/uuidv4';
import createVolumeActor from '../../helpers/createVolumeActor';
import {
  defaultVolumeStrategyProvider,
  selectFirstReadyStrategy,
} from '../../helpers/volumeRenderStrategy';
import type {
  IVolumeRenderStrategy,
  SelectVolumeStrategy,
  StrategyBinding,
  VolumeStrategyProvider,
  VolumeStrategyProvisionReason,
} from '../../helpers/volumeRenderStrategy';
import { getActiveGpuCapabilityProfile } from '../../../utilities/gpuCapabilityProfiles';
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
} from './viewport3DTypes';
import applyVolume3DCamera from './applyVolume3DCamera';
import { getInitialVolume3DCamera } from './vtkVolume3DInitialCamera';
import setVtkCameraClippingRange from '../setVtkCameraClippingRange';

/** @internal */
export class VtkVolume3DRenderPath
  implements RenderPath<Volume3DVtkVolumeAdapterContext>
{
  /**
   * The provider that builds the strategies of this render path.
   *
   * A new render type defines its own provider, and that is how a new render
   * type defines new texture sets.
   */
  private readonly provideStrategies: VolumeStrategyProvider;

  /**
   * The function that chooses the strategy of one render.
   *
   * A render component that implements phases supplies its own function. The
   * vtk-wasm path will use one: it reads a coarse maximum-value texture in a
   * first pass to find the bricks that hold no air, and then draws those.
   */
  private readonly selectStrategy: SelectVolumeStrategy;

  constructor(
    provideStrategies: VolumeStrategyProvider = defaultVolumeStrategyProvider,
    selectStrategy: SelectVolumeStrategy = selectFirstReadyStrategy
  ) {
    this.provideStrategies = provideStrategies;
    this.selectStrategy = selectStrategy;
  }

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
        provideStrategies: this.provideStrategies,
        selectStrategy: this.selectStrategy,
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
      viewportId: ctx.viewportId,
    };

    this.provisionStrategies(rendering, 'initial');
    this.applyStrategy(rendering);

    rendering.removeStreamingSubscriptions = subscribeToVolumeEvents(
      payload.volumeId,
      (eventType) => {
        if (eventType === Events.IMAGE_VOLUME_LOADING_COMPLETED) {
          this.provisionStrategies(rendering, 'loaded');
        }

        ctx.display.requestRender();
      }
    );

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
        this.render(ctx, rendering);
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

  private render(
    ctx: Volume3DVtkVolumeAdapterContext,
    rendering?: Volume3DVolumeRendering
  ): void {
    if (rendering) {
      this.applyStrategy(rendering);
    }

    ctx.display.requestRender();
  }

  /**
   * Runs the provider, and takes the strategies that it builds.
   *
   * This derives the voxels that a strategy needs and it allocates the
   * textures, which are the two expensive steps, so it never runs during a
   * render. It is called when the render path adds its actor, to build the
   * first strategies, and when the data of the volume finishes loading, so that
   * a strategy which could not draw before can be built. A later caller states
   * its own reason.
   *
   * A strategy that the provider builds again keeps its identity. The provider
   * builds fresh objects, and a fresh object holds no claim on its texture set,
   * so a run that replaced a live strategy would leave that claim behind.
   */
  private provisionStrategies(
    rendering: Volume3DVolumeRendering,
    reason: VolumeStrategyProvisionReason
  ): void {
    const held = rendering.strategies ?? [];
    const built = this.provideStrategies({
      volume: rendering.imageVolume,
      profile: getActiveGpuCapabilityProfile(),
      viewportId: rendering.viewportId,
      reason,
    });
    const strategies = built.map(
      (fresh) => held.find((existing) => existing.name === fresh.name) ?? fresh
    );

    for (const existing of held) {
      if (!strategies.includes(existing)) {
        existing.deactivate();
      }
    }

    rendering.strategies = strategies;

    if (rendering.strategy && !strategies.includes(rendering.strategy)) {
      rendering.strategy = undefined;
      rendering.boundTexture = undefined;
    }
  }

  /**
   * Chooses the strategy of this render, and binds what it offers.
   *
   * This runs on every render, so the render path changes its strategy between
   * two frames with no tear-down of the actor.
   *
   * Nothing is allocated here. The provider already built every strategy, so
   * this member chooses among them and cannot fail.
   */
  private applyStrategy(rendering: Volume3DVolumeRendering): void {
    const volume = rendering.imageVolume;

    if (!volume?.voxelGrid) {
      return;
    }

    const selected = this.selectStrategy({
      strategies: rendering.strategies ?? [],
      previous: rendering.strategy,
      volume,
      viewportId: rendering.viewportId,
    });

    if (selected !== rendering.strategy) {
      rendering.strategy?.deactivate();
      selected?.activate();
      rendering.strategy = selected;
    }

    selected?.update();

    this.bindStrategy(rendering, selected);
  }

  /**
   * Binds what the strategy offers.
   *
   * A strategy that offers no binding is ready, and it states that the data is
   * not in a texture. The render path then binds nothing and leaves the texture
   * of the previous render.
   */
  private bindStrategy(
    rendering: Volume3DVolumeRendering,
    strategy: IVolumeRenderStrategy | undefined
  ): void {
    const bindings = strategy?.bindings() ?? [];
    const base = bindings.find((binding) => binding.role === 'base');

    if (base && base.texture !== rendering.boundTexture) {
      // `vtkSharedVolumeMapper` adds this member, and the typing of
      // `vtkVolumeMapper` does not hold it.
      (
        rendering.mapper as unknown as {
          setScalarTexture?: (texture: unknown) => void;
        }
      ).setScalarTexture?.(base.texture);
      rendering.mapper.modified();
      rendering.boundTexture = base.texture;
    }

    rendering.voxelQuality = this.readQuality(rendering, bindings);
  }

  /**
   * The record of the quality for the render that just happened.
   *
   * The render composes this record, because the render is the only party that
   * knows which textures it used and how it used them.
   *
   * A 3D render samples the whole texture, where a slice render samples one
   * plane of it. The two therefore ask a different question of the data, and a
   * 3D viewport and a slice viewport over one volume can report a different
   * quality at the same moment.
   */
  private readQuality(
    rendering: Volume3DVolumeRendering,
    bindings: StrategyBinding[]
  ): VoxelQualityRecord | undefined {
    const base = bindings.find((binding) => binding.role === 'base');

    return rendering.imageVolume.getVoxelQuality(
      base
        ? { ceiling: base.grid.spacing, statistic: base.statistic }
        : undefined
    );
  }

  private resize(ctx: Volume3DVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  private removeData(
    ctx: Volume3DVtkVolumeAdapterContext,
    rendering: Volume3DVolumeRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

    // The actor is gone, so this render path holds no strategy any more.
    rendering.strategy?.deactivate();
    rendering.strategy = undefined;
    rendering.strategies = undefined;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }
}

/** @internal */
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
  setVtkCameraClippingRange(ctx.vtk.renderer.getActiveCamera());
}

function buildVolumeImageData(
  imageVolume: IImageVolume
): IImageData | undefined {
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
