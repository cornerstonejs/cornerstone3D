import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { MPR_CAMERA_VALUES } from '../../../constants';
import createVolumeMapper, {
  convertMapperToNotSharedMapper,
} from '../../helpers/createVolumeMapper';
import setDefaultVolumeVOI from '../../helpers/setDefaultVolumeVOI';
import { createAndCacheVolumeFromImages } from '../../../loaders/volumeLoader';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import type { IImage, Point3, VOIRange } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
import { toLowHighRange } from '../../../utilities/windowLevel';
import {
  getPlanarVolumeSliceNavigationState,
  getPlanarVolumeSlicePoint,
} from '../../helpers/planarVolumeRendering';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCameraState,
  PlanarPresentationProps,
  PlanarStackPayload,
  PlanarViewportBackendContext,
  PlanarViewState,
  PlanarVolumeRendering,
} from './PlanarViewportV2Types';

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

function setCameraState(
  ctx: PlanarViewportBackendContext,
  cameraState: PlanarCameraState
): void {
  const camera = ctx.renderer.getActiveCamera();

  camera.setParallelProjection(true);
  camera.setParallelScale(cameraState.parallelScale);
  camera.setFocalPoint(...cameraState.focalPoint);
  camera.setPosition(...cameraState.position);
}

function applyPresentation(
  rendering: PlanarVolumeRendering,
  props?: PlanarPresentationProps
): void {
  const { actor, defaultVOIRange } = rendering.backendHandle;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;

  actor.setVisibility(props?.visible === false ? false : true);

  if (props?.opacity !== undefined) {
    updateVolumeOpacity(actor, props.opacity);
  }

  if (props?.interpolationType !== undefined) {
    property.setInterpolationType(
      props.interpolationType as Parameters<
        typeof property.setInterpolationType
      >[0]
    );
  }

  if (!voiRange) {
    return;
  }

  const transferFunction = createLinearRGBTransferFunction(voiRange);

  if (props?.invert) {
    invertRgbTransferFunction(transferFunction);
  }

  property.setRGBTransferFunction(0, transferFunction);
}

function applyCameraViewState(
  ctx: PlanarViewportBackendContext,
  rendering: PlanarVolumeRendering,
  viewState?: PlanarViewState
): void {
  const camera = ctx.renderer.getActiveCamera();
  const { sliceCamera } = rendering.backendHandle;
  const zoom = Math.max(viewState?.zoom ?? 1, 0.001);
  const [panX, panY] = viewState?.pan ?? [0, 0];

  camera.setParallelProjection(true);
  camera.setParallelScale(sliceCamera.parallelScale / zoom);
  camera.setFocalPoint(
    sliceCamera.focalPoint[0] + panX,
    sliceCamera.focalPoint[1] + panY,
    sliceCamera.focalPoint[2]
  );
  camera.setPosition(
    sliceCamera.position[0] + panX,
    sliceCamera.position[1] + panY,
    sliceCamera.position[2]
  );
}

function applyOrientation(
  ctx: PlanarViewportBackendContext,
  rendering: PlanarVolumeRendering,
  orientation: PlanarViewState['orientation']
): void {
  if (!orientation) {
    return;
  }

  const cameraValues = MPR_CAMERA_VALUES[orientation];

  if (!cameraValues) {
    return;
  }

  const camera = ctx.renderer.getActiveCamera();

  camera.setDirectionOfProjection(
    -cameraValues.viewPlaneNormal[0],
    -cameraValues.viewPlaneNormal[1],
    -cameraValues.viewPlaneNormal[2]
  );
  camera.setViewUp(...cameraValues.viewUp);
  ctx.renderer.resetCamera();
  rendering.backendHandle.orientation = orientation;
  rendering.backendHandle.sliceCamera = getCameraState(ctx);
}

function getCurrentSliceIndex(
  ctx: PlanarViewportBackendContext,
  rendering: PlanarVolumeRendering
): number {
  const camera = ctx.renderer.getActiveCamera();
  const { actor, imageVolume } = rendering.backendHandle;

  return getPlanarVolumeSliceNavigationState({
    actor,
    camera: {
      focalPoint: [...camera.getFocalPoint()] as Point3,
      position: [...camera.getPosition()] as Point3,
      viewPlaneNormal: [...camera.getViewPlaneNormal()] as Point3,
    },
    imageVolume,
  }).currentSliceIndex;
}

