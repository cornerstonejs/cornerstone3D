import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import type {
  WSIClientLike,
  WSIMapLike,
} from '../../../utilities/WSIUtilities';
import { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
import { DicomMicroscopyPath } from './DicomMicroscopyRenderingAdapter';
import type {
  WSIDataProvider,
  WSIDataSetOptions,
  WSIViewportBackendContext,
  WSIViewportV2Input,
  WSIViewState,
  WSIPresentationProps,
  WSIRendering,
} from './WSIViewportV2Types';

defaultRenderPathResolver.register(new DicomMicroscopyPath());

class WSIViewportV2 extends ViewportV2<WSIViewState, WSIPresentationProps> {
  readonly kind = 'wsi' as const;
  readonly id: string;
  readonly element: HTMLDivElement;

  protected backendContext: WSIViewportBackendContext;

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
    this.backendContext = {
      viewportId: this.id,
      viewportKind: 'wsi',
      element: this.element,
    };
    this.viewState = {
      zoom: 1,
      rotation: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
  }

  async setDataIds(
    imageIds: string[],
    options: WSIDataSetOptions
  ): Promise<string> {
    const dataId = imageIds[0];
    const dataProvider = this.dataProvider as WSIDataProvider;

    dataProvider.register(dataId, {
      imageIds,
      options,
    });

    const renderingId = await this.setDataId(dataId, {
      role: 'image',
      renderMode: 'wsi2d',
    });

    this.setPresentation(dataId, {
      visible: true,
      opacity: 1,
    });

    return renderingId;
  }

  async setWSI(imageIds: string[], webClient: WSIClientLike): Promise<string> {
    return this.setDataIds(imageIds, {
      webClient,
    });
  }

  getZoom(): number {
    const map = this.getMap();

    return map?.getView?.()?.getZoom?.() ?? 1;
  }

  setZoom(zoom: number): void {
    this.setViewState({ zoom });
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
