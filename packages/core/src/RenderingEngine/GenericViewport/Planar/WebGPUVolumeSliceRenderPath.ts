import vtkPlaneFactory from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import { Events, ViewportStatus, ViewportType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import setDefaultVolumeVOI from '../../helpers/setDefaultVolumeVOI';
import triggerEvent from '../../../utilities/triggerEvent';
import type { IImageData, IImageVolume } from '../../../types';
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
} from './PlanarViewportTypes';
import type { PlanarVolumeSliceRendering } from './planarRuntimeTypes';
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
import type { PlanarWebGPUImageAdapterContext } from './WebGPUImageMapperRenderPath';
import type { WebGPUViewportWindow } from './webgpuViewportRenderWindow';
import {
  acquireWebGPUViewportWindow,
  releaseWebGPUViewportWindow,
  renderWebGPUViewportWindow,
} from './webgpuViewportRenderWindow';

/**
 * Wire id of the WebGPU volume-slice (MPR) render mode (follows the
 * `vtkVolumeSlice` / `cpuVolume` naming of the core render modes).
 * @internal
 */
export const WEBGPU_VOLUME_RENDER_MODE = 'webgpuVolume';

const SLICE_OVERLAY_DEPTH_EPSILON = 1e-4;

type PlanarWebGPUVolumeSliceRendering = Omit<
  PlanarVolumeSliceRendering,
  'renderMode'
> & {
  renderMode: typeof WEBGPU_VOLUME_RENDER_MODE;
  /** The mapper input imageData carrying real scalars (see addData). */
  mapperImageData: ReturnType<typeof vtkImageData.newInstance>;
};

/**
 * See VtkVolumeSliceRenderPath — the projection helpers are typed against the
 * closed PlanarRendering union; this rendering state is structurally the
 * volume-slice shape apart from the renderMode literal.
 */
function asProjectionRendering(
  rendering: PlanarWebGPUVolumeSliceRendering
): PlanarVolumeSliceRendering {
  return rendering as unknown as PlanarVolumeSliceRendering;
}

/**
 * Volume-slice (MPR) render path backed by the vtk.js WebGPU view API.
 *
 * Scene setup mirrors VtkVolumeSliceRenderPath (vtkImageResliceMapper with a
 * slice plane derived from the resolved camera, slab via the mapper API,
 * presentation via applyPlanarVolumePresentation) with two structural
 * differences:
 *
 * 1. Self-rendering: frames render through the per-viewport WebGPU window and
 *    blit into the `cpu` surface canvas (see WebGPUImageMapperRenderPath).
 * 2. Mapper input: cornerstone volume imageData carries no scalar point data
 *    (voxel data lives in the voxelManager; the OpenGL path streams it via
 *    custom texture classes). The stock WebGPU mapper reads
 *    `imageData.getPointData().getScalars()`, so this path builds a parallel
 *    mapper-input imageData whose scalars are the voxelManager's complete
 *    scalar array. Non-streamed phase: the texture uploads once from the
 *    current array contents; a full refresh happens on volume load
 *    completion (progressive per-frame texture updates are a follow-up).
 *
 * @internal
 */
