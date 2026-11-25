import { vec3 } from 'gl-matrix';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import CanvasActor from '../../CanvasActor';
import calculateTransform from '../../helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import correctShift from '../../helpers/cpuFallback/rendering/correctShift';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import {
  getDefaultImageInvert,
  getDefaultImageVOIRange,
} from '../../helpers/planarImageRendering';
import fitToWindow from '../../helpers/cpuFallback/rendering/fitToWindow';
import { resolveCPUFallbackColormap } from '../../helpers/cpuFallback/colors';
import {
  InterpolationType,
  MetadataModules,
  ViewportType,
  Events,
  ViewportStatus,
} from '../../../enums';
import * as metaData from '../../../metaData';
import { PlanarRenderModeId } from './planarRenderModeIds';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import triggerEvent from '../../../utilities/triggerEvent';
import uuidv4 from '../../../utilities/uuidv4';
import { toWindowLevel } from '../../../utilities/windowLevel';
import type {
  CPUIImageData,
  CPUFallbackEnabledElement,
  IImage,
  IImageVolume,
  Point2,
  Point3,
} from '../../../types';
import type { VolumeSliceGeometry } from '../../../utilities/volumeSliceGeometry';
import type { IViewport } from '../../../types/IViewport';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  PlanarViewState,
  PlanarDisplaySetAppearance,
  PlanarCpuImageAdapterContext,
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarCanvasFrameRendering } from './planarRuntimeTypes';
import type { DerivedPlanarFraming } from './planarRenderCamera';
import {
  resolvePlanarCpuImageDisplayedArea,
  resolvePlanarCpuViewportScale,
} from './planarCpuViewportMath';
import {
  subscribeToBetterImageStages,
  triggerPlanarNewImage,
} from './planarImageEvents';
import {
  canvasToWorldPlanarRenderPathProjection,
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathCurrentImageIdIndex,
  resolvePlanarRenderPathProjection,
  worldToCanvasPlanarRenderPathProjection,
} from './planarRenderPathProjection';
import type { PlanarRenderPathProjectionCamera } from './planarRenderPathProjection';
import { PlanarSliceSampler } from './planarCpuSlice';
import type { PlanarCpuSlice, PlanarCpuSliceInputs } from './planarCpuSlice';
import {
  PlanarCpuSliceCanvas,
  beginPlanarCanvasPass,
  getSliceCanvasTransform,
} from './planarCpuSliceCanvas';
import {
  getCanvasScreenSliceGeometry,
  scheduleCpuSliceRestWork,
} from './planarCpuSliceRest';
import {
  MAX_CPU_CANVAS_SLICE_SIZE,
  isSameGeometry,
} from './CanvasCpuSliceRenderPath';
import { buildPlanarImageData } from './planarImageData';
import { imageQualityStatusOf } from '../../helpers/fidelityIndicator/collectFidelityLines';
import { isSegmentationOverlayData } from '../renderingFidelity';
import { loadPlanarStackImage } from './planarStackImageLoad';

/**
 * The actors of the images that this path draws. A labelmap overlay drawn by
 * this path is drawn by its actor in the pass of the source
 * (`renderCompatibilityOverlayActors`).
 */
const canvasFrameActors = new WeakSet<object>();

/** The parts of one mounted CPU image. */
type CpuImageSliceMount = {
  ctx: PlanarCpuImageAdapterContext;
  rendering: PlanarCanvasFrameRendering;
  sampler: PlanarSliceSampler;
  draw: PlanarCpuSliceCanvas;
  /**
   * True for an overlay that is an image, which draws itself over the source
   * as on the GPU image path. The labelmap of a segmentation is drawn by its
   * actor in the pass of the source (`renderCompatibilityOverlayActors`).
   */
  overlayImage: boolean;
  /** The image drawn last and that image as a volume of one slice. */
  image?: IImage;
  volume?: IImageVolume;
  /** Cancels the pending work at rest. */
  cancelRestWork?: () => void;
  /** The slice drawn last and the screen grid it was drawn for. */
  shownSlice?: PlanarCpuSlice;
  shownScreen?: VolumeSliceGeometry;
  /** The plane, screen grid and inputs of the last request to the sampler. */
  sampledFor?: string;
};

