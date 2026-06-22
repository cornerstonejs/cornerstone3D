import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import uuidv4 from '../../../utilities/uuidv4';
import {
  InterpolationType,
  MetadataModules,
  ViewportType,
} from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { updateVTKImageDataWithCornerstoneImage } from '../../../utilities/updateVTKImageDataWithCornerstoneImage';
import * as metaData from '../../../metaData';
import { ActorRenderMode } from '../../../types';
import type { CPUIImageData, IImage, Point3 } from '../../../types';
import type { Point2 } from '../../../types';
import {
  applyPlanarImagePresentation,
  createVTKImageDataFromImage,
  getDefaultImageVOIRange,
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
  PlanarVtkImageAdapterContext,
} from './PlanarViewportTypes';
import type { PlanarImageMapperRendering } from './planarRuntimeTypes';
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from './planarAdapterCoordinateTransforms';
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

/** @internal */
export class VtkImageMapperRenderPath
  implements RenderPath<PlanarVtkImageAdapterContext>
{
  async addData(
    ctx: PlanarVtkImageAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.image) {
      throw new Error('[PlanarViewport] VTK image rendering requires an image');
    }

    const mapper = vtkImageMapper.newInstance();
    const actor = vtkImageSlice.newInstance();
    const imageData =
      payload.imageData ?? createVTKImageDataFromImage(payload.image);

    ctx.display.activateRenderMode(ActorRenderMode.VTK_IMAGE);
    mapper.setInputData(imageData);
    actor.setMapper(mapper);
    ctx.vtk.renderer.addActor(actor);
    const rendering: PlanarImageMapperRendering = {
      renderMode: ActorRenderMode.VTK_IMAGE,
      actorEntryUID: uuidv4(),
      actor,
      currentImage: payload.image,
      mapper,
      imageData,
      useWorldCoordinateImageData: payload.useWorldCoordinateImageData,
      currentImageIdIndex: payload.initialImageIdIndex,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      dataPresentation: undefined,
      loadRequestId: 0,
    };

    // STACK_NEW_IMAGE drives the source slice scrollbar/thumb. Only the source
    // binding represents a displayed-slice change; overlays (e.g. a segmentation
    // labelmap) must not fire it, otherwise adding/replacing the overlay snaps
    // the scrollbar to the overlay's own index (0) instead of the current slice.
    if (options.role !== 'overlay') {
      triggerPlanarNewImage(ctx, {
        image: payload.image,
        imageIdIndex: payload.initialImageIdIndex,
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
          renderMode: ActorRenderMode.VTK_IMAGE,
          uid: rendering.actorEntryUID,
          referencedIdFallback: rendering.currentImage.imageId,
        });
      },
      getImageData: () => {
        return this.getImageData(rendering);
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
    rendering: PlanarImageMapperRendering,
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
    ctx: PlanarVtkImageAdapterContext,
    rendering: PlanarImageMapperRendering,
    dataId: string,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarViewState | undefined;

    ctx.display.activateRenderMode(ActorRenderMode.VTK_IMAGE);

    if (rendering.useWorldCoordinateImageData) {
      return;
    }

    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      imageIds,
      rendering,
      viewState: planarCamera,
    });
    const nextImageIdIndex = resolvePlanarRenderPathCurrentImageIdIndex({
      projection,
      rendering,
      viewState: planarCamera,
    });

    if (projection) {
      applyPlanarImageActorTransforms(
        ctx,
        rendering,
        projection.resolvedICamera
      );

      if (projection.isSourceBinding) {
        applyPlanarICameraToRenderer({
          renderer: ctx.vtk.renderer,
          activeSourceICamera: projection.resolvedICamera,
        });
      }
    }

    // Dedup against the *last requested* index — not the currently rendered
    // one — so back-to-back navigation calls (e.g. Next then Previous) still
    // queue the second load when the first is in flight. Before this fix the
    // sequence `setImageIdIndex(1)` then `setImageIdIndex(0)` would early-out
    // on the second call because `currentImageIdIndex` was still 0 (the load
    // for index 1 hadn't completed), so the index-0 load never issued and
    // the stale index-1 load eventually rendered.
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

      void updateRenderedImage({
        ctx,
        dataId,
        image,
        rendering,
        imageIdIndex: nextImageIdIndex,
        dataPresentation: rendering.dataPresentation,
      });
    });
  }

  private canvasToWorld(
    ctx: PlanarVtkImageAdapterContext,
    canvasPos: Point2
  ): Point3 {
    return canvasToWorldContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      canvasPos,
    });
  }

  private worldToCanvas(
    ctx: PlanarVtkImageAdapterContext,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasContextPool({
      canvas: ctx.vtk.canvas,
      renderer: ctx.vtk.renderer,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: PlanarImageMapperRendering
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
    rendering: PlanarImageMapperRendering
  ): CPUIImageData | undefined {
    return buildPlanarImageData(
      rendering.currentImage,
      this.getFrameOfReferenceUID(rendering)
    );
  }

  private removeData(
    ctx: PlanarVtkImageAdapterContext,
    rendering: PlanarImageMapperRendering
  ): void {
    const { actor } = rendering;

    ctx.vtk.renderer.removeActor(actor);
  }

  private resize(
    ctx: PlanarVtkImageAdapterContext,
    rendering: PlanarImageMapperRendering,
    dataId: string
  ): void {
    if (rendering.useWorldCoordinateImageData) {
      ctx.display.requestRender();
      return;
    }

    const camera = ctx.viewport.getViewState();
    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
      rendering,
      viewState: camera,
    });

    if (projection) {
      applyPlanarImageActorTransforms(
        ctx,
        rendering,
        projection.resolvedICamera
      );

      if (projection.isSourceBinding) {
        applyPlanarICameraToRenderer({
          renderer: ctx.vtk.renderer,
          activeSourceICamera: projection.resolvedICamera,
        });
      }
    }

    ctx.display.requestRender();
  }
}

