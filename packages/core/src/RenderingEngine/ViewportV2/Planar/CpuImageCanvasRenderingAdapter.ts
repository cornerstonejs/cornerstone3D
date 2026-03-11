import calculateTransform from '../../helpers/cpuFallback/rendering/calculateTransform';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import resizeEnabledElement from '../../helpers/cpuFallback/rendering/resize';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import { InterpolationType, MetadataModules } from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import * as metaData from '../../../metaData';
import { toLowHighRange, toWindowLevel } from '../../../utilities/windowLevel';
import type {
  CPUFallbackEnabledElement,
  IImage,
  Point2,
  Point3,
  VOIRange,
} from '../../../types';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCamera,
  PlanarCpuImageAdapterContext,
  PlanarCpuImageRendering,
  PlanarPayload,
  PlanarPresentationProps,
  PlanarViewportRenderContext,
  PlanarProperties,
} from './PlanarViewportV2Types';
import {
  canvasToWorldCPUImage,
  worldToCanvasCPUImage,
} from './planarAdapterCoordinateTransforms';

export class CpuImageCanvasRenderingAdapter
  implements RenderingAdapter<PlanarCpuImageAdapterContext>
{
  async attach(
    ctx: PlanarCpuImageAdapterContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarCpuImageRendering> {
    const payload = data.payload as PlanarPayload;

    if (!payload.initialImage) {
      throw new Error(
        '[PlanarViewportV2] CPU rendering requires an initial image'
      );
    }

    ctx.display.activateRenderMode('cpu2d');

    const enabledElement = {
      canvas: ctx.cpu.canvas,
      image: payload.initialImage,
      renderingTools: {},
      viewport: getDefaultViewport(ctx.cpu.canvas, payload.initialImage),
    } as CPUFallbackEnabledElement;

    resizeEnabledElement(enabledElement, true);
    enabledElement.transform = calculateTransform(enabledElement);

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      renderMode: 'cpu2d',
      runtime: {
        enabledElement,
        payload,
        currentImageIdIndex: payload.initialImageIdIndex,
        defaultVOIRange: getDefaultVOIRange(payload.initialImage),
        fitScale: enabledElement.viewport.scale ?? 1,
        loadRequestId: 0,
        renderingInvalidated: true,
      },
    };
  }

  updatePresentation(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as PlanarCpuImageRendering,
      props as PlanarPresentationProps | undefined
    );
  }

  updateCamera(
    ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const planarRendering = rendering as PlanarCpuImageRendering;
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ?? planarRendering.runtime.currentImageIdIndex;

    ctx.display.activateRenderMode('cpu2d');
    applyCameraState(planarRendering, planarCamera);

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
        imageIdIndex: nextImageIdIndex,
        rendering: planarRendering,
        camera: planarCamera,
      });
    });
  }

  updateProperties(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering,
    presentation: unknown
  ): void {
    applyViewportPresentation(
      rendering as PlanarCpuImageRendering,
      presentation as PlanarProperties | undefined
    );
  }

  canvasToWorld(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering,
    canvasPos: Point2
  ): Point3 {
    const planarRendering = rendering as PlanarCpuImageRendering;
    const image = planarRendering.runtime.enabledElement.image;

    if (!image) {
      return [0, 0, 0];
    }

    return canvasToWorldCPUImage(
      planarRendering.runtime.enabledElement,
      image,
      canvasPos
    );
  }

  worldToCanvas(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering,
    worldPos: Point3
  ): Point2 {
    const planarRendering = rendering as PlanarCpuImageRendering;
    const image = planarRendering.runtime.enabledElement.image;

    if (!image) {
      return [0, 0];
    }

    return worldToCanvasCPUImage(
      planarRendering.runtime.enabledElement,
      image,
      worldPos
    );
  }

  getFrameOfReferenceUID(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering
  ): string | undefined {
    const imageId = (rendering as PlanarCpuImageRendering).runtime
      .enabledElement.image?.imageId;
    const imagePlaneModule = imageId
      ? (metaData.get(MetadataModules.IMAGE_PLANE, imageId) as
          | { frameOfReferenceUID?: string }
          | undefined)
      : undefined;

    return imagePlaneModule?.frameOfReferenceUID;
  }

  render(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering
  ): void {
    renderCPUImage(rendering as PlanarCpuImageRendering);
  }

  resize(
    _ctx: PlanarCpuImageAdapterContext,
    rendering: MountedRendering
  ): void {
    resizeEnabledElement(
      (rendering as PlanarCpuImageRendering).runtime.enabledElement
    );
  }

  detach(ctx: PlanarCpuImageAdapterContext, rendering: MountedRendering): void {
    const { enabledElement } = (rendering as PlanarCpuImageRendering).runtime;

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

export class CpuImageCanvasPath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuImageAdapterContext
    >
{
  readonly id = 'planar:cpu-image-canvas';
  readonly type = 'planar' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'image' && options.renderMode === 'cpu2d';
  }

  createAdapter() {
    return new CpuImageCanvasRenderingAdapter();
  }

  selectContext(
    rootContext: PlanarViewportRenderContext
  ): PlanarCpuImageAdapterContext {
    return {
      viewportId: rootContext.viewportId,
      type: rootContext.type,
      display: rootContext.display,
      cpu: rootContext.cpu,
    };
  }
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

function applyPresentation(
  rendering: PlanarCpuImageRendering,
  props?: PlanarPresentationProps
): void {
  const { enabledElement, defaultVOIRange } = rendering.runtime;
  const { viewport } = enabledElement;
  const canvas = enabledElement.canvas as HTMLCanvasElement;
  const voiRange = props?.voiRange ?? defaultVOIRange;

  canvas.style.display = props?.visible === false ? 'none' : '';
  canvas.style.opacity = String(props?.opacity ?? 1);

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

  rendering.runtime.renderingInvalidated = true;
}

function applyViewportPresentation(
  rendering: PlanarCpuImageRendering,
  presentation?: PlanarProperties
): void {
  const { enabledElement } = rendering.runtime;
  const { viewport } = enabledElement;

  if (presentation?.interpolationType !== undefined) {
    viewport.pixelReplication =
      presentation.interpolationType !== InterpolationType.LINEAR;
  }
}

function applyCameraState(
  rendering: PlanarCpuImageRendering,
  camera?: PlanarCamera
): void {
  const { enabledElement, fitScale } = rendering.runtime;
  const viewport = enabledElement.viewport;
  const [panX, panY] = camera?.pan ?? [0, 0];
  const zoom = Math.max(camera?.zoom ?? 1, 0.001);

  viewport.scale = fitScale * zoom;
  viewport.translation = {
    x: panX,
    y: panY,
  };

  enabledElement.transform = calculateTransform(enabledElement);
}

function renderCPUImage(rendering: PlanarCpuImageRendering): void {
  const { enabledElement, renderingInvalidated } = rendering.runtime;

  if (!enabledElement.image) {
    return;
  }

  drawImageSync(enabledElement, renderingInvalidated);
  rendering.runtime.renderingInvalidated = false;
}

async function updateRenderedImage(args: {
  ctx: PlanarCpuImageAdapterContext;
  image: IImage;
  imageIdIndex: number;
  props?: PlanarPresentationProps;
  viewportPresentation?: PlanarProperties;
  rendering: PlanarCpuImageRendering;
  camera?: PlanarCamera;
}): Promise<void> {
  const {
    ctx,
    image,
    imageIdIndex,
    props,
    viewportPresentation,
    rendering,
    camera,
  } = args;
  const enabledElement = rendering.runtime.enabledElement;
  const defaultViewport = getDefaultViewport(ctx.cpu.canvas, image);
  const previousViewport = enabledElement.viewport;

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

  rendering.runtime.currentImageIdIndex = imageIdIndex;
  rendering.runtime.defaultVOIRange = getDefaultVOIRange(image);
  rendering.runtime.fitScale = defaultViewport.scale ?? 1;
  rendering.runtime.renderingInvalidated = true;

  applyPresentation(rendering, props);
  applyViewportPresentation(rendering, viewportPresentation);
  applyCameraState(rendering, camera);
  ctx.display.requestRender();
}
