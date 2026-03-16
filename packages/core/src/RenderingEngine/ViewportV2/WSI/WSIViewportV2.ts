import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { ViewportType } from '../../../enums';
import type {
  WSIClientLike,
  WSIMapLike,
} from '../../../utilities/WSIUtilities';
import { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
import { DicomMicroscopyPath } from './DicomMicroscopyRenderPath';
import type {
  WSICamera,
  WSIDataPresentation,
  WSIViewportRenderContext,
  WSIViewportV2Input,
  WSIRendering,
} from './WSIViewportV2Types';

defaultRenderPathResolver.register(new DicomMicroscopyPath());

class WSIViewportV2 extends ViewportV2<
  WSICamera,
  WSIDataPresentation,
  WSIViewportRenderContext
> {
  readonly type = ViewportType.WHOLE_SLIDE;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;

  protected renderContext: WSIViewportRenderContext;

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  constructor(args: WSIViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.renderingEngineId = args.renderingEngineId;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultWSIDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'wsi',
      element: this.element,
    };
    this.camera = {
      zoom: 1,
      rotation: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  /**
   * Adds one or more WSI datasets using the microscopy render path.
   *
   * @param dataIds - Logical dataset ids to add.
   * @returns Rendering ids in the same order as the input dataset ids.
   */
  async setDataIds(dataIds: string[]): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      const renderingId = await this.setDataId(dataId, {
        renderMode: 'wsi2d',
      });

      this.setDefaultDataPresentation(dataId, {
        visible: true,
        opacity: 1,
      });

      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

  /**
   * Adds a single WSI dataset and returns its rendering id.
   *
   * @param dataId - Logical dataset id to add.
   * @param _webClient - Reserved compatibility argument for legacy callers.
   * @returns The rendering id created for the mounted dataset.
   */
  async setWSI(dataId: string, _webClient?: WSIClientLike): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

  getZoom(): number {
    return Math.max(this.camera.zoom ?? 1, 0.001);
  }

  setZoom(zoom: number): void {
    this.setCamera({
      zoom: Math.max(zoom, 0.001),
    });
  }

  /**
   * Requests a render on the active OpenLayers map.
   */
  render(): void {
    this.getMap()?.render?.();
  }

  private getMap(): WSIMapLike | undefined {
    return this.getWSIRendering()?.map;
  }

  private getWSIRendering(): WSIRendering | undefined {
    return this.getFirstBinding()?.rendering as WSIRendering | undefined;
  }
}

export default WSIViewportV2;
