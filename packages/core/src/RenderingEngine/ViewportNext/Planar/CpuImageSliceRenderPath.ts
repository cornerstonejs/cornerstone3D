import { vec3 } from 'gl-matrix';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import CanvasActor from '../../CanvasActor';
import calculateTransform from '../../helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import correctShift from '../../helpers/cpuFallback/rendering/correctShift';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import { getDefaultImageVOIRange } from '../../helpers/planarImageRendering';
import resizeEnabledElement from '../../helpers/cpuFallback/rendering/resize';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import { resolveCPUFallbackColormap } from '../../helpers/cpuFallback/colors';
import {
  InterpolationType,
  MetadataModules,
  ViewportType,
  Events,
  ViewportStatus,
} from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import * as metaData from '../../../metaData';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import triggerEvent from '../../../utilities/triggerEvent';
import { toWindowLevel } from '../../../utilities/windowLevel';
import type {
  CPUIImageData,
  CPUFallbackEnabledElement,
  IImage,
  Point2,
  Point3,
} from '../../../types';
import type { IViewport } from '../../../types/IViewport';
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
  PlanarCpuImageAdapterContext,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarCpuImageRendering } from './planarRuntimeTypes';
import {
  canvasToWorldPlanarCamera,
  getCanvasCssDimensions,
  worldToCanvasPlanarCamera,
} from './planarAdapterCoordinateTransforms';
import type { DerivedPlanarPresentation } from './planarRenderCamera';
import {
  derivePlanarPresentation,
  resolvePlanarRenderCamera,
} from './planarRenderCamera';
import {
  resolvePlanarCpuImageDisplayedArea,
  resolvePlanarCpuViewportScale,
} from './planarCpuViewportMath';
import { createPlanarCpuImageSliceBasis } from './planarSliceBasis';

