import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { InterpolationType } from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import type { IImage, Point3 } from '../../../types';
import {
  applyPlanarCameraViewState,
  applyPlanarImagePresentation,
  createVTKImageDataFromImage,
  getDefaultImageVOIRange,
  getPlanarCameraState,
} from '../../helpers/planarImageRendering';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarImageMapperRendering,
  PlanarPresentationProps,
  PlanarPayload,
  PlanarViewportRenderContext,
  PlanarProperties,
  PlanarVtkImageAdapterContext,
} from './PlanarViewportV2Types';

export class VtkImageMapperRenderingAdapter
  implements RenderingAdapter<PlanarVtkImageAdapterContext>
{
  async attach(
    ctx: PlanarVtkImageAdapterContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarImageMapperRendering> {
    const payload = data.payload as PlanarPayload;

    if (!payload.initialImage) {
      throw new Error(
        '[PlanarViewportV2] VTK image rendering requires an initial image'
      );
    }

    const mapper = vtkImageMapper.newInstance();
    const actor = vtkImageSlice.newInstance();
    const imageData = createVTKImageDataFromImage(payload.initialImage);

    ctx.display.activateRenderMode('vtkImage');
    mapper.setInputData(imageData);
    actor.setMapper(mapper);
    ctx.vtk.renderer.addActor(actor);
    applyImageOrientationToCamera(ctx.vtk.renderer, imageData);
    ctx.vtk.renderer.resetCamera();

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'image',
      renderMode: 'vtkImage',
      runtime: {
        actor,
        mapper,
        imageData,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        defaultVOIRange: getDefaultImageVOIRange(payload.initialImage),
        initialCamera: getPlanarCameraState(ctx.vtk.renderer),
        loadRequestId: 0,
      },
    };
  }

  updatePresentation(
    _ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const planarRendering = rendering as PlanarImageMapperRendering;

    applyPlanarImagePresentation({
      actor: planarRendering.runtime.actor,
      defaultVOIRange: planarRendering.runtime.defaultVOIRange,
      props: {
        interpolationType: InterpolationType.LINEAR,
        ...(props as PlanarPresentationProps | undefined),
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
      planarCamera?.imageIdIndex ?? planarRendering.runtime.currentImageIdIndex;

    ctx.display.activateRenderMode('vtkImage');
    applyPlanarCameraViewState({
      initialCamera: planarRendering.runtime.initialCamera,
      renderer: ctx.vtk.renderer,
      viewState: planarCamera,
    });

    if (nextImageIdIndex === planarRendering.runtime.currentImageIdIndex) {
      return;
    }

    const { imageIds } = planarRendering.runtime.payload;

    if (nextImageIdIndex < 0 || nextImageIdIndex >= imageIds.length) {
      return;
    }

    const requestId = ++planarRendering.runtime.loadRequestId;

    void loadAndCacheImage(imageIds[nextImageIdIndex]).then((image) => {
      if (requestId !== planarRendering.runtime.loadRequestId) {
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

  updateProperties(
    _ctx: PlanarVtkImageAdapterContext,
    rendering: MountedRendering,
    presentation: unknown
  ): void {
    const planarRendering = rendering as PlanarImageMapperRendering;
    const planarProperties = presentation as PlanarProperties | undefined;

    if (planarProperties?.interpolationType !== undefined) {
      const property = planarRendering.runtime.actor.getProperty();
      property.setInterpolationType(
        planarProperties.interpolationType as Parameters<
          typeof property.setInterpolationType
        >[0]
      );
    }
  }

  detach(ctx: PlanarVtkImageAdapterContext, rendering: MountedRendering): void {
    const { actor } = (rendering as PlanarImageMapperRendering).runtime;

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
  readonly type = 'planar' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'imageStack' &&
      options.role === 'image' &&
      options.renderMode === 'vtkImage'
    );
  }

  createAdapter() {
    return new VtkImageMapperRenderingAdapter();
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
  props?: PlanarPresentationProps;
  planarProperties?: PlanarProperties;
  resetCamera?: boolean;
  camera?: PlanarCamera;
}): Promise<void> {
  const {
    ctx,
    image,
    rendering,
    imageIdIndex,
    props,
    planarProperties,
    resetCamera = false,
    camera,
  } = args;
  const { actor, mapper } = rendering.runtime;
  const imageData = createVTKImageDataFromImage(image);

  mapper.setInputData(imageData);
  rendering.runtime.imageData = imageData;
  rendering.runtime.currentImageIdIndex = imageIdIndex;
  rendering.runtime.defaultVOIRange = getDefaultImageVOIRange(image);

  if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  applyPlanarImagePresentation({
    actor,
    defaultVOIRange: rendering.runtime.defaultVOIRange,
    props: {
      interpolationType:
        planarProperties?.interpolationType ?? InterpolationType.LINEAR,
      ...props,
    },
  });

  if (resetCamera) {
    applyImageOrientationToCamera(ctx.vtk.renderer, imageData);
    ctx.vtk.renderer.resetCamera();
    rendering.runtime.initialCamera = getPlanarCameraState(ctx.vtk.renderer);
  }

  applyPlanarCameraViewState({
    initialCamera: rendering.runtime.initialCamera,
    renderer: ctx.vtk.renderer,
    viewState: camera,
  });
  ctx.display.requestRender();
}

function applyImageOrientationToCamera(
  renderer: PlanarVtkImageAdapterContext['vtk']['renderer'],
  imageData: PlanarImageMapperRendering['runtime']['imageData']
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
