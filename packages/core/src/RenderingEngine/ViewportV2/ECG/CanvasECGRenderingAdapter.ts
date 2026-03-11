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
import type { Point2, Point3 } from '../../../types';
import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type {
  ECGCamera,
  ECGCanvasRenderContext,
  ECGCanvasRendering,
  ECGPresentationProps,
  ECGProperties,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportV2Types';

export class CanvasECGRenderingAdapter
  implements RenderingAdapter<ECGCanvasRenderContext>
{
  async attach(
    ctx: ECGCanvasRenderContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<ECGCanvasRendering> {
    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      renderMode: 'signal2d',
      runtime: {
        canvas: ctx.canvas,
        canvasContext: ctx.canvasContext,
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
    _ctx: ECGCanvasRenderContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const ecgRendering = rendering as ECGCanvasRendering;
    ecgRendering.runtime.currentPresentation = props as
      | ECGPresentationProps
      | undefined;
  }

  updateCamera(
    _ctx: ECGCanvasRenderContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const ecgRendering = rendering as ECGCanvasRendering;
    ecgRendering.runtime.currentCamera = camera as ECGCamera;
  }

  updateProperties(
    _ctx: ECGCanvasRenderContext,
    rendering: MountedRendering,
    presentation: unknown
  ): void {
    const ecgRendering = rendering as ECGCanvasRendering;
    ecgRendering.runtime.currentProperties = presentation as
      | ECGProperties
      | undefined;
  }

  canvasToWorld(
    _ctx: ECGCanvasRenderContext,
    rendering: MountedRendering,
    canvasPos: Point2
  ): Point3 {
    const ecgRendering = rendering as ECGCanvasRendering;
    const { waveform, metrics } = ecgRendering.runtime;
    const layouts = getChannelLayouts(ecgRendering);
    const scale = metrics.worldToCanvasRatio || 1;
    const subCanvasPos: Point2 = [
      (canvasPos[0] - metrics.xOffsetCanvas) / scale,
      (canvasPos[1] - metrics.yOffsetCanvas) / scale,
    ];
    let z = 0;

    for (let i = 0; i < layouts.length; i++) {
      const layout = layouts[i];

      if (subCanvasPos[1] <= layout.yOffset) {
        z = i;
        break;
      }

      if (i === layouts.length - 1) {
        z = i;
      }
    }

    const layout = layouts[z];

    return [
      Math.max(
        0,
        Math.min(
          waveform.numberOfSamples - 1,
          (subCanvasPos[0] * waveform.numberOfSamples) / metrics.ecgWidth
        )
      ),
      (layout.baseline - subCanvasPos[1]) / metrics.channelScale,
      z,
    ];
  }

  worldToCanvas(
    _ctx: ECGCanvasRenderContext,
    rendering: MountedRendering,
    worldPos: Point3
  ): Point2 {
    const ecgRendering = rendering as ECGCanvasRendering;
    const { waveform, metrics } = ecgRendering.runtime;
    const layouts = getChannelLayouts(ecgRendering);
    const z = Math.round(worldPos[2]);

    if (z < 0 || z >= layouts.length) {
      return [0, 0];
    }

    const layout = layouts[z];

    return [
      (worldPos[0] / waveform.numberOfSamples) *
        metrics.ecgWidth *
        metrics.worldToCanvasRatio +
        metrics.xOffsetCanvas,
      (layout.baseline - worldPos[1] * metrics.channelScale) *
        metrics.worldToCanvasRatio +
        metrics.yOffsetCanvas,
    ];
  }

  getFrameOfReferenceUID(ctx: ECGCanvasRenderContext): string | undefined {
    return `ecg-viewport-${ctx.viewportId}`;
  }

  render(ctx: ECGCanvasRenderContext, rendering: MountedRendering): void {
    drawFrame(ctx, rendering as ECGCanvasRendering);
  }

  detach(_ctx: ECGCanvasRenderContext, _rendering: MountedRendering): void {
    // Canvas lifecycle is owned by the viewport element.
  }
}

export class CanvasECGPath
  implements RenderPathDefinition<ECGCanvasRenderContext>
{
  readonly id = 'ecg:canvas-signal';
  readonly type = 'ecg' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'ecg' && options.renderMode === 'signal2d';
  }

  createAdapter() {
    return new CanvasECGRenderingAdapter();
  }
}

function getChannelLayouts(rendering: ECGCanvasRendering) {
  const visibleChannels = getVisibleECGChannels(
    rendering.runtime.waveform.channels,
    rendering.runtime.currentPresentation?.visibleChannels
  );

  return computeECGChannelLayouts({
    visibleChannels,
    channelScale: rendering.runtime.metrics.channelScale,
  });
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
  ecgRendering: ECGCanvasRendering
): void {
  const {
    canvas,
    canvasContext,
    waveform,
    currentCamera,
    currentProperties,
    currentPresentation,
  } = ecgRendering.runtime;

  if (!currentCamera) {
    return;
  }

  const ecgProps = {
    ...currentProperties,
    ...currentPresentation,
  };
  const visibleChannels = getVisibleECGChannels(
    waveform.channels,
    currentPresentation?.visibleChannels
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

  ecgRendering.runtime.metrics = metrics;

  canvasContext.resetTransform();
  canvasContext.fillStyle = '#000000';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);

  if (currentPresentation?.visible === false) {
    return;
  }

  canvasContext.globalAlpha = currentPresentation?.opacity ?? 1;
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
    rendering: ecgRendering,
  });
}
