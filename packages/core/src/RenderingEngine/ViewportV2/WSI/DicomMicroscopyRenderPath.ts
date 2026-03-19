import { Events as EVENTS, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import { getDicomMicroscopyViewer } from '../../../utilities/WSIUtilities';
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
import {
  canvasToIndexForWSI,
  indexToCanvasForWSI,
  indexToWorldWSIMetadata,
  worldToIndexWSIMetadata,
} from './wsiTransformUtils';

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
      transformUtils: DicomMicroscopyViewer.utils,
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
      render: () => {
        map.render?.();
      },
      resize: () => {
        map.updateSize?.();
        map.render?.();
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

    if (typeof wsiCamera.resolution === 'number') {
      view.setResolution?.(wsiCamera.resolution);
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
    const indexPoint = canvasToIndexForWSI({
      canvasPos,
      canvasWidth: ctx.element.clientWidth,
      canvasHeight: ctx.element.clientHeight,
      view: rendering.map.getView(),
    });
    indexPoint[1] = -indexPoint[1];

    return indexToWorldWSIMetadata(metadata, indexPoint);
  }

  private worldToCanvas(
    ctx: WSIViewportRenderContext,
    rendering: WSIRendering,
    metadata: WSIPayload['metadata'],
    worldPos: Point3
  ): Point2 {
    const indexPoint = worldToIndexWSIMetadata(metadata, worldPos);
    indexPoint[1] = -indexPoint[1];

    return indexToCanvasForWSI({
      indexPos: indexPoint,
      canvasWidth: ctx.element.clientWidth,
      canvasHeight: ctx.element.clientHeight,
      view: rendering.map.getView(),
    });
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
