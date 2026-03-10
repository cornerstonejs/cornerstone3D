import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { MPR_CAMERA_VALUES, RENDERING_DEFAULTS } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import createVolumeActor from '../../helpers/createVolumeActor';
import type { Point3, VOIRange } from '../../../types';
import createLinearRGBTransferFunction from '../../../utilities/createLinearRGBTransferFunction';
import invertRgbTransferFunction from '../../../utilities/invertRgbTransferFunction';
import { updateOpacity as updateVolumeOpacity } from '../../../utilities/colormap';
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
  PlanarPayload,
  PlanarPresentationProps,
  PlanarViewportBackendContext,
  PlanarViewState,
  PlanarVolumeRendering,
} from './PlanarViewportV2Types';

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

function setCameraClippingRange(ctx: PlanarViewportBackendContext): void {
  const camera = ctx.renderer.getActiveCamera();

  if (camera.getParallelProjection()) {
    camera.setClippingRange(
      -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
    );
    return;
  }

  camera.setClippingRange(
    RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
    RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
  );
}

function ensureClippingPlanes(mapper: vtkVolumeMapper) {
  const existingClippingPlanes = mapper.getClippingPlanes();

  if (existingClippingPlanes.length >= 2) {
    return existingClippingPlanes;
  }

  const clippingPlane1 = vtkPlane.newInstance();
  const clippingPlane2 = vtkPlane.newInstance();

  mapper.addClippingPlane(clippingPlane1);
  mapper.addClippingPlane(clippingPlane2);

  return mapper.getClippingPlanes();
}

function updateClippingPlanes(
  ctx: PlanarViewportBackendContext,
  rendering: PlanarVolumeRendering
): void {
  const camera = ctx.renderer.getActiveCamera();
  const viewPlaneNormal = [...camera.getViewPlaneNormal()] as Point3;
  const focalPoint = [...camera.getFocalPoint()] as Point3;
  const clippingPlanes = ensureClippingPlanes(rendering.backendHandle.mapper);
  const slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
  const scaledDistance = viewPlaneNormal.map(
    (value) => value * slabThickness
  ) as Point3;
  const clipPlane1Origin = [
    focalPoint[0] - scaledDistance[0],
    focalPoint[1] - scaledDistance[1],
    focalPoint[2] - scaledDistance[2],
  ] as Point3;
  const clipPlane2Origin = [
    focalPoint[0] + scaledDistance[0],
    focalPoint[1] + scaledDistance[1],
    focalPoint[2] + scaledDistance[2],
  ] as Point3;

  clippingPlanes[0].setNormal(...viewPlaneNormal);
  clippingPlanes[0].setOrigin(...clipPlane1Origin);
  clippingPlanes[1].setNormal(
    -viewPlaneNormal[0],
    -viewPlaneNormal[1],
    -viewPlaneNormal[2]
  );
  clippingPlanes[1].setOrigin(...clipPlane2Origin);

  setCameraClippingRange(ctx);
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
  camera.setViewUp(
    cameraValues.viewUp[0],
    cameraValues.viewUp[1],
    cameraValues.viewUp[2]
  );
  ctx.renderer.resetCamera();
  rendering.backendHandle.orientation = orientation;
  rendering.backendHandle.sliceCamera = getCameraState(ctx);
  updateClippingPlanes(ctx, rendering);
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
    const payload = data.payload as PlanarPayload;
    const imageVolume = payload.imageVolume;

    if (!imageVolume) {
      throw new Error(
        '[PlanarViewportV2] Volume rendering requires a prepared image volume'
      );
    }

    const actor = await createVolumeActor(
      {
        volumeId: payload.volumeId,
      },
      planarCtx.element,
      planarCtx.viewportId,
      true
    );
    const mapper = actor.getMapper() as vtkVolumeMapper;

    planarCtx.setRenderMode('vtkVolume');
    planarCtx.renderer.addVolume(actor);
    planarCtx.renderer.getActiveCamera().setParallelProjection(true);
    planarCtx.renderer.resetCamera();
    setCameraClippingRange(planarCtx);

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
          : undefined,
        orientation: payload.acquisitionOrientation || OrientationAxis.AXIAL,
        sliceCamera: getCameraState(planarCtx),
      },
    };

    setSliceIndex(planarCtx, rendering, payload.initialImageIdIndex);
    updateClippingPlanes(planarCtx, rendering);
    imageVolume.load(() => {
      planarCtx.requestRender();
    });

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
    updateClippingPlanes(planarCtx, planarRendering);
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
      data.kind === 'imageVolume' &&
      options.role === 'image' &&
      options.renderMode === 'vtkVolume'
    );
  }

  createAdapter() {
    return new VtkVolumeMapperRenderingAdapter();
  }
}
