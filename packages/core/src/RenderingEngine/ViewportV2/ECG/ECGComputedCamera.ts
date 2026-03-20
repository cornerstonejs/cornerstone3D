import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGChannelLayouts,
  getVisibleECGChannels,
} from '../../../utilities/ECGUtilities';
import ViewportComputedCamera from '../ViewportComputedCamera';
import {
  getAnchorWorldForCanvasPoint,
  getAnchorWorldForPan,
  getECGCameraLayout,
  getPanForECGLayout,
  type ECGCameraLayout,
} from './ecgViewportCamera';
import type {
  ECGCamera,
  ECGDataPresentation,
  ECGWaveformPayload,
  RenderWindowMetrics,
} from './ECGViewportV2Types';

type ECGComputedCameraState = {
  camera: ECGCamera;
  canvas: HTMLCanvasElement;
  dataPresentation?: ECGDataPresentation;
  frameOfReferenceUID: string;
  metrics: RenderWindowMetrics;
  waveform: ECGWaveformPayload;
};

class ECGComputedCamera extends ViewportComputedCamera<ECGComputedCameraState> {
  private cachedLayout?: ECGCameraLayout;

  get zoom(): number {
    return Math.max(this.state.camera.scale ?? 1, 0.001);
  }

  get pan(): Point2 {
    return getPanForECGLayout(this.getLayout());
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    const layout = this.getLayout();
    const channelLayouts = this.getChannelLayouts();
    const subCanvasPos: Point2 = [
      (canvasPos[0] - layout.xOffset) / layout.effectiveRatio,
      (canvasPos[1] - layout.yOffset) / layout.effectiveRatio,
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
    const layout = this.getLayout();
    const channelLayouts = this.getChannelLayouts();
    const z = Math.round(worldPos[2]);

    if (z < 0 || z >= channelLayouts.length) {
      return [0, 0];
    }

    return [
      (worldPos[0] / this.state.waveform.numberOfSamples) *
        this.state.metrics.ecgWidth *
        layout.effectiveRatio +
        layout.xOffset,
      (channelLayouts[z].baseline -
        worldPos[1] * this.state.metrics.channelScale) *
        layout.effectiveRatio +
        layout.yOffset,
    ];
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  withZoom(zoom: number, canvasPoint?: Point2): ECGComputedCamera {
    const nextZoom = Math.max(zoom, 0.001);

    if (!canvasPoint) {
      return this.cloneWithCamera({
        ...this.state.camera,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }

    return this.cloneWithCamera({
      ...this.state.camera,
      anchorWorld: getAnchorWorldForCanvasPoint(canvasPoint, this.getLayout()),
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.canvas.clientWidth, 1),
        canvasPoint[1] / Math.max(this.state.canvas.clientHeight, 1),
      ],
      scale: nextZoom,
      scaleMode: 'fit',
    });
  }

  withPan(pan: Point2): ECGComputedCamera {
    return this.cloneWithCamera({
      ...this.state.camera,
      anchorWorld: getAnchorWorldForPan([pan[0], pan[1]], this.getLayout()),
    });
  }

  protected buildICamera(): ICamera {
    const layout = this.getLayout();
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
        Math.max(layout.effectiveRatio, 0.001),
      viewPlaneNormal: [0, 0, 1],
    };
  }

  private getLayout(): ECGCameraLayout {
    this.cachedLayout ||= getECGCameraLayout({
      canvas: this.state.canvas,
      camera: this.state.camera,
      metrics: this.state.metrics,
    });

    return this.cachedLayout;
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

  private cloneWithCamera(camera: ECGCamera): ECGComputedCamera {
    return new ECGComputedCamera({
      ...this.state,
      camera,
    });
  }
}

export type { ECGComputedCameraState };
export default ECGComputedCamera;
