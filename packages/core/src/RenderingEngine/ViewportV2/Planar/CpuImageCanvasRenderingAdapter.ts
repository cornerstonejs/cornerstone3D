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
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  PlanarCpuRendering,
  PlanarPresentationProps,
  PlanarStackPayload,
  PlanarViewportBackendContext,
  PlanarViewState,
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
  rendering: PlanarCpuRendering,
  props?: PlanarPresentationProps
): void {
  const { enabledElement, defaultVOIRange } = rendering.backendHandle;
  const { viewport } = enabledElement;
  const canvas = enabledElement.canvas as HTMLCanvasElement;
  const voiRange = props?.voiRange ?? defaultVOIRange;

  canvas.style.display = props?.visible === false ? 'none' : '';
  canvas.style.opacity = String(props?.opacity ?? 1);

  viewport.invert = props?.invert ?? false;
  viewport.pixelReplication =
    props?.interpolationType !== undefined
      ? props.interpolationType !== InterpolationType.LINEAR
      : false;

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

function applyViewState(
  rendering: PlanarCpuRendering,
  viewState?: PlanarViewState
): void {
  const { enabledElement, fitScale } = rendering.backendHandle;
  const viewport = enabledElement.viewport;
  const [panX, panY] = viewState?.pan ?? [0, 0];
  const zoom = Math.max(viewState?.zoom ?? 1, 0.001);

  viewport.scale = fitScale * zoom;
  viewport.translation = {
    x: panX,
    y: panY,
  };

  enabledElement.transform = calculateTransform(enabledElement);
}

function renderCPUImage(rendering: PlanarCpuRendering): void {
  const { enabledElement, renderingInvalidated } = rendering.backendHandle;

  if (!enabledElement.image) {
    return;
  }

  drawImageSync(enabledElement, renderingInvalidated);
  rendering.backendHandle.renderingInvalidated = false;
}

async function updateRenderedImage(args: {
  ctx: PlanarViewportBackendContext;
  image: IImage;
  imageIdIndex: number;
  props?: PlanarPresentationProps;
  rendering: PlanarCpuRendering;
  viewState?: PlanarViewState;
}): Promise<void> {
  const { ctx, image, imageIdIndex, props, rendering, viewState } = args;
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
  applyViewState(rendering, viewState);
  ctx.requestRender();
}

export class CpuImageCanvasRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<PlanarCpuRendering> {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const payload = data.payload as PlanarStackPayload;

    planarCtx.setRenderMode('cpu2d');

    const enabledElement = {
      canvas: planarCtx.canvas,
      image: payload.initialImage,
      renderingTools: {},
      viewport: getDefaultViewport(planarCtx.canvas, payload.initialImage),
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
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    applyPresentation(
      rendering as PlanarCpuRendering,
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
    const planarRendering = rendering as PlanarCpuRendering;
    const planarViewState = viewState as PlanarViewState | undefined;
    const planarProps = props as PlanarPresentationProps | undefined;
    const nextImageIdIndex =
      planarViewState?.imageIdIndex ??
      planarRendering.backendHandle.currentImageIdIndex;

    planarCtx.setRenderMode('cpu2d');
    applyViewState(planarRendering, planarViewState);

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
        imageIdIndex: nextImageIdIndex,
        props: planarProps,
        rendering: planarRendering,
        viewState: planarViewState,
      });
    });
  }

  render(_ctx: ViewportBackendContext, rendering: MountedRendering): void {
    renderCPUImage(rendering as PlanarCpuRendering);
  }

  resize(_ctx: ViewportBackendContext, rendering: MountedRendering): void {
    resizeEnabledElement(
      (rendering as PlanarCpuRendering).backendHandle.enabledElement
    );
  }

  detach(ctx: ViewportBackendContext, rendering: MountedRendering): void {
    const planarCtx = ctx as PlanarViewportBackendContext;
    const { enabledElement } = (rendering as PlanarCpuRendering).backendHandle;

    planarCtx.canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    planarCtx.canvasContext.clearRect(
      0,
      0,
      planarCtx.canvas.width,
      planarCtx.canvas.height
    );
    enabledElement.image = undefined;
  }
}

export class CpuImageCanvasPath implements RenderPathDefinition {
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
