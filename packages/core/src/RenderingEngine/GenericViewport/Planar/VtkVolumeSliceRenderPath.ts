import vtkPlaneFactory from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import { Events, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import createVolumeSliceActor from '../../helpers/createVolumeSliceActor';
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
import { ActorRenderMode } from '../../../types';
import type {
  IImageData,
  Point2,
  Point3,
  VoxelQualityRecord,
} from '../../../types';
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
} from './planarRenderCamera';
import {
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import { applyPlanarVolumePresentation } from './planarVolumePresentation';

const SLICE_OVERLAY_DEPTH_EPSILON = 1e-4;
// Trailing delay before repainting a slab-projecting segmentation overlay
// after its volume was modified (brush edits fire many events per second).
const PROJECTING_OVERLAY_RENDER_DELAY_MS = 240;
/** @internal */
export class VtkVolumeSliceRenderPath
  implements RenderPath<PlanarVtkVolumeAdapterContext>
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
   * A render component that implements phases supplies its own function, and
   * that is where "reduced for the first render, full resolution for the
   * lossless render" belongs.
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
    ctx: PlanarVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
    const imageVolume = payload.imageVolume;
    const isSegmentationOverlay =
      options.role === 'overlay' && payload.reference?.kind === 'segmentation';

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewport] Volume rendering requires a prepared image volume'
      );
    }

    const { actor } = await createVolumeSliceActor(
      {
        volumeId: payload.volumeId,
        provideStrategies: this.provideStrategies,
        selectStrategy: this.selectStrategy,
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
      renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
      actorEntryUID: uuidv4(),
      actor,
      overlayOrder: getImageSliceOverlayOrder(ctx.vtk.renderer, actor),
      imageVolume,
      imageIds: payload.imageIds,
      acquisitionOrientation: payload.acquisitionOrientation,
      mapper,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      dataPresentation: undefined,
      isSegmentationOverlay,
      viewportId: ctx.viewportId,
    };

    this.provisionStrategies(rendering, 'initial');
    this.applyStrategy(rendering);

    let deferredProjectionRenderTimer: ReturnType<typeof setTimeout> | null =
      null;
    const removeVolumeSubscriptions = subscribeToVolumeEvents(
      payload.volumeId,
      (eventType) => {
        if (eventType === Events.IMAGE_VOLUME_MODIFIED) {
          // Volume writers (streaming loader, labelmap updates) mark the
          // modified slices on the shared streaming texture themselves, so
          // the next render only re-uploads those slices; the mapper just
          // needs to know its buffers are stale.
          mapper.modified();
        }

        if (eventType === Events.IMAGE_VOLUME_LOADING_COMPLETED) {
          this.provisionStrategies(rendering, 'loaded');
        }

        const isProjectingOverlay =
          rendering.isSegmentationOverlay &&
          (rendering.dataPresentation?.slabThickness ?? 0) > 0;

        if (!isProjectingOverlay) {
          ctx.display.requestRender();
          return;
        }

        // A slab-projecting overlay (e.g. labelmap over a MIP) re-marches the
        // whole slab per fragment, which is far too expensive to repeat for
        // every brush-stroke event; repaint once the modification stream goes
        // quiet instead of live.
        if (deferredProjectionRenderTimer !== null) {
          clearTimeout(deferredProjectionRenderTimer);
        }
        deferredProjectionRenderTimer = setTimeout(() => {
          deferredProjectionRenderTimer = null;
          ctx.display.requestRender();
        }, PROJECTING_OVERLAY_RENDER_DELAY_MS);
      }
    );
    rendering.removeStreamingSubscriptions = () => {
      if (deferredProjectionRenderTimer !== null) {
        clearTimeout(deferredProjectionRenderTimer);
        deferredProjectionRenderTimer = null;
      }
      removeVolumeSubscriptions();
    };
    imageVolume.load(() => {
      ctx.display.requestRender();
    });

    triggerPlanarVolumeNewImage(ctx, {
      camera: ctx.viewport.getViewState(),
      acquisitionOrientation: rendering.acquisitionOrientation,
      imageIds: rendering.imageIds,
      imageIdIndex: rendering.currentImageIdIndex,
      maxImageIdIndex: rendering.maxImageIdIndex,
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
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    props: unknown
  ): void {
    rendering.dataPresentation = props as PlanarDataPresentation | undefined;
    // Segmentation overlays get their color/opacity transfer functions from
    // the segmentation styling (setLabelmapColorAndOpacity); rebuilding them
    // here from a VOI range would overwrite the label colors with a grayscale
    // ramp. Dropping the default VOI keeps the presentation application to
    // blend/slab/visibility for those actors.
    applyPlanarVolumePresentation({
      actor: rendering.actor,
      defaultVOIRange: rendering.isSegmentationOverlay
        ? undefined
        : rendering.defaultVOIRange,
      mapper: rendering.mapper,
      props: rendering.dataPresentation,
    });
    const activeSourceICamera = getPlanarRenderPathActiveSourceICamera(ctx);

    updateVolumeSlicePlane(rendering.mapper, activeSourceICamera);
    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera,
    });
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      activeSourceICamera,
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

    ctx.display.activateRenderMode(ActorRenderMode.VTK_VOLUME_SLICE);
    this.syncRenderCamera(ctx, rendering, dataId, camera, true);
  }

  private syncRenderCamera(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    dataId: string,
    camera: PlanarViewState | undefined,
    triggerImageEvent: boolean
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

    if (projection.isSourceBinding) {
      applyPlanarICameraToRenderer({
        renderer: ctx.vtk.renderer,
        activeSourceICamera: projection.resolvedICamera,
      });
    }

    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera: projection.activeSourceICamera,
    });
    const imageIdIndexChanged =
      projection.currentImageIdIndex !== rendering.currentImageIdIndex;
    const maxImageIdIndexChanged =
      projection.maxImageIdIndex !== rendering.maxImageIdIndex;

    rendering.currentImageIdIndex = projection.currentImageIdIndex;
    rendering.maxImageIdIndex = projection.maxImageIdIndex;

    if (imageIdIndexChanged || maxImageIdIndexChanged) {
      ctx.viewport.invalidateResolvedView();
    }

    updateVolumeSlicePlane(rendering.mapper, projection.activeSourceICamera);
    updateVolumeSliceActorDepthOffset(
      rendering.actor,
      projection.activeSourceICamera,
      rendering.overlayOrder
    );
    ctx.vtk.renderer.resetCameraClippingRange();

    if (triggerImageEvent && imageIdIndexChanged) {
      triggerPlanarVolumeNewImage(ctx, {
        camera,
        acquisitionOrientation: rendering.acquisitionOrientation,
        imageIds: rendering.imageIds,
        imageIdIndex: rendering.currentImageIdIndex,
        maxImageIdIndex: rendering.maxImageIdIndex,
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

  private render(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering?: PlanarVolumeSliceRendering
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
   * The textures that this builds hold no data yet. The loader fills the voxel
   * managers as the data arrives, the volume marks the affected textures, and
   * each render refills the marked slices.
   *
   * A strategy that the provider builds again keeps its identity. The provider
   * builds fresh objects, and a fresh object holds no claim on its texture set,
   * so a run that replaced a live strategy would leave that claim behind.
   */
  private provisionStrategies(
    rendering: PlanarVolumeSliceRendering,
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
      // The provider stopped naming the strategy that this render path drew, so
      // the next render selects again and binds again.
      rendering.strategy = undefined;
      rendering.boundTexture = undefined;
    }
  }

  /**
   * Chooses the strategy of this render, and binds what it offers.
   *
   * This runs on every render, so the render path changes its strategy between
   * two frames with no tear-down of the actor. `setScalarTexture` of the mapper
   * permits that.
   *
   * Nothing is allocated here. The provider already built every strategy, so
   * this member chooses among them and cannot fail.
   *
   * A choice of nothing is legal, and it binds no texture. A CPU render does
   * that for its lossless pass.
   */
  private applyStrategy(rendering: PlanarVolumeSliceRendering): void {
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
   * not in a texture: the full-resolution data may live in the voxel manager of
   * a device that cannot hold the texture. The render path then binds nothing
   * and leaves the texture of the previous render.
   */
  private bindStrategy(
    rendering: PlanarVolumeSliceRendering,
    strategy: IVolumeRenderStrategy | undefined
  ): void {
    const bindings = strategy?.bindings() ?? [];
    const base = bindings.find((binding) => binding.role === 'base');

    if (base && base.texture !== rendering.boundTexture) {
      // `vtkSharedImageResliceMapper` adds this member, and the typing of
      // `vtkImageResliceMapper` does not hold it. `createVolumeSliceActor`
      // calls it in the same way.
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
   * knows which textures it used and how it used them. A render that reads a
   * coarse texture only to decide which fine textures to sample does not report
   * the quality of that coarse texture.
   *
   * This render path samples one plane from one texture, so the record follows
   * the grid of the `base` binding. A strategy that offers no binding states
   * that the render reads the composite at its full resolution, so the record
   * passes no ceiling.
   */
  private readQuality(
    rendering: PlanarVolumeSliceRendering,
    bindings: StrategyBinding[]
  ): VoxelQualityRecord | undefined {
    const base = bindings.find((binding) => binding.role === 'base');

    return rendering.imageVolume.getVoxelQuality(
      base
        ? { ceiling: base.grid.spacing, statistic: base.statistic }
        : undefined
    );
  }

  private resize(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering,
    dataId: string
  ): void {
    const camera = ctx.viewport.getViewState();

    this.syncRenderCamera(ctx, rendering, dataId, camera, false);
    ctx.display.requestRender();
  }

  private removeData(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = rendering;

    // The actor is gone, so this render path holds no strategy any more.
    rendering.strategy?.deactivate();
    rendering.strategy = undefined;
    rendering.strategies = undefined;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeActor(actor);
  }
}

/** @internal */
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
