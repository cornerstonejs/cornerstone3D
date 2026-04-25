import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import {
  InterpolationType,
  MetadataModules,
  ViewportType,
} from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
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
  PlanarCamera,
  PlanarDataPresentation,
  PlanarPayload,
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
  applyPlanarRenderCameraToActor,
  applyPlanarRenderCameraToRenderer,
  resolvePlanarRenderCamera,
} from './planarRenderCamera';
import { createPlanarImageSliceBasis } from './planarSliceBasis';

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
    const imageData = createVTKImageDataFromImage(payload.image);

    ctx.display.activateRenderMode(ActorRenderMode.VTK_IMAGE);
    mapper.setInputData(imageData);
    actor.setMapper(mapper);
    ctx.vtk.renderer.addActor(actor);
    const rendering: PlanarImageMapperRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: ActorRenderMode.VTK_IMAGE,
      actor,
      currentImage: payload.image,
      mapper,
      imageData,
      currentImageIdIndex: payload.initialImageIdIndex,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      dataPresentation: undefined,
      loadRequestId: 0,
    };

    triggerPlanarNewImage(ctx, {
      image: payload.image,
      imageIdIndex: payload.initialImageIdIndex,
    });

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, data.id, camera, payload.imageIds);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getActorEntry: (data) => {
        return buildPlanarActorEntry(data as LoadedData<PlanarPayload>, {
          actor: rendering.actor,
          mapper: rendering.mapper,
          renderMode: ActorRenderMode.VTK_IMAGE,
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
      props: {
        interpolationType: InterpolationType.LINEAR,
        ...dataPresentation,
      },
    });
  }

  private updateCamera(
    ctx: PlanarVtkImageAdapterContext,
    rendering: PlanarImageMapperRendering,
    dataId: string,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ?? rendering.currentImageIdIndex;
    const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
    const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;

    ctx.display.activateRenderMode(ActorRenderMode.VTK_IMAGE);
    const sliceBasis = createPlanarImageSliceBasis({
      canvasHeight,
      canvasWidth,
      image: rendering.currentImage,
    });
    const renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera: planarCamera,
      canvasWidth,
      canvasHeight,
    });
    applyPlanarImageActorTransforms(ctx, rendering, renderCamera);
    if (ctx.viewport.isCurrentDataId(dataId)) {
      ctx.renderPath.renderCamera = renderCamera;
      applyPlanarRenderCameraToRenderer({
        renderer: ctx.vtk.renderer,
        renderCamera,
      });
    }

    if (nextImageIdIndex === rendering.currentImageIdIndex) {
      return;
    }

    if (nextImageIdIndex < 0 || nextImageIdIndex >= imageIds.length) {
      return;
    }

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
    const camera = ctx.viewport.getCameraState();
    const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
    const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;
    const sliceBasis = createPlanarImageSliceBasis({
      canvasHeight,
      canvasWidth,
      image: rendering.currentImage,
    });
    const renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
    applyPlanarImageActorTransforms(ctx, rendering, renderCamera);
    if (ctx.viewport.isCurrentDataId(dataId)) {
      ctx.renderPath.renderCamera = renderCamera;
      applyPlanarRenderCameraToRenderer({
        renderer: ctx.vtk.renderer,
        renderCamera,
      });
    }
    ctx.display.requestRender();
  }
}

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
  const camera = ctx.viewport.getCameraState();
  const { actor, mapper } = rendering;
  const imageData = createVTKImageDataFromImage(image);

  mapper.setInputData(imageData);
  rendering.currentImage = image;
  rendering.imageData = imageData;
  rendering.currentImageIdIndex = imageIdIndex;
  rendering.defaultVOIRange = getDefaultImageVOIRange(image);

  if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  applyPlanarImagePresentation({
    actor,
    defaultVOIRange: rendering.defaultVOIRange,
    props: {
      interpolationType:
        dataPresentation?.interpolationType ?? InterpolationType.LINEAR,
      ...dataPresentation,
    },
  });

  const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
  const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;
  const sliceBasis = createPlanarImageSliceBasis({
    canvasHeight,
    canvasWidth,
    image,
  });
  const renderCamera = resolvePlanarRenderCamera({
    sliceBasis,
    camera,
    canvasWidth,
    canvasHeight,
  });
  applyPlanarImageActorTransforms(ctx, rendering, renderCamera);
  if (ctx.viewport.isCurrentDataId(dataId)) {
    ctx.renderPath.renderCamera = renderCamera;
    applyPlanarRenderCameraToRenderer({
      renderer: ctx.vtk.renderer,
      renderCamera,
    });
  }
  triggerPlanarNewImage(ctx, { image, imageIdIndex });
  ctx.display.requestRender();
}

function applyPlanarImageActorTransforms(
  ctx: PlanarVtkImageAdapterContext,
  rendering: PlanarImageMapperRendering,
  renderCamera: ReturnType<typeof resolvePlanarRenderCamera>
): void {
  applyPlanarRenderCameraToActor({
    actor: rendering.actor,
    renderCamera,
  });

  for (const actorEntry of ctx.viewport.getOverlayActors()) {
    if (actorEntry.actorMapper?.renderMode !== ActorRenderMode.VTK_IMAGE) {
      continue;
    }

    applyPlanarRenderCameraToActor({
      actor: actorEntry.actor as never,
      renderCamera,
    });
  }
}
