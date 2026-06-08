import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import type { LoadedData } from '../ViewportArchitectureTypes';
import GenericViewport from '../GenericViewport';
import { ViewportType } from '../../../enums';
import { getDefaultECGValueRange } from '../../../utilities/ECGUtilities';
import type {
  CPUIImageData,
  Mat3,
  Point2,
  Point3,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import { DefaultECGDataProvider } from './DefaultECGDataProvider';
import { createECGRenderPathResolver } from './ECGRenderPathResolver';
import type { GenericViewportReferenceContext } from '../genericViewportReferenceCompatibility';
import type {
  ECGViewState,
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGDataPresentation,
  ECGViewportInput,
  ECGWaveformPayload,
} from './ECGViewportTypes';
import {
  createDefaultECGViewState,
  normalizeECGViewState,
} from './ecgViewportCamera';
import ECGResolvedView from './ECGResolvedView';

const ECG_AMPLITUDE_INDEX_SIZE = 65536;

class ECGViewport extends GenericViewport<
  ECGViewState,
  ECGDataPresentation,
  ECGCanvasRenderContext
> {
  readonly type = ViewportType.ECG_NEXT;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  readonly canvasContext: CanvasRenderingContext2D;

  protected renderContext: ECGCanvasRenderContext;

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  constructor(args: ECGViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = getOrCreateCanvas(this.element);
    this.canvasContext = this.canvas.getContext('2d');
    this.dataProvider = args.dataProvider || new DefaultECGDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createECGRenderPathResolver();
    this.renderContext = {
      viewportId: this.id,
      type: 'ecg',
      renderingEngineId: this.renderingEngineId,
      element: this.element,
      canvas: this.canvas,
      canvasContext: this.canvasContext,
    };
    this.viewState = createDefaultECGViewState({
      timeRange: [0, 1],
      valueRange: [-1, 1],
    });

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    this.resize();
  }

  /**
   * Replaces all mounted waveform display sets with the provided ones using
   * the canvas ECG render path.
   *
   * @param entries - Waveform display sets to mount.
   */
  async setDisplaySets(
    ...entries: Array<{ displaySetId: string }>
  ): Promise<void> {
    this.removeAllData();

    for (const { displaySetId } of entries) {
      const waveform = await this.loadWaveformData(displaySetId);
      const durationMs =
        (waveform.numberOfSamples / waveform.samplingFrequency) * 1000;

      this.setDefaultDataPresentation(displaySetId, {
        visible: true,
        opacity: 1,
        visibleChannels: waveform.channels.map((_channel, index) => index),
        lineWidth: 1,
        amplitudeScale: 1,
        showGrid: true,
      });
      this.viewState = createDefaultECGViewState({
        timeRange: [0, durationMs],
        valueRange: getDefaultECGValueRange(waveform),
      });

      await this.addLoadedData(displaySetId, waveform, {
        renderMode: 'signal2d',
      });
    }
  }

  getWaveformData(): ECGWaveformPayload | null {
    return this.getWaveformBindingData() ?? null;
  }

  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    const dataId = this.getFirstBinding()?.data.id;

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      dataId,
      referencedImageId: this.getCurrentImageId(),
      sliceIndex: 0,
    };
  }

  getViewReferenceId(_specifier: ViewReferenceSpecifier = {}): string {
    return `imageId:${this.getCurrentImageId()}`;
  }

  setViewReference(_viewRef: ViewReference): void {
    // ECG viewports always show the single active waveform.
  }

  getSliceIndex(): number {
    return 0;
  }

  getZoom(): number {
    return (
      this.getResolvedView()?.zoom ?? Math.max(this.viewState.scale ?? 1, 0.001)
    );
  }

  protected override normalizeViewState(viewState: ECGViewState): ECGViewState {
    return normalizeECGViewState(viewState);
  }

  protected getReferenceViewContexts(): GenericViewportReferenceContext[] {
    const binding = this.getFirstBinding();

    if (!binding) {
      return super.getReferenceViewContexts();
    }

    return [
      {
        dataId: binding.data.id,
        dataIds: [binding.data.id],
        frameOfReferenceUID: this.getFrameOfReferenceUID(),
        imageIds: [binding.data.id],
        currentImageIdIndex: 0,
      },
    ];
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withZoom(zoom, canvasPoint).state.viewState
      );
      return;
    }

    this.setViewState({
      scale: Math.max(zoom, 0.001),
      scaleMode: 'fit',
    });
  }

  getPan(): Point2 {
    return this.getResolvedView()?.pan ?? [0, 0];
  }

  setPan(pan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    this.applyResolvedViewState(resolvedView.withPan(pan).state.viewState);
  }

  /**
   * Returns channel visibility state for the active ECG dataset.
   *
   * @returns Channel names paired with their current visibility state.
   */
  getVisibleChannels(): { name: string; visible: boolean }[] {
    const waveform = this.getWaveformBindingData();

    if (!waveform) {
      return [];
    }

    const dataId = waveform.id;
    const visibleChannels = new Set(
      this.getDisplaySetPresentation(dataId)?.visibleChannels ||
        waveform.channels.map((_channel, index) => index)
    );

    return waveform.channels.map((channel, index) => ({
      name: channel.name,
      visible: visibleChannels.has(index),
    }));
  }

  /**
   * Returns the rendered ECG content dimensions in device pixels.
   *
   * @returns The ECG content width and height in device pixels.
   */
  getContentDimensions(): { width: number; height: number } {
    const rendering = this.getCurrentRendering();

    if (!rendering) {
      return { width: 0, height: 0 };
    }

    return {
      width: rendering.metrics.ecgWidth,
      height: rendering.metrics.ecgHeight,
    };
  }

  /**
   * Resizes the backing canvas to match the displayed viewport size.
   */
  resize(): void {
    const { clientWidth, clientHeight } = this.canvas;

    if (
      this.canvas.width !== clientWidth ||
      this.canvas.height !== clientHeight
    ) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(Math.max(1, clientWidth) * dpr);
      this.canvas.height = Math.floor(Math.max(1, clientHeight) * dpr);
    }

    this.render();
  }

  /**
   * Renders all active ECG bindings.
   */
  render(): void {
    this.renderBindings();
  }

  /**
   * Called by the rendering engine render loop for custom pipeline viewports.
   */
  customRenderViewportToCanvas(): void {
    this.render();
  }

  /**
   * Resets pan and zoom to defaults and re-renders.
   */
  resetViewState(): boolean {
    const previousCamera = this.getCameraForEvent();
    this.viewState = createDefaultECGViewState({
      timeRange: this.viewState.timeRange,
      valueRange: this.viewState.valueRange,
    });
    this.modified(previousCamera);
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * ECG viewports have no rotation.
   */
  getRotation(): number {
    return 0;
  }

  /**
   * No-op: ECG viewports are not slice stacks.
   */
  scroll(): void {
    // no-op
  }

  /**
   * Returns the current ECG image id, if one has been loaded.
   */
  getCurrentImageId(): string | undefined {
    const binding = this.getFirstBinding();

    return binding?.data.id;
  }

  /**
   * ECG viewports always display index 0.
   */
  getCurrentImageIdIndex(): number {
    return 0;
  }

  /**
   * Returns the image ids for the active ECG dataset.
   */
  getImageIds(): string[] {
    const binding = this.getFirstBinding();

    return binding ? [binding.data.id] : [];
  }

  /**
   * Returns image data compatible with the Cornerstone tools annotation system.
   * Amplitude is mapped to [0, ECG_AMPLITUDE_INDEX_SIZE) so annotation
   * index bounds checks work correctly across channels.
   */
  getImageData(): CPUIImageData | null {
    const waveform = this.getWaveformBindingData();

    if (!waveform) {
      return null;
    }

    const nSamples = waveform.numberOfSamples;
    const nChannels = waveform.channels.length;
    const dimensions: Point3 = [nSamples, ECG_AMPLITUDE_INDEX_SIZE, nChannels];
    const spacing: Point3 = [1, 1, 1];
    const origin: Point3 = [0, 0, 0];
    const direction: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const amplitudeOffset = ECG_AMPLITUDE_INDEX_SIZE / 2;
    const scalarData = new Int16Array(0);

    const imageData: CPUIImageData['imageData'] = {
      getDirection: () => direction,
      getDimensions: () => dimensions,
      getRange: () => [0, 1] as Point2,
      getSpacing: () => spacing,
      worldToIndex: (point: Point3) => {
        return [point[0], point[1] + amplitudeOffset, point[2]] as Point3;
      },
      indexToWorld: (point: Point3) => {
        return [point[0], point[1] - amplitudeOffset, point[2]] as Point3;
      },
    };

    return {
      dimensions,
      spacing,
      origin,
      direction,
      imageData,
      scalarData,
      hasPixelSpacing: false,
      preScale: { scaled: false },
      metadata: { Modality: 'ECG', FrameOfReferenceUID: '' },
    };
  }

  private setScaleAtCanvasPoint(scale: number, canvasPoint: Point2): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      this.setZoom(scale);
      return;
    }

    this.applyResolvedViewState(
      resolvedView.withZoom(scale, canvasPoint).state.viewState
    );
  }

  private async loadWaveformData(
    dataId: string
  ): Promise<LoadedData<ECGWaveformPayload>> {
    const waveform = await this.dataProvider.load(dataId);

    if (!isECGWaveformData(waveform)) {
      throw new Error(
        `[ECGViewport] Loaded data for ${dataId} is not a valid ECG waveform`
      );
    }

    return waveform;
  }

  private getWaveformBindingData(): LoadedData<ECGWaveformPayload> | undefined {
    const binding = this.getFirstBinding();

    if (!binding || !isECGWaveformData(binding.data)) {
      return;
    }

    return binding.data;
  }

  private getCurrentRendering(): ECGCanvasRendering | undefined {
    const binding = this.getFirstBinding();

    if (!binding || !isECGCanvasRendering(binding.rendering)) {
      return;
    }

    return binding.rendering;
  }

  getResolvedView(): ECGResolvedView | undefined {
    const waveform = this.getWaveformBindingData();
    const rendering = this.getCurrentRendering();

    if (!waveform || !rendering) {
      return;
    }

    return new ECGResolvedView({
      viewState: this.viewState,
      canvas: this.canvas,
      dataPresentation: this.getDisplaySetPresentation(waveform.id),
      frameOfReferenceUID: `ecg-viewport-${this.id}`,
      metrics: rendering.metrics,
      waveform,
    });
  }

  /**
   * Applies a resolved ECG view state through the canonical mutation path.
   */
  private applyResolvedViewState(nextViewState: ECGViewState): void {
    this.setViewState(nextViewState);
  }
}

export default ECGViewport;

function isECGWaveformData(
  data: LoadedData
): data is LoadedData<ECGWaveformPayload> {
  if (typeof data !== 'object' || data === null || data.type !== 'ecg') {
    return false;
  }

  const waveform = data as Record<string, unknown>;

  return (
    Array.isArray(waveform.channels) &&
    typeof waveform.numberOfSamples === 'number' &&
    typeof waveform.samplingFrequency === 'number' &&
    typeof waveform.numberOfChannels === 'number'
  );
}

function isECGCanvasRendering(rendering: {
  renderMode: string;
}): rendering is ECGCanvasRendering {
  return rendering.renderMode === 'signal2d';
}
