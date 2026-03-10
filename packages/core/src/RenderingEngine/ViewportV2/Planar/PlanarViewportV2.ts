import { OrientationAxis } from '../../../enums';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import * as metaData from '../../../metaData';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';
import renderingEngineCache from '../../renderingEngineCache';
import type { DataAttachmentOptions } from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { CpuImageCanvasPath } from './CpuImageCanvasRenderingAdapter';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { VtkImageMapperPath } from './VtkImageMapperRenderingAdapter';
import { VtkVolumeMapperPath } from './VtkVolumeMapperRenderingAdapter';
import {
  normalizePlanarOrientation,
  selectPlanarRenderPath,
} from './planarRenderPathSelector';
import type {
  PlanarPresentationProps,
  PlanarRenderMode,
  PlanarRendering,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
  PlanarViewportBackendContext,
  PlanarViewportV2Input,
  PlanarViewState,
} from './PlanarViewportV2Types';

defaultRenderPathResolver.register(new CpuImageCanvasPath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeMapperPath());

class PlanarViewportV2 extends ViewportV2<
  PlanarViewState,
  PlanarPresentationProps
> {
  readonly kind = 'planar' as const;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
  suppressEvents = false;

  protected backendContext: PlanarViewportBackendContext;

  private activeDataId?: string;

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    // no-op — rendering engine calls this after completing a frame
  }

  constructor(args: PlanarViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = args.defaultOptions || {};
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;

    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[PlanarViewportV2] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

    const vtkCanvas = args.canvas;

    const cpuCanvas = document.createElement('canvas');
    cpuCanvas.style.display = 'none';
    cpuCanvas.style.height = '100%';
    cpuCanvas.style.inset = '0';
    cpuCanvas.style.position = 'absolute';
    cpuCanvas.style.width = '100%';
    this.element.appendChild(cpuCanvas);

    const cpuCanvasContext = cpuCanvas.getContext('2d');

    if (!cpuCanvasContext) {
      throw new Error('[PlanarViewportV2] Failed to initialize CPU canvas');
    }

    renderer.getActiveCamera().setParallelProjection(true);

    this.backendContext = {
      viewportId: this.id,
      viewportKind: 'planar',
      canvas: cpuCanvas,
      canvasContext: cpuCanvasContext,
      cpuCanvas,
      cpuCanvasContext,
      element: this.element,
      requestRender: () => {
        this.requestRenderingEngineRender();
      },
      renderer,
      setRenderMode: (renderMode: PlanarRenderMode) => {
        const useCPUCanvas = renderMode === 'cpu2d';
        cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
        vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
      },
      setRenderModeVisibility: (renderMode: PlanarRenderMode) => {
        const useCPUCanvas = renderMode === 'cpu2d';
        cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
        vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
      },
      vtkCanvas,
    };
    this.viewState = {
      imageIdIndex: 0,
      orientation: OrientationAxis.AXIAL,
      zoom: 1,
      pan: [0, 0],
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.resize();
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const registered = metaData.get(
      viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
      dataId
    );

    if (Array.isArray(registered)) {
      return {
        imageIds: registered,
      };
    }

    const candidate = registered as PlanarRegisteredDataSet | undefined;

    if (!candidate?.imageIds) {
      return;
    }

    return candidate;
  }

  async setDataIds(
    dataIds: string[],
    options: PlanarSetDataOptions = {}
  ): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      const renderingId = await this.setDataId(dataId, options);
      renderingIds.push(renderingId);
    }

    if (dataIds[0]) {
      this.activeDataId = dataIds[0];
    }

    return renderingIds;
  }

  async setDataId(
    dataId: string,
    options: PlanarSetDataOptions | DataAttachmentOptions = {}
  ): Promise<string> {
    const planarOptions = options as PlanarSetDataOptions;
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewportV2] No registered planar dataset metadata for ${dataId}`
      );
    }

    const selectedPath = selectPlanarRenderPath(dataSet, planarOptions);
    const data = await this.dataProvider.load(dataId, {
      acquisitionOrientation: selectedPath.acquisitionOrientation,
      orientation: planarOptions.orientation || OrientationAxis.ACQUISITION,
      renderMode: selectedPath.renderMode,
      volumeId: selectedPath.volumeId,
    });
    const payload = data.payload as PlanarPayload;
    const presentation = this.getPresentation(dataId) || {
      visible: true,
      opacity: 1,
    };

    this.activeDataId = dataId;
    this.viewState = {
      ...this.viewState,
      imageIdIndex: payload.initialImageIdIndex,
      orientation: normalizePlanarOrientation(
        planarOptions.orientation,
        selectedPath.acquisitionOrientation
      ),
    };

    const renderingId = await this.attachLoadedData(dataId, data, {
      role: 'image',
      renderMode: selectedPath.renderMode,
    });

    this.setPresentation(dataId, {
      ...presentation,
    });

    return renderingId;
  }

  getImageIds(): string[] {
    const payload = this.getPayload();

    if (!payload) {
      return [];
    }

    return payload.imageVolume?.imageIds || payload.imageIds;
  }

  getVolumeId(): string | undefined {
    return this.getPayload()?.volumeId;
  }

  getCurrentImageIdIndex(): number {
    return this.viewState.imageIdIndex ?? 0;
  }

  getCurrentImageId(): string | undefined {
    return this.getImageIds()[this.getCurrentImageIdIndex()];
  }

  setProperties(props: PlanarPresentationProps): void {
    if (!this.activeDataId) {
      return;
    }

    this.setPresentation(this.activeDataId, {
      ...(this.getPresentation(this.activeDataId) || {}),
      ...props,
    });
  }

  getProperties(): PlanarPresentationProps | undefined {
    if (!this.activeDataId) {
      return;
    }

    return this.getPresentation(this.activeDataId);
  }

  setImageIdIndex(imageIdIndex: number): Promise<string> {
    const imageIds = this.getImageIds();

    if (!imageIds.length) {
      return Promise.reject(
        new Error('[PlanarViewportV2] Cannot set image index on empty stack')
      );
    }

    const clampedImageIdIndex = Math.min(
      Math.max(0, imageIdIndex),
      imageIds.length - 1
    );

    this.setViewState({
      imageIdIndex: clampedImageIdIndex,
    });

    return Promise.resolve(imageIds[clampedImageIdIndex]);
  }

  scroll(delta: number): Promise<string> {
    return this.setImageIdIndex(this.getCurrentImageIdIndex() + delta);
  }

  setOrientation(
    orientation:
      | OrientationAxis.AXIAL
      | OrientationAxis.CORONAL
      | OrientationAxis.SAGITTAL
  ): void {
    this.setViewState({ orientation });
  }

  resize(): void {
    const { clientHeight, clientWidth } = this.element;
    const { cpuCanvas } = this.backendContext;

    if (cpuCanvas.width !== clientWidth || cpuCanvas.height !== clientHeight) {
      cpuCanvas.width = clientWidth;
      cpuCanvas.height = clientHeight;
    }

    for (const binding of this.bindings.values()) {
      binding.adapter.resize?.(
        this.backendContext,
        binding.rendering as PlanarRendering
      );
    }
  }

  render(): void {
    let renderedByAdapter = false;

    for (const binding of this.bindings.values()) {
      binding.adapter.render?.(
        this.backendContext,
        binding.rendering as PlanarRendering
      );
      renderedByAdapter = renderedByAdapter || Boolean(binding.adapter.render);
    }

    if (!renderedByAdapter) {
      this.requestRenderingEngineRender();
    }
  }

  private requestRenderingEngineRender(): void {
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);

    if (renderingEngine) {
      renderingEngine.renderViewport(this.id);
    }
  }

  private getPayload(): PlanarPayload | undefined {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    return (firstBinding.rendering as PlanarRendering).backendHandle
      .payload as PlanarPayload;
  }
}

export default PlanarViewportV2;
