import { Events as EVENTS } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  computeECGChannelLayouts,
  computeECGRenderMetrics,
  drawECGGrid,
  drawECGLabels,
  drawECGTraces,
  ensureECGCanvasSize,
  getVisibleECGChannels,
} from '../../../utilities/ECGUtilities';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  ECGCanvasBackendContext,
  ECGCanvasRendering,
  ECGPresentationProps,
  ECGViewState,
  ECGWaveformPayload,
  RenderWindowMetrics,
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

export class CanvasECGRenderingAdapter {
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
