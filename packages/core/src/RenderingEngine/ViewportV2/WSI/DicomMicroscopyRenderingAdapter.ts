import { mat4, vec3 } from 'gl-matrix';
import { Events as EVENTS, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import { getDicomMicroscopyViewer } from '../../../utilities/WSIUtilities';
import { Transform } from '../../helpers/cpuFallback/rendering/transform';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type { Point2, Point3 } from '../../../types';
import type {
  WSICamera,
  WSIPresentationProps,
  WSIRendering,
  WSIPayload,
  WSIViewportRenderContext,
  WSIProperties,
} from './WSIViewportV2Types';

const EVENT_POSTRENDER = 'postrender';

export class DicomMicroscopyRenderingAdapter
  implements RenderingAdapter<WSIViewportRenderContext>
{
  async attach(
    ctx: WSIViewportRenderContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<WSIRendering> {
    const payload = data.payload as WSIPayload;
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

    return {
      id: renderingId,
      dataId: data.id,
      renderMode: 'wsi2d',
      runtime: {
        microscopyElement,
        viewer,
        map,
        payload,
        postrenderHandler,
      },
    };
  }

  updatePresentation(
    _ctx: WSIViewportRenderContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const wsiProps = props as WSIPresentationProps | undefined;
    const { microscopyElement } = (rendering as WSIRendering).runtime;

    microscopyElement.style.display = wsiProps?.visible === false ? 'none' : '';
    microscopyElement.style.opacity = String(wsiProps?.opacity ?? 1);
  }

  updateCamera(
    _ctx: WSIViewportRenderContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const wsiCamera = camera as WSICamera;
    const { map } = (rendering as WSIRendering).runtime;
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

  updateProperties(
    _ctx: WSIViewportRenderContext,
    _rendering: MountedRendering,
    _presentation: unknown
  ): void {
    // No viewport-level properties for WSI currently.
  }

  canvasToWorld(
    ctx: WSIViewportRenderContext,
    rendering: MountedRendering,
    canvasPos: Point2
  ): Point3 {
    const indexPoint = canvasToIndex(ctx, rendering as WSIRendering, canvasPos);
    indexPoint[1] = -indexPoint[1];

    return indexToWorld(rendering as WSIRendering, indexPoint);
  }

  worldToCanvas(
    ctx: WSIViewportRenderContext,
    rendering: MountedRendering,
    worldPos: Point3
  ): Point2 {
    const indexPoint = worldToIndex(rendering as WSIRendering, worldPos);
    indexPoint[1] = -indexPoint[1];

    return indexToCanvas(ctx, rendering as WSIRendering, indexPoint);
  }

  getFrameOfReferenceUID(
    _ctx: WSIViewportRenderContext,
    rendering: MountedRendering
  ): string | undefined {
    return (
      (rendering as WSIRendering).runtime.payload.frameOfReferenceUID ??
      undefined
    );
  }

  detach(_ctx: WSIViewportRenderContext, rendering: MountedRendering): void {
    const { map, microscopyElement, viewer, postrenderHandler } = (
      rendering as WSIRendering
    ).runtime;

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

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'wsi' && options.renderMode === 'wsi2d';
  }

  createAdapter() {
    return new DicomMicroscopyRenderingAdapter();
  }
}

function computeTransforms(rendering: WSIRendering) {
  const metadata = rendering.runtime.payload.metadata;
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

function worldToIndex(rendering: WSIRendering, point: Point3): Point3 {
  const transforms = computeTransforms(rendering);
  const imageCoord = vec3.create();

  vec3.transformMat4(imageCoord, point, transforms.worldToIndexMatrix);

  return [imageCoord[0], imageCoord[1], imageCoord[2]];
}

function indexToWorld(rendering: WSIRendering, point: Point3): Point3 {
  const transforms = computeTransforms(rendering);
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
  const view = rendering.runtime.map.getView();
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
