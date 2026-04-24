import { getOrCreateCanvas } from '../../helpers';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { LoadedData } from '../ViewportArchitectureTypes';
import ViewportNext from '../ViewportNext';
import { ViewportType } from '../../../enums';
import { getDefaultECGValueRange } from '../../../utilities/ECGUtilities';
import type {
  CPUIImageData,
  Mat3,
  Point2,
  Point3,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import { CanvasECGPath } from './CanvasECGRenderPath';
import { DefaultECGDataProvider } from './DefaultECGDataProvider';
import type {
  ECGCamera,
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGDataPresentation,
  ECGViewportInput,
  ECGWaveformPayload,
} from './ECGViewportTypes';
import {
  createDefaultECGCamera,
  normalizeECGCamera,
} from './ecgViewportCamera';
import ECGComputedCamera from './ECGComputedCamera';

const ECG_AMPLITUDE_INDEX_SIZE = 65536;

defaultRenderPathResolver.register(new CanvasECGPath());

class ECGViewport extends ViewportNext<
  ECGCamera,
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
      args.renderPathResolver || defaultRenderPathResolver;
    this.renderContext = {
      viewportId: this.id,
      type: 'ecg',
      renderingEngineId: this.renderingEngineId,
      element: this.element,
      canvas: this.canvas,
      canvasContext: this.canvasContext,
    };
    this.camera = createDefaultECGCamera({
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
   * Adds one or more waveform datasets using the canvas ECG render path.
   *
   * @param entries - List of datasets to add.
   * @returns Rendering ids in the same order as the provided entries.
   */
  async setDataList(entries: Array<{ dataId: string }>): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const { dataId } of entries) {
      const waveform = await this.loadWaveformData(dataId);
      const durationMs =
        (waveform.numberOfSamples / waveform.samplingFrequency) * 1000;

      this.setDefaultDataPresentation(dataId, {
        visible: true,
        opacity: 1,
        visibleChannels: waveform.channels.map((_channel, index) => index),
        lineWidth: 1,
        amplitudeScale: 1,
        showGrid: true,
      });
      this.camera = createDefaultECGCamera({
        timeRange: [0, durationMs],
        valueRange: getDefaultECGValueRange(waveform),
      });

      const renderingId = await this.addLoadedData(dataId, waveform, {
        renderMode: 'signal2d',
      });

      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

  getWaveformData(): ECGWaveformPayload | null {
    return this.getWaveformBindingData() ?? null;
  }

  getViewPresentation(
    viewPresSel: ViewPresentationSelector = {
      zoom: true,
      pan: true,
    }
  ): ViewPresentation {
    const target: ViewPresentation = {};
    const { zoom, pan } = viewPresSel;
    const currentZoom = this.getZoom();

    if (zoom) {
      target.zoom = currentZoom;
    }

    if (pan) {
      const currentPan = this.getPan();
      target.pan = [currentPan[0] / currentZoom, currentPan[1] / currentZoom];
    }

    return target;
  }

  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const nextZoom = Math.max(viewPres.zoom ?? this.getZoom(), 0.001);

    this.setCamera({
      scale: nextZoom,
      scaleMode: 'fit',
    });

    if (viewPres.pan) {
      this.setPan([viewPres.pan[0] * nextZoom, viewPres.pan[1] * nextZoom]);
    }
  }

  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
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
      this.getComputedCamera()?.zoom ?? Math.max(this.camera.scale ?? 1, 0.001)
    );
  }

  protected normalizeCamera(camera: ECGCamera): ECGCamera {
    return normalizeECGCamera(camera);
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    const computedCamera = this.getComputedCamera();

    if (computedCamera) {
      this.applyComputedCameraState(
        computedCamera.withZoom(zoom, canvasPoint).state.camera
      );
      return;
    }

    this.setCamera({
      scale: Math.max(zoom, 0.001),
      scaleMode: 'fit',
    });
  }

  getPan(): Point2 {
    return this.getComputedCamera()?.pan ?? [0, 0];
  }

  setPan(pan: Point2): void {
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      return;
    }

    this.applyComputedCameraState(computedCamera.withPan(pan).state.camera);
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
      this.getDataPresentation(dataId)?.visibleChannels ||
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
  resetCamera(): boolean {
    const previousCamera = this.getCameraForEvent();
    this.camera = createDefaultECGCamera({
      timeRange: this.camera.timeRange,
      valueRange: this.camera.valueRange,
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
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      this.setZoom(scale);
      return;
    }

    this.applyComputedCameraState(
      computedCamera.withZoom(scale, canvasPoint).state.camera
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

  getComputedCamera(): ECGComputedCamera | undefined {
    const waveform = this.getWaveformBindingData();
    const rendering = this.getCurrentRendering();

    if (!waveform || !rendering) {
      return;
    }

    return new ECGComputedCamera({
      camera: this.camera,
      canvas: this.canvas,
      dataPresentation: this.getDataPresentation(waveform.id),
      frameOfReferenceUID: `ecg-viewport-${this.id}`,
      metrics: rendering.metrics,
      waveform,
    });
  }

  private applyComputedCameraState(nextCamera: ECGCamera): void {
    const previousCamera = this.getCameraForEvent();

    this.camera = this.normalizeCamera(nextCamera);
    this.modified(previousCamera);
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