export class CpuImageSliceRenderPath
  implements RenderPath<PlanarCpuImageAdapterContext>
{
  async addData(
    ctx: PlanarCpuImageAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDataPresentation>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.image) {
      throw new Error('[PlanarViewport] CPU rendering requires an image');
    }

    ctx.display.activateRenderMode('cpu2d');

    let rendering: PlanarCpuImageRendering;
    const compatibilityActor = new CanvasActor(
      {
        getImageData: () => this.getImageData(rendering),
      } as unknown as IViewport,
      payload.image
    );

    compatibilityActor.setVisibility(true);

    const defaultViewport = getDefaultViewport(ctx.cpu.canvas, payload.image);

    defaultViewport.displayedArea = resolvePlanarCpuImageDisplayedArea(
      payload.image
    );

    const enabledElement = {
      canvas: ctx.cpu.canvas,
      image: payload.image,
      renderingTools: {},
      viewport: defaultViewport,
    } as CPUFallbackEnabledElement;

    resizeEnabledElement(enabledElement, true);
    enabledElement.transform = calculateTransform(enabledElement);
    rendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'cpu2d',
      enabledElement,
      compatibilityActor,
      currentImageIdIndex: payload.initialImageIdIndex,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      dataPresentation: undefined,
      fitScale: enabledElement.viewport.scale ?? 1,
      loadRequestId: 0,
      renderingInvalidated: true,
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(ctx, rendering, data.id, camera, payload.imageIds);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getActorEntry: (data) => {
        return buildPlanarActorEntry(data as LoadedData<PlanarPayload>, {
          actor: rendering.compatibilityActor,
          renderMode: 'cpu2d',
          uidFallback: rendering.enabledElement.image?.imageId,
          referencedIdFallback: rendering.enabledElement.image?.imageId,
        });
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(ctx, rendering);
      },
      resize: () => {
        this.resize(ctx, rendering, data.id);
      },
      removeData: () => {
        this.removeData(ctx, rendering);
      },
    };
  }

  private updateDataPresentation(
    rendering: PlanarCpuImageRendering,
    props: unknown
  ): void {
    rendering.dataPresentation = props as PlanarDataPresentation | undefined;
    applyDataPresentation(rendering, rendering.dataPresentation);
  }

  private updateCamera(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    dataId: string,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ?? rendering.currentImageIdIndex;
    const image = rendering.enabledElement.image;

    ctx.display.activateRenderMode('cpu2d');

    if (image) {
      const sliceBasis = createPlanarCpuImageSliceBasis({
        canvasHeight: ctx.cpu.canvas.height,
        canvasWidth: ctx.cpu.canvas.width,
        image,
      });
      const renderCamera = resolvePlanarRenderCamera({
        sliceBasis,
        camera: planarCamera,
        canvasWidth: ctx.cpu.canvas.width,
        canvasHeight: ctx.cpu.canvas.height,
      });
      if (ctx.viewport.isCurrentDataId(dataId)) {
        ctx.renderPath.renderCamera = renderCamera;
      }
      const presentation = derivePlanarPresentation({
        sliceBasis,
        camera: planarCamera,
        canvasWidth: ctx.cpu.canvas.width,
        canvasHeight: ctx.cpu.canvas.height,
      });
      applyPresentationState(rendering, presentation, renderCamera);
    }

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
        dataId,
        image,
        imageIdIndex: nextImageIdIndex,
        props: rendering.dataPresentation,
        rendering,
      });
    });
  }

  private canvasToWorld(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    canvasPos: Point2
  ): Point3 {
    const renderCamera = ctx.renderPath.renderCamera;

    if (
      !renderCamera?.focalPoint ||
      !renderCamera.parallelScale ||
      !renderCamera.viewPlaneNormal ||
      !renderCamera.viewUp
    ) {
      return [0, 0, 0];
    }

    const { canvasWidth, canvasHeight } = getCanvasCssDimensions(
      ctx.cpu.canvas
    );

    return canvasToWorldPlanarCamera({
      camera: {
        focalPoint: renderCamera.focalPoint,
        parallelScale: renderCamera.parallelScale,
        viewPlaneNormal: renderCamera.viewPlaneNormal,
        viewUp: renderCamera.viewUp,
      },
      canvasWidth,
      canvasHeight,
      canvasPos,
    });
  }

  private worldToCanvas(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    worldPos: Point3
  ): Point2 {
    const renderCamera = ctx.renderPath.renderCamera;

    if (
      !renderCamera?.focalPoint ||
      !renderCamera.parallelScale ||
      !renderCamera.viewPlaneNormal ||
      !renderCamera.viewUp
    ) {
      return [0, 0];
    }

    const { canvasWidth, canvasHeight } = getCanvasCssDimensions(
      ctx.cpu.canvas
    );

    return worldToCanvasPlanarCamera({
      camera: {
        focalPoint: renderCamera.focalPoint,
        parallelScale: renderCamera.parallelScale,
        viewPlaneNormal: renderCamera.viewPlaneNormal,
        viewUp: renderCamera.viewUp,
      },
      canvasWidth,
      canvasHeight,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: PlanarCpuImageRendering
  ): string | undefined {
    const imageId = rendering.enabledElement.image?.imageId;
    const imagePlaneModule = imageId
      ? (metaData.get(MetadataModules.IMAGE_PLANE, imageId) as
          | { frameOfReferenceUID?: string }
          | undefined)
      : undefined;

    return imagePlaneModule?.frameOfReferenceUID;
  }

  private getImageData(
    rendering: PlanarCpuImageRendering
  ): CPUIImageData | undefined {
    const image = rendering.enabledElement.image;

    if (!image) {
      return;
    }

    return buildPlanarImageData(image, this.getFrameOfReferenceUID(rendering));
  }

  private render(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering
  ): void {
    renderCPUImage(rendering);
    renderCompatibilityOverlayActors(ctx);
    triggerEvent(ctx.viewport.element, Events.IMAGE_RENDERED, {
      element: ctx.viewport.element,
      viewportId: ctx.viewportId,
      renderingEngineId: ctx.renderingEngineId,
      viewportStatus: ViewportStatus.RENDERED,
    });
  }

  private resize(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    dataId: string
  ): void {
    resizeEnabledElement(rendering.enabledElement, true);
    const image = rendering.enabledElement.image;
    const camera = ctx.viewport.getCameraState();

    if (!image) {
      return;
    }

    const sliceBasis = createPlanarCpuImageSliceBasis({
      canvasHeight: rendering.enabledElement.canvas.height,
      canvasWidth: rendering.enabledElement.canvas.width,
      image,
    });
    const renderCamera = resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth: rendering.enabledElement.canvas.width,
      canvasHeight: rendering.enabledElement.canvas.height,
    });
    if (ctx.viewport.isCurrentDataId(dataId)) {
      ctx.renderPath.renderCamera = renderCamera;
    }
    const presentation = derivePlanarPresentation({
      sliceBasis,
      camera,
      canvasWidth: rendering.enabledElement.canvas.width,
      canvasHeight: rendering.enabledElement.canvas.height,
    });

    rendering.fitScale =
      getDefaultViewport(rendering.enabledElement.canvas, image).scale ?? 1;
    rendering.renderingInvalidated = true;
    applyPresentationState(rendering, presentation, renderCamera);
  }

  private removeData(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering
  ): void {
    const { enabledElement } = rendering;

    ctx.cpu.context.setTransform(1, 0, 0, 1, 0, 0);
    ctx.cpu.context.clearRect(
      0,
      0,
      ctx.cpu.canvas.width,
      ctx.cpu.canvas.height
    );
    enabledElement.image = undefined;
  }
}

