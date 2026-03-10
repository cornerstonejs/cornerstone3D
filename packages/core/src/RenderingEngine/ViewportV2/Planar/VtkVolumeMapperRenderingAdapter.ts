import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import { Events, OrientationAxis } from '../../../enums';
import eventTarget from '../../../eventTarget';
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
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarCameraState,
  PlanarPayload,
  PlanarPresentationProps,
  PlanarViewportRenderContext,
  PlanarProperties,
  PlanarVolumeMapperRendering,
  PlanarVtkVolumeAdapterContext,
} from './PlanarViewportV2Types';
import { getPlanarCameraVectors } from './planarCameraOrientation';

export class VtkVolumeMapperRenderingAdapter
  implements RenderingAdapter<PlanarVtkVolumeAdapterContext>
{
  async attach(
    ctx: PlanarVtkVolumeAdapterContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarVolumeMapperRendering> {
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
      ctx.viewport.element,
      ctx.viewportId,
      true
    );
    const mapper = actor.getMapper() as vtkVolumeMapper;

    ctx.display.activateRenderMode('vtkVolume');
    ctx.vtk.renderer.addVolume(actor);
    ctx.vtk.renderer.getActiveCamera().setParallelProjection(true);
    ctx.vtk.renderer.resetCamera();
    setCameraClippingRange(ctx);

    const defaultRange = actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    const rendering: PlanarVolumeMapperRendering = {
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
        removeStreamingSubscriptions: subscribeToVolumeEvents(
          payload.volumeId,
          () => {
            ctx.display.requestRender();
          }
        ),
        sliceCamera: getCameraState(ctx),
      },
    };

    setSliceIndex(ctx, rendering, payload.initialImageIdIndex);
    updateClippingPlanes(ctx, rendering);
    imageVolume.load(() => {
      ctx.display.requestRender();
    });

    return rendering;
  }

  updatePresentation(
    _ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as PlanarVolumeMapperRendering,
      props as PlanarPresentationProps | undefined
    );
  }

  updateCamera(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const planarRendering = rendering as PlanarVolumeMapperRendering;
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ??
      planarRendering.backendHandle.currentImageIdIndex;
    const nextOrientation =
      planarCamera?.orientation ?? planarRendering.backendHandle.orientation;

    ctx.display.activateRenderMode('vtkVolume');

    if (nextOrientation !== planarRendering.backendHandle.orientation) {
      applyOrientation(ctx, planarRendering, nextOrientation);
    }

    if (
      nextImageIdIndex !== planarRendering.backendHandle.currentImageIdIndex
    ) {
      setSliceIndex(ctx, planarRendering, nextImageIdIndex);
    } else {
      setCameraState(ctx, planarRendering.backendHandle.sliceCamera);
    }

    applyCameraToVtk(ctx, planarRendering, planarCamera);
    updateClippingPlanes(ctx, planarRendering);
  }

  updateProperties(
    _ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering,
    presentation: unknown
  ): void {
    const planarRendering = rendering as PlanarVolumeMapperRendering;
    const planarProperties = presentation as PlanarProperties | undefined;

    if (planarProperties?.interpolationType !== undefined) {
      const property = planarRendering.backendHandle.actor.getProperty();
      property.setInterpolationType(
        planarProperties.interpolationType as Parameters<
          typeof property.setInterpolationType
        >[0]
      );
    }
  }

  render(ctx: PlanarVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  resize(ctx: PlanarVtkVolumeAdapterContext): void {
    ctx.display.requestRender();
  }

  detach(
    ctx: PlanarVtkVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = (
      rendering as PlanarVolumeMapperRendering
    ).backendHandle;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }
}

export class VtkVolumeMapperPath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarVtkVolumeAdapterContext
    >
{
  readonly id = 'planar:vtk-volume-mapper';
  readonly type = 'planar' as const;

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

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarVtkVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      display: rootContext.display,
      vtk: rootContext.vtk,
    };
  }
}

function subscribeToVolumeEvents(
  volumeId: string,
  onProgress: () => void
): () => void {
  const handleProgress = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onProgress();
  };

  eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, handleProgress);
  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleProgress
  );

  return () => {
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      handleProgress
    );
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handleProgress
    );
  };
}

function getCameraState(ctx: PlanarVtkVolumeAdapterContext): PlanarCameraState {
  const camera = ctx.vtk.renderer.getActiveCamera();

  return {
    focalPoint: [...camera.getFocalPoint()] as Point3,
    parallelScale: camera.getParallelScale(),
    position: [...camera.getPosition()] as Point3,
  };
}

function setCameraState(
  ctx: PlanarVtkVolumeAdapterContext,
  cameraState: PlanarCameraState
): void {
  const camera = ctx.vtk.renderer.getActiveCamera();

  camera.setParallelProjection(true);
  camera.setParallelScale(cameraState.parallelScale);
  camera.setFocalPoint(...cameraState.focalPoint);
  camera.setPosition(...cameraState.position);
}

function setCameraClippingRange(ctx: PlanarVtkVolumeAdapterContext): void {
  const camera = ctx.vtk.renderer.getActiveCamera();

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
  ctx: PlanarVtkVolumeAdapterContext,
  rendering: PlanarVolumeMapperRendering
): void {
  const camera = ctx.vtk.renderer.getActiveCamera();
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
  rendering: PlanarVolumeMapperRendering,
  props?: PlanarPresentationProps
): void {
  const { actor, defaultVOIRange } = rendering.backendHandle;
  const property = actor.getProperty();
  const voiRange = props?.voiRange ?? defaultVOIRange;

  actor.setVisibility(props?.visible === false ? false : true);

  if (props?.opacity !== undefined) {
    updateVolumeOpacity(actor, props.opacity);
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

function applyCameraToVtk(
  ctx: PlanarVtkVolumeAdapterContext,
  rendering: PlanarVolumeMapperRendering,
  planarCamera?: PlanarCamera
): void {
  const camera = ctx.vtk.renderer.getActiveCamera();
  const { sliceCamera } = rendering.backendHandle;
  const zoom = Math.max(planarCamera?.zoom ?? 1, 0.001);
  const [panX, panY] = planarCamera?.pan ?? [0, 0];

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
  ctx: PlanarVtkVolumeAdapterContext,
  rendering: PlanarVolumeMapperRendering,
  orientation: PlanarCamera['orientation']
): void {
  if (!orientation) {
    return;
  }

  const cameraValues = getPlanarCameraVectors({
    imageVolume: rendering.backendHandle.imageVolume,
    orientation,
  });

  if (!cameraValues) {
    return;
  }

  const camera = ctx.vtk.renderer.getActiveCamera();

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
  ctx.vtk.renderer.resetCamera();
  rendering.backendHandle.orientation = orientation;
  rendering.backendHandle.sliceCamera = getCameraState(ctx);
  updateClippingPlanes(ctx, rendering);
}

function getCurrentSliceIndex(
  ctx: PlanarVtkVolumeAdapterContext,
  rendering: PlanarVolumeMapperRendering
): number {
  const camera = ctx.vtk.renderer.getActiveCamera();
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
  ctx: PlanarVtkVolumeAdapterContext,
  rendering: PlanarVolumeMapperRendering,
  imageIdIndex: number
): void {
  setCameraState(ctx, rendering.backendHandle.sliceCamera);

  const camera = ctx.vtk.renderer.getActiveCamera();
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
