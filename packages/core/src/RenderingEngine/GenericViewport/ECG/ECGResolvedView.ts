import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGChannelLayouts,
  getVisibleECGChannels,
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

class ECGResolvedView extends ResolvedViewportView<ECGResolvedViewState> {
  private cachedCanvasMapping?: ECGCanvasMapping;

  get zoom(): number {
    return Math.max(this.state.viewState.scale ?? 1, 0.001);
  }

  get pan(): Point2 {
    return getPanForECGCanvasMapping(this.getCanvasMapping());
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.getChannelLayouts();
    const subCanvasPos: Point2 = [
      (canvasPos[0] - mapping.xOffset) / mapping.effectiveRatio,
      (canvasPos[1] - mapping.yOffset) / mapping.effectiveRatio,
    ];

    // Find the layout cell containing the coordinates
    const layout =
      channelLayouts.find((item) => {
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
      }) || channelLayouts[0];

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

    const layout =
      channelLayouts.find((item) => item.leadIndex === z) || channelLayouts[z];
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
    return computeECGChannelLayouts({
      visibleChannels: getVisibleECGChannels(
        this.state.waveform.channels,
        this.state.dataPresentation?.visibleChannels
      ),
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
