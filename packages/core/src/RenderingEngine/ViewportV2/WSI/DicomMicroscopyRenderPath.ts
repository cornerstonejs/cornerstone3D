import { mat4, vec3 } from 'gl-matrix';
import { Events as EVENTS, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import { getDicomMicroscopyViewer } from '../../../utilities/WSIUtilities';
import { Transform } from '../../helpers/cpuFallback/rendering/transform';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type { Point2, Point3 } from '../../../types';
import type {
  WSICamera,
  WSIDataPresentation,
  WSIRendering,
  WSIPayload,
  WSIViewportRenderContext,
} from './WSIViewportV2Types';

const EVENT_POSTRENDER = 'postrender';

export class DicomMicroscopyRenderPath
  implements RenderPath<WSIViewportRenderContext>
{
  async addData(
    ctx: WSIViewportRenderContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<WSIDataPresentation>> {
    const payload: WSIPayload = data as unknown as LoadedData<WSIPayload>;
    const DicomMicroscopyViewer = await getDicomMicroscopyViewer();
    const microscopyElement = document.createElement('div');

    microscopyElement.setAttribute('class', 'DicomMicroscopyViewer');
    microscopyElement.style.background = 'black';
    microscopyElement.style.width = '100%';
    microscopyElement.style.height = '100%';
    microscopyElement.style.position = 'absolute';
    microscopyElement.style.left = '0';
    microscopyElement.style.top = '0';
    ctx.element.appendChild(microscopyElement);

    const viewer = new DicomMicroscopyViewer.viewer.VolumeImageViewer({
      client: payload.client,
      metadata: payload.volumeImages,
      controls: ['overview', 'position'],
      retrieveRendered: false,
      bindings: {},
    });

    viewer.render({ container: microscopyElement });
    viewer.deactivateDragPanInteraction();

    const map = viewer.getMap();
    const renderingId = `rendering:${data.id}:${options.renderMode}`;
    const postrenderHandler = () => {
      triggerEvent(ctx.element, EVENTS.IMAGE_RENDERED, {
        element: ctx.element,
        viewportId: ctx.viewportId,
        renderingEngineId: ctx.renderingEngineId,
        rendering: {
          id: renderingId,
          dataId: data.id,
          renderMode: 'wsi2d',
        },
      });
    };

    map.on(EVENT_POSTRENDER, postrenderHandler);
    Object.assign(microscopyElement.style, {
      '--ol-partial-background-color': 'rgba(127, 127, 127, 0.7)',
      '--ol-foreground-color': '#000000',
      '--ol-subtle-foreground-color': '#000',
      '--ol-subtle-background-color': 'rgba(78, 78, 78, 0.5)',
      background: 'none',
    });

    const rendering: WSIRendering = {
      id: renderingId,
      renderMode: 'wsi2d',
      microscopyElement,
      viewer,
      map,
      postrenderHandler,
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(rendering, camera);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(ctx, rendering, payload.metadata, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(ctx, rendering, payload.metadata, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(payload);
      },
      removeData: () => {
        this.removeData(rendering);
      },
    };
  }

  private updateDataPresentation(
    rendering: WSIRendering,
    props: unknown
  ): void {
    const wsiProps = props as WSIDataPresentation | undefined;
    const { microscopyElement } = rendering;

    microscopyElement.style.display = wsiProps?.visible === false ? 'none' : '';
    microscopyElement.style.opacity = String(wsiProps?.opacity ?? 1);
  }

  private updateCamera(rendering: WSIRendering, camera: unknown): void {
    const wsiCamera = camera as WSICamera;
    const { map } = rendering;
    const view = map?.getView?.();

    if (!view) {
      return;
    }

    if (typeof wsiCamera.zoom === 'number') {
      view.setZoom(wsiCamera.zoom);
    }
    if (wsiCamera.centerIndex) {
      view.setCenter(wsiCamera.centerIndex);
    }
    if (typeof wsiCamera.rotation === 'number') {
      view.setRotation(wsiCamera.rotation);
    }
  }

  private canvasToWorld(
    ctx: WSIViewportRenderContext,
    rendering: WSIRendering,
    metadata: WSIPayload['metadata'],
    canvasPos: Point2
  ): Point3 {
    const indexPoint = canvasToIndex(ctx, rendering, canvasPos);
    indexPoint[1] = -indexPoint[1];

    return indexToWorld(metadata, indexPoint);
  }

  private worldToCanvas(
    ctx: WSIViewportRenderContext,
    rendering: WSIRendering,
    metadata: WSIPayload['metadata'],
    worldPos: Point3
  ): Point2 {
    const indexPoint = worldToIndex(metadata, worldPos);
    indexPoint[1] = -indexPoint[1];

    return indexToCanvas(ctx, rendering, indexPoint);
  }

  private getFrameOfReferenceUID(payload: WSIPayload): string | undefined {
    return payload.frameOfReferenceUID ?? undefined;
  }

  private removeData(rendering: WSIRendering): void {
    const { map, microscopyElement, viewer, postrenderHandler } = rendering;

    map?.un?.(EVENT_POSTRENDER, postrenderHandler);
    viewer?.cleanup?.();
    microscopyElement.remove();
  }
}

export class DicomMicroscopyPath
  implements RenderPathDefinition<WSIViewportRenderContext>
{
  readonly id = 'wsi:dicom-microscopy-viewer';
  readonly type = ViewportType.WHOLE_SLIDE;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'wsi' && options.renderMode === 'wsi2d';
  }

  createRenderPath() {
    return new DicomMicroscopyRenderPath();
  }
}

function computeTransforms(metadata: WSIPayload['metadata']) {
  const indexToWorld = mat4.create();
  const worldToIndexMatrix = mat4.create();

  mat4.fromTranslation(indexToWorld, metadata.origin);
  indexToWorld[0] = metadata.direction[0];
  indexToWorld[1] = metadata.direction[1];
  indexToWorld[2] = metadata.direction[2];
  indexToWorld[4] = metadata.direction[3];
  indexToWorld[5] = metadata.direction[4];
  indexToWorld[6] = metadata.direction[5];
  indexToWorld[8] = metadata.direction[6];
  indexToWorld[9] = metadata.direction[7];
  indexToWorld[10] = metadata.direction[8];
  mat4.scale(indexToWorld, indexToWorld, metadata.spacing);
  mat4.invert(worldToIndexMatrix, indexToWorld);

  return {
    indexToWorld,
    worldToIndexMatrix,
  };
}

function worldToIndex(metadata: WSIPayload['metadata'], point: Point3): Point3 {
  const transforms = computeTransforms(metadata);
  const imageCoord = vec3.create();

  vec3.transformMat4(imageCoord, point, transforms.worldToIndexMatrix);

  return [imageCoord[0], imageCoord[1], imageCoord[2]];
}

function indexToWorld(metadata: WSIPayload['metadata'], point: Point3): Point3 {
  const transforms = computeTransforms(metadata);
  const worldPos = vec3.create();

  vec3.transformMat4(worldPos, point, transforms.indexToWorld);

  return [worldPos[0], worldPos[1], worldPos[2]];
}

function canvasToIndex(
  ctx: WSIViewportRenderContext,
  rendering: WSIRendering,
  canvasPos: Point2
): Point3 {
  const transform = getTransform(ctx, rendering);

  transform.invert();

  const indexPoint = transform.transformPoint(
    canvasPos.map((value) => value * (window.devicePixelRatio || 1)) as Point2
  );

  return [indexPoint[0], indexPoint[1], 0];
}

function indexToCanvas(
  ctx: WSIViewportRenderContext,
  rendering: WSIRendering,
  indexPos: Point3
): Point2 {
  const transform = getTransform(ctx, rendering);

  return transform
    .transformPoint([indexPos[0], indexPos[1]])
    .map((value) => value / (window.devicePixelRatio || 1)) as Point2;
}

function getTransform(
  ctx: WSIViewportRenderContext,
  rendering: WSIRendering
): Transform {
  const view = rendering.map.getView();
  const center = view.getCenter();
  const resolution = view.getResolution();
  const rotation = view.getRotation();
  const canvasWidth =
    Math.max(ctx.element.clientWidth, 1) * (window.devicePixelRatio || 1);
  const canvasHeight =
    Math.max(ctx.element.clientHeight, 1) * (window.devicePixelRatio || 1);
  const halfCanvas = [canvasWidth / 2, canvasHeight / 2];
  const transform = new Transform();

  transform.translate(halfCanvas[0], halfCanvas[1]);
  transform.rotate(rotation);
  transform.scale(1 / resolution, -1 / resolution);
  transform.translate(-center[0], -center[1]);

  return transform;
}
