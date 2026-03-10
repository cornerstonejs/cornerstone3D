import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import type {
  WSIClientLike,
  WSIMapLike,
} from '../../../utilities/WSIUtilities';
import { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
import { DicomMicroscopyPath } from './DicomMicroscopyRenderingAdapter';
import type {
  WSICamera,
  WSIProperties,
  WSIViewportRenderContext,
  WSIViewportPresentation,
  WSIViewportV2Input,
  WSIPresentationProps,
  WSIRendering,
} from './WSIViewportV2Types';

defaultRenderPathResolver.register(new DicomMicroscopyPath());

class WSIViewportV2 extends ViewportV2<
  WSICamera,
  WSIProperties,
  WSIPresentationProps,
  WSIViewportRenderContext
> {
  readonly kind = 'wsi' as const;
  readonly id: string;
  readonly element: HTMLDivElement;

  protected renderContext: WSIViewportRenderContext;

  constructor(args: WSIViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultWSIDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.renderContext = {
      viewportId: this.id,
      type: 'wsi',
      element: this.element,
    };
    this.camera = {
      zoom: 1,
      rotation: 0,
    };
    this.properties = {};

    this.element.setAttribute('data-viewport-uid', this.id);
  }

  async setDataIds(dataIds: string[]): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      const renderingId = await this.setDataId(dataId, {
        role: 'image',
        renderMode: 'wsi2d',
      });

      this.setPresentation(dataId, {
        visible: true,
        opacity: 1,
      });

      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

  async setWSI(dataId: string, _webClient?: WSIClientLike): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

  getZoom(): number {
    const map = this.getMap();

    return map?.getView?.()?.getZoom?.() ?? 1;
  }

  setZoom(zoom: number): void {
    this.setCamera({ zoom });
  }

  render(): void {
    this.getMap()?.render?.();
  }

  private getMap(): WSIMapLike | undefined {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    return (firstBinding.rendering as WSIRendering).backendHandle.map;
  }
}

export default WSIViewportV2;