export class WebGPUVolumeSliceRenderPath
  implements RenderPath<PlanarWebGPUImageAdapterContext>
{
  private window?: WebGPUViewportWindow;

  async addData(
    ctx: PlanarWebGPUImageAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;
    const imageVolume = payload.imageVolume;

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewport] WebGPU volume rendering requires a prepared image volume'
      );
    }

    const window = acquireWebGPUViewportWindow(ctx.viewportId, {
      renderingEngineId: ctx.renderingEngineId,
    });
    this.window = window;

    const mapperImageDataEntry = acquireMapperImageData(
      payload.volumeId,
      imageVolume
    );
    const mapperImageData = mapperImageDataEntry.imageData;
    const slicePlane = vtkPlaneFactory.newInstance();
    const mapper = vtkImageResliceMapper.newInstance();

    mapper.setInputData(mapperImageData);
    mapper.setSlicePlane(slicePlane);
    mapper.setSlabThickness(0);

    const actor = vtkImageSlice.newInstance();
    actor.setMapper(mapper);

    const imageDataMetadata = imageVolume.imageData?.get(
      'numberOfComponents'
    ) as { numberOfComponents?: number } | undefined;

    if ((imageDataMetadata?.numberOfComponents ?? 1) > 1) {
      actor.getProperty().setIndependentComponents(false);
    }

    await setDefaultVolumeVOI(actor, imageVolume);
    applyScalarRangeFallback(actor, imageVolume);

    ctx.display.activateRenderMode(WEBGPU_VOLUME_RENDER_MODE);
    window.renderer.addActor(actor);

    const transferFunction = actor.getProperty().getRGBTransferFunction(0);
    const defaultRange = transferFunction?.getRange?.();

    const rendering: PlanarWebGPUVolumeSliceRendering = {
      renderMode: WEBGPU_VOLUME_RENDER_MODE,
      actorEntryUID: uuidv4(),
      actor,
      overlayOrder: getImageSliceOverlayOrder(window, actor),
      imageVolume,
      imageIds: payload.imageIds,
      acquisitionOrientation: payload.acquisitionOrientation,
      mapper,
      mapperImageData,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      maxImageIdIndex: payload.imageIds.length - 1,
      defaultVOIRange: defaultRange
        ? { lower: defaultRange[0], upper: defaultRange[1] }
        : undefined,
      dataPresentation: undefined,
      removeStreamingSubscriptions: subscribeToVolumeEvents(
        payload.volumeId,
        (eventType) => {
          if (
            eventType === Events.IMAGE_VOLUME_LOADING_COMPLETED &&
            !mapperImageDataEntry.refreshedAfterLoad
          ) {
            mapperImageDataEntry.refreshedAfterLoad = true;
            refreshMapperScalars(rendering);
          }

          ctx.display.renderNow();
        }
      ),
    };
    imageVolume.load(() => {
      ctx.display.renderNow();
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
        return rendering.imageVolume.metadata?.FrameOfReferenceUID;
      },
      getActorEntry: (data) => {
        const planarData = data as LoadedData<PlanarPayload>;

        return buildPlanarActorEntry(planarData, {
          actor: rendering.actor,
          mapper: rendering.mapper,
          renderMode: WEBGPU_VOLUME_RENDER_MODE as never,
          uid: rendering.actorEntryUID,
          referencedIdFallback: planarData.volumeId,
        });
      },
      getImageData: () => {
        return buildPlanarVolumeImageData(rendering.imageVolume);
      },
      render: () => {
        this.render(ctx, data.id);
      },
      resize: () => {
        this.resize(ctx, rendering, data.id);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private render(ctx: PlanarWebGPUImageAdapterContext, dataId: string): void {
    if (!this.window) {
      return;
    }

    if (!ctx.viewport.isCurrentDataId(dataId)) {
      return;
    }

    renderWebGPUViewportWindow(this.window, ctx.cpu.canvas, () => {
      ctx.display.markRendered();
      triggerEvent(ctx.viewport.element, Events.IMAGE_RENDERED, {
        element: ctx.viewport.element,
        viewportId: ctx.viewportId,
        renderingEngineId: ctx.renderingEngineId,
        viewportStatus: ViewportStatus.RENDERED,
      });
    });
  }

  private updateDataPresentation(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUVolumeSliceRendering,
    props: unknown
  ): void {
    if (!this.window) {
      return;
    }

    rendering.dataPresentation = props as PlanarDataPresentation | undefined;
    applyPlanarVolumePresentation({
      actor: rendering.actor,
      defaultVOIRange: rendering.defaultVOIRange,
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
    this.window.renderer.resetCameraClippingRange();
  }

  private applyViewState(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUVolumeSliceRendering,
    dataId: string,
    cameraInput: unknown
  ): void {
    const camera = cameraInput as PlanarViewState | undefined;

    ctx.display.activateRenderMode(WEBGPU_VOLUME_RENDER_MODE);
    this.syncRenderCamera(ctx, rendering, dataId, camera, true);
  }

  private syncRenderCamera(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUVolumeSliceRendering,
    dataId: string,
    camera: PlanarViewState | undefined,
    triggerImageEvent: boolean
  ): void {
    if (!this.window) {
      return;
    }

    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      rendering: asProjectionRendering(rendering),
      viewState: camera,
    });

    if (!projection) {
      return;
    }

    if (projection.isSourceBinding) {
      applyPlanarICameraToRenderer({
        renderer: this.window.renderer,
        activeSourceICamera: projection.resolvedICamera,
      });
      // Mirror onto the engine's vtk renderer: it never draws for this
      // self-rendering viewport, but legacy getCamera() and camera-dependent
      // consumers (tools, the labelmap image-mapper plan) read it.
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
    this.window.renderer.resetCameraClippingRange();

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

  private resize(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUVolumeSliceRendering,
    dataId: string
  ): void {
    const camera = ctx.viewport.getViewState();

    this.syncRenderCamera(ctx, rendering, dataId, camera, false);
    ctx.display.renderNow();
  }

  private removeData(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUVolumeSliceRendering
  ): void {
    rendering.removeStreamingSubscriptions?.();

    if (this.window) {
      this.window.renderer.removeActor(rendering.actor);
      this.window = undefined;
      releaseWebGPUViewportWindow(ctx.viewportId);
    }

    releaseMapperImageData(rendering.imageVolume.volumeId);
  }
}

/** @internal */
export class WebGPUVolumeSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarWebGPUImageAdapterContext
    >
{
  readonly id = 'planar:webgpu-volume-slice';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' && options.renderMode === WEBGPU_VOLUME_RENDER_MODE
    );
  }

  createRenderPath() {
    return new WebGPUVolumeSliceRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarWebGPUImageAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      renderingEngineId: rootContext.renderingEngineId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      renderPath: rootContext.renderPath,
      view: rootContext.view,
      display: rootContext.display,
      cpu: rootContext.cpu,
      vtk: rootContext.vtk,
    };
  }
}