/**
 * The render path of `canvasFrame`: one image of a stack drawn on the 2D canvas
 * of the viewport.
 *
 * The image is drawn by the CPU draw step of the sampled slice
 * (`PlanarCpuSliceCanvas`, appearance `image`), so that the picture is
 * the one of the GPU image path (`VtkFrameRenderPath`): the same colour
 * tables, the same blend with the background, the same placement. The image
 * is handed to it as a volume of one slice (`createImageSliceVolume`): along
 * its own normal the sampler copies the image unchanged. The canvas enlarges
 * colours, not values, so a LINEAR image is sampled once more on the screen
 * grid at rest (`scheduleCpuSliceRestWork`), as on the CPU volume path.
 *
 * @internal
 */
export class CanvasFrameRenderPath
  implements RenderPath<PlanarCpuImageAdapterContext>
{
  async addData(
    ctx: PlanarCpuImageAdapterContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<PlanarDisplaySetAppearance>> {
    const payload: PlanarPayload = data as unknown as LoadedData<PlanarPayload>;

    if (!payload.image) {
      throw new Error('[PlanarViewport] CPU rendering requires an image');
    }

    ctx.display.activateRenderMode(PlanarRenderModeId.CANVAS_FRAME);

    let rendering: PlanarCanvasFrameRendering;
    markCpuImagePreScaled(payload.image);
    const compatibilityActor = new CanvasActor(
      {
        getImageData: () => this.getImageData(rendering),
      } as unknown as IViewport,
      payload.image
    );

    compatibilityActor.setVisibility(true);
    canvasFrameActors.add(compatibilityActor);

    const defaultViewport = getDefaultViewport(
      ctx.cpu.canvas,
      payload.image,
      getCPUFallbackViewportModality(payload.image)
    );

    defaultViewport.displayedArea = resolvePlanarCpuImageDisplayedArea(
      payload.image
    );

    const enabledElement = {
      canvas: ctx.cpu.canvas,
      image: payload.image,
      renderingTools: {},
      viewport: defaultViewport,
    } as CPUFallbackEnabledElement;

    fitToWindow(enabledElement);
    enabledElement.transform = calculateTransform(enabledElement);
    rendering = {
      renderMode: PlanarRenderModeId.CANVAS_FRAME,
      actorEntryUID: uuidv4(),
      excludeFromFidelity: isSegmentationOverlayData(payload, options),
      imageQualityStatus: imageQualityStatusOf(payload.image),
      enabledElement,
      compatibilityActor,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      defaultInvert: getDefaultImageInvert(payload.image),
      defaultVOILUTFunction: payload.image.voiLUTFunction,
      appearance: undefined,
      fitScale: getCPUFallbackScalarScale(enabledElement.viewport.scale),
      loadRequestId: 0,
      renderingInvalidated: true,
      refreshFidelity: () => {
        rendering.qualityPending =
          rendering.enabledElement.image?.imageQualityPending;
      },
    };
    const volume = createImageSliceVolume(payload.image);
    const mount: CpuImageSliceMount = {
      ctx,
      rendering,
      image: payload.image,
      volume,
      overlayImage:
        options.role === 'overlay' &&
        !isSegmentationOverlayData(payload, options),
      sampler: new PlanarSliceSampler({
        enlargesColours: true,
        keepFractions: true,
        maxSliceSize: MAX_CPU_CANVAS_SLICE_SIZE,
      }),
      draw: new PlanarCpuSliceCanvas(
        volume,
        ctx.cpu.canvas.width,
        ctx.cpu.canvas.height,
        'image'
      ),
    };
    const unsubscribeStages = subscribeToBetterImageStages(
      rendering,
      () => rendering.enabledElement.image?.imageId,
      (image) =>
        void updateRenderedImage({
          ctx,
          displaySetId: data.id,
          image,
          imageIdIndex: rendering.currentImageIdIndex,
          numberOfSlices: payload.imageIds.length,
          props: rendering.appearance,
          rendering,
        })
    );

    if (options.role !== 'overlay') {
      triggerPlanarNewImage(ctx, {
        displaySetId: data.id,
        image: payload.image,
        sliceIndex: payload.initialImageIdIndex ?? 0,
        numberOfSlices: payload.imageIds.length,
      });
    }

    return {
      rendering,
      updateAppearance: (props) => {
        this.updateAppearance(rendering, props);
      },
      applyViewState: (camera) => {
        this.applyViewState(ctx, rendering, data.id, camera, payload.imageIds);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getActorEntry: (data) => {
        return buildPlanarActorEntry(data as LoadedData<PlanarPayload>, {
          actor: rendering.compatibilityActor,
          uid: rendering.actorEntryUID,
          referencedIdFallback: rendering.enabledElement.image?.imageId,
        });
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(mount, data.id);
      },
      resize: () => {
        this.resize(ctx, rendering, data.id);
      },
      removeData: () => {
        unsubscribeStages();
        this.removeData(mount);
      },
    };
  }

  private updateAppearance(
    rendering: PlanarCanvasFrameRendering,
    props: unknown
  ): void {
    rendering.appearance = props as PlanarDisplaySetAppearance | undefined;
    applyAppearance(rendering, rendering.appearance);
  }

  private applyViewState(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCanvasFrameRendering,
    displaySetId: string,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarViewState | undefined;
    const image = rendering.enabledElement.image;

    ctx.display.activateRenderMode(PlanarRenderModeId.CANVAS_FRAME);

    const projection = image
      ? resolvePlanarRenderPathProjection({
          ctx,
          displaySetId,
          imageIds,
          rendering,
          viewState: planarCamera,
        })
      : undefined;
    const nextImageIdIndex = resolvePlanarRenderPathCurrentImageIdIndex({
      projection,
      rendering,
      viewState: planarCamera,
    });

    if (projection) {
      applyAppearanceState(
        rendering,
        projection.framing,
        projection.resolvedICamera
      );
    }

    // See VtkFrameRenderPath for context on why this dedupes against
    // lastRequestedImageIdIndex instead of currentImageIdIndex.
    const dedupTarget =
      rendering.lastRequestedImageIdIndex ?? rendering.currentImageIdIndex;

    if (nextImageIdIndex === dedupTarget) {
      return;
    }

    if (nextImageIdIndex < 0 || nextImageIdIndex >= imageIds.length) {
      return;
    }

    rendering.lastRequestedImageIdIndex = nextImageIdIndex;
    rendering.failedImageIdIndex = undefined;
    const requestId = ++rendering.loadRequestId;

    rendering.imageLoad = loadPlanarStackImage({
      imageIds,
      imageIdIndex: nextImageIdIndex,
      onImage: (image) => {
        if (requestId !== rendering.loadRequestId) {
          return;
        }

        return updateRenderedImage({
          ctx,
          displaySetId,
          image,
          imageIdIndex: nextImageIdIndex,
          numberOfSlices: imageIds.length,
          props: rendering.appearance,
          rendering,
        });
      },
      onError: () => {
        if (requestId === rendering.loadRequestId) {
          rendering.failedImageIdIndex = nextImageIdIndex;
        }
      },
    });
  }

  private canvasToWorld(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCanvasFrameRendering,
    canvasPos: Point2
  ): Point3 {
    return canvasToWorldPlanarRenderPathProjection({
      canvas: ctx.cpu.canvas,
      canvasPos,
      ctx,
    });
  }

  private worldToCanvas(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCanvasFrameRendering,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasPlanarRenderPathProjection({
      canvas: ctx.cpu.canvas,
      ctx,
      worldPos,
    });
  }

  private getFrameOfReferenceUID(
    rendering: PlanarCanvasFrameRendering
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
    rendering: PlanarCanvasFrameRendering
  ): CPUIImageData | undefined {
    const image = rendering.enabledElement.image;

    if (!image) {
      return;
    }

    return buildPlanarImageData(image, this.getFrameOfReferenceUID(rendering));
  }

  private render(mount: CpuImageSliceMount, displaySetId: string): void {
    const { ctx } = mount;

    if (!ctx.viewport.isCurrentDisplaySetId(displaySetId)) {
      if (mount.overlayImage) {
        this.drawImage(mount);
      }

      return;
    }

    this.drawImage(mount);
    renderCompatibilityOverlayActors(ctx);
    ctx.display.markRendered();
    triggerEvent(ctx.viewport.element, Events.IMAGE_RENDERED, {
      element: ctx.viewport.element,
      viewportId: ctx.viewportId,
      renderingEngineId: ctx.renderingEngineId,
      viewportStatus: ViewportStatus.RENDERED,
    });
  }

  private resize(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCanvasFrameRendering,
    displaySetId: string
  ): void {
    const image = rendering.enabledElement.image;
    const camera = ctx.viewport.getViewState();

    if (!image) {
      return;
    }

    fitToWindow(rendering.enabledElement);

    const projection = resolvePlanarRenderPathProjection({
      ctx,
      displaySetId,
      rendering,
      viewState: camera,
    });

    rendering.fitScale = getCPUFallbackScalarScale(
      getDefaultViewport(
        rendering.enabledElement.canvas,
        image,
        getCPUFallbackViewportModality(image)
      ).scale
    );
    rendering.renderingInvalidated = true;

    if (projection) {
      applyAppearanceState(
        rendering,
        projection.framing,
        projection.resolvedICamera
      );
    }
  }

  /**
   * Draws the image over the background of the viewport. The slice comes
   * from the sampler, which copies the image for a new image, plane or input
   * and keeps it otherwise; a slice of the screen grid sampled at rest is
   * kept for the same view. The canvas is left with the transform from the
   * pixels of the image to the canvas, which the overlay actors of the
   * viewport (a labelmap of the stack) draw with.
   */
  private drawImage(mount: CpuImageSliceMount): void {
    const { ctx, draw, rendering, sampler } = mount;
    const { enabledElement } = rendering;
    const { image } = enabledElement;

    ctx.cpu.canvas.style.display = '';
    ctx.cpu.canvas.style.opacity = '1';
    beginPlanarCanvasPass(ctx.cpu);

    if (!image || !ctx.cpu.canvas.width || !ctx.cpu.canvas.height) {
      return;
    }

    if (image !== mount.image) {
      mount.image = image;
      mount.volume = createImageSliceVolume(image);
      mount.sampledFor = undefined;
      sampler.invalidate();
      draw.setVolume(mount.volume);
    }

    const camera = getImagePlaneCamera(ctx, mount.volume);

    if (!camera) {
      return;
    }

    if (rendering.appearance?.visible !== false) {
      const screen = getCanvasScreenSliceGeometry(
        ctx.cpu.canvas,
        camera,
        MAX_CPU_CANVAS_SLICE_SIZE
      );
      const inputs = getImageSliceInputs(rendering);
      const request = JSON.stringify([
        camera.focalPoint,
        camera.viewPlaneNormal,
        screen,
        inputs,
      ]);
      const slice =
        request === mount.sampledFor && mount.shownSlice
          ? mount.shownSlice
          : sampler.sample(mount.volume, camera, inputs, screen);

      mount.sampledFor = request;

      if (
        slice &&
        (slice !== mount.shownSlice ||
          !isSameGeometry(mount.shownScreen, screen))
      ) {
        this.restartRestWork(mount);
      }

      mount.shownSlice = slice;
      mount.shownScreen = screen;

      if (slice) {
        draw.setSlice(slice);
        draw.draw({
          target: ctx.cpu,
          camera,
          appearance: getImageSliceAppearance(rendering),
          defaultVOIRange: rendering.defaultVOIRange,
          invalidated: rendering.renderingInvalidated,
        });
      }
    }

    rendering.renderingInvalidated = false;
    ctx.cpu.context.setTransform(
      ...getSliceCanvasTransform(
        getImageSliceGeometry(mount.volume),
        camera,
        ctx.cpu.canvas
      )
    );
    ctx.cpu.context.imageSmoothingEnabled =
      !enabledElement.viewport.pixelReplication;
  }

  /**
   * Cancels the work at rest and starts it again for the view on screen: the
   * sample of a LINEAR image on the screen grid, drawn with a render of the
   * viewport. A stack has no neighbour slices to prefetch.
   */
  private restartRestWork(mount: CpuImageSliceMount): void {
    const { ctx, rendering, sampler, volume } = mount;

    mount.cancelRestWork?.();
    mount.cancelRestWork = scheduleCpuSliceRestWork({
      sampler,
      volume,
      getCamera: () => getImagePlaneCamera(ctx, volume),
      getInputs: () => getImageSliceInputs(rendering),
      getScreen: (camera) =>
        getCanvasScreenSliceGeometry(
          ctx.cpu.canvas,
          camera,
          MAX_CPU_CANVAS_SLICE_SIZE
        ),
      getNeighbours: () => [],
      onFinerSlice: (slice) => {
        mount.shownSlice = slice;
        rendering.renderingInvalidated = true;
        ctx.display.renderNow();
      },
    });
  }

  private removeData(mount: CpuImageSliceMount): void {
    const { ctx, rendering } = mount;
    const { enabledElement } = rendering;

    mount.cancelRestWork?.();
    mount.cancelRestWork = undefined;
    mount.sampler.release();
    mount.draw.release();
    mount.shownSlice = undefined;
    mount.sampledFor = undefined;

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

/** @internal */
export class CanvasFramePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuImageAdapterContext
    >
{
  readonly id = 'planar:canvas-frame';
  readonly type = ViewportType.PLANAR;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' &&
      options.renderMode === PlanarRenderModeId.CANVAS_FRAME
    );
  }

  createRenderPath() {
    return new CanvasFrameRenderPath();
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
      view: rootContext.view,
      display: rootContext.display,
      cpu: rootContext.cpu,
    };
  }
}

function applyAppearance(
  rendering: PlanarCanvasFrameRendering,
  props?: PlanarDisplaySetAppearance
): void {
  const { enabledElement, defaultVOIRange } = rendering;
  const { viewport } = enabledElement;
  const voiRange = props?.voiRange ?? defaultVOIRange;

  viewport.colormap = resolveCPUFallbackColormap(
    props?.colormap,
    enabledElement.image?.colormap
  );
  viewport.invert = props?.invert ?? rendering.defaultInvert ?? false;

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

function getCPUFallbackScalarScale(scale?: number | Point2): number {
  return Array.isArray(scale) ? scale[1] : (scale ?? 1);
}

function applyAppearanceState(
  rendering: PlanarCanvasFrameRendering,
  framing?: DerivedPlanarFraming,
  activeSourceICamera?: PlanarResolvedICamera
): void {
  const { enabledElement, fitScale } = rendering;
  const viewport = enabledElement.viewport as Omit<
    CPUFallbackEnabledElement['viewport'],
    'scale'
  > & {
    scale?: number | Point2;
  };
  const desiredPan = framing?.pan ?? [0, 0];
  const zoom = Math.max(framing?.zoom ?? 1, 0.001);

  viewport.hflip = framing?.flipHorizontal ?? false;
  viewport.vflip = framing?.flipVertical ?? false;
  viewport.rotation = framing?.rotation ?? 0;
  viewport.scale =
    typeof activeSourceICamera?.parallelScale === 'number'
      ? resolvePlanarCpuViewportScale({
          canvas: enabledElement.canvas,
          parallelScale: activeSourceICamera.parallelScale,
          framingScale: activeSourceICamera.framingScale,
          columnPixelSpacing: enabledElement.image?.columnPixelSpacing || 1,
          rowPixelSpacing: enabledElement.image?.rowPixelSpacing || 1,
        })
      : [fitScale * (framing?.scale?.[0] ?? zoom), fitScale * zoom];
  viewport.parallelScale = activeSourceICamera?.parallelScale;
  viewport.translation = activeSourceICamera?.focalPoint
    ? resolveCPUImageViewportTranslationFromFocalPoint(
        enabledElement,
        activeSourceICamera.focalPoint
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
  const targetPoint = worldToCPUImageDrawPoint(enabledElement, focalPoint);
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

function worldToCPUImageDrawPoint(
  enabledElement: CPUFallbackEnabledElement,
  worldPos: Point3
): Point2 {
  const { image, viewport } = enabledElement;

  if (!image) {
    return [0, 0];
  }

  const { spacing, direction, origin } = getImageDataMetadata(image);
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const displayedArea = viewport.displayedArea;
  const sourceX = (displayedArea?.tlhc.x ?? 1) - 1;
  const sourceY = (displayedArea?.tlhc.y ?? 1) - 1;
  const diff = vec3.subtract(
    vec3.create(),
    worldPos as unknown as vec3,
    origin as unknown as vec3
  );

  return [
    vec3.dot(diff, rowVector as unknown as vec3) / spacing[0] + 0.5 - sourceX,
    vec3.dot(diff, columnVector as unknown as vec3) / spacing[1] +
      0.5 -
      sourceY,
  ];
}

/**
 * Mirror legacy StackViewport._setCSImage: when the cached image's pixel data is
 * already pre-scaled (modality rescale baked in), flag it so the CPUFallback
 * renderer skips the modality LUT. Without this the renderer
 * (generateLut/getDefaultViewport/renderGrayscaleImage all branch on
 * image.isPreScaled) re-applies slope/intercept on top of already-scaled data,
 * shifting every pixel down by the rescale intercept — e.g. a CT renders far too
 * dark, with only the densest bone surviving the window.
 */
function markCpuImagePreScaled(image: IImage): void {
  image.isPreScaled = image.preScale?.scaled;
}

function getCPUFallbackViewportModality(image: IImage): string | undefined {
  return (
    image.preScale?.scalingParameters?.modality ||
    (
      metaData.get(MetadataModules.GENERAL_SERIES, image.imageId) as
        | { modality?: string }
        | undefined
    )?.modality
  );
}

/**
 * The image as a volume of one slice, for the sample and draw steps of the
 * sampled slice: the pixel data of the image with its position, direction
 * and spacing. The volume is one unit thick, and its image data maps any
 * point onto the plane of the image.
 *
 * @internal
 */
export function createImageSliceVolume(image: IImage): IImageVolume {
  const { dimensions, direction, origin, spacing, modality } =
    getImageDataMetadata(image);

  return {
    volumeId: image.imageId,
    imageIds: [image.imageId],
    dimensions,
    direction,
    origin,
    spacing: [spacing[0], spacing[1], 1],
    imageData: buildPlanarImageData(image).imageData,
    voxelManager: image.voxelManager,
    metadata: { Modality: modality },
    isPreScaled: image.isPreScaled,
    scaling: image.scaling,
  } as unknown as IImageVolume;
}

/** The geometry of the pixels of an image that `createImageSliceVolume` made. */
function getImageSliceGeometry(
  volume: IImageVolume
): Parameters<typeof getSliceCanvasTransform>[0] {
  const { dimensions, direction, origin, spacing } = volume;

  return {
    origin,
    xDirection: [direction[0], direction[1], direction[2]],
    yDirection: [direction[3], direction[4], direction[5]],
    spacing: [spacing[0], spacing[1]],
    width: dimensions[0],
    height: dimensions[1],
  };
}

/**
 * The camera of the source with its focal point moved along the normal of
 * the image onto the plane of the image, so the image is drawn whatever
 * plane the camera of the stack is on.
 */
function getImagePlaneCamera(
  ctx: PlanarCpuImageAdapterContext,
  volume: IImageVolume
): PlanarRenderPathProjectionCamera | undefined {
  const camera = getPlanarRenderPathActiveSourceICamera(ctx);

  if (!camera) {
    return;
  }

  const { direction, origin } = volume;
  const normal = [direction[6], direction[7], direction[8]];
  const distance = [0, 1, 2].reduce(
    (sum, axis) =>
      sum + (camera.focalPoint[axis] - origin[axis]) * normal[axis],
    0
  );

  return {
    ...camera,
    focalPoint: [0, 1, 2].map(
      (axis) => camera.focalPoint[axis] - normal[axis] * distance
    ) as Point3,
  };
}

/**
 * The sampling inputs of an image: its interpolation, LINEAR unless the
 * appearance asks for NEAREST, as on the GPU image path. An image has no
 * slab and no time point.
 */
function getImageSliceInputs(
  rendering: PlanarCanvasFrameRendering
): PlanarCpuSliceInputs {
  return {
    interpolationType:
      rendering.appearance?.interpolationType === InterpolationType.NEAREST
        ? InterpolationType.NEAREST
        : InterpolationType.LINEAR,
  };
}

/**
 * The appearance that the GPU image path applies: LINEAR interpolation
 * unless the appearance says otherwise, and the VOI LUT function and the
 * invert flag of the image unless the appearance gives them.
 */
function getImageSliceAppearance(
  rendering: PlanarCanvasFrameRendering
): PlanarDisplaySetAppearance {
  const { appearance } = rendering;

  return {
    interpolationType: InterpolationType.LINEAR,
    ...appearance,
    voiLUTFunction:
      appearance?.voiLUTFunction ?? rendering.defaultVOILUTFunction,
    invert: appearance?.invert ?? rendering.defaultInvert,
  };
}

/**
 * Draws the labelmap overlays of segmentations with their actors, in the
 * pixel space of the source image that the canvas transform gives. An overlay
 * image draws itself (`CpuImageSliceMount.overlayImage`).
 */
function renderCompatibilityOverlayActors(
  ctx: PlanarCpuImageAdapterContext
): void {
  const overlayActors = ctx.viewport.getOverlayActors();

  for (const actorEntry of overlayActors) {
    if (
      !canvasFrameActors.has(actorEntry.actor) ||
      (actorEntry.reference as { kind?: string } | undefined)?.kind !==
        'segmentation'
    ) {
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
  displaySetId: string;
  image: IImage;
  imageIdIndex: number;
  numberOfSlices: number;
  props?: PlanarDisplaySetAppearance;
  rendering: PlanarCanvasFrameRendering;
}): Promise<void> {
  const {
    ctx,
    displaySetId,
    image,
    imageIdIndex,
    numberOfSlices,
    props,
    rendering,
  } = args;
  const enabledElement = rendering.enabledElement;
  markCpuImagePreScaled(image);
  const camera = ctx.viewport.getViewState();
  const defaultViewport = getDefaultViewport(
    ctx.cpu.canvas,
    image,
    getCPUFallbackViewportModality(image)
  );
  const previousViewport = enabledElement.viewport;

  defaultViewport.displayedArea = resolvePlanarCpuImageDisplayedArea(image);

  enabledElement.image = image;
  rendering.imageQualityStatus = imageQualityStatusOf(image);
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

  const previousDefaults = {
    voiRange: rendering.defaultVOIRange,
    invert: rendering.defaultInvert,
    voiLUTFunction: rendering.defaultVOILUTFunction,
  };

  rendering.defaultVOIRange = getDefaultImageVOIRange(image);
  rendering.defaultInvert = getDefaultImageInvert(image);
  rendering.defaultVOILUTFunction = image.voiLUTFunction;
  rendering.fitScale = getCPUFallbackScalarScale(defaultViewport.scale);
  rendering.renderingInvalidated = true;
  ctx.viewport.invalidateResolvedView();
  rendering.compatibilityActor
    .getMapper()
    .getInputData()
    .setDerivedImage(image);

  applyAppearance(rendering, props);
  const projection = resolvePlanarRenderPathProjection({
    ctx,
    displaySetId,
    rendering,
    viewState: camera,
  });

  if (projection) {
    applyAppearanceState(
      rendering,
      projection.framing,
      projection.resolvedICamera
    );
  }

  ctx.viewport.notifyDefaultAppearanceOfNewImage?.(
    displaySetId,
    previousDefaults
  );
  if (ctx.viewport.isCurrentDisplaySetId(displaySetId)) {
    triggerPlanarNewImage(ctx, {
      displaySetId,
      image,
      sliceIndex: imageIdIndex,
      numberOfSlices,
    });
  }
  // cpuImage is drawn by the Planar viewport itself, not by the rendering
  // engine's VTK pass. The image swap therefore needs an immediate viewport
  // render or the visible canvas stays stale until another direct render.
  ctx.display.renderNow();
}
