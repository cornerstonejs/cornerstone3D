import { vec3 } from 'gl-matrix';
import { buildPlanarActorEntry } from './buildPlanarActorEntry';
import CanvasActor from '../../CanvasActor';
import calculateTransform from '../../helpers/cpuFallback/rendering/calculateTransform';
import canvasToPixel from '../../helpers/cpuFallback/rendering/canvasToPixel';
import correctShift from '../../helpers/cpuFallback/rendering/correctShift';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import { getDefaultImageVOIRange } from '../../helpers/planarImageRendering';
import fitToWindow from '../../helpers/cpuFallback/rendering/fitToWindow';
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
import { ActorRenderMode } from '../../../types';
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
  PlanarDataPresentation,
  PlanarCpuImageAdapterContext,
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import type { PlanarCpuImageRendering } from './planarRuntimeTypes';
import type { DerivedPlanarPresentation } from './planarRenderCamera';
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
import { PlanarSliceSampler } from './planarSampledSlice';
import type {
  PlanarSampledSlice,
  PlanarSampledSliceInputs,
} from './planarSampledSlice';
import {
  PlanarSampledSliceCanvas,
  beginPlanarCanvasPass,
  getSliceCanvasTransform,
} from './planarSampledSliceCanvas';
import {
  getCanvasScreenSliceGeometry,
  scheduleSampledSliceRestWork,
} from './planarSampledSliceRest';
import {
  MAX_CPU_CANVAS_SLICE_SIZE,
  isSameGeometry,
} from './CpuVolumeSliceRenderPath';
import { buildPlanarImageData } from './planarImageData';
import { imageQualityStatusOf } from '../../helpers/fidelityIndicator/collectFidelityLines';
import { isSegmentationOverlayData } from '../renderingFidelity';

/** The parts of one mounted CPU image. */
type CpuImageSliceMount = {
  ctx: PlanarCpuImageAdapterContext;
  rendering: PlanarCpuImageRendering;
  sampler: PlanarSliceSampler;
  draw: PlanarSampledSliceCanvas;
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
  shownSlice?: PlanarSampledSlice;
  shownScreen?: VolumeSliceGeometry;
  /** The plane, screen grid and inputs of the last request to the sampler. */
  sampledFor?: string;
};

