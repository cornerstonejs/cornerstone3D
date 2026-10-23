import { Events as EVENTS, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  drawECGGrid,
  drawECGLabels,
  drawECGTraces,
  ensureECGCanvasSize,
} from './ecgDrawing';
import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type {
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGDataPresentation,
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
   * @param _data - ECG waveform dataset payload. The resolved view reads it.
   * @param _options - Additional attachment options.
   * @returns Promise resolving to the render path attachment descriptor.
   */
  async addData(
    ctx: ECGCanvasRenderContext,
    _data: LoadedData,
    _options: DataAddOptions
  ): Promise<RenderPathAttachment<ECGDataPresentation>> {
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
        drawFrame(ctx);
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

function drawFrame(ecgCtx: ECGCanvasRenderContext): void {
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
      sensitivityMmMv: viewState.sensitivityMmMv,
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
    lineWidth: dataPresentation?.lineWidth,
    amplitudeScale: resolvedView.amplitudeScale,
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
