import { vec3 } from 'gl-matrix';
import calculateTransform from '../../helpers/cpuFallback/rendering/calculateTransform';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import { getDefaultImageVOIRange } from '../../helpers/planarImageRendering';
import resizeEnabledElement from '../../helpers/cpuFallback/rendering/resize';
import drawImageSync from '../../helpers/cpuFallback/drawImageSync';
import {
  InterpolationType,
  MetadataModules,
  ViewportType,
} from '../../../enums';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import * as metaData from '../../../metaData';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import { toWindowLevel } from '../../../utilities/windowLevel';
import type {
  CPUIImageData,
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  Point2,
  Point3,
} from '../../../types';
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
  PlanarCpuImageRendering,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportV2Types';
import {
  canvasToWorldCPUImage,
  getCpuEquivalentParallelScale,
  worldToCanvasCPUImage,
} from './planarAdapterCoordinateTransforms';
import {
  normalizePlanarRotation,
  rotatePlanarViewUp,
} from './planarCameraPresentation';

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
      throw new Error('[PlanarViewportV2] CPU rendering requires an image');
    }

    ctx.display.activateRenderMode('cpu2d');

    const enabledElement = {
      canvas: ctx.cpu.canvas,
      image: payload.image,
      renderingTools: {},
      viewport: getDefaultViewport(ctx.cpu.canvas, payload.image),
    } as CPUFallbackEnabledElement;

    resizeEnabledElement(enabledElement, true);
    enabledElement.transform = calculateTransform(enabledElement);

    const rendering: PlanarCpuImageRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'cpu2d',
      enabledElement,
      currentImageIdIndex: payload.initialImageIdIndex,
      defaultVOIRange: getDefaultImageVOIRange(payload.image),
      camera: getPlanarCpuImageCompatibilityCamera({
        enabledElement,
        image: payload.image,
      }),
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
        this.updateCamera(ctx, rendering, camera, payload.imageIds);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(rendering, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(rendering, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      getImageData: () => {
        return this.getImageData(rendering);
      },
      render: () => {
        this.render(rendering);
      },
      resize: () => {
        this.resize(rendering);
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
    applyDataPresentation(
      rendering,
      props as PlanarDataPresentation | undefined
    );
  }

  private updateCamera(
    ctx: PlanarCpuImageAdapterContext,
    rendering: PlanarCpuImageRendering,
    camera: unknown,
    imageIds: string[]
  ): void {
    const planarCamera = camera as PlanarCamera | undefined;
    const nextImageIdIndex =
      planarCamera?.imageIdIndex ?? rendering.currentImageIdIndex;

    ctx.display.activateRenderMode('cpu2d');
    applyCameraState(rendering, planarCamera);
    rendering.camera = getPlanarCpuImageCompatibilityCamera({
      camera: planarCamera,
      enabledElement: rendering.enabledElement,
      image: rendering.enabledElement.image,
    });

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
        image,
        imageIdIndex: nextImageIdIndex,
        rendering,
        camera: planarCamera,
      });
    });
  }

  private canvasToWorld(
    rendering: PlanarCpuImageRendering,
    canvasPos: Point2
  ): Point3 {
    const image = rendering.enabledElement.image;

    if (!image) {
      return [0, 0, 0];
    }

    return canvasToWorldCPUImage(rendering.enabledElement, image, canvasPos);
  }

  private worldToCanvas(
    rendering: PlanarCpuImageRendering,
    worldPos: Point3
  ): Point2 {
    const image = rendering.enabledElement.image;

    if (!image) {
      return [0, 0];
    }

    return worldToCanvasCPUImage(rendering.enabledElement, image, worldPos);
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

  private render(rendering: PlanarCpuImageRendering): void {
    renderCPUImage(rendering);
  }

  private resize(rendering: PlanarCpuImageRendering): void {
    resizeEnabledElement(rendering.enabledElement);
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
      type: rootContext.type,
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

function applyCameraState(
  rendering: PlanarCpuImageRendering,
  camera?: PlanarCamera
): void {
  const { enabledElement, fitScale } = rendering;
  const viewport = enabledElement.viewport;
  const [panX, panY] = camera?.pan ?? [0, 0];
  const zoom = Math.max(camera?.zoom ?? 1, 0.001);

  viewport.scale = fitScale * zoom;
  viewport.rotation = normalizePlanarRotation(camera?.rotation);
  viewport.translation = {
    x: panX,
    y: panY,
  };

  enabledElement.transform = calculateTransform(enabledElement);
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

export function getPlanarCpuImageCompatibilityCamera(args: {
  camera?: PlanarCamera;
  enabledElement?: CPUFallbackEnabledElement;
  image?: IImage;
}): PlanarCamera & ICamera {
  const { camera, enabledElement, image } = args;
  const nextCamera = { ...(camera || {}) };

  if (!image) {
    return nextCamera;
  }

  const { direction, dimensions, origin, spacing } =
    getImageDataMetadata(image);
  const rowVector = direction.slice(0, 3) as Point3;
  const columnVector = direction.slice(3, 6) as Point3;
  const viewPlaneNormal = direction.slice(6, 9) as Point3;
  const viewUp = rotatePlanarViewUp({
    rotation: nextCamera.rotation,
    viewPlaneNormal,
    viewUp: direction.slice(3, 6) as Point3,
  });
  const focalPoint = [...origin] as Point3;

  vec3.scaleAndAdd(
    focalPoint as unknown as vec3,
    focalPoint as unknown as vec3,
    rowVector as unknown as vec3,
    ((dimensions[0] - 1) * spacing[0]) / 2
  );
  vec3.scaleAndAdd(
    focalPoint as unknown as vec3,
    focalPoint as unknown as vec3,
    columnVector as unknown as vec3,
    ((dimensions[1] - 1) * spacing[1]) / 2
  );

  const baseParallelScale = enabledElement
    ? getCpuEquivalentParallelScale({
        canvasHeight: enabledElement.canvas.height,
        canvasWidth: enabledElement.canvas.width,
        columnPixelSpacing: image.columnPixelSpacing || 1,
        columns: image.columns,
        rowPixelSpacing: image.rowPixelSpacing || 1,
        rows: image.rows,
      })
    : undefined;
  const fitScale = enabledElement
    ? getDefaultViewport(enabledElement.canvas, image).scale || 1
    : 1;
  const currentScale = enabledElement?.viewport.scale ?? fitScale;
  const zoom = Math.max(currentScale / Math.max(fitScale, 0.001), 0.001);
  const parallelScale =
    baseParallelScale !== undefined ? baseParallelScale / zoom : undefined;
  const position = vec3.subtract(
    vec3.create(),
    focalPoint as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  ) as Point3;

  return {
    ...nextCamera,
    focalPoint,
    ...(parallelScale !== undefined ? { parallelScale } : {}),
    parallelProjection: true,
    position,
    viewPlaneNormal,
    viewUp,
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

async function updateRenderedImage(args: {
  ctx: PlanarCpuImageAdapterContext;
  image: IImage;
  imageIdIndex: number;
  props?: PlanarDataPresentation;
  rendering: PlanarCpuImageRendering;
  camera?: PlanarCamera;
}): Promise<void> {
  const { ctx, image, imageIdIndex, props, rendering, camera } = args;
  const enabledElement = rendering.enabledElement;
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

  rendering.currentImageIdIndex = imageIdIndex;
  rendering.defaultVOIRange = getDefaultImageVOIRange(image);
  rendering.camera = getPlanarCpuImageCompatibilityCamera({
    camera,
    enabledElement,
    image,
  });
  rendering.fitScale = defaultViewport.scale ?? 1;
  rendering.renderingInvalidated = true;

  applyDataPresentation(rendering, props);
  applyCameraState(rendering, camera);
  ctx.display.requestRender();
}
