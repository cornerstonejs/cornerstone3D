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
  LogicalDataObject,
  MountedRendering,
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
    data: LogicalDataObject,
    options: DataAddOptions
  ): Promise<PlanarImageMapperRendering> {
    const payload = data.payload as PlanarPayload;

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

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'vtkImage',
      actor,
      currentImage: payload.image,
      mapper,
      imageData,
      payload,
      currentImageIdIndex: payload.initialImageIdIndex,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      initialCamera: getPlanarCameraState(ctx.vtk.renderer),
      camera: getVtkImageCompatibilityCamera(ctx.vtk.renderer),
      loadRequestId: 0,
    };
  }

  updateDataPresentation(
    _ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const planarRendering = rendering as PlanarImageMapperRendering;
    const dataPresentation = props as PlanarDataPresentation | undefined;

    applyPlanarImagePresentation({
      actor: planarRendering.actor,
      defaultVOIRange: planarRendering.defaultVOIRange,
      props: {
        interpolationType: InterpolationType.LINEAR,
        ...dataPresentation,
      },
    });
  }

  updateCamera(
    ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const planarRendering = rendering as PlanarImageMapperRendering;
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ?? planarRendering.currentImageIdIndex;

    ctx.display.activateRenderMode('vtkImage');
    applyPlanarCanvasCameraViewState({
      canvas: ctx.vtk.canvas,
      baseCamera: planarRendering.initialCamera,
      renderer: ctx.vtk.renderer,
      viewState: {
        pan: planarCamera?.pan,
        rotation: planarCamera?.rotation,
        zoom: planarCamera?.zoom,
      },
    });
    planarRendering.camera = getVtkImageCompatibilityCamera(ctx.vtk.renderer);

    if (nextImageIdIndex === planarRendering.currentImageIdIndex) {
      return;
    }

    const { imageIds } = planarRendering.payload;

    if (nextImageIdIndex < 0 || nextImageIdIndex >= imageIds.length) {
      return;
    }

    const requestId = ++planarRendering.loadRequestId;

    void loadAndCacheImage(imageIds[nextImageIdIndex]).then((image) => {
      if (requestId !== planarRendering.loadRequestId) {
        return;
      }

      void updateRenderedImage({
        ctx,
        image,
        rendering: planarRendering,
        imageIdIndex: nextImageIdIndex,
        camera: planarCamera,
      });
    });
  }

  canvasToWorld(
    ctx: PlanarVtkImageAdapterContext,
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
    ctx: PlanarVtkImageAdapterContext,
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
    _ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering
  ): string | undefined {
    const imageId = (rendering as PlanarImageMapperRendering).payload.imageIds[
      (rendering as PlanarImageMapperRendering).currentImageIdIndex
    ];
    const imagePlaneModule = imageId
      ? (metaData.get(MetadataModules.IMAGE_PLANE, imageId) as
          | { frameOfReferenceUID?: string }
          | undefined)
      : undefined;

    return imagePlaneModule?.frameOfReferenceUID;
  }

  getImageData(
    ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering
  ): CPUIImageData | undefined {
    const planarRendering = rendering as PlanarImageMapperRendering;

    return buildPlanarImageData(
      planarRendering.currentImage,
      this.getFrameOfReferenceUID(ctx, rendering)
    );
  }

  removeData(
    ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering
  ): void {
    const { actor } = rendering as PlanarImageMapperRendering;

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

  matches(data: LogicalDataObject, options: DataAddOptions): boolean {
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
