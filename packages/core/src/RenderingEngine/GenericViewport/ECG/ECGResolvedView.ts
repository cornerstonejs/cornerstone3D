import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGRenderMetrics,
  type ECGChannelLayout,
  type ECGRenderMetrics,
} from './ecgGeometry';
import {
  hasViewTimeRegion,
  resolveECGTraceCells,
  resolveECGTraceLayout,
  type ECGTraceCell,
} from './ecgTraceLayouts';
import ResolvedViewportView from '../ResolvedViewportView';
import {
  getAnchorWorldForCanvasPoint,
  getAnchorWorldForPan,
  resolveECGCanvasMapping,
  getPanForECGCanvasMapping,
  type ECGCanvasMapping,
} from './ecgViewportCamera';
import type {
  ECGViewState,
  ECGChannelData,
  ECGDataPresentation,
  ECGTraceLayoutDefinition,
  ECGWaveformPayload,
} from './ECGViewportTypes';

type ECGResolvedViewState = {
  viewState: ECGViewState;
  canvas: HTMLCanvasElement;
  dataPresentation?: ECGDataPresentation;
  frameOfReferenceUID: string;
  waveform: ECGWaveformPayload;
};

/** Canvas transform that the render path applies before it draws. */
type ECGCanvasTransform = {
  effectiveRatio: number;
  xOffset: number;
  yOffset: number;
};

/** Time window of one frame, in ms and in samples `[startSample, endSample)`. */
type ECGTimeWindow = {
  startMs: number;
  endMs: number;
  startSample: number;
  endSample: number;
};

/**
 * Owns the world geometry of one ECG frame, and the transforms between world
 * space and canvas space.
 *
 * The geometry comes from the data, the canvas geometry and the view state
 * only (GENVIEW-VIEW-2). That geometry includes the time window, the render
 * metrics and the channel layouts. `CanvasECGRenderPath` reads all three from
 * here, so the drawn frame and the transforms always agree.
 *
 * Every derived value is cached, because one instance describes one frame and
 * the state is frozen.
 */
class ECGResolvedView extends ResolvedViewportView<ECGResolvedViewState> {
  private cachedCanvasMapping?: ECGCanvasMapping;
  private cachedGeometry?: {
    metrics: ECGRenderMetrics;
    layouts: ECGChannelLayout<ECGChannelData>[];
  };
  private cachedTimeWindow?: ECGTimeWindow;
  private cachedDefinition?: ECGTraceLayoutDefinition;
  private cachedCells?: ECGTraceCell<ECGChannelData>[];

  /** Gets the current zoom scale factor. */
  get zoom(): number {
    return Math.max(this.state.viewState.scale ?? 1, 0.001);
  }

  /** Gets the current 2D pan offset. */
  get pan(): Point2 {
    return getPanForECGCanvasMapping(this.getCanvasMapping());
  }

  /**
   * World geometry of this frame: the world size, the amplitude scale and the
   * pixels for each second. The render path draws with these values.
   */
  get metrics(): ECGRenderMetrics {
    return this.getGeometry().metrics;
  }

  /** The trace layout definition, with a registered name resolved. */
  get traceLayout(): ECGTraceLayoutDefinition {
    this.cachedDefinition ||= resolveECGTraceLayout(
      this.state.viewState.traceLayout,
      { channels: this.state.waveform.channels }
    );

    return this.cachedDefinition;
  }

  /**
   * The regions of the trace layout, resolved to channels and sample ranges.
   * The hidden regions are included, with `visible` false.
   */
  get traceCells(): ECGTraceCell<ECGChannelData>[] {
    const { startSample, endSample } = this.timeWindow;

    this.cachedCells ||= resolveECGTraceCells({
      definition: this.traceLayout,
      channels: this.state.waveform.channels,
      numberOfSamples: this.state.waveform.numberOfSamples,
      viewSampleWindow: [startSample, endSample],
      visibleChannels: this.state.viewState.visibleChannels,
    });

    return this.cachedCells;
  }

  /** One more than the largest Z of a world point in this layout. */
  get leadIndexCount(): number {
    return this.traceCells.reduce(
      (count, cell) => Math.max(count, cell.leadIndex + 1),
      this.state.waveform.channels.length
    );
  }

