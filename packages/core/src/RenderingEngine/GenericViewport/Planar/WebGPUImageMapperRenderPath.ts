import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import {
  Events,
  InterpolationType,
  MetadataModules,
  ViewportStatus,
  ViewportType,
} from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { updateVTKImageDataWithCornerstoneImage } from '../../../utilities/updateVTKImageDataWithCornerstoneImage';
import * as metaData from '../../../metaData';
import triggerEvent from '../../../utilities/triggerEvent';
import type { CPUIImageData, IImage } from '../../../types';
import {
  applyPlanarImagePresentation,
  createVTKImageDataFromImage,
  getDefaultImageVOIRange,
  updateVTKImageDataGeometryFromImage,
} from '../../helpers/planarImageRendering';
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
  PlanarCpuImageAdapterContext,
} from './PlanarViewportTypes';
import type { PlanarImageMapperRendering } from './planarRuntimeTypes';
import { buildPlanarImageData } from './CpuImageSliceRenderPath';
import { triggerPlanarNewImage } from './planarImageEvents';
import {
  applyPlanarICameraToActor,
  applyPlanarICameraToRenderer,
} from './planarRenderCamera';
import {
  resolvePlanarRenderPathCurrentImageIdIndex,
  resolvePlanarRenderPathProjection,
} from './planarRenderPathProjection';
import type { WebGPUViewportWindow } from './webgpuViewportRenderWindow';
import {
  acquireWebGPUViewportWindow,
  releaseWebGPUViewportWindow,
  renderWebGPUViewportWindow,
} from './webgpuViewportRenderWindow';

/**
 * Wire id of the WebGPU image render mode (follows the `vtkImage` /
 * `cpuImage` naming of the core render modes).
 * @internal
 */
export const WEBGPU_IMAGE_RENDER_MODE = 'webgpuImage';

/**
 * The WebGPU path renders through its own per-viewport vtk.js WebGPU render
 * window and blits into the viewport's `cpu` surface canvas, so its adapter
 * context is the same slice of the root context the CPU image path uses.
 * @internal
 */
export type PlanarWebGPUImageAdapterContext = PlanarCpuImageAdapterContext;

type PlanarWebGPUImageRendering = Omit<
  PlanarImageMapperRendering,
  'renderMode'
> & {
  renderMode: typeof WEBGPU_IMAGE_RENDER_MODE;
};

/**
 * The shared planar projection helpers are typed against the closed
 * `PlanarRendering` union of the built-in render modes; this path's rendering
 * state is structurally identical to the vtkImage one apart from the
 * renderMode literal, so present it as such at those call sites.
 */
function asProjectionRendering(
  rendering: PlanarWebGPUImageRendering
): PlanarImageMapperRendering {
  return rendering as unknown as PlanarImageMapperRendering;
}

/**
 * GPU image-stack render path backed by the vtk.js WebGPU view API instead of
 * the shared offscreen OpenGL multi-render-window.
 *
 * Scene setup mirrors VtkImageMapperRenderPath (stock vtkImageMapper +
 * vtkImageSlice + the planar projection/camera helpers). The difference is in
 * how frames reach the screen: this path owns a per-viewport WebGPU render
 * window, its attachment exposes `render()` (self-rendering, like the CPU
 * path), and each frame is blitted into the viewport's `cpu` surface canvas
 * once the WebGPU queue reports the submitted work done. The `cpu` surface is
 * reused as the blit target because the surface system currently only knows
 * `'vtk' | 'cpu'` and the `'vtk'` canvas belongs to the engine's WebGL blit
 * cycle.
 *
 * @internal
 */
