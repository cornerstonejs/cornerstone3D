import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { InterpolationType } from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import type { IImage, Point3, VOIRange } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateVTKImageDataWithCornerstoneImage } from '../../../utilities/updateVTKImageDataWithCornerstoneImage';
import { toLowHighRange } from '../../../utilities/windowLevel';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCameraState,
  PlanarImageRendering,
  PlanarPresentationProps,
  PlanarStackPayload,
  PlanarViewportBackendContext,
  PlanarViewState,
} from './PlanarViewportV2Types';

function createVTKImageDataFromImage(image: IImage): vtkImageData {
  const { dimensions, direction, numberOfComponents, origin, spacing } =
    getImageDataMetadata(image);
  const pixelArray = image.voxelManager.getScalarData();
  const values = pixelArray.slice(0);
  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents,
    values,
  });
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);
  updateVTKImageDataWithCornerstoneImage(imageData, image);

  return imageData;
}

function getDefaultVOIRange(image: IImage): VOIRange | undefined {
  const windowWidth = Array.isArray(image.windowWidth)
    ? image.windowWidth[0]
    : image.windowWidth;
  const windowCenter = Array.isArray(image.windowCenter)
    ? image.windowCenter[0]
    : image.windowCenter;

  if (typeof windowWidth !== 'number' || typeof windowCenter !== 'number') {
    return;
  }

  return toLowHighRange(windowWidth, windowCenter, image.voiLUTFunction);
}

function getCameraState(ctx: PlanarViewportBackendContext): PlanarCameraState {
  const camera = ctx.renderer.getActiveCamera();

  return {
    focalPoint: [...camera.getFocalPoint()] as Point3,
    parallelScale: camera.getParallelScale(),
    position: [...camera.getPosition()] as Point3,
  };
}

function applyPresentation(
  rendering: PlanarImageRendering,
  props?: PlanarPresentationProps
): void {
  const { actor, defaultVOIRange } = rendering.backendHandle;
  const property = actor.getProperty();

  actor.setVisibility(props?.visible === false ? false : true);
  property.setOpacity(props?.opacity ?? 1);
  property.setInterpolationType(
    (props?.interpolationType ?? InterpolationType.LINEAR) as Parameters<
      typeof property.setInterpolationType
    >[0]
  );

  const voiRange = props?.voiRange ?? defaultVOIRange;

  if (!voiRange) {
    property.setRGBTransferFunction(0, null);
    return;
  }

  const transferFunction = createLinearRGBTransferFunction(voiRange);

  if (props?.invert) {
    invertRgbTransferFunction(transferFunction);
  }

  property.setUseLookupTableScalarRange(true);
  property.setRGBTransferFunction(0, transferFunction);
}

function applyCameraViewState(
  ctx: PlanarViewportBackendContext,
  rendering: PlanarImageRendering,
  viewState?: PlanarViewState
): void {
  const camera = ctx.renderer.getActiveCamera();
  const { initialCamera } = rendering.backendHandle;
  const zoom = Math.max(viewState?.zoom ?? 1, 0.001);
  const [panX, panY] = viewState?.pan ?? [0, 0];

  camera.setParallelProjection(true);
  camera.setParallelScale(initialCamera.parallelScale / zoom);
  camera.setFocalPoint(
    initialCamera.focalPoint[0] + panX,
    initialCamera.focalPoint[1] + panY,
    initialCamera.focalPoint[2]
  );
  camera.setPosition(
    initialCamera.position[0] + panX,
    initialCamera.position[1] + panY,
    initialCamera.position[2]
  );
}

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
  rendering.backendHandle.defaultVOIRange = getDefaultVOIRange(image);

  if (imageData.getPointData().getScalars().getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  applyPresentation(rendering, props);

  if (resetCamera) {
    ctx.renderer.getActiveCamera().setParallelProjection(true);
    ctx.renderer.resetCamera();
    rendering.backendHandle.initialCamera = getCameraState(ctx);
  }

  applyCameraViewState(ctx, rendering, viewState);
  ctx.renderWindow.render();
}

export class VtkImageMapperRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarImageRendering> {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const payload = data.payload as PlanarStackPayload;
    const mapper = vtkImageMapper.newInstance();
    const actor = vtkImageSlice.newInstance();
    const imageData = createVTKImageDataFromImage(payload.initialImage);

    planarCtx.setRenderModeVisibility('vtkImage');
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
        defaultVOIRange: getDefaultVOIRange(payload.initialImage),
        initialCamera: getCameraState(planarCtx),
        loadRequestId: 0,
      },
    };
  }

  updatePresentation(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as PlanarImageRendering,
      props as PlanarPresentationProps | undefined
    );
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

    planarCtx.setRenderModeVisibility('vtkImage');
    applyCameraViewState(planarCtx, planarRendering, planarViewState);

    if (
      nextImageIdIndex === planarRendering.backendHandle.currentImageIdIndex
    ) {
      planarCtx.renderWindow.render();
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

  render(ctx: ViewportBackendContext): void {
    (ctx as PlanarViewportBackendContext).renderWindow.render();
  }

  resize(ctx: ViewportBackendContext): void {
    (ctx as PlanarViewportBackendContext).renderWindow.render();
  }

  detach(ctx: ViewportBackendContext, rendering: MountedRendering): void {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const { actor } = (rendering as PlanarImageRendering).backendHandle;

    planarCtx.renderer.removeActor(actor);
    planarCtx.renderWindow.render();
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
