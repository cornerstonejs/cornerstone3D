import { getOrCreateCanvas } from '../../helpers';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import { getDefaultECGValueRange } from '../../../utilities/ECGUtilities';
import { CanvasECGPath } from './CanvasECGRenderingAdapter';
import { DefaultECGDataProvider } from './DefaultECGDataProvider';
import type {
  ECGCanvasBackendContext,
  ECGCanvasRendering,
  ECGPresentationProps,
  ECGViewState,
  ECGViewportV2Input,
  ECGWaveformPayload,
} from './ECGViewportV2Types';

defaultRenderPathResolver.register(new CanvasECGPath());

class ECGViewportV2 extends ViewportV2<ECGViewState, ECGPresentationProps> {
  readonly kind = 'ecg' as const;
  readonly id: string;

  readonly element: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly canvasContext: CanvasRenderingContext2D;

  protected backendContext: ECGCanvasBackendContext;

  constructor(args: ECGViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.canvas = getOrCreateCanvas(this.element);
    this.canvasContext = this.canvas.getContext('2d');
    this.dataProvider = args.dataProvider || new DefaultECGDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.backendContext = {
      viewportId: this.id,
      viewportKind: 'ecg',
      element: this.element,
      canvas: this.canvas,
      canvasContext: this.canvasContext,
    };
    this.viewState = {
      timeRange: [0, 1],
      valueRange: [-1, 1],
      scrollOffset: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.resize();
  }

  async setSignal(dataId: string): Promise<string> {
    const renderingId = await this.setDataId(dataId, {
      role: 'signal',
      renderMode: 'signal2d',
    });
    const binding = this.getBinding(dataId);

    if (!binding) {
      return renderingId;
    }

    const waveform = (binding.data.payload as ECGWaveformPayload) || null;
    const durationMs =
      (waveform.numberOfSamples / waveform.samplingFrequency) * 1000;

    this.setPresentation(dataId, {
      visible: true,
      opacity: 1,
      lineWidth: 1,
      amplitudeScale: 1,
      showGrid: true,
      visibleChannels: waveform.channels.map((_channel, index) => index),
    });
    this.setViewState({
      timeRange: [0, durationMs],
      valueRange: getDefaultECGValueRange(waveform),
      scrollOffset: 0,
    });

    return renderingId;
  }

  setChannelVisibility(index: number, visible: boolean): void {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    const dataId = firstBinding.data.id;
    const waveform = firstBinding.data.payload as ECGWaveformPayload;
    const current = this.getPresentation(dataId) || {};
    const nextVisibleChannels = new Set(
      current.visibleChannels || waveform.channels.map((_channel, i) => i)
    );

    if (visible) {
      nextVisibleChannels.add(index);
    } else {
      nextVisibleChannels.delete(index);
    }

    this.setPresentation(dataId, {
      ...current,
      visibleChannels: Array.from(nextVisibleChannels).sort((a, b) => a - b),
    });
  }

  getVisibleChannels(): { name: string; visible: boolean }[] {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return [];
    }

    const dataId = firstBinding.data.id;
    const waveform = firstBinding.data.payload as ECGWaveformPayload;
    const visibleChannels = new Set(
      this.getPresentation(dataId)?.visibleChannels ||
        waveform.channels.map((_channel, index) => index)
    );

    return waveform.channels.map((channel, index) => ({
      name: channel.name,
      visible: visibleChannels.has(index),
    }));
  }

  getContentDimensions(): { width: number; height: number } {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return { width: 0, height: 0 };
    }

    const rendering = firstBinding.rendering as ECGCanvasRendering;
    return {
      width: rendering.backendHandle.metrics.ecgWidth,
      height: rendering.backendHandle.metrics.ecgHeight,
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
    this.redrawBindings();
  }
}

export default ECGViewportV2;
