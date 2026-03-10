import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import Events from '../../../enums/Events';
import { OrientationAxis } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { ICamera, Point3 } from '../../../types';
import createVolumeActor from '../../helpers/createVolumeActor';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
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
  PlanarCpuVolumeAdapterContext,
  PlanarCpuVolumeRendering,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportV2Types';
import PlanarCPUVolumeSampler from './PlanarCPUVolumeSampler';
import { getPlanarCameraVectors } from './planarCameraOrientation';

export class CpuVolumeSliceRenderingAdapter
  implements RenderingAdapter<PlanarCpuVolumeAdapterContext>
{
  private readonly sampler = new PlanarCPUVolumeSampler();

  async attach(
    ctx: PlanarCpuVolumeAdapterContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarCpuVolumeRendering> {
    const payload = data.payload as PlanarPayload;

    if (!payload.imageVolume) {
      throw new Error(
        '[PlanarViewportV2] CPU volume rendering requires a prepared image volume'
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

    ctx.vtk.renderer.addVolume(actor);
    ctx.vtk.renderer.getActiveCamera().setParallelProjection(true);
    ctx.vtk.renderer.resetCamera();
    setCameraClippingRange(ctx);
    ctx.display.activateRenderMode('cpuVolume');

    const rendering: PlanarCpuVolumeRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'image',
      renderMode: 'cpuVolume',
      backendHandle: {
        actor,
        mapper,
        imageVolume: payload.imageVolume,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        orientation: payload.acquisitionOrientation || OrientationAxis.AXIAL,
        sliceCamera: getCameraState(ctx),
        renderingInvalidated: true,
        removeStreamingSubscriptions: subscribeToVolumeLoadCompletion(
          payload.volumeId,
          () => {
            rendering.backendHandle.pendingVolumeLoadCallback = false;
            rendering.backendHandle.sampledSliceState = undefined;
            rendering.backendHandle.renderingInvalidated = true;
            this.render(ctx, rendering);
          }
        ),
      },
    };

    setSliceIndex(ctx, rendering, payload.initialImageIdIndex);
    updateClippingPlanes(ctx, rendering);

    return rendering;
  }

  updatePresentation(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    (rendering as PlanarCpuVolumeRendering).backendHandle.presentation =
      props as PlanarCpuVolumeRendering['backendHandle']['presentation'];
    (rendering as PlanarCpuVolumeRendering).backendHandle.renderingInvalidated =
      true;
  }

  updateCamera(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const planarRendering = rendering as PlanarCpuVolumeRendering;
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ??
      planarRendering.backendHandle.currentImageIdIndex;
    const nextOrientation =
      planarCamera?.orientation ?? planarRendering.backendHandle.orientation;

    ctx.display.activateRenderMode('cpuVolume');
    planarRendering.backendHandle.currentCamera = planarCamera;

    if (nextOrientation !== planarRendering.backendHandle.orientation) {
      applyOrientation(ctx, planarRendering, nextOrientation);
      planarRendering.backendHandle.renderingInvalidated = true;
    }

    if (
      nextImageIdIndex !== planarRendering.backendHandle.currentImageIdIndex
    ) {
      setSliceIndex(ctx, planarRendering, nextImageIdIndex);
      planarRendering.backendHandle.renderingInvalidated = true;
    } else {
      setCameraState(ctx, planarRendering.backendHandle.sliceCamera);
    }

    applyCameraToVtk(ctx, planarRendering, planarCamera);
    updateClippingPlanes(ctx, planarRendering);
  }

  updateProperties(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    (rendering as PlanarCpuVolumeRendering).backendHandle.properties =
      props as PlanarCpuVolumeRendering['backendHandle']['properties'];
    (rendering as PlanarCpuVolumeRendering).backendHandle.renderingInvalidated =
      true;
  }

  render(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const planarRendering = rendering as PlanarCpuVolumeRendering;
    const { backendHandle } = planarRendering;

    ctx.display.activateRenderMode('cpuVolume');

    if (backendHandle.presentation?.visible === false) {
      ctx.cpu.canvas.style.display = 'none';
      return;
    }

    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = String(
      backendHandle.presentation?.opacity ?? 1
    );

    const loadStatus = (
      backendHandle.imageVolume as { loadStatus?: { loaded?: boolean } }
    ).loadStatus;

    if (!loadStatus?.loaded) {
      clearToBackground(ctx);
      if (!backendHandle.pendingVolumeLoadCallback) {
        backendHandle.pendingVolumeLoadCallback = true;
        backendHandle.imageVolume.load();
      }
      return;
    }

    backendHandle.pendingVolumeLoadCallback = false;

    if (!ctx.cpu.canvas.width || !ctx.cpu.canvas.height) {
      return;
    }

    const camera = getViewportCamera(ctx);
    const shouldResample =
      backendHandle.renderingInvalidated ||
      this.sampler.needsResample({
        sampledSliceState: backendHandle.sampledSliceState,
        width: ctx.cpu.canvas.width,
        height: ctx.cpu.canvas.height,
        camera,
        properties: backendHandle.properties,
      });

    if (shouldResample) {
      backendHandle.sampledSliceState = this.sampler.sampleSliceImage({
        volume: backendHandle.imageVolume,
        width: ctx.cpu.canvas.width,
        height: ctx.cpu.canvas.height,
        camera,
        presentation: backendHandle.presentation,
        properties: backendHandle.properties,
      });
      backendHandle.renderingInvalidated = true;
    }

    if (!backendHandle.sampledSliceState) {
      clearToBackground(ctx);
      return;
    }

    backendHandle.enabledElement = this.sampler.createOrUpdateEnabledElement({
      enabledElement: backendHandle.enabledElement,
      canvas: ctx.cpu.canvas,
      image: backendHandle.sampledSliceState.image,
      modality: backendHandle.imageVolume.metadata?.Modality,
    });
    this.sampler.updateCPUFallbackViewport({
      enabledElement: backendHandle.enabledElement,
      sampledSliceState: backendHandle.sampledSliceState,
      camera,
      presentation: backendHandle.presentation,
      properties: backendHandle.properties,
      zoom: backendHandle.currentCamera?.zoom,
    });
    backendHandle.defaultVOIRange = this.sampler.getResolvedVOIRange(
      backendHandle.presentation?.voiRange,
      backendHandle.sampledSliceState.image.minPixelValue ?? 0,
      backendHandle.sampledSliceState.image.maxPixelValue ?? 1
    );
    drawImageSync(
      backendHandle.enabledElement,
      backendHandle.renderingInvalidated
    );
    backendHandle.renderingInvalidated = false;
  }

  resize(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    (rendering as PlanarCpuVolumeRendering).backendHandle.renderingInvalidated =
      true;
  }

  detach(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = (
      rendering as PlanarCpuVolumeRendering
    ).backendHandle;

    removeStreamingSubscriptions?.();
    ctx.vtk.renderer.removeVolume(actor);
  }
}

function subscribeToVolumeLoadCompletion(
  volumeId: string,
  onComplete: () => void
): () => void {
  const handleComplete = (evt: Event) => {
    const detail = (evt as CustomEvent<{ volumeId?: string }>).detail;

    if (detail?.volumeId !== volumeId) {
      return;
    }

    onComplete();
  };

  eventTarget.addEventListener(
    Events.IMAGE_VOLUME_LOADING_COMPLETED,
    handleComplete
  );

  return () => {
    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      handleComplete
    );
  };
}

export class CpuVolumeSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuVolumeAdapterContext
    >
{
  readonly id = 'planar:cpu-volume-slice';
  readonly type = 'planar' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'imageVolume' &&
      options.role === 'image' &&
      options.renderMode === 'cpuVolume'
    );
  }

  createAdapter() {
    return new CpuVolumeSliceRenderingAdapter();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarCpuVolumeAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      display: rootContext.display,
      cpu: rootContext.cpu,
      vtk: rootContext.vtk,
    };
  }
}

