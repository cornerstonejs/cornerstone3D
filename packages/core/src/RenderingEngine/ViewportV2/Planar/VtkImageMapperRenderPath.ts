import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import {
  InterpolationType,
  MetadataModules,
  ViewportType,
} from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import * as metaData from '../../../metaData';
import type { CPUIImageData, IImage, Point3 } from '../../../types';
import type { Point2 } from '../../../types';
import {
  applyPlanarImagePresentation,
  createVTKImageDataFromImage,
  getDefaultImageVOIRange,
  getPlanarCameraState,
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
  PlanarImageMapperRendering,
  PlanarPayload,
  PlanarViewportRenderContext,
  PlanarVtkImageAdapterContext,
} from './PlanarViewportV2Types';
import {
  applyPlanarCanvasCameraViewState,
  canvasToWorldContextPool,
  getCpuEquivalentParallelScale,
  worldToCanvasContextPool,
} from './planarAdapterCoordinateTransforms';
import { buildPlanarImageData } from './CpuImageSliceRenderPath';

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
      throw new Error(
        '[PlanarViewportV2] VTK image rendering requires an image'
      );
    }

    const mapper = vtkImageMapper.newInstance();
    const actor = vtkImageSlice.newInstance();
    const imageData = createVTKImageDataFromImage(payload.image);

    ctx.display.activateRenderMode('vtkImage');
    mapper.setInputData(imageData);
    actor.setMapper(mapper);
    ctx.vtk.renderer.addActor(actor);
    applyImageOrientationToCamera(ctx.vtk.renderer, imageData);
    ctx.vtk.renderer.resetCamera();
    applyCpuEquivalentInitialScale(ctx, payload.image);

    const rendering: PlanarImageMapperRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'vtkImage',
      actor,
      currentImage: payload.image,
      mapper,
      imageData,
      currentImageIdIndex: payload.initialImageIdIndex,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      initialCamera: getPlanarCameraState(ctx.vtk.renderer),
      camera: getVtkImageCompatibilityCamera(ctx.vtk.renderer),
      loadRequestId: 0,
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, camera, payload.imageIds);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(ctx, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(ctx, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getImageData: () => {
        return this.getImageData(rendering);
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
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ?? rendering.currentImageIdIndex;

    ctx.display.activateRenderMode('vtkImage');
    applyPlanarCanvasCameraViewState({
      canvas: ctx.vtk.canvas,
      baseCamera: rendering.initialCamera,
      renderer: ctx.vtk.renderer,
      viewState: {
        pan: planarCamera?.pan,
        rotation: planarCamera?.rotation,
        zoom: planarCamera?.zoom,
      },
    });
    rendering.camera = getVtkImageCompatibilityCamera(ctx.vtk.renderer);

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
        image,
        rendering,
        imageIdIndex: nextImageIdIndex,
        camera: planarCamera,
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
}

export class VtkImageMapperPath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkImageAdapterContext
    >
{
  readonly id = 'planar:vtk-image-mapper';
  readonly type = ViewportType.PLANAR_V2;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'image' && options.renderMode === 'vtkImage';
  }

  createRenderPath() {
    return new VtkImageMapperRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarVtkImageAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      type: rootContext.type,
      display: rootContext.display,
      vtk: rootContext.vtk,
    };
  }
}

async function updateRenderedImage(args: {
  ctx: PlanarVtkImageAdapterContext;
  image: IImage;
  rendering: PlanarImageMapperRendering;
  imageIdIndex: number;
  dataPresentation?: PlanarDataPresentation;
  resetCamera?: boolean;
  camera?: PlanarCamera;
}): Promise<void> {
  const {
    ctx,
    image,
    rendering,
    imageIdIndex,
    dataPresentation,
    resetCamera = false,
    camera,
  } = args;
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

  if (resetCamera) {
    applyImageOrientationToCamera(ctx.vtk.renderer, imageData);
    ctx.vtk.renderer.resetCamera();
    applyCpuEquivalentInitialScale(ctx, image);
    rendering.initialCamera = getPlanarCameraState(ctx.vtk.renderer);
  }

  applyPlanarCanvasCameraViewState({
    canvas: ctx.vtk.canvas,
    baseCamera: rendering.initialCamera,
    renderer: ctx.vtk.renderer,
    viewState: {
      pan: camera?.pan,
      rotation: camera?.rotation,
      zoom: camera?.zoom,
    },
  });
  rendering.camera = getVtkImageCompatibilityCamera(ctx.vtk.renderer);
  ctx.display.requestRender();
}

function getVtkImageCompatibilityCamera(
  renderer: PlanarVtkImageAdapterContext['vtk']['renderer']
) {
  return {
    ...getPlanarCameraState(renderer),
    parallelProjection: true as const,
  };
}

function applyImageOrientationToCamera(
  renderer: PlanarVtkImageAdapterContext['vtk']['renderer'],
  imageData: PlanarImageMapperRendering['imageData']
): void {
  const direction = Array.from(imageData.getDirection());
  const viewPlaneNormal = direction.slice(6, 9).map((x) => -x) as Point3;
  const viewUp = direction.slice(3, 6).map((x) => -x) as Point3;
  const camera = renderer.getActiveCamera();

  camera.setParallelProjection(true);
  camera.setDirectionOfProjection(
    -viewPlaneNormal[0],
    -viewPlaneNormal[1],
    -viewPlaneNormal[2]
  );
  camera.setViewUp(viewUp[0], viewUp[1], viewUp[2]);
}

function applyCpuEquivalentInitialScale(
  ctx: PlanarVtkImageAdapterContext,
  image: IImage
): void {
  const camera = ctx.vtk.renderer.getActiveCamera();
  const canvasWidth = ctx.vtk.canvas.clientWidth || ctx.vtk.canvas.width;
  const canvasHeight = ctx.vtk.canvas.clientHeight || ctx.vtk.canvas.height;

  camera.setParallelScale(
    getCpuEquivalentParallelScale({
      canvasHeight,
      canvasWidth,
      columnPixelSpacing: image.columnPixelSpacing || 1,
      columns: image.columns,
      rowPixelSpacing: image.rowPixelSpacing || 1,
      rows: image.rows,
    })
  );
}
