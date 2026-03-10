import calculateTransform from '../../helpers/cpuFallback/rendering/calculateTransform';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import resizeEnabledElement from '../../helpers/cpuFallback/rendering/resize';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import { InterpolationType } from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { toLowHighRange, toWindowLevel } from '../../../utilities/windowLevel';
import type {
  CPUFallbackEnabledElement,
  IImage,
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
  PlanarCpuImageRendering,
  PlanarPayload,
  PlanarPresentationProps,
  PlanarViewportRenderContext,
  PlanarProperties,
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

function applyPresentation(
  rendering: PlanarCpuImageRendering,
  props?: PlanarPresentationProps
): void {
  const { enabledElement, defaultVOIRange } = rendering.backendHandle;
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

  rendering.backendHandle.renderingInvalidated = true;
}

function applyViewportPresentation(
  rendering: PlanarCpuImageRendering,
  presentation?: PlanarProperties
): void {
  const { enabledElement } = rendering.backendHandle;
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
  const { enabledElement, fitScale } = rendering.backendHandle;
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
  const { enabledElement, renderingInvalidated } = rendering.backendHandle;

  if (!enabledElement.image) {
    return;
  }

  drawImageSync(enabledElement, renderingInvalidated);
  rendering.backendHandle.renderingInvalidated = false;
}

async function updateRenderedImage(args: {
  ctx: PlanarViewportRenderContext;
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
  const enabledElement = rendering.backendHandle.enabledElement;
  const defaultViewport = getDefaultViewport(ctx.canvas, image);
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

  rendering.backendHandle.currentImageIdIndex = imageIdIndex;
  rendering.backendHandle.defaultVOIRange = getDefaultVOIRange(image);
  rendering.backendHandle.fitScale = defaultViewport.scale ?? 1;
  rendering.backendHandle.renderingInvalidated = true;

  applyPresentation(rendering, props);
  applyViewportPresentation(rendering, viewportPresentation);
  applyCameraState(rendering, camera);
  ctx.requestRender();
}

export class CpuImageCanvasRenderingAdapter
  implements RenderingAdapter<PlanarViewportRenderContext>
{
  async attach(
    ctx: PlanarViewportRenderContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarCpuImageRendering> {
    const payload = data.payload as PlanarPayload;

    if (!payload.initialImage) {
      throw new Error(
        '[PlanarViewportV2] CPU rendering requires an initial image'
      );
    }

    ctx.setRenderMode('cpu2d');

    const enabledElement = {
      canvas: ctx.canvas,
      image: payload.initialImage,
      renderingTools: {},
      viewport: getDefaultViewport(ctx.canvas, payload.initialImage),
    } as CPUFallbackEnabledElement;

    resizeEnabledElement(enabledElement, true);
    enabledElement.transform = calculateTransform(enabledElement);

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'image',
      renderMode: 'cpu2d',
      backendHandle: {
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
    _ctx: PlanarViewportRenderContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as PlanarCpuImageRendering,
      props as PlanarPresentationProps | undefined
    );
  }

  updateCamera(
    ctx: PlanarViewportRenderContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const planarRendering = rendering as PlanarCpuImageRendering;
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ??
      planarRendering.backendHandle.currentImageIdIndex;

    ctx.setRenderMode('cpu2d');
    applyCameraState(planarRendering, planarCamera);

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
        ctx,
        image,
        imageIdIndex: nextImageIdIndex,
        rendering: planarRendering,
        camera: planarCamera,
      });
    });
  }

  updateProperties(
    _ctx: PlanarViewportRenderContext,
    rendering: MountedRendering,
    presentation: unknown
  ): void {
    applyViewportPresentation(
      rendering as PlanarCpuImageRendering,
      presentation as PlanarProperties | undefined
    );
  }

  render(_ctx: PlanarViewportRenderContext, rendering: MountedRendering): void {
    renderCPUImage(rendering as PlanarCpuImageRendering);
  }

  resize(_ctx: PlanarViewportRenderContext, rendering: MountedRendering): void {
    resizeEnabledElement(
      (rendering as PlanarCpuImageRendering).backendHandle.enabledElement
    );
  }

  detach(ctx: PlanarViewportRenderContext, rendering: MountedRendering): void {
    const { enabledElement } = (rendering as PlanarCpuImageRendering)
      .backendHandle;

    ctx.canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    ctx.canvasContext.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    enabledElement.image = undefined;
  }
}

export class CpuImageCanvasPath
  implements RenderPathDefinition<PlanarViewportRenderContext>
{
  readonly id = 'planar:cpu-image-canvas';
  readonly viewportKind = 'planar' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'imageStack' &&
      options.role === 'image' &&
      options.renderMode === 'cpu2d'
    );
  }

  createAdapter() {
    return new CpuImageCanvasRenderingAdapter();
  }
}