/**
 * The render path of `cpuImage`: one image of a stack drawn on the 2D canvas
 * of the viewport.
 *
 * The image is drawn by the CPU draw step of the sampled slice
 * (`PlanarSampledSliceCanvas`, presentation `image`), so that the picture is
 * the one of the GPU image path (`VtkImageMapperRenderPath`): the same colour
 * tables, the same blend with the background, the same placement. The image
 * is handed to it as a volume of one slice (`createImageSliceVolume`): along
 * its own normal the sampler copies the image unchanged. The canvas enlarges
 * colours, not values, so a LINEAR image is sampled once more on the screen
 * grid at rest (`scheduleSampledSliceRestWork`), as on the CPU volume path.
 *
 * @internal
 */
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

    ctx.display.activateRenderMode(ActorRenderMode.CPU_IMAGE);

    let rendering: PlanarCpuImageRendering;
    markCpuImagePreScaled(payload.image);
    const compatibilityActor = new CanvasActor(
      {
        getImageData: () => this.getImageData(rendering),
      } as unknown as IViewport,
      payload.image
    );

    compatibilityActor.setVisibility(true);

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
      renderMode: ActorRenderMode.CPU_IMAGE,
      actorEntryUID: uuidv4(),
      excludeFromFidelity: isSegmentationOverlayData(payload, options),
      imageQualityStatus: imageQualityStatusOf(payload.image),
      enabledElement,
      compatibilityActor,
      currentImageIdIndex: payload.initialImageIdIndex ?? 0,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      dataPresentation: undefined,
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
      draw: new PlanarSampledSliceCanvas(
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
          dataId: data.id,
          image,
          imageIdIndex: rendering.currentImageIdIndex,
          props: rendering.dataPresentation,
          rendering,
        })
    );

    triggerPlanarNewImage(ctx, {
      image: payload.image,
      imageIdIndex: payload.initialImageIdIndex ?? 0,
    });

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
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
          mapper: rendering.compatibilityActor.getMapper(),
          renderMode: ActorRenderMode.CPU_IMAGE,
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

  private updateDataPresentation(
    rendering: PlanarCpuImageRendering,
    props: unknown
  ): void {
    rendering.dataPresentation = props as PlanarDataPresentation | undefined;
    applyDataPresentation(rendering, rendering.dataPresentation);
  }

  private applyViewState(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    dataId: string,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarViewState | undefined;
    const image = rendering.enabledElement.image;

    ctx.display.activateRenderMode(ActorRenderMode.CPU_IMAGE);

    const projection = image
      ? resolvePlanarRenderPathProjection({
          ctx,
          dataId,
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
      applyPresentationState(
        rendering,
        projection.presentation,
        projection.resolvedICamera
      );
    }

    // See VtkImageMapperRenderPath for context on why this dedupes against
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
    return canvasToWorldPlanarRenderPathProjection({
      canvas: ctx.cpu.canvas,
      canvasPos,
      ctx,
    });
  }

  private worldToCanvas(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    worldPos: Point3
  ): Point2 {
    return worldToCanvasPlanarRenderPathProjection({
      canvas: ctx.cpu.canvas,
      ctx,
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

  private render(mount: CpuImageSliceMount, dataId: string): void {
    const { ctx } = mount;

    if (!ctx.viewport.isCurrentDataId(dataId)) {
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
    rendering: PlanarCpuImageRendering,
    dataId: string
  ): void {
    const image = rendering.enabledElement.image;
    const camera = ctx.viewport.getViewState();

    if (!image) {
      return;
    }

    fitToWindow(rendering.enabledElement);

    const projection = resolvePlanarRenderPathProjection({
      ctx,
      dataId,
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
      applyPresentationState(
        rendering,
        projection.presentation,
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

    if (rendering.dataPresentation?.visible !== false) {
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
        ctx.viewport.drawsFinerImageAtRest?.() !== false &&
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
          presentation: getImageSlicePresentation(rendering),
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
    mount.cancelRestWork = scheduleSampledSliceRestWork({
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
export class CpuImageSlicePath
  implements
    RenderPathDefinition<
      PlanarViewportRenderContext,
      PlanarCpuImageAdapterContext
    >
{
  readonly id = 'planar:cpu-image-slice';
  readonly type = ViewportType.PLANAR_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return (
      data.type === 'image' && options.renderMode === ActorRenderMode.CPU_IMAGE
    );
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
      view: rootContext.view,
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
  const voiRange = props?.voiRange ?? defaultVOIRange;

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

function getCPUFallbackScalarScale(scale?: number | Point2): number {
  return Array.isArray(scale) ? scale[1] : (scale ?? 1);
}

function applyPresentationState(
  rendering: PlanarCpuImageRendering,
  presentation?: DerivedPlanarPresentation,
  activeSourceICamera?: PlanarResolvedICamera
): void {
  const { enabledElement, fitScale } = rendering;
  const viewport = enabledElement.viewport as Omit<
    CPUFallbackEnabledElement['viewport'],
    'scale'
  > & {
    scale?: number | Point2;
  };
  const desiredPan = presentation?.pan ?? [0, 0];
  const zoom = Math.max(presentation?.zoom ?? 1, 0.001);

  viewport.hflip = presentation?.flipHorizontal ?? false;
  viewport.vflip = presentation?.flipVertical ?? false;
  viewport.rotation = presentation?.rotation ?? 0;
  viewport.scale =
    typeof activeSourceICamera?.parallelScale === 'number'
      ? resolvePlanarCpuViewportScale({
          canvas: enabledElement.canvas,
          parallelScale: activeSourceICamera.parallelScale,
          presentationScale: activeSourceICamera.presentationScale,
          columnPixelSpacing: enabledElement.image?.columnPixelSpacing || 1,
          rowPixelSpacing: enabledElement.image?.rowPixelSpacing || 1,
        })
      : [fitScale * (presentation?.scale?.[0] ?? zoom), fitScale * zoom];
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
 * presentation asks for NEAREST, as on the GPU image path. An image has no
 * slab and no time point.
 */
function getImageSliceInputs(
  rendering: PlanarCpuImageRendering
): PlanarSampledSliceInputs {
  return {
    interpolationType:
      rendering.dataPresentation?.interpolationType ===
      InterpolationType.NEAREST
        ? InterpolationType.NEAREST
        : InterpolationType.LINEAR,
  };
}

/**
 * The presentation that the GPU image path applies: LINEAR interpolation
 * unless the presentation says otherwise, and the VOI LUT function of the
 * image unless the presentation gives one.
 */
function getImageSlicePresentation(
  rendering: PlanarCpuImageRendering
): PlanarDataPresentation {
  const { dataPresentation, enabledElement } = rendering;

  return {
    interpolationType: InterpolationType.LINEAR,
    ...dataPresentation,
    voiLUTFunction:
      dataPresentation?.voiLUTFunction ?? enabledElement.image?.voiLUTFunction,
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
      actorEntry.actorMapper?.renderMode !== ActorRenderMode.CPU_IMAGE ||
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
  dataId: string;
  image: IImage;
  imageIdIndex: number;
  props?: PlanarDataPresentation;
  rendering: PlanarCpuImageRendering;
}): Promise<void> {
  const { ctx, dataId, image, imageIdIndex, props, rendering } = args;
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
  rendering.defaultVOIRange = getDefaultImageVOIRange(image);
  rendering.fitScale = getCPUFallbackScalarScale(defaultViewport.scale);
  rendering.renderingInvalidated = true;
  ctx.viewport.invalidateResolvedView();
  rendering.compatibilityActor
    .getMapper()
    .getInputData()
    .setDerivedImage(image);

  applyDataPresentation(rendering, props);
  const projection = resolvePlanarRenderPathProjection({
    ctx,
    dataId,
    rendering,
    viewState: camera,
  });

  if (projection) {
    applyPresentationState(
      rendering,
      projection.presentation,
      projection.resolvedICamera
    );
  }

  triggerPlanarNewImage(ctx, { image, imageIdIndex });
  // cpuImage is drawn by the Planar viewport itself, not by the rendering
  // engine's VTK pass. The image swap therefore needs an immediate viewport
  // render or the visible canvas stays stale until another direct render.
  ctx.display.renderNow();
}