function setSliceIndex(
  ctx: PlanarViewportBackendContext,
  rendering: PlanarVolumeRendering,
  imageIdIndex: number
): void {
  setCameraState(ctx, rendering.backendHandle.sliceCamera);

  const camera = ctx.renderer.getActiveCamera();
  const { actor, imageVolume, payload } = rendering.backendHandle;
  const viewPlaneNormal = [...camera.getViewPlaneNormal()] as Point3;
  const focalPoint = [...camera.getFocalPoint()] as Point3;
  const position = [...camera.getPosition()] as Point3;
  const { sliceRange, spacingInNormalDirection } =
    getPlanarVolumeSliceNavigationState({
      actor,
      camera: {
        focalPoint,
        position,
        viewPlaneNormal,
      },
      imageVolume,
    });
  const maxImageIdIndex = payload.imageIds.length - 1;
  const currentImageIdIndex = getCurrentSliceIndex(ctx, rendering);
  const clampedImageIdIndex = Math.min(
    Math.max(0, imageIdIndex),
    maxImageIdIndex
  );
  const delta = clampedImageIdIndex - currentImageIdIndex;

  if (delta !== 0) {
    const { newFocalPoint, newPosition } = getPlanarVolumeSlicePoint({
      camera: {
        focalPoint,
        position,
        viewPlaneNormal,
      },
      delta,
      sliceRange,
      spacingInNormalDirection,
    });

    camera.setFocalPoint(...newFocalPoint);
    camera.setPosition(...newPosition);
  }

  rendering.backendHandle.currentImageIdIndex = clampedImageIdIndex;
  rendering.backendHandle.sliceCamera = getCameraState(ctx);
}

export class VtkVolumeMapperRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarVolumeRendering> {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const payload = data.payload as PlanarStackPayload;

    await Promise.all(
      payload.imageIds.map((imageId) => loadAndCacheImage(imageId))
    );

    const imageVolume = await createAndCacheVolumeFromImages(
      payload.volumeId,
      payload.imageIds
    );
    const sharedMapper = createVolumeMapper(
      imageVolume.imageData,
      imageVolume.vtkOpenGLTexture
    );
    const mapper = convertMapperToNotSharedMapper(
      sharedMapper
    ) as vtkVolumeMapper;
    const actor = vtkVolume.newInstance();

    planarCtx.setRenderMode('vtkVolume');
    actor.setMapper(mapper);
    planarCtx.renderer.addVolume(actor);
    planarCtx.renderer.getActiveCamera().setParallelProjection(true);
    planarCtx.renderer.resetCamera();

    await setDefaultVolumeVOI(actor, imageVolume);

    const defaultRange = actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    const rendering: PlanarVolumeRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'image',
      renderMode: 'vtkVolume',
      backendHandle: {
        actor,
        imageVolume,
        mapper,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        defaultVOIRange: defaultRange
          ? { lower: defaultRange[0], upper: defaultRange[1] }
          : getDefaultVOIRange(payload.initialImage),
        orientation: 'axial',
        sliceCamera: getCameraState(planarCtx),
      },
    };

    setSliceIndex(planarCtx, rendering, payload.initialImageIdIndex);

    return rendering;
  }

  updatePresentation(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as PlanarVolumeRendering,
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
    const planarRendering = rendering as PlanarVolumeRendering;
    const planarViewState = viewState as PlanarViewState | undefined;
    const planarProps = props as PlanarPresentationProps | undefined;
    const nextImageIdIndex =
      planarViewState?.imageIdIndex ??
      planarRendering.backendHandle.currentImageIdIndex;
    const nextOrientation =
      planarViewState?.orientation ?? planarRendering.backendHandle.orientation;

    planarCtx.setRenderMode('vtkVolume');

    if (nextOrientation !== planarRendering.backendHandle.orientation) {
      applyOrientation(planarCtx, planarRendering, nextOrientation);
    }

    if (
      nextImageIdIndex !== planarRendering.backendHandle.currentImageIdIndex
    ) {
      setSliceIndex(planarCtx, planarRendering, nextImageIdIndex);
    } else {
      setCameraState(planarCtx, planarRendering.backendHandle.sliceCamera);
    }

    applyPresentation(planarRendering, planarProps);
    applyCameraViewState(planarCtx, planarRendering, planarViewState);
  }

  render(ctx: ViewportBackendContext): void {
    (ctx as PlanarViewportBackendContext).requestRender();
  }

  resize(ctx: ViewportBackendContext): void {
    (ctx as PlanarViewportBackendContext).requestRender();
  }

  detach(ctx: ViewportBackendContext, rendering: MountedRendering): void {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const { actor } = (rendering as PlanarVolumeRendering).backendHandle;

    planarCtx.renderer.removeVolume(actor);
  }
}

export class VtkVolumeMapperPath implements RenderPathDefinition {
  readonly id = 'planar:vtk-volume-mapper';
  readonly viewportKind = 'planar' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'imageStack' &&
      options.role === 'image' &&
      options.renderMode === 'vtkVolume'
    );
  }

  createAdapter() {
    return new VtkVolumeMapperRenderingAdapter();
  }
}
