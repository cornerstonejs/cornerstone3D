import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGRenderMetrics,
  type ECGCanvasSize,
  type ECGChannelLayout,
  type ECGRenderMetrics,
} from './ecgGeometry';
import {
  hasViewTimeRegion,
  resolveECGTraceCells,
  findECGLayoutForZ,
  findECGLayoutsForLead,
  type ECGLeadGroup,
  resolveDefaultECGTraceLayout,
  resolveECGTraceLayout,
  type ECGTraceCell,
} from './ecgTraceLayouts';
import { getECGChannelMvPerUnit } from './ecgWaveform';
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
  ECGDisplaySetAppearance,
  ECGTraceLayoutDefinition,
  ECGWaveformPayload,
} from './ECGViewportTypes';

type ECGResolvedViewState = {
  viewState: ECGViewState;
  /** The sizes of the canvas that the frame is laid out on. */
  canvas: ECGCanvasSize;
  /**
   * The height over the width of the canvas whose height the traces fill
   * without a sensitivity: the shape that the view was fitted at. The shape
   * of `canvas` when not given.
   */
  layoutAspect?: number;
  appearance?: ECGDisplaySetAppearance;
  frameOfReferenceUID: string;
  waveform: ECGWaveformPayload;
  /**
   * The region of the layout cell that the user last clicked in. A point
   * that two cells of its lead hold is drawn in this cell.
   */
  preferredRegionIndex?: number;
  /**
   * The region of the cell that an annotation was given for each of its
   * points; see {@link ECGResolvedView.findLayoutsForPoints}.
   */
  pointRegions?: WeakMap<Point3, number>;
};

