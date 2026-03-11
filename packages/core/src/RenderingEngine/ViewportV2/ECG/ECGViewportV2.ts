import { getOrCreateCanvas } from '../../helpers';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { LoadedData } from '../ViewportArchitectureTypes';
import ViewportV2 from '../ViewportV2';
import { ViewportType } from '../../../enums';
import { getDefaultECGValueRange } from '../../../utilities/ECGUtilities';
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

defaultRenderPathResolver.register(new CanvasECGPath());

class ECGViewportV2 extends ViewportV2<
  ECGCamera,
  ECGDataPresentation,
  ECGCanvasRenderContext
> {
  readonly type = ViewportType.ECG;
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
      element: this.element,
      canvas: this.canvas,
      canvasContext: this.canvasContext,
    };
    this.camera = {
      timeRange: [0, 1],
      valueRange: [-1, 1],
      scrollOffset: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    this.resize();
  }

  async setSignal(dataId: string): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

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
      };
      this.modified();

      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

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

  render(): void {
    this.renderBindings();
  }
}

export default ECGViewportV2;
