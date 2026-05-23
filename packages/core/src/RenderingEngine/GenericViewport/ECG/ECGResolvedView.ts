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
  ECGCamera,
  ECGDataPresentation,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportTypes';

type ECGResolvedViewState = {
  viewState: ECGCamera;
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
    let z = 0;

    for (let index = 0; index < channelLayouts.length; index++) {
      const channelLayout = channelLayouts[index];

      if (
        subCanvasPos[1] <= channelLayout.yOffset ||
        index === channelLayouts.length - 1
      ) {
        z = index;
        break;
      }
    }

    const channelLayout = channelLayouts[z];

    return [
      Math.max(
        0,
        Math.min(
          this.state.waveform.numberOfSamples - 1,
          (subCanvasPos[0] * this.state.waveform.numberOfSamples) /
            this.state.metrics.ecgWidth
        )
      ),
      (channelLayout.baseline - subCanvasPos[1]) /
        this.state.metrics.channelScale,
      z,
    ];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.getChannelLayouts();
    const z = Math.round(worldPos[2]);

    if (z < 0 || z >= channelLayouts.length) {
      return [0, 0];
    }

    return [
      (worldPos[0] / this.state.waveform.numberOfSamples) *
        this.state.metrics.ecgWidth *
        mapping.effectiveRatio +
        mapping.xOffset,
      (channelLayouts[z].baseline -
        worldPos[1] * this.state.metrics.channelScale) *
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
    });
  }

  private cloneWithViewState(viewState: ECGCamera): ECGResolvedView {
    return new ECGResolvedView({
      ...this.state,
      viewState,
    });
  }
}

export type { ECGResolvedViewState };
export default ECGResolvedView;