  /**
   * Time window that this frame shows: the `timeRange` of the view state,
   * clamped to the record. A layout with no region that follows the view
   * shows the full record.
   */
  get timeWindow(): ECGTimeWindow {
    if (this.cachedTimeWindow) {
      return this.cachedTimeWindow;
    }

    const { numberOfSamples, samplingFrequency } = this.state.waveform;
    const durationMs = (numberOfSamples / samplingFrequency) * 1000;

    if (!hasViewTimeRegion(this.traceLayout)) {
      this.cachedTimeWindow = {
        startMs: 0,
        endMs: durationMs,
        startSample: 0,
        endSample: numberOfSamples,
      };
      return this.cachedTimeWindow;
    }

    const [requestedStart, requestedEnd] = this.state.viewState.timeRange;
    const startMs = Math.max(0, Math.min(requestedStart, durationMs));
    const endMs = Math.max(startMs + 1, Math.min(requestedEnd, durationMs));
    const startSample = Math.max(
      0,
      Math.min(
        numberOfSamples - 1,
        Math.floor((startMs / 1000) * samplingFrequency)
      )
    );
    const endSample = Math.max(
      startSample + 1,
      Math.min(numberOfSamples, Math.ceil((endMs / 1000) * samplingFrequency))
    );

    this.cachedTimeWindow = { startMs, endMs, startSample, endSample };
    return this.cachedTimeWindow;
  }

  /** Multiplier on the drawn amplitude. The transforms apply it too. */
  get amplitudeScale(): number {
    const scale = this.state.viewState.amplitudeScale;

    return scale > 0 ? scale : 1;
  }

  /** World position of each visible region, in the order of the layout. */
  get channelLayouts(): ECGChannelLayout<ECGChannelData>[] {
    return this.getGeometry().layouts;
  }

  /**
   * Scale and offset that map world space to canvas space. The render path
   * passes these values to `setTransform`.
   */
  get canvasTransform(): ECGCanvasTransform {
    const mapping = this.getCanvasMapping();

    return {
      effectiveRatio: mapping.effectiveRatio,
      xOffset: mapping.xOffset,
      yOffset: mapping.yOffset,
    };
  }

