import { Events as EVENTS, ViewportType } from '../../../enums';
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
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  ECGCamera,
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGDataPresentation,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportTypes';
import { getECGCameraLayout } from './ecgViewportCamera';

export class CanvasECGRenderPath implements RenderPath<ECGCanvasRenderContext> {
  async addData(
    ctx: ECGCanvasRenderContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<ECGDataPresentation>> {
    const waveform = data as unknown as LoadedData<ECGWaveformPayload>;

    const rendering: ECGCanvasRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'signal2d',
      canvas: ctx.canvas,
      canvasContext: ctx.canvasContext,
      metrics: {
        ecgWidth: 1,
        ecgHeight: 1,
        channelScale: 1,
        worldToCanvasRatio: 1,
        xOffsetCanvas: 0,
        yOffsetCanvas: 0,
      },
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(rendering, camera);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(ctx);
      },
      render: () => {
        this.render(ctx, rendering, waveform);
      },
      removeData: () => {
        this.removeData();
      },
    };
  }

  private updateDataPresentation(
    rendering: ECGCanvasRendering,
    props: unknown
  ): void {
    rendering.currentDataPresentation = props as
      | ECGDataPresentation
      | undefined;
  }

  private updateCamera(rendering: ECGCanvasRendering, camera: unknown): void {
    rendering.currentCamera = camera as ECGCamera;
  }

  private getFrameOfReferenceUID(
    ctx: ECGCanvasRenderContext
  ): string | undefined {
    return `ecg-viewport-${ctx.viewportId}`;
  }

  private render(
    ctx: ECGCanvasRenderContext,
    rendering: ECGCanvasRendering,
    waveform: ECGWaveformPayload
  ): void {
    drawFrame(ctx, rendering, waveform);
  }

  private removeData(): void {
    // Canvas lifecycle is owned by the viewport element.
  }
}

export class CanvasECGPath
  implements RenderPathDefinition<ECGCanvasRenderContext>
{
  readonly id = 'ecg:canvas-signal';
  readonly type = ViewportType.ECG_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'ecg' && options.renderMode === 'signal2d';
  }

  createRenderPath() {
    return new CanvasECGRenderPath();
  }
}

function getEffectiveTransform(
  metrics: RenderWindowMetrics,
  camera: ECGCamera | undefined,
  canvas: HTMLCanvasElement
): { effectiveRatio: number; xOffset: number; yOffset: number } {
  const layout = getECGCameraLayout({
    metrics,
    camera,
    canvas,
  });

  return {
    effectiveRatio: layout.effectiveRatio,
    xOffset: layout.xOffset,
    yOffset: layout.yOffset,
  };
}

function computeTimeWindow(
  waveform: ECGWaveformPayload,
  camera: ECGCamera
): {
  startMs: number;
  endMs: number;
  startIndex: number;
  endIndex: number;
} {
  const durationMs =
    (waveform.numberOfSamples / waveform.samplingFrequency) * 1000;
  const startMs = Math.max(0, Math.min(camera.timeRange[0], durationMs));
  const requestedEnd = Math.max(startMs + 1, camera.timeRange[1]);
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

function drawFrame(
  ecgCtx: ECGCanvasRenderContext,
  ecgRendering: ECGCanvasRendering,
  waveform: ECGWaveformPayload
): void {
  const { canvas, canvasContext, currentCamera, currentDataPresentation } =
    ecgRendering;

  if (!currentCamera) {
    return;
  }

  const visibleChannels = getVisibleECGChannels(
    waveform.channels,
    currentDataPresentation?.visibleChannels
  );

  ensureECGCanvasSize(canvas);

  const metrics = computeECGRenderMetrics({
    canvas,
    visibleChannels,
    windowMs: Math.max(
      1,
      currentCamera.timeRange[1] - currentCamera.timeRange[0]
    ),
    valueRange: currentCamera.valueRange,
  }) as RenderWindowMetrics;
  const layouts = computeECGChannelLayouts({
    visibleChannels,
    channelScale: metrics.channelScale,
  });
  const timeWindow = computeTimeWindow(waveform, currentCamera);
  const dpr = window.devicePixelRatio || 1;

  ecgRendering.metrics = metrics;

  const { effectiveRatio, xOffset, yOffset } = getEffectiveTransform(
    metrics,
    currentCamera,
    canvas
  );

  canvasContext.resetTransform();
  canvasContext.fillStyle = '#000000';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);

  if (currentDataPresentation?.visible === false) {
    return;
  }

  canvasContext.globalAlpha = currentDataPresentation?.opacity ?? 1;
  canvasContext.setTransform(
    effectiveRatio * dpr,
    0,
    0,
    effectiveRatio * dpr,
    xOffset * dpr,
    yOffset * dpr
  );

  drawECGGrid(canvasContext, metrics, {
    showGrid: currentDataPresentation?.showGrid,
  });
  drawECGTraces({
    ctx: canvasContext,
    layouts,
    ecgWidth: metrics.ecgWidth,
    channelScale: metrics.channelScale,
    startIndex: timeWindow.startIndex,
    endIndex: timeWindow.endIndex,
    lineWidth: currentDataPresentation?.lineWidth,
    amplitudeScale: currentDataPresentation?.amplitudeScale,
  });
  drawECGLabels(canvasContext, layouts, metrics.worldToCanvasRatio);

  canvasContext.resetTransform();
  canvasContext.globalAlpha = 1;

  triggerEvent(ecgCtx.element, EVENTS.IMAGE_RENDERED, {
    element: ecgCtx.element,
    viewportId: ecgCtx.viewportId,
    renderingEngineId: ecgCtx.renderingEngineId,
    rendering: ecgRendering,
  });
}