export class WebGPUImageMapperRenderPath
  implements RenderPath<PlanarWebGPUImageAdapterContext>
{
  private window?: WebGPUViewportWindow;

  async addData(
    ctx: PlanarWebGPUImageAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.image) {
      throw new Error(
        '[PlanarViewport] WebGPU image rendering requires an image'
      );
    }

    const window = acquireWebGPUViewportWindow(ctx.viewportId);
    this.window = window;

    // 16-bit handling: the vtk.js WebGPU texture manager uploads non-8-bit
    // scalar types (Int16/Uint16/Float) as r16float (half-float). There is no
    // norm16 equivalent in WebGPU, so precision matches the WebGL
    // no-EXT_texture_norm16 fallback path.
    const mapper = vtkImageMapper.newInstance();
    const actor = vtkImageSlice.newInstance();
    const imageData =
      payload.imageData ?? createVTKImageDataFromImage(payload.image);

    ctx.display.activateRenderMode(WEBGPU_IMAGE_RENDER_MODE);
    mapper.setInputData(imageData);
    actor.setMapper(mapper);
    // Multi-component images (e.g. RGB ultrasound) must render as direct
    // color; see VtkImageMapperRenderPath.
    if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
      actor.getProperty().setIndependentComponents(false);
    }
    window.renderer.addActor(actor);

    const rendering: PlanarWebGPUImageRendering = {
      renderMode: WEBGPU_IMAGE_RENDER_MODE,
      actorEntryUID: uuidv4(),
      actor,
      currentImage: payload.image,
      mapper,
      imageData,
      useWorldCoordinateImageData: payload.useWorldCoordinateImageData,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      dataPresentation: undefined,
      loadRequestId: 0,
    };

    // Only the source binding drives the slice scrollbar; see
    // VtkImageMapperRenderPath.
    if (options.role !== 'overlay') {
      triggerPlanarNewImage(ctx, {
        image: payload.image,
        imageIdIndex: payload.initialImageIdIndex ?? 0,
      });
    }

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      applyViewState: (camera) => {
        this.applyViewState(ctx, rendering, data.id, camera, payload.imageIds);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getActorEntry: (data) => {
        return buildPlanarActorEntry(data as LoadedData<PlanarPayload>, {
          actor: rendering.actor,
          mapper: rendering.mapper,
          // ActorEntry.actorMapper.renderMode is typed on the closed
          // ActorRenderMode enum; this path's wire id is an extension string.
          renderMode: WEBGPU_IMAGE_RENDER_MODE as never,
          uid: rendering.actorEntryUID,
          referencedIdFallback: rendering.currentImage.imageId,
        });
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      // Presence of render() makes this binding self-rendering: the viewport
      // calls it synchronously from renderBindings() and skips the engine's
      // WebGL render/blit cycle for this viewport.
      render: () => {
        this.render(ctx, rendering, data.id);
      },
      resize: () => {
        this.resize(ctx, rendering, data.id);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private render(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUImageRendering,
    dataId: string
  ): void {
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
    rendering: PlanarWebGPUImageRendering,
    props: unknown
  ): void {
    const dataPresentation = props as PlanarDataPresentation | undefined;

    rendering.dataPresentation = dataPresentation;
    applyPlanarImagePresentation({
      actor: rendering.actor,
      defaultVOIRange: rendering.defaultVOIRange,
      defaultVOILUTFunction: rendering.currentImage?.voiLUTFunction,
      props: {
        interpolationType: InterpolationType.LINEAR,
        ...dataPresentation,
      },
    });
  }

  private applyViewState(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUImageRendering,
    dataId: string,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarViewState | undefined;

    ctx.display.activateRenderMode(WEBGPU_IMAGE_RENDER_MODE);

    if (rendering.useWorldCoordinateImageData) {
      return;
    }

    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      imageIds,
      rendering: asProjectionRendering(rendering),
      viewState: planarCamera,
    });
    const nextImageIdIndex = resolvePlanarRenderPathCurrentImageIdIndex({
      projection,
      rendering: asProjectionRendering(rendering),
      viewState: planarCamera,
    });

    if (projection) {
      this.applyActorAndCamera(rendering, projection);
    }

    // Dedup against the last *requested* index; see VtkImageMapperRenderPath
    // for why this must not use currentImageIdIndex.
    const dedupTarget =
      rendering.lastRequestedImageIdIndex ?? rendering.currentImageIdIndex;

    if (nextImageIdIndex === dedupTarget) {
      return;
    }

    if (nextImageIdIndex < 0 || nextImageIdIndex >= imageIds.length) {
      return;
    }

    rendering.lastRequestedImageIdIndex = nextImageIdIndex;
    const requestId = ++rendering.loadRequestId;

    void loadAndCacheImage(imageIds[nextImageIdIndex]).then((image) => {
      if (requestId !== rendering.loadRequestId) {
        return;
      }

      this.updateRenderedImage({
        ctx,
        dataId,
        image,
        rendering,
        imageIdIndex: nextImageIdIndex,
        dataPresentation: rendering.dataPresentation,
      });
    });
  }

  private applyActorAndCamera(
    rendering: PlanarWebGPUImageRendering,
    projection: {
      resolvedICamera: PlanarResolvedICamera;
      isSourceBinding: boolean;
    }
  ): void {
    if (!this.window) {
      return;
    }

    applyPlanarICameraToActor({
      actor: rendering.actor,
      activeSourceICamera: projection.resolvedICamera,
    });

    if (projection.isSourceBinding) {
      applyPlanarICameraToRenderer({
        renderer: this.window.renderer,
        activeSourceICamera: projection.resolvedICamera,
      });
    }
  }

  private updateRenderedImage(args: {
    ctx: PlanarWebGPUImageAdapterContext;
    dataId: string;
    image: IImage;
    rendering: PlanarWebGPUImageRendering;
    imageIdIndex: number;
    dataPresentation?: PlanarDataPresentation;
  }): void {
    const { ctx, dataId, image, rendering, imageIdIndex, dataPresentation } =
      args;
    const camera = ctx.viewport.getViewState();
    const { actor, mapper } = rendering;

    // In-place scalar reuse mirrors VtkImageMapperRenderPath. Note: the
    // vtk.js WebGPU texture manager caches textures by scalars mtime, so a
    // scalar update still creates a new GPU texture per slice (no partial
    // update yet); the reuse here keeps the vtkImageData/actor stable.
    let imageData = rendering.imageData;

    if (imageData && canReuseImageDataForImage(imageData, image)) {
      updateVTKImageDataWithCornerstoneImage(imageData, image);
      updateVTKImageDataGeometryFromImage(imageData, image);
    } else {
      imageData = createVTKImageDataFromImage(image);
      mapper.setInputData(imageData);
    }

    rendering.currentImage = image;
    rendering.imageData = imageData;
    rendering.currentImageIdIndex = imageIdIndex;
    rendering.defaultVOIRange = getDefaultImageVOIRange(image);
    ctx.viewport.invalidateResolvedView();

    if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
      actor.getProperty().setIndependentComponents(false);
    }

    applyPlanarImagePresentation({
      actor,
      defaultVOIRange: rendering.defaultVOIRange,
      defaultVOILUTFunction: image.voiLUTFunction,
      props: {
        interpolationType:
          dataPresentation?.interpolationType ?? InterpolationType.LINEAR,
        ...dataPresentation,
      },
    });

    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      rendering: asProjectionRendering(rendering),
      viewState: camera,
    });

    if (projection) {
      this.applyActorAndCamera(rendering, projection);
    }

    if (projection?.isSourceBinding) {
      triggerPlanarNewImage(ctx, { image, imageIdIndex });
    }

    // Self-rendering path: the engine RAF cycle does not repaint this
    // viewport, so request a synchronous viewport render (which re-enters
    // this path's render()).
    ctx.display.renderNow();
  }

  private getFrameOfReferenceUID(
    rendering: PlanarWebGPUImageRendering
  ): string | undefined {
    const imageId = rendering.currentImage.imageId;
    const imagePlaneModule = imageId
      ? (metaData.get(MetadataModules.IMAGE_PLANE, imageId) as
          | { frameOfReferenceUID?: string }
          | undefined)
      : undefined;

    return imagePlaneModule?.frameOfReferenceUID;
  }

  private getImageData(
    rendering: PlanarWebGPUImageRendering
  ): CPUIImageData | undefined {
    return buildPlanarImageData(
      rendering.currentImage,
      this.getFrameOfReferenceUID(rendering)
    );
  }

  private removeData(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUImageRendering
  ): void {
    if (this.window) {
      this.window.renderer.removeActor(rendering.actor);
      this.window = undefined;
      releaseWebGPUViewportWindow(ctx.viewportId);
    }
  }

  private resize(
    ctx: PlanarWebGPUImageAdapterContext,
    rendering: PlanarWebGPUImageRendering,
    dataId: string
  ): void {
    if (rendering.useWorldCoordinateImageData) {
      ctx.display.renderNow();
      return;
    }

    const camera = ctx.viewport.getViewState();
    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      rendering: asProjectionRendering(rendering),
      viewState: camera,
    });

    if (projection) {
      this.applyActorAndCamera(rendering, projection);
    }

    ctx.display.renderNow();
  }
}

/** @internal */
export class WebGPUImageMapperPath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarWebGPUImageAdapterContext
    >
{
  readonly id = 'planar:webgpu-image-mapper';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' && options.renderMode === WEBGPU_IMAGE_RENDER_MODE
    );
  }

  createRenderPath() {
    return new WebGPUImageMapperRenderPath();
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
    };
  }
}

/**
 * See VtkImageMapperRenderPath.canReuseImageDataForImage — same safety
 * checks for in-place scalar replacement.
 */
function canReuseImageDataForImage(
  imageData: ReturnType<typeof createVTKImageDataFromImage>,
  image: IImage
): boolean {
  const scalars = imageData.getPointData?.()?.getScalars?.();

  if (!scalars) {
    return false;
  }

  const [xVoxels, yVoxels] = imageData.getDimensions();

  if (xVoxels !== image.columns || yVoxels !== image.rows) {
    return false;
  }

  if (
    scalars.getDataType() !==
    image.voxelManager.getScalarData().constructor.name
  ) {
    return false;
  }

  const incomingComponents = image.color ? 3 : 1;

  return scalars.getNumberOfComponents() === incomingComponents;
}
