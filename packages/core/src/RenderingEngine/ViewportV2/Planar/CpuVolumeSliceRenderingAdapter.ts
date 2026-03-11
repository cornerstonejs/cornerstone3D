import { vec3 } from 'gl-matrix';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import Events from '../../../enums/Events';
import { OrientationAxis } from '../../../enums';
import eventTarget from '../../../eventTarget';
import type { ICamera, IImageData, Point2, Point3 } from '../../../types';
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
import {
  canvasToWorldContextPool,
  worldToCanvasContextPool,
} from './planarAdapterCoordinateTransforms';

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
      renderMode: 'cpuVolume',
      runtime: {
        actor,
        mapper,
        imageVolume: payload.imageVolume,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        maxImageIdIndex: payload.imageIds.length - 1,
        orientation: payload.acquisitionOrientation || OrientationAxis.AXIAL,
        sliceCamera: getCameraState(ctx),
        renderingInvalidated: true,
        removeStreamingSubscriptions: subscribeToVolumeLoadCompletion(
          payload.volumeId,
          () => {
            const rerenderLoadedSlice = () => {
              rendering.runtime.pendingVolumeLoadCallback = false;
              rendering.runtime.sampledSliceState = undefined;
              rendering.runtime.renderingInvalidated = true;
              this.render(ctx, rendering);
            };

            rerenderLoadedSlice();
            window.requestAnimationFrame(() => {
              rerenderLoadedSlice();
            });
          }
        ),
      },
    };

    rendering.runtime.currentImageIdIndex = getCurrentSliceIndex(
      ctx,
      rendering
    );
    updateClippingPlanes(ctx, rendering);

    return rendering;
  }

  updatePresentation(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    (rendering as PlanarCpuVolumeRendering).runtime.presentation =
      props as PlanarCpuVolumeRendering['runtime']['presentation'];
  }

  updateCamera(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const planarRendering = rendering as PlanarCpuVolumeRendering;
    const planarCamera = camera as PlanarCamera | undefined;

    ctx.display.activateRenderMode('cpuVolume');
    planarRendering.runtime.currentCamera = planarCamera;
    syncVolumeSliceState(ctx, planarRendering, {
      camera: planarCamera,
    });
  }

  updateProperties(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    (rendering as PlanarCpuVolumeRendering).runtime.properties =
      props as PlanarCpuVolumeRendering['runtime']['properties'];
  }

  canvasToWorld(
    ctx: PlanarCpuVolumeAdapterContext,
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
    ctx: PlanarCpuVolumeAdapterContext,
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
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): string | undefined {
    return (rendering as PlanarCpuVolumeRendering).runtime.imageVolume.metadata
      ?.FrameOfReferenceUID;
  }

  getImageData(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): IImageData | undefined {
    return buildPlanarVolumeImageData(
      (rendering as PlanarCpuVolumeRendering).runtime.imageVolume
    );
  }

  render(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const planarRendering = rendering as PlanarCpuVolumeRendering;
    const { runtime } = planarRendering;

    ctx.display.activateRenderMode('cpuVolume');

    if (runtime.presentation?.visible === false) {
      ctx.cpu.canvas.style.display = 'none';
      return;
    }

    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = String(runtime.presentation?.opacity ?? 1);

    const loadStatus = (
      runtime.imageVolume as { loadStatus?: { loaded?: boolean } }
    ).loadStatus;

    if (!loadStatus?.loaded) {
      clearToBackground(ctx);
      if (!runtime.pendingVolumeLoadCallback) {
        runtime.pendingVolumeLoadCallback = true;
        runtime.imageVolume.load();
      }
      return;
    }

    runtime.pendingVolumeLoadCallback = false;

    if (!ctx.cpu.canvas.width || !ctx.cpu.canvas.height) {
      return;
    }

    const camera = getCpuVolumeCompatibilityCamera(ctx, planarRendering);
    const shouldResample =
      runtime.renderingInvalidated ||
      this.sampler.needsResample({
        sampledSliceState: runtime.sampledSliceState,
        width: ctx.cpu.canvas.width,
        height: ctx.cpu.canvas.height,
        camera,
        properties: runtime.properties,
      });

    if (shouldResample) {
      runtime.sampledSliceState = this.sampler.sampleSliceImage({
        volume: runtime.imageVolume,
        width: ctx.cpu.canvas.width,
        height: ctx.cpu.canvas.height,
        camera,
        presentation: runtime.presentation,
        properties: runtime.properties,
      });
      runtime.renderingInvalidated = true;
    }

    if (!runtime.sampledSliceState) {
      clearToBackground(ctx);
      return;
    }

    runtime.enabledElement = this.sampler.createOrUpdateEnabledElement({
      enabledElement: runtime.enabledElement,
      canvas: ctx.cpu.canvas,
      image: runtime.sampledSliceState.image,
      modality: runtime.imageVolume.metadata?.Modality,
    });
    this.sampler.updateCPUFallbackViewport({
      enabledElement: runtime.enabledElement,
      sampledSliceState: runtime.sampledSliceState,
      camera,
      presentation: runtime.presentation,
      properties: runtime.properties,
      zoom: runtime.currentCamera?.zoom,
    });
    runtime.defaultVOIRange = this.sampler.getResolvedVOIRange(
      runtime.presentation?.voiRange,
      runtime.sampledSliceState.image.minPixelValue ?? 0,
      runtime.sampledSliceState.image.maxPixelValue ?? 1
    );
    drawImageSync(runtime.enabledElement, runtime.renderingInvalidated);
    runtime.renderingInvalidated = false;
  }

  resize(
    _ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    (rendering as PlanarCpuVolumeRendering).runtime.renderingInvalidated = true;
  }

  detach(
    ctx: PlanarCpuVolumeAdapterContext,
    rendering: MountedRendering
  ): void {
    const { actor, removeStreamingSubscriptions } = (
      rendering as PlanarCpuVolumeRendering
    ).runtime;

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
    return data.type === 'image' && options.renderMode === 'cpuVolume';
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

function getSliceNavigationCamera(ctx: PlanarCpuVolumeAdapterContext): ICamera {
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

export function getCpuVolumeCompatibilityCamera(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering
): ICamera {
  setCameraState(ctx, rendering.runtime.sliceCamera);

  const camera = ctx.vtk.renderer.getActiveCamera();
  const viewUp = vec3.normalize(vec3.create(), [
    ...camera.getViewUp(),
  ] as Point3) as Point3;
  const viewPlaneNormal = vec3.normalize(vec3.create(), [
    ...camera.getViewPlaneNormal(),
  ] as Point3) as Point3;
  let right = vec3.cross(
    vec3.create(),
    viewUp as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  );

  if (vec3.length(right) === 0) {
    right = vec3.fromValues(1, 0, 0);
  }

  right = vec3.normalize(vec3.create(), right);

  const zoom = Math.max(rendering.runtime.currentCamera?.zoom ?? 1, 0.001);
  const [panX, panY] = rendering.runtime.currentCamera?.pan ?? [0, 0];
  const parallelScale = rendering.runtime.sliceCamera.parallelScale / zoom;
  const canvasWidth = Math.max(ctx.cpu.canvas.width, 1);
  const canvasHeight = Math.max(ctx.cpu.canvas.height, 1);
  const worldHeight = parallelScale * 2;
  const worldWidth = worldHeight * (canvasWidth / canvasHeight);
  const deltaWorld = vec3.create();

  vec3.scaleAndAdd(
    deltaWorld,
    deltaWorld,
    right,
    (panX * worldWidth) / canvasWidth
  );
  vec3.scaleAndAdd(
    deltaWorld,
    deltaWorld,
    viewUp as unknown as vec3,
    (-panY * worldHeight) / canvasHeight
  );

  return {
    viewUp,
    viewPlaneNormal,
    focalPoint: vec3.subtract(
      vec3.create(),
      rendering.runtime.sliceCamera.focalPoint as unknown as vec3,
      deltaWorld
    ) as Point3,
    position: vec3.subtract(
      vec3.create(),
      rendering.runtime.sliceCamera.position as unknown as vec3,
      deltaWorld
    ) as Point3,
    parallelProjection: true,
    parallelScale,
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
  const clippingPlanes = ensureClippingPlanes(rendering.runtime.mapper);
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
    imageVolume: rendering.runtime.imageVolume,
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
  rendering.runtime.orientation = orientation;
  rendering.runtime.sliceCamera = getCameraState(ctx);
  rendering.runtime.currentImageIdIndex = getCurrentSliceIndex(ctx, rendering);
  updateClippingPlanes(ctx, rendering);
}

function getCurrentSliceIndex(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering
): number {
  return getPlanarVolumeSliceNavigationState({
    actor: rendering.runtime.actor,
    camera: getSliceNavigationCamera(ctx),
    imageVolume: rendering.runtime.imageVolume,
  }).currentSliceIndex;
}

function setSliceIndex(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering,
  imageIdIndex: number
): void {
  setCameraState(ctx, rendering.runtime.sliceCamera);

  const camera = ctx.vtk.renderer.getActiveCamera();
  const viewPlaneNormal = [...camera.getViewPlaneNormal()] as Point3;
  const focalPoint = [...camera.getFocalPoint()] as Point3;
  const position = [...camera.getPosition()] as Point3;
  const { sliceRange, spacingInNormalDirection } =
    getPlanarVolumeSliceNavigationState({
      actor: rendering.runtime.actor,
      camera: {
        focalPoint,
        position,
        viewPlaneNormal,
      },
      imageVolume: rendering.runtime.imageVolume,
    });
  const maxImageIdIndex = Math.max(
    0,
    Math.round((sliceRange.max - sliceRange.min) / spacingInNormalDirection)
  );
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

  rendering.runtime.currentImageIdIndex = clampedImageIdIndex;
  rendering.runtime.maxImageIdIndex = maxImageIdIndex;
  rendering.runtime.sliceCamera = getCameraState(ctx);
}

function applyCameraToVtk(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering,
  planarCamera?: PlanarCamera
): void {
  rendering.runtime.currentCamera = {
    ...rendering.runtime.currentCamera,
    ...planarCamera,
  };
}

function syncVolumeSliceState(
  ctx: PlanarCpuVolumeAdapterContext,
  rendering: PlanarCpuVolumeRendering,
  options: {
    camera?: PlanarCamera;
    forceSliceResync?: boolean;
  } = {}
): void {
  const { camera, forceSliceResync = false } = options;
  const nextImageIdIndex = camera?.imageIdIndex;
  const nextOrientation = camera?.orientation ?? rendering.runtime.orientation;

  if (nextOrientation !== rendering.runtime.orientation) {
    applyOrientation(ctx, rendering, nextOrientation);
    rendering.runtime.renderingInvalidated = true;
  }

  if (
    forceSliceResync ||
    (nextImageIdIndex ?? rendering.runtime.currentImageIdIndex) !==
      rendering.runtime.currentImageIdIndex
  ) {
    setSliceIndex(
      ctx,
      rendering,
      nextImageIdIndex ?? rendering.runtime.currentImageIdIndex
    );
    rendering.runtime.renderingInvalidated = true;
  } else {
    setCameraState(ctx, rendering.runtime.sliceCamera);
  }

  applyCameraToVtk(ctx, rendering, camera);
  updateClippingPlanes(ctx, rendering);
}

function clearToBackground(ctx: PlanarCpuVolumeAdapterContext): void {
  ctx.cpu.context.setTransform(1, 0, 0, 1, 0, 0);
  ctx.cpu.context.clearRect(0, 0, ctx.cpu.canvas.width, ctx.cpu.canvas.height);
  ctx.cpu.context.fillStyle = '#000';
  ctx.cpu.context.fillRect(0, 0, ctx.cpu.canvas.width, ctx.cpu.canvas.height);
}

function buildPlanarVolumeImageData(imageVolume): IImageData | undefined {
  const vtkImageData = imageVolume.imageData;

  if (!vtkImageData) {
    return;
  }

  return {
    dimensions: vtkImageData.getDimensions(),
    spacing: vtkImageData.getSpacing(),
    origin: vtkImageData.getOrigin(),
    direction: vtkImageData.getDirection(),
    imageData: vtkImageData,
    metadata: {
      Modality: imageVolume.metadata?.Modality,
      FrameOfReferenceUID: imageVolume.metadata?.FrameOfReferenceUID,
    },
    get scalarData() {
      return imageVolume.voxelManager?.getScalarData();
    },
    scaling: imageVolume.scaling,
    hasPixelSpacing: imageVolume.hasPixelSpacing,
    voxelManager: imageVolume.voxelManager,
  };
}