/** @internal */
export class VtkImageMapperPath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkImageAdapterContext
    >
{
  readonly id = 'planar:vtk-image-mapper';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' && options.renderMode === ActorRenderMode.VTK_IMAGE
    );
  }

  createRenderPath() {
    return new VtkImageMapperRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarVtkImageAdapterContext {
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

async function updateRenderedImage(args: {
  ctx: PlanarVtkImageAdapterContext;
  dataId: string;
  image: IImage;
  rendering: PlanarImageMapperRendering;
  imageIdIndex: number;
  dataPresentation?: PlanarDataPresentation;
}): Promise<void> {
  const { ctx, dataId, image, rendering, imageIdIndex, dataPresentation } =
    args;
  const camera = ctx.viewport.getViewState();
  const { actor, mapper } = rendering;

  // Reuse the existing vtkImageData and replace its scalars in place when the
  // incoming slice matches it (same dimensions / data type / components),
  // mirroring legacy StackViewport._updateActorToDisplayImageId. Allocating a
  // fresh vtkImageData per slice forces VTK to build a new GPU texture on every
  // scroll, and the first render after that swap draws before the new texture
  // has uploaded - a one-frame black flash. Updating the scalars in place keeps
  // the same texture (re-uploaded within the same render), so there is no flash.
  let imageData = rendering.imageData;

  if (imageData && canReuseImageDataForImage(imageData, image)) {
    updateVTKImageDataWithCornerstoneImage(imageData, image);
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
    rendering,
    viewState: camera,
  });

  if (projection) {
    applyPlanarImageActorTransforms(ctx, rendering, projection.resolvedICamera);

    if (projection.isSourceBinding) {
      applyPlanarICameraToRenderer({
        renderer: ctx.vtk.renderer,
        activeSourceICamera: projection.resolvedICamera,
      });
    }
  }

  // Only the source binding's slice change should drive the slice scrollbar; an
  // overlay (segmentation) slice update must not emit STACK_NEW_IMAGE.
  if (projection?.isSourceBinding) {
    triggerPlanarNewImage(ctx, { image, imageIdIndex });
  }
  ctx.display.requestRender();
}

/**
 * Whether an incoming image can have its scalars written into an existing
 * vtkImageData (reusing the same GPU texture) instead of allocating a new one.
 * Mirrors the safety-critical part of legacy
 * StackViewport._checkVTKImageDataMatchesCornerstoneImage: the in-place scalar
 * set is only valid when dimensions, data type and component count match.
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

function applyPlanarImageActorTransforms(
  ctx: PlanarVtkImageAdapterContext,
  rendering: PlanarImageMapperRendering,
  activeSourceICamera: PlanarResolvedICamera
): void {
  applyPlanarICameraToActor({
    actor: rendering.actor,
    activeSourceICamera,
  });
}
