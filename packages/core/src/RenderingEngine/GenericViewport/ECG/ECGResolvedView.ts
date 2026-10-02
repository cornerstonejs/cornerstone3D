import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGChannelLayouts,
  computeECGRenderMetrics,
  getVisibleECGChannelEntries,
  type ECGChannelLayout,
  type ECGRenderMetrics,
} from '../../../utilities/ECGUtilities';
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

/**
 * Owns the world geometry of one ECG frame, and the transforms between world
 * space and canvas space.
 *
 * The snapshot derives everything from the data, the canvas geometry and the
 * view state, which is what the view ownership contract asks of a resolved view
 * (see ViewportArchitectureTypes). The render metrics and the channel layouts
 * are part of that geometry, so this class computes them, and
 * `CanvasECGRenderPath` reads them back. The render path previously computed
 * the metrics itself and wrote them onto the mounted rendering, so a transform
 * answered with the geometry of the previous frame, and answered with a
 * placeholder before the first frame.
 *
 * Every derived value is cached, because one instance describes one frame and
 * the state is frozen.
 */
class ECGResolvedView extends ResolvedViewportView<ECGResolvedViewState> {
  private cachedCanvasMapping?: ECGCanvasMapping;
  private cachedChannelLayouts?: ECGChannelLayout<ECGChannelData>[];
  private cachedMetrics?: ECGRenderMetrics;
  private cachedVisibleEntries?: ReturnType<
    typeof getVisibleECGChannelEntries<ECGChannelData>
  >;

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
    this.cachedMetrics ||= computeECGRenderMetrics({
      canvas: this.state.canvas,
      visibleChannels: this.getVisibleChannels(),
      windowMs: Math.max(
        1,
        this.state.viewState.timeRange[1] - this.state.viewState.timeRange[0]
      ),
      valueRange: this.state.viewState.valueRange,
      sweepSpeed: this.state.dataPresentation?.sweepSpeed,
      sensitivityMmMv: this.state.dataPresentation?.sensitivityMmMv,
      layoutType: this.layoutType,
    });

    return this.cachedMetrics;
  }

  /** Layout cell of each visible lead, in the order that the grid fills. */
  get channelLayouts(): ECGChannelLayout<ECGChannelData>[] {
    // The layout is stable for one resolved view, so compute it once. A tool
    // that converts many annotation handles calls canvasToWorld and
    // worldToCanvas repeatedly, and each call needs the same layout.
    this.cachedChannelLayouts ||= this.computeChannelLayouts();

    return this.cachedChannelLayouts;
  }

  /** Lead arrangement that this frame draws. */
  get layoutType() {
    return this.state.dataPresentation?.layoutType ?? '12x1';
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
      const xStart = item.xOffset ?? 0;
      const xEnd = xStart + (item.width ?? this.metrics.ecgWidth);
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

    const xOffset = layout.xOffset ?? 0;
    const width = layout.width ?? this.metrics.ecgWidth;
    const startSample = layout.startSample ?? 0;
    const endSample = layout.endSample ?? this.state.waveform.numberOfSamples;
    const leadIndex = layout.leadIndex ?? channelLayouts.indexOf(layout);

    const fraction = (subCanvasPos[0] - xOffset) / (width || 1);
    const sampleIndex = startSample + fraction * (endSample - startSample);

    return [
      Math.max(
        0,
        Math.min(this.state.waveform.numberOfSamples - 1, sampleIndex)
      ),
      (layout.baseline - subCanvasPos[1]) / this.metrics.channelScale,
      leadIndex,
    ];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.channelLayouts;
    const z = Math.round(worldPos[2]);

    // `leadIndex` identifies one layout cell without ambiguity: a grid cell
    // carries the index of its channel in the unfiltered channel list, and the
    // `3x4+1` rhythm strip carries its own synthetic index. A search by
    // position in the layout array would select the wrong cell, because the
    // array holds only the visible leads.
    const layout = channelLayouts.find((item) => item.leadIndex === z);

    if (!layout) {
      return [0, 0];
    }

    const startSample = layout.startSample ?? 0;
    const endSample = layout.endSample ?? this.state.waveform.numberOfSamples;
    const xOffset = layout.xOffset ?? 0;
    const width = layout.width ?? this.metrics.ecgWidth;

    const sampleFraction =
      (worldPos[0] - startSample) / (endSample - startSample || 1);
    const canvasX = xOffset + sampleFraction * width;

    return [
      canvasX * mapping.effectiveRatio + mapping.xOffset,
      (layout.baseline - worldPos[1] * this.metrics.channelScale) *
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
    const xStart = layout.xOffset ?? 0;
    const xEnd = xStart + (layout.width ?? this.metrics.ecgWidth);
    const yStart = layout.yOffset - layout.itemHeight;
    const yEnd = layout.yOffset;
    const dx = Math.max(xStart - point[0], 0, point[0] - xEnd);
    const dy = Math.max(yStart - point[1], 0, point[1] - yEnd);

    return dx * dx + dy * dy;
  }

  /**
   * Returns the visible channels together with their index in the unfiltered
   * channel list. The metrics and the layout both need the same selection, so
   * the filter runs once.
   */
  private getVisibleEntries() {
    this.cachedVisibleEntries ||= getVisibleECGChannelEntries(
      this.state.waveform.channels,
      this.state.dataPresentation?.visibleChannels
    );

    return this.cachedVisibleEntries;
  }

  private getVisibleChannels(): ECGChannelData[] {
    return this.getVisibleEntries().map((entry) => entry.channel);
  }

  private computeChannelLayouts(): ECGChannelLayout<ECGChannelData>[] {
    const entries = this.getVisibleEntries();

    return computeECGChannelLayouts({
      visibleChannels: entries.map((entry) => entry.channel),
      leadIndices: entries.map((entry) => entry.channelIndex),
      channelCount: this.state.waveform.channels.length,
      channelScale: this.metrics.channelScale,
      layoutType: this.layoutType,
      numberOfSamples: this.state.waveform.numberOfSamples,
      ecgWidth: this.metrics.ecgWidth,
    });
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
