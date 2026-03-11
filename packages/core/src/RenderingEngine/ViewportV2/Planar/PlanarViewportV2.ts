import { OrientationAxis, ViewportType } from '../../../enums';
import type {
  ICamera,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type { PlaneRestriction } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import * as metaData from '../../../metaData';
import imageIdToURI from '../../../utilities/imageIdToURI';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';
import renderingEngineCache from '../../renderingEngineCache';
import type { DataAttachmentOptions } from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { CpuImageCanvasPath } from './CpuImageCanvasRenderingAdapter';
import { CpuVolumeSlicePath } from './CpuVolumeSliceRenderingAdapter';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { VtkImageMapperPath } from './VtkImageMapperRenderingAdapter';
import { VtkVolumeMapperPath } from './VtkVolumeMapperRenderingAdapter';
import {
  normalizePlanarOrientation,
  selectPlanarRenderPath,
} from './planarRenderPathSelector';
import {
  getPlanarCompatibilityCamera,
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
  isPlanarReferenceViewable,
} from './planarViewportCompatibility';
import type {
  PlanarCamera,
  PlanarEffectiveRenderMode,
  PlanarPresentationProps,
  PlanarRendering,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
  PlanarViewportRenderContext,
  PlanarProperties,
  PlanarViewportV2Input,
} from './PlanarViewportV2Types';

defaultRenderPathResolver.register(new CpuImageCanvasPath());
defaultRenderPathResolver.register(new CpuVolumeSlicePath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeMapperPath());

class PlanarViewportV2 extends ViewportV2<
  PlanarCamera,
  PlanarProperties,
  PlanarPresentationProps,
  PlanarViewportRenderContext
> {
  readonly kind = 'planar' as const;
  readonly type = ViewportType.PLANAR_V2;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
  suppressEvents = false;

  protected renderContext: PlanarViewportRenderContext;

  private activeDataId?: string;

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    // no-op -- rendering engine calls this after completing a frame
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
    const viewportElement = this.element.querySelector(
      '.viewport-element'
    ) as HTMLDivElement | null;

    const cpuCanvas = document.createElement('canvas');
    cpuCanvas.style.display = 'none';
    cpuCanvas.style.height = '100%';
    cpuCanvas.style.inset = '0';
    cpuCanvas.style.pointerEvents = 'none';
    cpuCanvas.style.position = 'absolute';
    cpuCanvas.style.width = '100%';
    cpuCanvas.style.zIndex = '0';
    this.element.appendChild(cpuCanvas);

    if (viewportElement) {
      viewportElement.style.position =
        viewportElement.style.position || 'relative';
      viewportElement.style.zIndex = '1';
    }

    const cpuCanvasContext = cpuCanvas.getContext('2d');

    if (!cpuCanvasContext) {
      throw new Error('[PlanarViewportV2] Failed to initialize CPU canvas');
    }

    renderer.getActiveCamera().setParallelProjection(true);

    this.renderContext = {
      viewportId: this.id,
      type: 'planar',
      viewport: {
        element: this.element,
      },
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
        activateRenderMode: (renderMode: PlanarEffectiveRenderMode) => {
          this.setRenderModeVisibility(renderMode, cpuCanvas, vtkCanvas);
        },
      },
      cpu: {
        canvas: cpuCanvas,
        context: cpuCanvasContext,
      },
      vtk: {
        renderer,
        canvas: vtkCanvas,
      },
    };
    this.camera = {
      imageIdIndex: 0,
      orientation: OrientationAxis.ACQUISITION,
      zoom: 1,
      pan: [0, 0],
    };
    this.properties = {};

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    this.resize();
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
    const isVolumeRenderMode =
      selectedPath.renderMode === 'cpuVolume' ||
      selectedPath.renderMode === 'vtkVolume';

    this.activeDataId = dataId;
    this.camera = {
      ...this.camera,
      imageIdIndex: isVolumeRenderMode
        ? undefined
        : payload.initialImageIdIndex,
      orientation: normalizePlanarOrientation(
        planarOptions.orientation,
        selectedPath.acquisitionOrientation
      ),
    };

    const renderingId = await this.attachLoadedData(dataId, data, {
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
    return this.getActiveImageIdIndex();
  }

  getCurrentImageId(): string | undefined {
    return getPlanarReferencedImageId({
      camera: this.camera,
      rendering: this.getCurrentBinding()?.rendering as
        | PlanarRendering
        | undefined,
      renderContext: this.renderContext,
    });
  }

  getSliceIndex(): number {
    return this.getCurrentImageIdIndex();
  }

  getCamera(): PlanarCamera & ICamera {
    return this.getCompatibilityCamera();
  }

  getRenderingEngine() {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    return getPlanarViewReference({
      camera: this.camera,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      rendering: this.getCurrentBinding()?.rendering as
        | PlanarRendering
        | undefined,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  getViewReferenceId(viewRefSpecifier: ViewReferenceSpecifier = {}): string {
    return getPlanarViewReferenceId({
      camera: this.camera,
      rendering: this.getCurrentBinding()?.rendering as
        | PlanarRendering
        | undefined,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  getImageData() {
    return this.getCurrentBinding()?.getImageData?.();
  }

  hasImageId(imageId: string): boolean {
    return this.getImageIds().includes(imageId);
  }

  hasImageURI(imageURI: string): boolean {
    return this.getImageIds().some(
      (imageId) => imageIdToURI(imageId) === imageURI
    );
  }

  hasVolumeId(volumeId: string): boolean {
    return this.getVolumeId() === volumeId;
  }

  isPlaneViewable(
    planeRestriction: PlaneRestriction,
    options?: ReferenceCompatibleOptions
  ): boolean {
    return isPlanarPlaneViewable({
      camera: this.camera,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      options,
      planeRestriction,
      rendering: this.getCurrentBinding()?.rendering as
        | PlanarRendering
        | undefined,
      renderContext: this.renderContext,
    });
  }

  isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return isPlanarReferenceViewable({
      camera: this.camera,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      imageIds: this.getImageIds(),
      options,
      rendering: this.getCurrentBinding()?.rendering as
        | PlanarRendering
        | undefined,
      renderContext: this.renderContext,
      viewRef,
    });
  }

  setProperties(
    props: Partial<PlanarPresentationProps & PlanarProperties>
  ): void {
    const { interpolationType, slabThickness, ...dataProps } = props;

    if (interpolationType !== undefined || slabThickness !== undefined) {
      super.setProperties({
        ...(interpolationType !== undefined ? { interpolationType } : {}),
        ...(slabThickness !== undefined ? { slabThickness } : {}),
      });
    }

    if (this.activeDataId && Object.keys(dataProps).length > 0) {
      this.setPresentation(this.activeDataId, {
        ...(this.getPresentation(this.activeDataId) || {}),
        ...dataProps,
      });
    }
  }

  getProperties(): PlanarPresentationProps & PlanarProperties {
    return {
      ...(this.activeDataId ? this.getPresentation(this.activeDataId) : {}),
      ...this.properties,
    };
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
      this.getMaxImageIdIndex()
    );
    const resolvedImageId =
      imageIds[clampedImageIdIndex] || imageIds[imageIds.length - 1];

    this.setCamera({
      imageIdIndex: clampedImageIdIndex,
    });

    return Promise.resolve(resolvedImageId);
  }

  scroll(delta: number): Promise<string> {
    return this.setImageIdIndex(this.getActiveImageIdIndex() + delta);
  }

  setOrientation(
    orientation:
      | OrientationAxis.AXIAL
      | OrientationAxis.CORONAL
      | OrientationAxis.SAGITTAL
  ): void {
    this.setCamera({ imageIdIndex: undefined, orientation });
  }

  resize(): void {
    const { clientHeight, clientWidth } = this.element;
    const { canvas } = this.renderContext.cpu;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    for (const binding of this.bindings.values()) {
      binding.resize?.();
    }
  }

  render(): void {
    let renderedByAdapter = false;

    for (const binding of this.bindings.values()) {
      binding.render?.();
      renderedByAdapter = renderedByAdapter || Boolean(binding.render);
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

  private setRenderModeVisibility(
    renderMode: PlanarEffectiveRenderMode,
    cpuCanvas: HTMLCanvasElement,
    vtkCanvas: HTMLCanvasElement
  ): void {
    const useCPUCanvas = renderMode === 'cpu2d' || renderMode === 'cpuVolume';
    cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
    vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
  }

  private getActiveImageIdIndex(): number {
    const binding = this.getCurrentBinding();
    const currentImageIdIndex = (
      binding?.rendering as
        | { runtime?: { currentImageIdIndex?: number } }
        | undefined
    )?.runtime?.currentImageIdIndex;

    if (typeof currentImageIdIndex === 'number') {
      return currentImageIdIndex;
    }

    return this.camera.imageIdIndex ?? 0;
  }

  private getMaxImageIdIndex(): number {
    const binding = this.getCurrentBinding();
    const maxImageIdIndex = (
      binding?.rendering as
        | { runtime?: { maxImageIdIndex?: number } }
        | undefined
    )?.runtime?.maxImageIdIndex;

    if (typeof maxImageIdIndex === 'number') {
      return maxImageIdIndex;
    }

    return Math.max(0, this.getImageIds().length - 1);
  }

  private getPayload(): PlanarPayload | undefined {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    return (firstBinding.rendering as PlanarRendering).runtime
      .payload as PlanarPayload;
  }

  protected getCurrentBinding() {
    const activeDataId = this.activeDataId ?? this.bindings.keys().next().value;

    if (!activeDataId) {
      return;
    }

    return this.getBinding(activeDataId);
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

  private getCompatibilityCamera(): PlanarCamera & ICamera {
    return getPlanarCompatibilityCamera({
      camera: this.camera,
      rendering: this.getCurrentBinding()?.rendering as
        | PlanarRendering
        | undefined,
      renderContext: this.renderContext,
    });
  }
}

export default PlanarViewportV2;