/**
 * Shared mapper-input imageData per volume. Materializing the voxel data is
 * a full copy (cornerstone volumes are image-backed and own no contiguous
 * array), so every viewport rendering the same volume must share one
 * instance — reference-counted like the per-viewport windows.
 */
const mapperImageDataByVolumeId = new Map<
  string,
  {
    imageData: ReturnType<typeof vtkImageData.newInstance>;
    refCount: number;
    refreshedAfterLoad: boolean;
  }
>();

function acquireMapperImageData(volumeId: string, imageVolume: IImageVolume) {
  let entry = mapperImageDataByVolumeId.get(volumeId);

  if (!entry) {
    entry = {
      imageData: createMapperImageData(imageVolume),
      refCount: 0,
      refreshedAfterLoad: false,
    };
    mapperImageDataByVolumeId.set(volumeId, entry);
  }

  entry.refCount += 1;
  return entry;
}

function releaseMapperImageData(volumeId: string): void {
  const entry = mapperImageDataByVolumeId.get(volumeId);

  if (!entry) {
    return;
  }

  entry.refCount -= 1;

  if (entry.refCount <= 0) {
    mapperImageDataByVolumeId.delete(volumeId);
    entry.imageData.delete();
  }
}

/**
 * Builds the mapper input vtkImageData: same geometry as the volume's
 * imageData, with real scalar point data materialized from the voxelManager
 * (the volume's own imageData intentionally carries none — see the class
 * docstring).
 */
