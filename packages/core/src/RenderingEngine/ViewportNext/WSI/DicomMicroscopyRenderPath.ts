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
import type {
  WSIDataPresentation,
  WSIRendering,
  WSIPayload,
  WSIViewState,
  WSIViewportRenderContext,
} from './WSIViewportTypes';

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
    const postrenderHandler = () => {
      triggerEvent(ctx.element, EVENTS.IMAGE_RENDERED, {
        element: ctx.element,
        viewportId: ctx.viewportId,
        renderingEngineId: ctx.renderingEngineId,
        rendering: {
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
      applyViewState: (camera) => {
        this.applyViewState(rendering, camera);
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

  private applyViewState(rendering: WSIRendering, camera: unknown): void {
    const wsiCamera = camera as WSIViewState;
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
  readonly type = ViewportType.WHOLE_SLIDE_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'wsi' && options.renderMode === 'wsi2d';
  }

  createRenderPath() {
    return new DicomMicroscopyRenderPath();
  }
}