export class CpuImageSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuImageAdapterContext
    >
{
  readonly id = 'planar:cpu-image-slice';
  readonly type = ViewportType.PLANAR_V2;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'image' && options.renderMode === 'cpu2d';
  }

  createRenderPath() {
    return new CpuImageSliceRenderPath();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarCpuImageAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      renderingEngineId: rootContext.renderingEngineId,
      type: rootContext.type,
      viewport: rootContext.viewport,
      renderPath: rootContext.renderPath,
      display: rootContext.display,
      cpu: rootContext.cpu,
    };
  }
}

function applyDataPresentation(
  rendering: PlanarCpuImageRendering,
  props?: PlanarDataPresentation
): void {
  const { enabledElement, defaultVOIRange } = rendering;
  const { viewport } = enabledElement;
  const canvas = enabledElement.canvas as HTMLCanvasElement;
  const voiRange = props?.voiRange ?? defaultVOIRange;

  canvas.style.display = props?.visible === false ? 'none' : '';
  canvas.style.opacity = String(props?.opacity ?? 1);

  viewport.colormap = resolveCPUFallbackColormap(
    props?.colormap,
    enabledElement.image?.colormap
  );
  viewport.invert = props?.invert ?? false;

  if (voiRange) {
    const { windowCenter, windowWidth } = toWindowLevel(
      voiRange.lower,
      voiRange.upper
    );

    viewport.voi = {
      windowCenter,
      windowWidth,
      voiLUTFunction: enabledElement.image?.voiLUTFunction,
    };
  }

  rendering.renderingInvalidated = true;

  if (props?.interpolationType !== undefined) {
    viewport.pixelReplication =
      props.interpolationType !== InterpolationType.LINEAR;
  }
}

function applyPresentationState(
  rendering: PlanarCpuImageRendering,
  presentation?: DerivedPlanarPresentation,
  renderCamera?: {
    focalPoint?: Point3;
    parallelScale?: number;
  }
): void {
  const { enabledElement, fitScale } = rendering;
  const viewport = enabledElement.viewport;
  const desiredPan = presentation?.pan ?? [0, 0];
  const zoom = Math.max(presentation?.zoom ?? 1, 0.001);

  viewport.hflip = presentation?.flipHorizontal ?? false;
  viewport.vflip = presentation?.flipVertical ?? false;
  viewport.rotation = presentation?.rotation ?? 0;
  viewport.scale =
    typeof renderCamera?.parallelScale === 'number'
      ? resolvePlanarCpuViewportScale({
          canvas: enabledElement.canvas,
          parallelScale: renderCamera.parallelScale,
          columnPixelSpacing: enabledElement.image?.columnPixelSpacing || 1,
          rowPixelSpacing: enabledElement.image?.rowPixelSpacing || 1,
        })
      : fitScale * zoom;
  viewport.parallelScale = renderCamera?.parallelScale;
  viewport.translation = renderCamera?.focalPoint
    ? resolveCPUImageViewportTranslationFromFocalPoint(
        enabledElement,
        renderCamera.focalPoint
      )
    : resolveCPUImageViewportTranslation(enabledElement, desiredPan);

  enabledElement.transform = calculateTransform(enabledElement);
}

