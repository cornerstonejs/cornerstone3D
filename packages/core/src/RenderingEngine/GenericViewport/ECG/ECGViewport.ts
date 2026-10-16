import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import type { LoadedData } from '../ViewportArchitectureTypes';
import GenericViewport from '../GenericViewport';
import { ViewportType } from '../../../enums';
import { getDefaultECGValueRange } from './ecgWaveform';
import { getGenericViewportSourceDataId } from '../genericViewportDisplaySetAccess';
import imageIdToURI from '../../../utilities/imageIdToURI';
import type {
  CPUIImageData,
  Mat3,
  Point2,
  Point3,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import { DefaultECGDataProvider } from './DefaultECGDataProvider';
import { createECGRenderPathResolver } from './ECGRenderPathResolver';
import type { GenericViewportReferenceContext } from '../genericViewportReferenceCompatibility';
import type {
  ECGViewState,
  ECGCanvasRenderContext,
  ECGDataPresentation,
  ECGViewportInput,
  ECGWaveformPayload,
  ECGResetViewStateOptions,
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
      // The render path reads the world geometry of the frame from here, so the
      // viewport stays the single owner of the view state and the presentation.
      getResolvedView: () => this.getResolvedView(),
    };
    this.viewState = createDefaultECGViewState({
      timeRange: [0, 1],
      valueRange: [-1, 1],
      traceLayout: args.defaultOptions?.traceLayout,
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
   * The view state resets to the full record with every channel visible. The
   * trace layout, the sweep speed, the sensitivity and the amplitude scale stay.
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
      const { traceLayout, sweepSpeed, sensitivityMmMv, amplitudeScale } =
        this.viewState;

      this.setDefaultDataPresentation(displaySetId, {
        visible: true,
        opacity: 1,
        lineWidth: 1,
        showGrid: true,
      });
      this.viewState = createDefaultECGViewState({
        timeRange: [0, durationMs],
        valueRange: getDefaultECGValueRange(waveform),
        traceLayout,
        sweepSpeed,
        sensitivityMmMv,
        amplitudeScale,
      });

      await this.addLoadedData(displaySetId, waveform, {
        renderMode: 'signal2d',
      });
    }
  }

  /**
   * Returns the active ECG waveform dataset payload mounted on this viewport.
   * @returns Active waveform payload or null.
   */
  getWaveformData(): ECGWaveformPayload | null {
    return this.getWaveformBindingData() ?? null;
  }

  /**
   * Reports the content-true classification of the viewport's bound data.
   * Returns 'ecg' when a waveform is mounted, 'empty' otherwise.
   */
  getCurrentMode(): ViewportContentMode {
    return this.getWaveformData() ? 'ecg' : 'empty';
  }

  /**
   * Returns a view reference describing the mounted ECG dataset state.
   * @param _specifier - Optional specifier flags.
   * @returns View reference representation.
   */
  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    const dataId = this.getFirstBinding()?.data.id;

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      dataId,
      referencedImageId: this.getCurrentImageId(),
      sliceIndex: 0,
    };
  }

  /**
   * Returns a unique string identifier for the view reference.
   * @param _specifier - Optional specifier flags.
   * @returns String identifier.
   */
  getViewReferenceId(_specifier: ViewReferenceSpecifier = {}): string {
    return `imageId:${this.getCurrentImageId()}`;
  }

  /**
   * Sets the view reference for the viewport.
   * @param _viewRef - Target view reference.
   */
  setViewReference(_viewRef: ViewReference): void {
    // ECG viewports always show the single active waveform.
  }

  /**
   * Returns the current slice index (always 0 for 2D ECG viewports).
   * @returns Slice index 0.
   */
  getSliceIndex(): number {
    return 0;
  }

  /**
   * Returns the current zoom level of the viewport.
   * @returns Zoom level factor.
   */
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
        imageIds: this.getImageIds(),
        currentImageIdIndex: 0,
      },
    ];
  }

  /**
   * Sets the zoom level for the viewport relative to an optional canvas point.
   * @param zoom - Scale factor to apply.
   * @param canvasPoint - Optional point in canvas space to zoom relative to.
   */
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

  /**
   * Returns the current 2D pan offset of the viewport.
   * @returns Array containing [x, y] pan coordinates.
   */
  getPan(): Point2 {
    return this.getResolvedView()?.pan ?? [0, 0];
  }

  /**
   * Sets the 2D pan offset for the viewport.
   * @param pan - Target [x, y] pan offset.
   */
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

    const visibleChannels = new Set(
      this.viewState.visibleChannels ||
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
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return { width: 0, height: 0 };
    }

    return {
      width: resolvedView.metrics.ecgWidth,
      height: resolvedView.metrics.ecgHeight,
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
   * Resets the pan and the zoom, and optionally the time window. The layout
   * options of the view state stay. Called by `resetCamera()` and the toolbar
   * "Reset View" button.
   *
   * @param options - Flags controlling which view-state fields are reset.
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetViewState(options?: ECGResetViewStateOptions): boolean {
    const {
      resetPan = true,
      resetZoom = true,
      resetTimeRange = false,
    } = options || {};
    const nextViewState: Partial<ECGViewState> = { scrollOffset: 0 };

    if (resetPan) {
      nextViewState.anchorWorld = undefined;
      nextViewState.anchorCanvas = [0.5, 0.5];
    }

    if (resetZoom) {
      nextViewState.scale = 1;
      nextViewState.scaleMode = 'fit';
    }

    if (resetTimeRange) {
      nextViewState.timeRange = [0, this.getDurationMs()];
    }

    this.setViewState(nextViewState);
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
   * Scrolls the time window by `delta` window widths. Matches the Planar
   * family scroll signature.
   *
   * The scroll does nothing when the window shows the full record, which is
   * always true for a multi-column layout.
   *
   * @param delta - Number of window widths to shift (default 1).
   * @returns Promise resolving to the current source imageId.
   */
  async scroll(delta = 1): Promise<string> {
    const timeWindow = this.getResolvedView()?.timeWindow;

    if (timeWindow) {
      const windowMs = Math.max(1, timeWindow.endMs - timeWindow.startMs);
      this.scrollToTime(timeWindow.startMs + windowMs * delta);
    }

    return this.getCurrentImageId();
  }

  /**
   * Scrolls the time window so that `timeMs` is at the left edge. The window
   * keeps its width and stays inside the record.
   *
   * @param timeMs - Target start time in milliseconds.
   */
  scrollToTime(timeMs: number): void {
    const timeWindow = this.getResolvedView()?.timeWindow;
    const durationMs = this.getDurationMs();

    if (!timeWindow) {
      return;
    }

    const windowMs = Math.max(1, timeWindow.endMs - timeWindow.startMs);

    if (windowMs >= durationMs) {
      return;
    }

    const nextStart = Math.max(0, Math.min(timeMs, durationMs - windowMs));

    if (nextStart === timeWindow.startMs) {
      return;
    }

    this.setViewState({ timeRange: [nextStart, nextStart + windowMs] });
  }

  /**
   * Returns the total signal duration in milliseconds, or 0 if no waveform is loaded.
   */
  getDurationMs(): number {
    const waveform = this.getWaveformData();

    if (!waveform) {
      return 0;
    }

    return (waveform.numberOfSamples / waveform.samplingFrequency) * 1000;
  }

  /**
   * Returns the display set id bound to this viewport, if one has been loaded.
   * Use `getCurrentImageId` for the SOP image id of the waveform instance.
   */
  getSourceDataId(): string | undefined {
    return this.getFirstBinding()?.data.id;
  }

  /**
   * Returns the image id of the mounted ECG instance, if one has been loaded.
   * This is the source imageId registered for the display set, not the
   * display set id.
   */
  getCurrentImageId(): string | undefined {
    const dataId = this.getSourceDataId();

    return dataId ? getGenericViewportSourceDataId(dataId) : undefined;
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
    const imageId = this.getCurrentImageId();

    return imageId ? [imageId] : [];
  }

  /**
   * Returns whether the viewport is rendering the specified imageId.
   */
  hasImageId(imageId: string): boolean {
    return this.getImageIds().includes(imageId);
  }

  /**
   * Returns whether the viewport is rendering the specified imageURI.
   * Whole identifiers are compared, so a UID prefix does not match.
   */
  hasImageURI(imageURI: string): boolean {
    const imageId = this.getCurrentImageId();

    return (
      !!imageId && (imageId === imageURI || imageIdToURI(imageId) === imageURI)
    );
  }

  /**
   * Returns image data compatible with the Cornerstone tools annotation system.
   * Amplitude is mapped to [0, ECG_AMPLITUDE_INDEX_SIZE) so annotation
   * index bounds checks work correctly across channels.
   */
  getImageData(): CPUIImageData | undefined {
    const waveform = this.getWaveformBindingData();

    if (!waveform) {
      return undefined;
    }

    const nSamples = waveform.numberOfSamples;
    // The Z of a world point identifies a trace region. A region that repeats
    // a lead takes a Z above the last channel index, and the annotation tools
    // reject a handle whose index is outside `dimensions`.
    const dimensions: Point3 = [
      nSamples,
      ECG_AMPLITUDE_INDEX_SIZE,
      this.getResolvedView()?.leadIndexCount ?? waveform.channels.length,
    ];
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
      calibration: waveform.calibration as
        | import('../../../types').IImageCalibration
        | undefined,
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

  /**
   * Builds the resolved view of the current frame from the mounted waveform,
   * the canvas geometry, the view state and the data presentation. It does not
   * read the mounted rendering, so a transform is correct before the first
   * draw (GENVIEW-VIEW-2).
   */
  getResolvedView(): ECGResolvedView | undefined {
    const waveform = this.getWaveformBindingData();

    if (!waveform) {
      return;
    }

    return new ECGResolvedView({
      viewState: this.viewState,
      canvas: this.canvas,
      dataPresentation: this.getDisplaySetPresentation(waveform.id),
      frameOfReferenceUID: `ecg-viewport-${this.id}`,
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
