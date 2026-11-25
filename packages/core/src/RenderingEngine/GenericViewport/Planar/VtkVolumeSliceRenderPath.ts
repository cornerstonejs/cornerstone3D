import vtkPlaneFactory from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import { Events, ViewportType } from '../../../enums';
import createVolumeSliceActor from '../../helpers/createVolumeSliceActor';
import {
  defaultVolumeStrategyProvider,
  selectFirstReadyStrategy,
} from '../../helpers/volumeRenderStrategy';
import type {
  SelectVolumeStrategy,
  VolumeStrategyProvider,
  VolumeStrategyProvisionReason,
} from '../../helpers/volumeRenderStrategy';
import * as lifecycle from '../../helpers/volumeStrategyLifecycle';
import type { VolumeStrategyHooks } from '../../helpers/volumeStrategyLifecycle';
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
} from './planarRenderCamera';
import {
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import { applyPlanarVolumePresentation } from './planarVolumePresentation';
import {
  acquiredFrameActors,
  withAcquiredFrames,
} from './planarAcquiredFrames';
import { isSegmentationOverlayData } from '../renderingFidelity';
import { gridWorldToIndex } from '../../../utilities/voxelGrid';

const SLICE_OVERLAY_DEPTH_EPSILON = 1e-4;
// Trailing delay before repainting a slab-projecting segmentation overlay
// after its volume was modified (brush edits fire many events per second).
const PROJECTING_OVERLAY_RENDER_DELAY_MS = 240;
/** @internal */
export class VtkVolumeSliceRenderPath
  implements RenderPath<PlanarVtkVolumeAdapterContext>
{
  /**
   * The provider that builds the strategies of this render path, and the
   * function that chooses the strategy of one render.
   *
   * A new render type defines its own provider, and that is how a new render
   * type defines new texture sets. A render component that implements phases
   * supplies its own selection, and that is where "reduced for the first
   * render, full resolution for the lossless render" belongs.
   */
  private readonly hooks: VolumeStrategyHooks<PlanarVolumeSliceRendering>;

  constructor(
    provideStrategies: VolumeStrategyProvider = defaultVolumeStrategyProvider,
    selectStrategy: SelectVolumeStrategy = selectFirstReadyStrategy
  ) {
    this.hooks = { provideStrategies, selectStrategy };
  }

  async addData(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
    const imageVolume = payload.imageVolume;
    const isSegmentationOverlay = isSegmentationOverlayData(payload, options);

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewport] Volume rendering requires a prepared image volume'
      );
    }

    const { actor } = await createVolumeSliceActor(
      { volumeId: payload.volumeId, ...this.hooks },
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
      excludeFromFidelity: isSegmentationOverlay,
      fullGrid: imageVolume.voxelGrid,
      // A slice samples no ray, so it has no interactive sample reduction.
      sampleDistanceLod: 1,
    };
    rendering.refreshFidelity = () => lifecycle.refreshFidelity(rendering);

    this.provisionStrategies(rendering, 'initial');
    this.applyStrategy(rendering);

    let deferredProjectionRenderTimer: ReturnType<typeof setTimeout> | null =
      null;
    const removeVolumeSubscriptions = lifecycle.subscribeToVolumeEvents(
      payload.volumeId,
      (eventType) => {
        if (eventType === Events.IMAGE_VOLUME_MODIFIED) {
          // Volume writers mark the modified slices on the shared streaming
          // texture themselves; the mapper only needs to know that its
          // buffers are stale.
          rendering.mapper.modified();
        }
        lifecycle.onVolumeData(rendering, eventType, this.hooks);

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

    const attachment: RenderPathAttachment<PlanarDataPresentation> = {
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

    return isSegmentationOverlay
      ? attachment
      : withAcquiredFrames(ctx, data as LoadedData<PlanarPayload>, attachment);
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
      this.setFillHint(ctx, rendering);
    }

    ctx.display.requestRender();
  }

  /**
   * Starts the next budgeted fill of the bound texture at the slice of the
   * focal point, so the slice that this view shows fills first.
   */
  private setFillHint(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: PlanarVolumeSliceRendering
  ): void {
    const focalPoint = getPlanarRenderPathActiveSourceICamera(ctx)?.focalPoint;
    const grid = rendering.boundGrid?.grid;

    if (focalPoint && grid) {
      rendering.boundTexture?.setFillHint?.(
        gridWorldToIndex(grid, focalPoint)[2]
      );
    }
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
    lifecycle.releaseStrategies(rendering);
    rendering.removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeActor(rendering.actor);
  }

  private provisionStrategies(
    rendering: PlanarVolumeSliceRendering,
    reason: VolumeStrategyProvisionReason
  ): void {
    lifecycle.provisionStrategies(
      rendering,
      this.hooks.provideStrategies,
      reason
    );
  }

  private applyStrategy(rendering: PlanarVolumeSliceRendering): void {
    lifecycle.applyStrategy(rendering, this.hooks);
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

/** @internal The depth order of a slice actor; acquired frame actors do not count. */
export function getImageSliceOverlayOrder(
  renderer: PlanarVtkVolumeAdapterContext['vtk']['renderer'],
  actor: PlanarVolumeSliceRendering['actor']
): number {
  const imageSliceActors = renderer
    .getActors()
    .filter(
      (currentActor) =>
        currentActor?.getClassName?.() === 'vtkImageSlice' &&
        !acquiredFrameActors.has(currentActor)
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