function createMapperImageData(imageVolume: IImageVolume) {
  const sourceImageData = imageVolume.imageData;

  if (!sourceImageData) {
    throw new Error(
      '[PlanarViewport] WebGPU volume rendering requires volume imageData'
    );
  }

  const values = getVolumeScalarArray(imageVolume);
  const imageDataMetadata = sourceImageData.get('numberOfComponents') as
    | { numberOfComponents?: number }
    | undefined;
  const scalars = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: imageDataMetadata?.numberOfComponents ?? 1,
    values,
  });
  const mapperImageData = vtkImageData.newInstance();

  mapperImageData.setDimensions(sourceImageData.getDimensions());
  mapperImageData.setSpacing(sourceImageData.getSpacing());
  mapperImageData.setDirection(sourceImageData.getDirection());
  mapperImageData.setOrigin(sourceImageData.getOrigin());
  mapperImageData.getPointData().setScalars(scalars);

  return mapperImageData;
}

function getVolumeScalarArray(imageVolume: IImageVolume) {
  const voxelManager = imageVolume.voxelManager as
    | {
        getCompleteScalarDataArray?: () => ArrayLike<number>;
        getScalarData?: () => ArrayLike<number>;
      }
    | undefined;
  const values =
    voxelManager?.getCompleteScalarDataArray?.() ??
    voxelManager?.getScalarData?.();

  if (!values) {
    throw new Error(
      '[PlanarViewport] WebGPU volume rendering requires voxel data'
    );
  }

  return values as number[];
}

/**
 * Re-materializes the voxel data into the mapper's scalar array once the
 * volume finishes loading, invalidating the cached GPU texture exactly once.
 */
function refreshMapperScalars(
  rendering: PlanarWebGPUVolumeSliceRendering
): void {
  const scalars = rendering.mapperImageData.getPointData().getScalars();

  if (!scalars) {
    return;
  }

  const values = getVolumeScalarArray(rendering.imageVolume);

  if (scalars.getData() !== values) {
    scalars.setData(values as never);
  }

  scalars.modified();
  rendering.mapperImageData.modified();
  rendering.mapper.modified();
}

/**
 * Mirrors createVolumeSliceActor's window/level fallback: when
 * setDefaultVolumeVOI leaves the vtk default (255 / 127.5), derive a range
 * from the actual voxel data.
 */
function applyScalarRangeFallback(
  actor: ReturnType<typeof vtkImageSlice.newInstance>,
  imageVolume: IImageVolume
): void {
  const imageProperty = actor.getProperty();
  const defaultWindow = imageProperty.getColorWindow?.();
  const defaultLevel = imageProperty.getColorLevel?.();

  if (defaultWindow !== 255 || defaultLevel !== 127.5) {
    return;
  }

  const voxelManager = imageVolume.voxelManager as
    | { getRange?: () => number[] }
    | undefined;
  const scalarRange = voxelManager?.getRange?.();

  if (scalarRange?.length === 2) {
    imageProperty.setColorWindow(scalarRange[1] - scalarRange[0]);
    imageProperty.setColorLevel((scalarRange[1] + scalarRange[0]) / 2);
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

function ensureSlicePlane(
  mapper: PlanarVolumeSliceRendering['mapper']
): vtkPlane {
  const existingSlicePlane = mapper.getSlicePlane?.();

  if (existingSlicePlane) {
    return existingSlicePlane;
  }

  const slicePlane = vtkPlaneFactory.newInstance();
  mapper.setSlicePlane(slicePlane);

  return slicePlane;
}

function updateVolumeSlicePlane(
  mapper: PlanarVolumeSliceRendering['mapper'],
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
  window: WebGPUViewportWindow,
  actor: PlanarVolumeSliceRendering['actor']
): number {
  const imageSliceActors = window.renderer
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

function buildPlanarVolumeImageData(
  imageVolume: IImageVolume
): IImageData | undefined {
  const vtkVolumeImageData = imageVolume.imageData;

  if (!vtkVolumeImageData) {
    return;
  }

  return {
    dimensions: vtkVolumeImageData.getDimensions(),
    spacing: vtkVolumeImageData.getSpacing(),
    origin: vtkVolumeImageData.getOrigin(),
    direction: vtkVolumeImageData.getDirection(),
    imageData: vtkVolumeImageData,
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
  } as unknown as IImageData;
}
