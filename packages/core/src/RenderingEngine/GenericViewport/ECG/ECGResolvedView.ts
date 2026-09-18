import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGChannelLayouts,
  getVisibleECGChannelEntries,
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
  ECGDataPresentation,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportTypes';

type ECGResolvedViewState = {
  viewState: ECGViewState;
  canvas: HTMLCanvasElement;
  dataPresentation?: ECGDataPresentation;
  frameOfReferenceUID: string;
  metrics: RenderWindowMetrics;
  waveform: ECGWaveformPayload;
};

/**
 * Computes coordinate transforms and resolved state for ECG viewport rendering.
 */
class ECGResolvedView extends ResolvedViewportView<ECGResolvedViewState> {
  private cachedCanvasMapping?: ECGCanvasMapping;
  private cachedChannelLayouts?: ReturnType<
    ECGResolvedView['computeChannelLayouts']
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
   * Converts a canvas-space point into 3D world-space coordinates.
   * @param canvasPos - Point in canvas space [x, y].
   * @returns 3D world point `[sampleIndex, amplitude, leadIndex]`. The sample
   * index is global, so it does not depend on the layout cell. The lead index
   * identifies the layout cell; see {@link ECGChannelLayout.leadIndex}.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.getChannelLayouts();
    const subCanvasPos: Point2 = [
      (canvasPos[0] - mapping.xOffset) / mapping.effectiveRatio,
      (canvasPos[1] - mapping.yOffset) / mapping.effectiveRatio,
    ];

    // Find the layout cell containing the coordinates
    let layout = channelLayouts.find((item) => {
      const xStart = item.xOffset ?? 0;
      const xEnd = xStart + (item.width ?? this.state.metrics.ecgWidth);
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
      // Pick nearest layout by vertical distance to center line
      layout = channelLayouts.reduce((nearest, item) => {
        const itemCenterY = item.yOffset - item.itemHeight / 2;
        const nearestCenterY = nearest.yOffset - nearest.itemHeight / 2;
        return Math.abs(subCanvasPos[1] - itemCenterY) <
          Math.abs(subCanvasPos[1] - nearestCenterY)
          ? item
          : nearest;
      }, channelLayouts[0]);
    }

    if (!layout) {
      return [0, 0, 0];
    }

    const xOffset = layout.xOffset ?? 0;
    const width = layout.width ?? this.state.metrics.ecgWidth;
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
      (layout.baseline - subCanvasPos[1]) / this.state.metrics.channelScale,
      leadIndex,
    ];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.getChannelLayouts();
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
    const width = layout.width ?? this.state.metrics.ecgWidth;

    const sampleFraction =
      (worldPos[0] - startSample) / (endSample - startSample || 1);
    const canvasX = xOffset + sampleFraction * width;

    return [
      canvasX * mapping.effectiveRatio + mapping.xOffset,
      (layout.baseline - worldPos[1] * this.state.metrics.channelScale) *
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
      metrics: this.state.metrics,
    });

    return this.cachedCanvasMapping;
  }

  private getChannelLayouts() {
    // The layout is stable for one resolved view, so compute it once. A tool
    // that converts many annotation handles calls canvasToWorld and
    // worldToCanvas repeatedly, and each call needs the same layout.
    this.cachedChannelLayouts ||= this.computeChannelLayouts();

    return this.cachedChannelLayouts;
  }

  private computeChannelLayouts() {
    const entries = getVisibleECGChannelEntries(
      this.state.waveform.channels,
      this.state.dataPresentation?.visibleChannels
    );

    return computeECGChannelLayouts({
      visibleChannels: entries.map((entry) => entry.channel),
      leadIndices: entries.map((entry) => entry.channelIndex),
      channelCount: this.state.waveform.channels.length,
      channelScale: this.state.metrics.channelScale,
      layoutType: this.state.dataPresentation?.layoutType ?? '12x1',
      numberOfSamples: this.state.waveform.numberOfSamples,
      ecgWidth: this.state.metrics.ecgWidth,
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
