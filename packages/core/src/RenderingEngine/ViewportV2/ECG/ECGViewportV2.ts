import { getOrCreateCanvas } from '../../helpers';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { LoadedData } from '../ViewportArchitectureTypes';
import ViewportV2 from '../ViewportV2';
import { ViewportType } from '../../../enums';
import { getDefaultECGValueRange } from '../../../utilities/ECGUtilities';
import type { IImageData, Point2, Point3 } from '../../../types';
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
    this.camera = {
      timeRange: [0, 1],
      valueRange: [-1, 1],
      scrollOffset: 0,
      pan: [0, 0],
      zoom: 1,
    };

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
      const renderingId = await this.setDataId(dataId, {
        renderMode: 'signal2d',
      });
      const binding = this.getBinding(dataId);

      if (!binding) {
        renderingIds.push(renderingId);
        continue;
      }

      const waveform =
        (binding.data as unknown as LoadedData<ECGWaveformPayload>) || null;
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
      this.camera = {
        timeRange: [0, durationMs],
        valueRange: getDefaultECGValueRange(waveform),
        scrollOffset: 0,
        pan: [0, 0],
        zoom: 1,
      };
      this.modified();

      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

  /**
   * Shows or hides a specific ECG channel in the active dataset.
   *
   * @param index - Channel index to update.
   * @param visible - Whether the channel should be visible.
   */
  setChannelVisibility(index: number, visible: boolean): void {
    const firstBinding = this.getFirstBinding();

    if (!firstBinding) {
      return;
    }

    const dataId = firstBinding.data.id;
    const waveform =
      firstBinding.data as unknown as LoadedData<ECGWaveformPayload>;
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
    const firstBinding = this.getFirstBinding();

    if (!firstBinding) {
      return [];
    }

    const dataId = firstBinding.data.id;
    const waveform =
      firstBinding.data as unknown as LoadedData<ECGWaveformPayload>;
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
    const firstBinding = this.getFirstBinding();

    if (!firstBinding) {
      return { width: 0, height: 0 };
    }

    const rendering = firstBinding.rendering as ECGCanvasRendering;
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
    this.camera = {
      ...this.camera,
      pan: [0, 0],
      zoom: 1,
    };
    this.modified();

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
  getImageData(): IImageData | null {
    const binding = this.getFirstBinding();

    if (!binding) {
      return null;
    }

    const waveform = binding.data as unknown as LoadedData<ECGWaveformPayload>;
    const nSamples = waveform.numberOfSamples;
    const nChannels = waveform.channels.length;
    const dimensions = [nSamples, ECG_AMPLITUDE_INDEX_SIZE, nChannels];
    const spacing = [1, 1, 1];
    const origin = [0, 0, 0];
    const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const amplitudeOffset = ECG_AMPLITUDE_INDEX_SIZE / 2;

    const imageData = {
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
      hasPixelSpacing: false,
      preScale: { scaled: false },
      metadata: { Modality: 'ECG' },
    } as unknown as IImageData;
  }
}

export default ECGViewportV2;