function getCameraState(ctx: PlanarCpuVolumeAdapterContext): PlanarCameraState {
  const camera = ctx.vtk.renderer.getActiveCamera();

  return {
    focalPoint: [...camera.getFocalPoint()] as Point3,
    parallelScale: camera.getParallelScale(),
    position: [...camera.getPosition()] as Point3,
  };
}

function getViewportCamera(ctx: PlanarCpuVolumeAdapterContext): ICamera {
  const camera = ctx.vtk.renderer.getActiveCamera();

  return {
    viewUp: [...camera.getViewUp()] as Point3,
    viewPlaneNormal: [...camera.getViewPlaneNormal()] as Point3,
    focalPoint: [...camera.getFocalPoint()] as Point3,
    position: [...camera.getPosition()] as Point3,
    parallelProjection: true,
    parallelScale: camera.getParallelScale(),
  };
}

function setCameraState(
  ctx: PlanarCpuVolumeAdapterContext,
  cameraState: PlanarCameraState
): void {
  const camera = ctx.vtk.renderer.getActiveCamera();

  camera.setParallelProjection(true);
  camera.setParallelScale(cameraState.parallelScale);
  camera.setFocalPoint(...cameraState.focalPoint);
  camera.setPosition(...cameraState.position);
}

function setCameraClippingRange(ctx: PlanarCpuVolumeAdapterContext): void {
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
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering
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

function applyOrientation(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering,
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
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering
): number {
  const camera = ctx.vtk.renderer.getActiveCamera();

  return getPlanarVolumeSliceNavigationState({
    actor: rendering.backendHandle.actor,
    camera: {
      focalPoint: [...camera.getFocalPoint()] as Point3,
      position: [...camera.getPosition()] as Point3,
      viewPlaneNormal: [...camera.getViewPlaneNormal()] as Point3,
    },
    imageVolume: rendering.backendHandle.imageVolume,
  }).currentSliceIndex;
}

function setSliceIndex(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering,
  imageIdIndex: number
): void {
  setCameraState(ctx, rendering.backendHandle.sliceCamera);

  const camera = ctx.vtk.renderer.getActiveCamera();
  const viewPlaneNormal = [...camera.getViewPlaneNormal()] as Point3;
  const focalPoint = [...camera.getFocalPoint()] as Point3;
  const position = [...camera.getPosition()] as Point3;
  const { sliceRange, spacingInNormalDirection } =
    getPlanarVolumeSliceNavigationState({
      actor: rendering.backendHandle.actor,
      camera: {
        focalPoint,
        position,
        viewPlaneNormal,
      },
      imageVolume: rendering.backendHandle.imageVolume,
    });
  const maxImageIdIndex = rendering.backendHandle.payload.imageIds.length - 1;
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

function applyCameraToVtk(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering,
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

function clearToBackground(ctx: PlanarCpuVolumeAdapterContext): void {
  ctx.cpu.context.setTransform(1, 0, 0, 1, 0, 0);
  ctx.cpu.context.clearRect(0, 0, ctx.cpu.canvas.width, ctx.cpu.canvas.height);
  ctx.cpu.context.fillStyle = '#000';
  ctx.cpu.context.fillRect(0, 0, ctx.cpu.canvas.width, ctx.cpu.canvas.height);
}