/** Canvas transform that the render path applies before it draws. */
export type ECGCanvasTransform = {
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
   * The canvas pixels of one unit of the world of the trace layout, the
   * space of the `anchorWorld` of the view state, with the zoom of the view.
   */
  get worldToCanvasRatio(): number {
    return this.getCanvasMapping().effectiveRatio;
  }

  /**
   * World geometry of this frame: the world size, the amplitude scale and the
   * pixels for each second. The render path draws with these values.
   */
  get metrics(): ECGRenderMetrics {
    return this.getGeometry().metrics;
  }

  /**
   * The name of the layout that the view shows: the name in the view state,
   * else the default name for the waveform. Undefined for a full definition.
   */
  get traceLayoutName(): string | undefined {
    const { traceLayout } = this.state.viewState;

    if (traceLayout !== undefined && typeof traceLayout !== 'string') {
      return;
    }
    return (
      (traceLayout as string | undefined) ??
      resolveDefaultECGTraceLayout(this.traceLayoutContext)
    );
  }

  private get traceLayoutContext() {
    const { channels, numberOfSamples, samplingFrequency } =
      this.state.waveform;

    return { channels, numberOfSamples, samplingFrequency };
  }

  /** The trace layout definition, with a registered name resolved. */
  get traceLayout(): ECGTraceLayoutDefinition {
    this.cachedDefinition ||= resolveECGTraceLayout(
      this.state.viewState.traceLayout,
      this.traceLayoutContext
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
      group: this.leadGroup,
    });

    return this.cachedCells;
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
  /** 1 with a set sensitivity, which is the clinical gain (ECG-U-1). */
  get amplitudeScale(): number {
    const { amplitudeScale: scale, sensitivityMmMv } = this.state.viewState;

    return scale > 0 && !(sensitivityMmMv > 0) ? scale : 1;
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
   * The area of the canvas in layout units. The grid covers this area, so the
   * paper fills the canvas at the one scale of {@link canvasTransform}.
   */
  get canvasBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const { effectiveRatio, xOffset, yOffset, canvasWidth, canvasHeight } =
      this.getCanvasMapping();

    return {
      minX: -xOffset / effectiveRatio,
      minY: -yOffset / effectiveRatio,
      maxX: (canvasWidth - xOffset) / effectiveRatio,
      maxY: (canvasHeight - yOffset) / effectiveRatio,
    };
  }

  /** The multiplex group of the waveform, for world Z; see `getECGLeadZ`. */
  get leadGroup(): ECGLeadGroup {
    const { multiplexGroupIndex = 0, numberOfMultiplexGroups = 1 } =
      this.state.waveform;

    return { index: multiplexGroupIndex, count: numberOfMultiplexGroups };
  }

  /** The layout of world Z, or undefined; see `findECGLayoutForZ`. */
  findLayoutForZ(z: number): ECGChannelLayout<ECGChannelData> | undefined {
    return findECGLayoutForZ(this.channelLayouts, z, this.leadGroup);
  }

  /**
   * The cell that draws a world point: the cell kept for the point in
   * `pointRegions` while it still holds the sample, else a cell of the lead
   * whose time window holds the sample (see {@link pickLayout}). With no such
   * cell, the cell of world Z, as `findLayoutForZ` gives it.
   */
  findLayoutForPoint(
    worldPos: Point3
  ): ECGChannelLayout<ECGChannelData> | undefined {
    const z = Math.round(worldPos[2]);
    const holding = this.getLayoutsOfLead(z).filter((layout) =>
      this.holdsSample(layout, worldPos[0])
    );
    const keptRegion = this.state.pointRegions?.get(worldPos);
    const kept = holding.find((layout) => layout.regionIndex === keptRegion);

    return kept ?? this.pickLayout(holding) ?? this.findLayoutForZ(z);
  }

  /**
   * The cell for each point of an annotation, or undefined when the
   * annotation does not show. The points of one lead all go to one cell of
   * that lead whose time window holds every one of their samples (see
   * {@link pickLayout}). When no cell of a lead holds them all, the
   * annotation does not show.
   */
  findLayoutsForPoints(
    points: Point3[]
  ): Map<Point3, ECGChannelLayout<ECGChannelData>> | undefined {
    const byLead = new Map<number, Point3[]>();

    points.forEach((point) => {
      const z = Math.round(point[2]);
      byLead.set(z, [...(byLead.get(z) ?? []), point]);
    });

    const result = new Map<Point3, ECGChannelLayout<ECGChannelData>>();

    for (const [z, leadPoints] of byLead) {
      const layout = this.pickLayout(
        this.getLayoutsOfLead(z).filter((item) =>
          leadPoints.every((point) => this.holdsSample(item, point[0]))
        )
      );

      if (!layout) {
        return;
      }
      leadPoints.forEach((point) => result.set(point, layout));
    }

    return result;
  }

  /**
   * The layout cell under a canvas point, else the nearest cell. Undefined
   * when the layout has no cell.
   */
  findLayoutAtCanvasPoint(
    canvasPos: Point2
  ): ECGChannelLayout<ECGChannelData> | undefined {
    return this.findLayoutAtSubCanvasPoint(this.toSubCanvas(canvasPos));
  }

  /**
   * Converts a canvas-space point into 3D world-space coordinates.
   * @param canvasPos - Point in canvas space [x, y].
   * @returns 3D world point `[sampleIndex, amplitude, leadIndex]`. The
   * amplitude is in raw units of the first channel. The sample
   * index is global, so it does not depend on the layout cell. The lead index
   * identifies the layout cell; see {@link ECGChannelLayout.leadIndex}.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const world = this.canvasToWorldUnclamped(canvasPos);
    world[0] = Math.max(
      0,
      Math.min(this.state.waveform.numberOfSamples - 1, world[0])
    );
    return world;
  }

  /**
   * As {@link canvasToWorld}, but the sample index can be outside the record.
   * The camera uses it, so that `setCamera(getCamera())` keeps the pan.
   */
  private canvasToWorldUnclamped(canvasPos: Point2): Point3 {
    const subCanvasPos = this.toSubCanvas(canvasPos);
    const layout = this.findLayoutAtSubCanvasPoint(subCanvasPos);

    if (!layout) {
      return [0, 0, 0];
    }

    const { xOffset, width, startSample, endSample, leadIndex } = layout;

    const fraction = (subCanvasPos[0] - xOffset) / (width || 1);
    const sampleIndex = startSample + fraction * (endSample - startSample);

    const effectiveChannelScale = this.getDrawnScale(layout);

    return [
      sampleIndex,
      (layout.baseline - subCanvasPos[1]) / effectiveChannelScale,
      leadIndex,
    ];
  }

  /**
   * Converts a world point to the canvas, in the cell that
   * {@link findLayoutForPoint} gives for it.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();
    const layout = this.findLayoutForPoint(worldPos);

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
      focalPoint: this.canvasToWorldUnclamped(canvasCenter),
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale:
        this.state.canvas.clientHeight /
        2 /
        Math.max(mapping.effectiveRatio, 0.001),
      viewPlaneNormal: [0, 0, 1],
    };
  }

  /**
   * The cells of the lead of world Z, the copy of Z first; see
   * `findECGLayoutsForLead`.
   */
  private getLayoutsOfLead(z: number): ECGChannelLayout<ECGChannelData>[] {
    return findECGLayoutsForLead(this.channelLayouts, z, this.leadGroup);
  }

  /**
   * Picks one of the cells that can draw a point: the cell that the user
   * last clicked in, else the first one, which is the copy of world Z when it
   * is one of them.
   */
  private pickLayout(
    layouts: ECGChannelLayout<ECGChannelData>[]
  ): ECGChannelLayout<ECGChannelData> | undefined {
    return (
      layouts.find(
        (layout) => layout.regionIndex === this.state.preferredRegionIndex
      ) ?? layouts[0]
    );
  }

  /**
   * True when a cell can draw the sample: its time window holds the sample,
   * ends included, or the cell follows the time window of the view, where a
   * sample out of the window is only scrolled away, as by a pan.
   */
  private holdsSample(
    layout: ECGChannelLayout<ECGChannelData>,
    sample: number
  ): boolean {
    const time = this.traceLayout.regions[layout.regionIndex]?.time ?? 'view';

    return (
      time === 'view' ||
      (sample >= layout.startSample && sample <= layout.endSample)
    );
  }

  private toSubCanvas(canvasPos: Point2): Point2 {
    const mapping = this.getCanvasMapping();

    return [
      (canvasPos[0] - mapping.xOffset) / mapping.effectiveRatio,
      (canvasPos[1] - mapping.yOffset) / mapping.effectiveRatio,
    ];
  }

  /**
   * The layout cell whose rectangle holds a point in layout units, else the
   * nearest cell by the distance to its rectangle in both axes.
   */
  private findLayoutAtSubCanvasPoint(
    subCanvasPos: Point2
  ): ECGChannelLayout<ECGChannelData> | undefined {
    const channelLayouts = this.channelLayouts;
    const layout = channelLayouts.find(
      (item) => this.getDistanceToCell(subCanvasPos, item) === 0
    );

    if (layout || !channelLayouts.length) {
      return layout;
    }

    return channelLayouts.reduce(
      (nearest, item) =>
        this.getDistanceToCell(subCanvasPos, item) <
        this.getDistanceToCell(subCanvasPos, nearest)
          ? item
          : nearest,
      channelLayouts[0]
    );
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

  /**
   * Canvas world units for each world Y unit, as the trace is drawn. World Y
   * is in raw units of the first channel, so that the one CALIBRATION region
   * (which uses the first channel's sensitivity) gives the correct mV on a lead
   * with a different sensitivity.
   */
  private getDrawnScale(layout: ECGChannelLayout<ECGChannelData>): number {
    const firstChannel = this.state.waveform.channels[0];
    const unitRatio = firstChannel
      ? getECGChannelMvPerUnit(layout.channel) /
        getECGChannelMvPerUnit(firstChannel)
      : 1;
    return (layout.channelScale * this.amplitudeScale) / unitRatio;
  }

  private getGeometry() {
    this.cachedGeometry ||= computeECGRenderMetrics({
      canvas: this.state.canvas,
      cells: this.traceCells,
      numberOfSamples: this.state.waveform.numberOfSamples,
      samplingFrequency: this.state.waveform.samplingFrequency,
      sweepSpeed: this.state.viewState.sweepSpeed,
      sensitivityMmMv: this.state.viewState.sensitivityMmMv,
      layoutAspect: this.state.layoutAspect,
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
