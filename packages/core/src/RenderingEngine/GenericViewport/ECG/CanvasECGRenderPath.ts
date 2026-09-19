import { Events as EVENTS, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  computeECGChannelLayouts,
  computeECGRenderMetrics,
  computeECGTimeWindow,
  drawECGGrid,
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
  ECGViewState,
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGDataPresentation,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportTypes';
import { resolveECGCanvasMapping } from './ecgViewportCamera';

/**
 * Render path implementation for rendering 2D ECG waveforms on an HTML5 canvas.
 * @internal
 */
export class CanvasECGRenderPath implements RenderPath<ECGCanvasRenderContext> {
  /**
   * Adds an ECG waveform dataset to the canvas render context and returns
   * life-cycle control callbacks.
   *
   * @param ctx - Canvas render context
   * @param data - Loaded ECG waveform data
   * @param options - Render attachment options
   * @returns Render path attachment handle
   */
  async addData(
    ctx: ECGCanvasRenderContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<ECGDataPresentation>> {
    const waveform = data as unknown as LoadedData<ECGWaveformPayload>;

    const rendering: ECGCanvasRendering = {
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
      applyViewState: (camera) => {
        this.applyViewState(rendering, camera);
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

  /**
   * Updates presentation properties (e.g. visible channels, line width, grid) for the ECG rendering.
   *
   * @param rendering - Target canvas rendering object
   * @param props - Updated presentation properties
   */
  private updateDataPresentation(
    rendering: ECGCanvasRendering,
    props: unknown
  ): void {
    rendering.currentDataPresentation = props as
      | ECGDataPresentation
      | undefined;
  }

  /**
   * Applies the current camera / view state to the rendering object.
   *
   * @param rendering - Target canvas rendering object
   * @param camera - Updated camera view state
   */
  private applyViewState(rendering: ECGCanvasRendering, camera: unknown): void {
    rendering.currentCamera = camera as ECGViewState;
  }

  /**
   * Returns the viewport-scoped Frame of Reference UID.
   *
   * @param ctx - Canvas render context
   * @returns Frame of reference UID string
   */
  private getFrameOfReferenceUID(
    ctx: ECGCanvasRenderContext
  ): string | undefined {
    return `ecg-viewport-${ctx.viewportId}`;
  }

  /**
   * Triggers a draw frame pass onto the canvas.
   *
   * @param ctx - Canvas render context
   * @param rendering - Target canvas rendering object
   * @param waveform - Waveform data payload
   */
  private render(
    ctx: ECGCanvasRenderContext,
    rendering: ECGCanvasRendering,
    waveform: ECGWaveformPayload
  ): void {
    drawFrame(ctx, rendering, waveform);
  }

  /**
   * Cleans up data when removed from the viewport.
   */
  private removeData(): void {
    // Canvas lifecycle is owned by the viewport element.
  }
}

/**
 * Render path definition for 2D canvas ECG rendering.
 * @internal
 */
export class CanvasECGPath
  implements RenderPathDefinition<ECGCanvasRenderContext>
{
  readonly id = 'ecg:canvas-signal';
  readonly type = ViewportType.ECG_NEXT;

  /**
   * Checks if this render path handles the given data and render options.
   *
   * @param data - Loaded dataset
   * @param options - Attachment options
   * @returns boolean indicating if this path matches
   */
  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'ecg' && options.renderMode === 'signal2d';
  }

  /**
   * Creates a new instance of CanvasECGRenderPath.
   *
   * @returns New CanvasECGRenderPath instance
   */
  createRenderPath() {
    return new CanvasECGRenderPath();
  }
}

/**
 * Resolves the effective 2D transform ratio and pixel offsets for canvas rendering.
 */
function getEffectiveTransform(
  metrics: RenderWindowMetrics,
  camera: ECGViewState | undefined,
  canvas: HTMLCanvasElement
): { effectiveRatio: number; xOffset: number; yOffset: number } {
  const mapping = resolveECGCanvasMapping({
    metrics,
    camera,
    canvas,
  });

  return {
    effectiveRatio: mapping.effectiveRatio,
    xOffset: mapping.xOffset,
    yOffset: mapping.yOffset,
  };
}

/**
 * Executes a full canvas render pass for an ECG frame, including background,
 * grid lines, baselines, and waveform traces.
 */
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
    traceRegions: currentDataPresentation?.traceRegions,
  }) as RenderWindowMetrics;
  const layouts = computeECGChannelLayouts({
    visibleChannels,
    channelScale: metrics.channelScale,
  });
  const timeWindow = computeECGTimeWindow(waveform, currentCamera);
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
    ecgHeight: metrics.ecgHeight,
    channelScale: metrics.channelScale,
    startIndex: timeWindow.startIndex,
    endIndex: timeWindow.endIndex,
    lineWidth: currentDataPresentation?.lineWidth,
    amplitudeScale: currentDataPresentation?.amplitudeScale,
    traceRegions: currentDataPresentation?.traceRegions,
    channels: waveform.channels,
    numberOfSamples: waveform.numberOfSamples,
    visibleChannels: currentDataPresentation?.visibleChannels,
  });

  canvasContext.resetTransform();
  canvasContext.globalAlpha = 1;

  triggerEvent(ecgCtx.element, EVENTS.IMAGE_RENDERED, {
    element: ecgCtx.element,
    viewportId: ecgCtx.viewportId,
    renderingEngineId: ecgCtx.renderingEngineId,
    rendering: ecgRendering,
  });
}
