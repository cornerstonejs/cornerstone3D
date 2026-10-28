import { Events as EVENTS, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  drawECGGrid,
  drawECGLabels,
  drawECGTraces,
  ensureECGCanvasSize,
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
} from './ECGViewportTypes';
import type ECGResolvedView from './ECGResolvedView';

/**
 * Render path that draws the ECG grid, the channel labels and the traces on a
 * 2D canvas.
 *
 * The render path owns the drawing only. `ECGResolvedView` owns the world
 * geometry: the render metrics, the channel layouts and the canvas transform.
 * The render path reads all three through `ctx.getResolvedView()`, so the
 * transform that a tool uses and the geometry that the frame draws are always
 * the same values.
 *
 * @internal
 */
export class CanvasECGRenderPath implements RenderPath<ECGCanvasRenderContext> {
  /**
   * Adds an ECG dataset payload to the render path attachment list.
   * @param ctx - Canvas rendering context.
   * @param data - ECG waveform dataset payload.
   * @param _options - Additional attachment options.
   * @returns Promise resolving to the render path attachment descriptor.
   */
  async addData(
    ctx: ECGCanvasRenderContext,
    data: LoadedData,
    _options: DataAddOptions
  ): Promise<RenderPathAttachment<ECGDataPresentation>> {
    const waveform = data as unknown as LoadedData<ECGWaveformPayload>;

    const rendering: ECGCanvasRendering = {
      renderMode: 'signal2d',
      canvas: ctx.canvas,
      canvasContext: ctx.canvasContext,
    };

    return {
      rendering,
      updateDataPresentation: () => {
        // The viewport stores the presentation, and the resolved view reads it.
        // A copy here would be a second source of truth for the geometry.
      },
      applyViewState: () => {
        // The viewport owns the view state. The canvas redraws in full for each
        // frame, so there is no incremental state to apply.
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(ctx);
      },
      render: () => {
        drawFrame(ctx, waveform);
      },
      removeData: () => {
        this.removeData();
      },
    };
  }

  private getFrameOfReferenceUID(
    ctx: ECGCanvasRenderContext
  ): string | undefined {
    return `ecg-viewport-${ctx.viewportId}`;
  }

  private removeData(): void {
    // Canvas lifecycle is owned by the viewport element.
  }
}

/** @internal */
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

/**
 * Returns the sample range that the view state selects, clamped to the signal.
 */
function computeTimeWindow(
  waveform: ECGWaveformPayload,
  camera: ECGViewState
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
  waveform: ECGWaveformPayload
): void {
  const { canvas, canvasContext } = ecgCtx;

  ensureECGCanvasSize(canvas);

  // The resolved view is the single owner of the geometry of this frame. It is
  // absent only while no waveform is mounted, and then there is nothing to
  // draw.
  const resolvedView: ECGResolvedView | undefined = ecgCtx.getResolvedView();

  if (!resolvedView) {
    return;
  }

  const viewState = resolvedView.state.viewState;
  const dataPresentation = resolvedView.state.dataPresentation;
  const metrics = resolvedView.metrics;
  const layouts = resolvedView.channelLayouts;
  const { effectiveRatio, xOffset, yOffset } = resolvedView.canvasTransform;
  const timeWindow = computeTimeWindow(waveform, viewState);
  const dpr = window.devicePixelRatio || 1;

  canvasContext.resetTransform();
  canvasContext.fillStyle = '#000000';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);

  if (dataPresentation?.visible === false) {
    return;
  }

  canvasContext.globalAlpha = dataPresentation?.opacity ?? 1;
  canvasContext.setTransform(
    effectiveRatio * dpr,
    0,
    0,
    effectiveRatio * dpr,
    xOffset * dpr,
    yOffset * dpr
  );

  drawECGGrid(
    canvasContext,
    {
      // `metrics` already carries `pxPerSecond` and the resolved `sweepSpeed`
      // that produced it, so the grid and the trace width stay in agreement.
      ...metrics,
      sensitivityMmMv: dataPresentation?.sensitivityMmMv,
      showAmplitudeLabels: dataPresentation?.showAmplitudeLabels,
    },
    {
      showGrid: dataPresentation?.showGrid,
    },
    layouts
  );
  drawECGTraces({
    ctx: canvasContext,
    layouts,
    ecgWidth: metrics.ecgWidth,
    channelScale: metrics.channelScale,
    startIndex: timeWindow.startIndex,
    endIndex: timeWindow.endIndex,
    lineWidth: dataPresentation?.lineWidth,
    amplitudeScale: dataPresentation?.amplitudeScale,
  });
  drawECGLabels(canvasContext, layouts, metrics.worldToCanvasRatio);

  canvasContext.resetTransform();
  canvasContext.globalAlpha = 1;

  triggerEvent(ecgCtx.element, EVENTS.IMAGE_RENDERED, {
    element: ecgCtx.element,
    viewportId: ecgCtx.viewportId,
    renderingEngineId: ecgCtx.renderingEngineId,
    resolvedView,
  });
}