function resolveCPUImageViewportTranslationFromFocalPoint(
  enabledElement: CPUFallbackEnabledElement,
  focalPoint: Point3
): { x: number; y: number } {
  const { image, viewport } = enabledElement;
  const originalTranslation = viewport.translation || { x: 0, y: 0 };

  if (!image) {
    return originalTranslation;
  }

  viewport.translation = { x: 0, y: 0 };
  enabledElement.transform = calculateTransform(enabledElement);

  const referencePoint = canvasToPixel(enabledElement, [
    enabledElement.canvas.width / 2,
    enabledElement.canvas.height / 2,
  ]);
  const targetPoint = worldToCPUImagePoint(image, focalPoint);
  const shift = correctShift(
    {
      x: targetPoint[0] - referencePoint[0],
      y: targetPoint[1] - referencePoint[1],
    },
    viewport
  );

  viewport.translation = originalTranslation;

  return {
    x: -shift.x,
    y: -shift.y,
  };
}

function resolveCPUImageViewportTranslation(
  enabledElement: CPUFallbackEnabledElement,
  desiredPan: Point2
): { x: number; y: number } {
  const { viewport } = enabledElement;
  const originalTranslation = viewport.translation || { x: 0, y: 0 };

  viewport.translation = { x: 0, y: 0 };
  const baseOrigin = calculateTransform(enabledElement).transformPoint([0, 0]);

  viewport.translation = { x: 1, y: 0 };
  const translatedXOrigin = calculateTransform(enabledElement).transformPoint([
    0, 0,
  ]);

  viewport.translation = { x: 0, y: 1 };
  const translatedYOrigin = calculateTransform(enabledElement).transformPoint([
    0, 0,
  ]);

  viewport.translation = originalTranslation;

  const deltaX: Point2 = [
    translatedXOrigin[0] - baseOrigin[0],
    translatedXOrigin[1] - baseOrigin[1],
  ];
  const deltaY: Point2 = [
    translatedYOrigin[0] - baseOrigin[0],
    translatedYOrigin[1] - baseOrigin[1],
  ];
  const determinant = deltaX[0] * deltaY[1] - deltaX[1] * deltaY[0];

  if (Math.abs(determinant) < 1e-6) {
    return { x: 0, y: 0 };
  }

  return {
    x: (desiredPan[0] * deltaY[1] - desiredPan[1] * deltaY[0]) / determinant,
    y: (deltaX[0] * desiredPan[1] - deltaX[1] * desiredPan[0]) / determinant,
  };
}

function worldToCPUImagePoint(image: IImage, worldPos: Point3): Point2 {
  const { spacing, direction, origin } = getImageDataMetadata(image);
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const diff = vec3.subtract(
    vec3.create(),
    worldPos as unknown as vec3,
    origin as unknown as vec3
  );

  return [
    vec3.dot(diff, rowVector as unknown as vec3) / spacing[0],
    vec3.dot(diff, columnVector as unknown as vec3) / spacing[1],
  ];
}

