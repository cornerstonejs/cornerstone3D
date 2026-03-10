import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { InterpolationType } from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import type { IImage } from '../../../types';
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
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  PlanarImageRendering,
  PlanarPresentationProps,
  PlanarPayload,
  PlanarViewportBackendContext,
  PlanarViewState,
} from './PlanarViewportV2Types';

async function updateRenderedImage(args: {
  ctx: PlanarViewportBackendContext;
  image: IImage;
  rendering: PlanarImageRendering;
  imageIdIndex: number;
  props?: PlanarPresentationProps;
  resetCamera?: boolean;
  viewState?: PlanarViewState;
}): Promise<void> {
  const {
    ctx,
    image,
    rendering,
    imageIdIndex,
    props,
    resetCamera = false,
    viewState,
  } = args;
  const { actor, mapper } = rendering.backendHandle;
  const imageData = createVTKImageDataFromImage(image);

  mapper.setInputData(imageData);
  rendering.backendHandle.imageData = imageData;
  rendering.backendHandle.currentImageIdIndex = imageIdIndex;
  rendering.backendHandle.defaultVOIRange = getDefaultImageVOIRange(image);

  if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  applyPlanarImagePresentation({
    actor,
    defaultVOIRange: rendering.backendHandle.defaultVOIRange,
    props: {
      interpolationType: InterpolationType.LINEAR,
      ...props,
    },
  });

  if (resetCamera) {
    ctx.renderer.getActiveCamera().setParallelProjection(true);
    ctx.renderer.resetCamera();
    rendering.backendHandle.initialCamera = getPlanarCameraState(ctx.renderer);
  }

  applyPlanarCameraViewState({
    initialCamera: rendering.backendHandle.initialCamera,
    renderer: ctx.renderer,
    viewState,
  });
  ctx.requestRender();
}

export class VtkImageMapperRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarImageRendering> {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const payload = data.payload as PlanarPayload;

    if (!payload.initialImage) {
      throw new Error(
        '[PlanarViewportV2] VTK image rendering requires an initial image'
      );
    }

    const mapper = vtkImageMapper.newInstance();
    const actor = vtkImageSlice.newInstance();
    const imageData = createVTKImageDataFromImage(payload.initialImage);

    planarCtx.setRenderMode('vtkImage');
    mapper.setInputData(imageData);
    actor.setMapper(mapper);
    planarCtx.renderer.addActor(actor);
    planarCtx.renderer.getActiveCamera().setParallelProjection(true);
    planarCtx.renderer.resetCamera();

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'image',
      renderMode: 'vtkImage',
      backendHandle: {
        actor,
        mapper,
        imageData,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        defaultVOIRange: getDefaultImageVOIRange(payload.initialImage),
        initialCamera: getPlanarCameraState(planarCtx.renderer),
        loadRequestId: 0,
      },
    };
  }

  updatePresentation(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const planarRendering = rendering as PlanarImageRendering;

    applyPlanarImagePresentation({
      actor: planarRendering.backendHandle.actor,
      defaultVOIRange: planarRendering.backendHandle.defaultVOIRange,
      props: {
        interpolationType: InterpolationType.LINEAR,
        ...(props as PlanarPresentationProps | undefined),
      },
    });
  }

  updateViewState(
    ctx: ViewportBackendContext,
    rendering: MountedRendering,
    viewState: unknown,
    props?: unknown
  ): void {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const planarRendering = rendering as PlanarImageRendering;
    const planarViewState = viewState as PlanarViewState | undefined;
    const planarProps = props as PlanarPresentationProps | undefined;
    const nextImageIdIndex =
      planarViewState?.imageIdIndex ??
      planarRendering.backendHandle.currentImageIdIndex;

    planarCtx.setRenderMode('vtkImage');
    applyPlanarCameraViewState({
      initialCamera: planarRendering.backendHandle.initialCamera,
      renderer: planarCtx.renderer,
      viewState: planarViewState,
    });

    if (
      nextImageIdIndex === planarRendering.backendHandle.currentImageIdIndex
    ) {
      return;
    }

    const { imageIds } = planarRendering.backendHandle.payload;

    if (nextImageIdIndex < 0 || nextImageIdIndex >= imageIds.length) {
      return;
    }

    const requestId = ++planarRendering.backendHandle.loadRequestId;

    void loadAndCacheImage(imageIds[nextImageIdIndex]).then((image) => {
      if (requestId !== planarRendering.backendHandle.loadRequestId) {
        return;
      }

      void updateRenderedImage({
        ctx: planarCtx,
        image,
        rendering: planarRendering,
        imageIdIndex: nextImageIdIndex,
        props: planarProps,
        viewState: planarViewState,
      });
    });
  }

  detach(ctx: ViewportBackendContext, rendering: MountedRendering): void {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const { actor } = (rendering as PlanarImageRendering).backendHandle;

    planarCtx.renderer.removeActor(actor);
  }
}

export class VtkImageMapperPath implements RenderPathDefinition {
  readonly id = 'planar:vtk-image-mapper';
  readonly viewportKind = 'planar' as const;

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
}
