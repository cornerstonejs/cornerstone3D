import { Events as EVENTS } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import { getDicomMicroscopyViewer } from '../../../utilities/WSIUtilities';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  WSIPresentationProps,
  WSIRendering,
  WSIPayload,
  WSIViewportBackendContext,
  WSIViewState,
} from './WSIViewportV2Types';

const EVENT_POSTRENDER = 'postrender';

export class DicomMicroscopyRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<WSIRendering> {
    const wsiCtx = ctx as WSIViewportBackendContext;
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
    wsiCtx.element.appendChild(microscopyElement);

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
      triggerEvent(wsiCtx.element, EVENTS.IMAGE_RENDERED, {
        element: wsiCtx.element,
        viewportId: wsiCtx.viewportId,
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
      backendHandle: {
        microscopyElement,
        viewer,
        map,
        payload,
        postrenderHandler,
      },
    };
  }

  updatePresentation(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const wsiProps = props as WSIPresentationProps | undefined;
    const { microscopyElement } = (rendering as WSIRendering).backendHandle;

    microscopyElement.style.display = wsiProps?.visible === false ? 'none' : '';
    microscopyElement.style.opacity = String(wsiProps?.opacity ?? 1);
  }

  updateViewState(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    viewState: unknown
  ): void {
    const wsiViewState = viewState as WSIViewState;
    const { map } = (rendering as WSIRendering).backendHandle;
    const view = map?.getView?.();

    if (!view) {
      return;
    }

    if (typeof wsiViewState.zoom === 'number') {
      view.setZoom(wsiViewState.zoom);
    }
    if (wsiViewState.centerIndex) {
      view.setCenter(wsiViewState.centerIndex);
    }
    if (typeof wsiViewState.rotation === 'number') {
      view.setRotation(wsiViewState.rotation);
    }
  }

  detach(_ctx: ViewportBackendContext, rendering: MountedRendering): void {
    const { map, microscopyElement, viewer, postrenderHandler } = (
      rendering as WSIRendering
    ).backendHandle;

    map?.un?.(EVENT_POSTRENDER, postrenderHandler);
    viewer?.cleanup?.();
    microscopyElement.remove();
  }
}

export class DicomMicroscopyPath implements RenderPathDefinition {
  readonly id = 'wsi:dicom-microscopy-viewer';
  readonly viewportKind = 'wsi' as const;

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