export function buildPlanarImageData(
  image: IImage,
  frameOfReferenceUID?: string
): CPUIImageData {
  const metadata = getImageDataMetadata(image);
  const { calibration, dimensions, direction, modality, origin, spacing } =
    metadata;
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const scalarData =
    image.voxelManager?.getScalarData() || image.getPixelData?.();

  return {
    dimensions,
    spacing,
    origin,
    direction,
    metadata: {
      Modality: modality,
      FrameOfReferenceUID: frameOfReferenceUID,
    },
    imageData: {
      getDirection: () => direction,
      getDimensions: () => dimensions,
      getScalarData: () => scalarData,
      getSpacing: () => spacing,
      worldToIndex: (point: Point3) => {
        const diff = vec3.subtract(
          vec3.create(),
          point as unknown as vec3,
          origin as unknown as vec3
        );

        return [
          vec3.dot(diff, rowVector as unknown as vec3) / spacing[0],
          vec3.dot(diff, columnVector as unknown as vec3) / spacing[1],
          0,
        ] as Point3;
      },
      indexToWorld: (point: Point3) => {
        const worldPoint = [...origin] as Point3;

        vec3.scaleAndAdd(
          worldPoint as unknown as vec3,
          worldPoint as unknown as vec3,
          rowVector as unknown as vec3,
          point[0] * spacing[0]
        );
        vec3.scaleAndAdd(
          worldPoint as unknown as vec3,
          worldPoint as unknown as vec3,
          columnVector as unknown as vec3,
          point[1] * spacing[1]
        );

        return worldPoint;
      },
    },
    scalarData,
    scaling: image.scaling,
    hasPixelSpacing: Boolean(image.rowPixelSpacing || image.columnPixelSpacing),
    calibration,
    preScale: image.preScale,
    voxelManager: image.voxelManager,
  };
}

function renderCPUImage(rendering: PlanarCpuImageRendering): void {
  const { enabledElement, renderingInvalidated } = rendering;

  if (!enabledElement.image) {
    return;
  }

  drawImageSync(enabledElement, renderingInvalidated);
  rendering.renderingInvalidated = false;
}

function renderCompatibilityOverlayActors(
  ctx: PlanarCpuImageAdapterContext
): void {
  const overlayActors = ctx.viewport.getOverlayActors();

  for (const actorEntry of overlayActors) {
    if (actorEntry.actorMapper?.renderMode !== 'cpu2d') {
      continue;
    }

    (actorEntry.actor as CanvasActor).render(
      undefined as never,
      ctx.cpu.context
    );
  }
}

async function updateRenderedImage(args: {
  ctx: PlanarCpuImageAdapterContext;
  dataId: string;
  image: IImage;
  imageIdIndex: number;
  props?: PlanarDataPresentation;
  rendering: PlanarCpuImageRendering;
}): Promise<void> {
  const { ctx, dataId, image, imageIdIndex, props, rendering } = args;
  const enabledElement = rendering.enabledElement;
  const camera = ctx.viewport.getCameraState();
  const defaultViewport = getDefaultViewport(ctx.cpu.canvas, image);
  const previousViewport = enabledElement.viewport;

  defaultViewport.displayedArea = resolvePlanarCpuImageDisplayedArea(image);

  enabledElement.image = image;
  enabledElement.viewport = {
    ...defaultViewport,
    hflip: previousViewport?.hflip ?? defaultViewport.hflip,
    invert: defaultViewport.invert,
    pixelReplication:
      previousViewport?.pixelReplication ?? defaultViewport.pixelReplication,
    rotation: previousViewport?.rotation ?? defaultViewport.rotation,
    translation: previousViewport?.translation ?? defaultViewport.translation,
    vflip: previousViewport?.vflip ?? defaultViewport.vflip,
  };

  rendering.currentImageIdIndex = imageIdIndex;
  rendering.defaultVOIRange = getDefaultImageVOIRange(image);
  rendering.fitScale = defaultViewport.scale ?? 1;
  rendering.renderingInvalidated = true;
  rendering.compatibilityActor
    .getMapper()
    .getInputData()
    .setDerivedImage(image);

  applyDataPresentation(rendering, props);
  const sliceBasis = createPlanarCpuImageSliceBasis({
    canvasHeight: enabledElement.canvas.height,
    canvasWidth: enabledElement.canvas.width,
    image,
  });
  const renderCamera = resolvePlanarRenderCamera({
    sliceBasis,
    camera,
    canvasWidth: enabledElement.canvas.width,
    canvasHeight: enabledElement.canvas.height,
  });
  if (ctx.viewport.isCurrentDataId(dataId)) {
    ctx.renderPath.renderCamera = renderCamera;
  }
  const presentation = derivePlanarPresentation({
    sliceBasis,
    camera,
    canvasWidth: enabledElement.canvas.width,
    canvasHeight: enabledElement.canvas.height,
  });
  applyPresentationState(rendering, presentation, renderCamera);
  ctx.display.requestRender();
}
