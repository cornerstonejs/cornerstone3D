import { Events as EVENTS } from '../enums';
import { getOrCreateCanvas } from './helpers';
import triggerEvent from '../utilities/triggerEvent';
import { defaultRenderPathResolver } from './DefaultRenderPathResolver';
import ViewportV2 from './ViewportV2';
import type {
  DataAttachmentOptions,
  DataProvider,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  ViewportBackendContext,
} from './ViewportArchitectureTypes';
import type {
  ChannelLayout,
  ECGCanvasBackendContext,
  ECGCanvasRendering,
  ECGChannelData,
  ECGPresentationProps,
  ECGViewState,
  ECGViewportV2Input,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportV2Types';
import {
  computeECGChannelLayouts,
  computeECGRenderMetrics,
  drawECGGrid,
  drawECGLabels,
  drawECGTraces,
  ensureECGCanvasSize,
  getDefaultECGValueRange,
  getVisibleECGChannels,
  loadECGWaveform,
} from '../utilities/ECGUtilities';

export type {
  ECGCanvasBackendContext,
  ECGCanvasRendering,
  ECGChannelData,
  ECGPresentationProps,
  ECGViewState,
  ECGViewportV2Input,
  ECGWaveformPayload,
} from './ECGViewportV2Types';

function computeTimeWindow(
  waveform: ECGWaveformPayload,
  viewState: ECGViewState
): {
  startMs: number;
  endMs: number;
  startIndex: number;
  endIndex: number;
} {
  const durationMs =
    (waveform.numberOfSamples / waveform.samplingFrequency) * 1000;
  const startMs = Math.max(0, Math.min(viewState.timeRange[0], durationMs));
  const requestedEnd = Math.max(startMs + 1, viewState.timeRange[1]);
  const endMs = Math.max(startMs + 1, Math.min(requestedEnd, durationMs));
  const startIndex = Math.max(
    0,
    Math.min(
      waveform.numberOfSamples - 1,
      Math.floor((startMs / 1000) * waveform.samplingFrequency)
    )
  );
  const endIndex = Math.max(
    startIndex + 1,
    Math.min(
      waveform.numberOfSamples,
      Math.ceil((endMs / 1000) * waveform.samplingFrequency)
    )
  );

  return {
    startMs,
    endMs,
    startIndex,
    endIndex,
  };
}

export class DefaultECGDataProvider implements DataProvider {
  private cache = new Map<string, LogicalDataObject>();

  async load(dataId: string): Promise<LogicalDataObject> {
    const cached = this.cache.get(dataId);

    if (cached) {
      return cached;
    }

    const { waveform, calibration } = await loadECGWaveform(dataId);

    const logicalDataObject: LogicalDataObject<ECGWaveformPayload> = {
      id: dataId,
      role: 'signal',
      kind: 'signal',
      metadata: {
        calibration,
      },
      payload: waveform as ECGWaveformPayload,
    };

    this.cache.set(dataId, logicalDataObject);
    return logicalDataObject;
  }
}

class CanvasECGRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<ECGCanvasRendering> {
    const ecgCtx = ctx as ECGCanvasBackendContext;

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'signal',
      renderMode: 'signal2d',
      backendHandle: {
        canvas: ecgCtx.canvas,
        canvasContext: ecgCtx.canvasContext,
        waveform: data.payload as ECGWaveformPayload,
        metrics: {
          ecgWidth: 1,
          ecgHeight: 1,
          channelScale: 1,
          worldToCanvasRatio: 1,
          xOffsetCanvas: 0,
          yOffsetCanvas: 0,
        },
      },
    };
  }

  updatePresentation(
    _ctx: ViewportBackendContext,
    _rendering: MountedRendering,
    _props: unknown
  ): void {
    // Rendering happens in updateViewState for this canvas path.
  }

  updateViewState(
    ctx: ViewportBackendContext,
    rendering: MountedRendering,
    viewState: unknown,
    props?: unknown
  ): void {
    const ecgCtx = ctx as ECGCanvasBackendContext;
    const ecgRendering = rendering as ECGCanvasRendering;
    const ecgViewState = viewState as ECGViewState;
    const ecgProps = props as ECGPresentationProps | undefined;
    const { canvas, canvasContext, waveform } = ecgRendering.backendHandle;
    const visibleChannels = getVisibleECGChannels(
      waveform.channels,
      ecgProps?.visibleChannels
    );

    ensureECGCanvasSize(canvas);

    const metrics = computeECGRenderMetrics({
      canvas,
      visibleChannels,
      windowMs: Math.max(
        1,
        ecgViewState.timeRange[1] - ecgViewState.timeRange[0]
      ),
      valueRange: ecgViewState.valueRange,
    }) as RenderWindowMetrics;
    const layouts = computeECGChannelLayouts({
      visibleChannels,
      channelScale: metrics.channelScale,
    });
    const timeWindow = computeTimeWindow(waveform, ecgViewState);
    const dpr = window.devicePixelRatio || 1;

    ecgRendering.backendHandle.metrics = metrics;

    canvasContext.resetTransform();
    canvasContext.fillStyle = '#000000';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    if (ecgProps?.visible === false) {
      return;
    }

    canvasContext.globalAlpha = ecgProps?.opacity ?? 1;
    canvasContext.setTransform(
      metrics.worldToCanvasRatio * dpr,
      0,
      0,
      metrics.worldToCanvasRatio * dpr,
      metrics.xOffsetCanvas * dpr,
      metrics.yOffsetCanvas * dpr
    );

    drawECGGrid(canvasContext, metrics, {
      showGrid: ecgProps?.showGrid,
    });
    drawECGTraces({
      ctx: canvasContext,
      layouts,
      ecgWidth: metrics.ecgWidth,
      channelScale: metrics.channelScale,
      startIndex: timeWindow.startIndex,
      endIndex: timeWindow.endIndex,
      lineWidth: ecgProps?.lineWidth,
      amplitudeScale: ecgProps?.amplitudeScale,
    });
    drawECGLabels(canvasContext, layouts, metrics.worldToCanvasRatio);

    canvasContext.resetTransform();
    canvasContext.globalAlpha = 1;

    triggerEvent(ecgCtx.element, EVENTS.IMAGE_RENDERED, {
      element: ecgCtx.element,
      viewportId: ecgCtx.viewportId,
      rendering,
    });
  }

  detach(_ctx: ViewportBackendContext, _rendering: MountedRendering): void {
    // Canvas lifecycle is owned by the viewport element.
  }
}

export class CanvasECGPath implements RenderPathDefinition {
  readonly id = 'ecg:canvas-signal';
  readonly viewportKind = 'ecg' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'signal' &&
      options.role === 'signal' &&
      options.renderMode === 'signal2d'
    );
  }

  createAdapter() {
    return new CanvasECGRenderingAdapter();
  }
}

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
      ensureECGCanvasSize(this.canvas);
    }

    this.render();
  }

  render(): void {
    this.redrawBindings();
  }
}

export default ECGViewportV2;