  /**
   * Converts a canvas-space point into 3D world-space coordinates.
   * @param canvasPos - Point in canvas space [x, y].
   * @returns 3D world point `[sampleIndex, amplitude, leadIndex]`. The sample
   * index is global, so it does not depend on the layout cell. The lead index
   * identifies the layout cell; see {@link ECGChannelLayout.leadIndex}.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.channelLayouts;
    const subCanvasPos: Point2 = [
      (canvasPos[0] - mapping.xOffset) / mapping.effectiveRatio,
      (canvasPos[1] - mapping.yOffset) / mapping.effectiveRatio,
    ];

    // Find the layout cell containing the coordinates
    let layout = channelLayouts.find((item) => {
      const xStart = item.xOffset;
      const xEnd = xStart + item.width;
      // Row heights are stacked vertically; determine boundaries of this row
      const yStart = item.yOffset - item.itemHeight;
      const yEnd = item.yOffset;
      return (
        subCanvasPos[0] >= xStart &&
        subCanvasPos[0] <= xEnd &&
        subCanvasPos[1] >= yStart &&
        subCanvasPos[1] <= yEnd
      );
    });

    if (!layout && channelLayouts.length > 0) {
      // Pick the nearest cell by the distance to its rectangle, in both axes.
      // A comparison of the vertical distance alone always returned column 0 in
      // a multi-column layout, because every cell of a row shares one vertical
      // distance.
      layout = channelLayouts.reduce(
        (nearest, item) =>
          this.getDistanceToCell(subCanvasPos, item) <
          this.getDistanceToCell(subCanvasPos, nearest)
            ? item
            : nearest,
        channelLayouts[0]
      );
    }

    if (!layout) {
      return [0, 0, 0];
    }

    const { xOffset, width, startSample, endSample, leadIndex } = layout;

    const fraction = (subCanvasPos[0] - xOffset) / (width || 1);
    const sampleIndex = startSample + fraction * (endSample - startSample);

    const effectiveChannelScale = this.getDrawnScale(layout);

    return [
      Math.max(
        0,
        Math.min(this.state.waveform.numberOfSamples - 1, sampleIndex)
      ),
      (layout.baseline - subCanvasPos[1]) / effectiveChannelScale,
      leadIndex,
    ];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.channelLayouts;
    const z = Math.round(worldPos[2]);

    // `leadIndex` identifies one region; see `ECGTraceCell.leadIndex`.
    const layout = channelLayouts.find((item) => item.leadIndex === z);

    if (!layout) {
      return [0, 0];
    }

    const { xOffset, width, startSample, endSample } = layout;

    const sampleFraction =
      (worldPos[0] - startSample) / (endSample - startSample || 1);
    const canvasX = xOffset + sampleFraction * width;

    const effectiveChannelScale = this.getDrawnScale(layout);

    return [
      canvasX * mapping.effectiveRatio + mapping.xOffset,
      (layout.baseline - worldPos[1] * effectiveChannelScale) *
        mapping.effectiveRatio +
        mapping.yOffset,
    ];
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  withZoom(zoom: number, canvasPoint?: Point2): ECGResolvedView {
    const nextZoom = Math.max(zoom, 0.001);

    if (!canvasPoint) {
      return this.cloneWithViewState({
        ...this.state.viewState,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }

    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorWorld: getAnchorWorldForCanvasPoint(
        canvasPoint,
        this.getCanvasMapping()
      ),
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.canvas.clientWidth, 1),
        canvasPoint[1] / Math.max(this.state.canvas.clientHeight, 1),
      ],
      scale: nextZoom,
      scaleMode: 'fit',
    });
  }

  withPan(pan: Point2): ECGResolvedView {
    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorWorld: getAnchorWorldForPan(
        [pan[0], pan[1]],
        this.getCanvasMapping()
      ),
    });
  }

  protected buildICamera(): ICamera {
    const mapping = this.getCanvasMapping();
    const canvasCenter: Point2 = [
      this.state.canvas.clientWidth / 2,
      this.state.canvas.clientHeight / 2,
    ];

    return {
      parallelProjection: true,
      focalPoint: this.canvasToWorld(canvasCenter),
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale:
        this.state.canvas.clientHeight /
        2 /
        Math.max(mapping.effectiveRatio, 0.001),
      viewPlaneNormal: [0, 0, 1],
    };
  }

  private getCanvasMapping(): ECGCanvasMapping {
    this.cachedCanvasMapping ||= resolveECGCanvasMapping({
      canvas: this.state.canvas,
      camera: this.state.viewState,
      metrics: this.metrics,
    });

    return this.cachedCanvasMapping;
  }

  /**
   * Returns the squared distance from a point to the rectangle of a layout
   * cell, in sub-canvas space. The value is 0 when the point is inside the
   * rectangle. The function squares the distance, because the caller only
   * compares two values.
   */
  private getDistanceToCell(
    point: Point2,
    layout: ECGChannelLayout<ECGChannelData>
  ): number {
    const xStart = layout.xOffset;
    const xEnd = xStart + layout.width;
    const yStart = layout.yOffset - layout.itemHeight;
    const yEnd = layout.yOffset;
    const dx = Math.max(xStart - point[0], 0, point[0] - xEnd);
    const dy = Math.max(yStart - point[1], 0, point[1] - yEnd);

    return dx * dx + dy * dy;
  }

  /** World units for each raw amplitude unit, as the trace is drawn. */
  private getDrawnScale(layout: ECGChannelLayout<ECGChannelData>): number {
    return layout.channelScale * this.amplitudeScale;
  }

  private getGeometry() {
    this.cachedGeometry ||= computeECGRenderMetrics({
      canvas: this.state.canvas,
      cells: this.traceCells,
      numberOfSamples: this.state.waveform.numberOfSamples,
      samplingFrequency: this.state.waveform.samplingFrequency,
      sweepSpeed: this.state.viewState.sweepSpeed,
      sensitivityMmMv: this.state.viewState.sensitivityMmMv,
    });

    return this.cachedGeometry;
  }

  private cloneWithViewState(viewState: ECGViewState): ECGResolvedView {
    return new ECGResolvedView({
      ...this.state,
      viewState,
    });
  }
}

export type { ECGResolvedViewState };
export default ECGResolvedView;
