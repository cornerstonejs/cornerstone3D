import { Events as EVENTS } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import { getDicomMicroscopyViewer } from '../../../utilities/WSIUtilities';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
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
          role: 'image',
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
      role: 'image',
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
  readonly type = 'wsi' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'wsiData' &&
      options.role === 'image' &&
      options.renderMode === 'wsi2d'
    );
  }

  createAdapter() {
    return new DicomMicroscopyRenderingAdapter();
  }
}
