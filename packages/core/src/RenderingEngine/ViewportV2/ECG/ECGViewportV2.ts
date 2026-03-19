import { getOrCreateCanvas } from '../../helpers';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { LoadedData } from '../ViewportArchitectureTypes';
import ViewportV2 from '../ViewportV2';
import { ViewportType } from '../../../enums';
import { getDefaultECGValueRange } from '../../../utilities/ECGUtilities';
import type {
  CPUIImageData,
  ICamera,
  Mat3,
  Point2,
  Point3,
} from '../../../types';
import { CanvasECGPath } from './CanvasECGRenderPath';
import { DefaultECGDataProvider } from './DefaultECGDataProvider';
import type {
  ECGCamera,
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGDataPresentation,
  ECGViewportV2Input,
  ECGWaveformPayload,
} from './ECGViewportV2Types';
import {
  createDefaultECGCamera,
  getAnchorWorldForCanvasPoint,
  getAnchorWorldForPan,
  getECGCameraLayout,
  getPanForECGLayout,
  normalizeECGCamera,
} from './ecgViewportCamera';

const ECG_AMPLITUDE_INDEX_SIZE = 65536;

defaultRenderPathResolver.register(new CanvasECGPath());

class ECGViewportV2 extends ViewportV2<
  ECGCamera,
  ECGDataPresentation,
  ECGCanvasRenderContext
> {
  readonly type = ViewportType.ECG_V2;
  readonly id: string;

  readonly element: HTMLDivElement;
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

  constructor(args: ECGViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
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
   * Adds a single waveform dataset and returns its rendering id.
   *
   * @param dataId - Logical dataset id to add.
   * @returns The rendering id created for the mounted waveform.
   */
  /**
   * Legacy compat: loads ECG data from an imageId, matching the old
   * ECGViewport.setEcg signature.
   */
  async setEcg(imageId: string): Promise<void> {
    await this.setSignal(imageId);
  }

  async setSignal(dataId: string): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

  /**
   * Adds one or more waveform datasets using the canvas ECG render path.
   *
   * @param dataIds - Logical dataset ids to add.
   * @returns Rendering ids in the same order as the input dataset ids.
   */
  async setDataIds(dataIds: string[]): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
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

  getSliceIndex(): number {
    return 0;
  }

  getZoom(): number {
    return this.getScale();
  }

  protected normalizeCamera(camera: ECGCamera): ECGCamera {
    return normalizeECGCamera(camera);
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    if (canvasPoint) {
      this.setScaleAtCanvasPoint(zoom, canvasPoint);
      return;
    }

    this.setScale(zoom);
  }

  getPan(): Point2 {
    const layout = this.getCurrentCameraLayout();

    return layout ? getPanForECGLayout(layout) : [0, 0];
  }

  setPan(pan: Point2): void {
    const layout = this.getCurrentCameraLayout();

    if (!layout) {
      return;
    }

    this.setCamera({
      frame: {
        anchorWorld: getAnchorWorldForPan([pan[0], pan[1]], layout),
      },
    });
  }

  /**
   * Shows or hides a specific ECG channel in the active dataset.
   *
   * @param index - Channel index to update.
   * @param visible - Whether the channel should be visible.
   */
  setChannelVisibility(index: number, visible: boolean): void {
    const waveform = this.getWaveformBindingData();

    if (!waveform) {
      return;
    }

    const dataId = waveform.id;
    const current = this.getDataPresentation(dataId) || {};
    const nextVisibleChannels = new Set(
      current.visibleChannels || waveform.channels.map((_channel, i) => i)
    );

    if (visible) {
      nextVisibleChannels.add(index);
    } else {
      nextVisibleChannels.delete(index);
    }

    this.setDataPresentation(dataId, {
      visibleChannels: Array.from(nextVisibleChannels).sort((a, b) => a - b),
    });
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
    const layout = this.getCurrentCameraLayout();

    if (!layout) {
      this.setScale(scale);
      return;
    }

    this.setCamera({
      frame: {
        ...(this.getCamera().frame || {}),
        anchorWorld: getAnchorWorldForCanvasPoint(canvasPoint, layout),
        anchorCanvas: [
          canvasPoint[0] / Math.max(this.canvas.clientWidth, 1),
          canvasPoint[1] / Math.max(this.canvas.clientHeight, 1),
        ],
        scale: Math.max(scale, 0.001),
        scaleMode: 'fit',
      },
    });
  }

  private getCurrentCameraLayout() {
    const rendering = this.getCurrentRendering();

    if (!rendering) {
      return;
    }

    return getECGCameraLayout({
      metrics: rendering.metrics,
      camera: this.camera,
      canvas: this.canvas,
    });
  }

  private async loadWaveformData(
    dataId: string
  ): Promise<LoadedData<ECGWaveformPayload>> {
    const waveform = await this.dataProvider.load(dataId);

    if (!isECGWaveformData(waveform)) {
      throw new Error(
        `[ECGViewportV2] Loaded data for ${dataId} is not a valid ECG waveform`
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

  protected getCameraForEvent(): ICamera {
    const layout = this.getCurrentCameraLayout();
    const effectiveRatio = Math.max(layout?.effectiveRatio ?? 1, 0.001);
    const canvasCenter: Point2 = [
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ];

    return {
      parallelProjection: true,
      focalPoint: this.canvasToWorld(canvasCenter),
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight / 2 / effectiveRatio,
      viewPlaneNormal: [0, 0, 1],
    };
  }
}

export default ECGViewportV2;

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
