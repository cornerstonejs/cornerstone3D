import type { ICamera, Point2, Point3 } from '../../../types';
import ViewportComputedCamera from '../ViewportComputedCamera';
import {
  getAnchorWorldForPan,
  getPanForVideoLayout,
  getVideoLayout,
  type VideoCameraLayout,
} from './videoViewportCamera';
import type {
  VideoCamera,
  VideoProperties,
  VideoStreamPayload,
} from './VideoViewportNextTypes';

type VideoComputedCameraState = {
  camera: VideoCamera;
  containerHeight: number;
  containerWidth: number;
  frameOfReferenceUID?: string;
  intrinsicHeight: number;
  intrinsicWidth: number;
  objectFit?: VideoProperties['objectFit'];
  payload?: VideoStreamPayload;
};

class VideoComputedCamera extends ViewportComputedCamera<VideoComputedCameraState> {
  private cachedLayout?: VideoCameraLayout;

  get zoom(): number {
    return Math.max(this.state.camera.scale ?? 1, 0.001);
  }

  get pan(): Point2 {
    return this.getLayout() ? getPanForVideoLayout(this.getLayout()) : [0, 0];
  }

  get rotation(): number {
    return this.state.camera.rotation ?? 0;
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    const layout = this.getLayout();

    return [
      (canvasPos[0] - layout.left) / layout.worldToCanvasRatio,
      (canvasPos[1] - layout.top) / layout.worldToCanvasRatio,
      0,
    ];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const layout = this.getLayout();

    return [
      layout.left + worldPos[0] * layout.worldToCanvasRatio,
      layout.top + worldPos[1] * layout.worldToCanvasRatio,
    ];
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  withZoom(zoom: number, canvasPoint?: Point2): VideoComputedCamera {
    const nextZoom = Math.max(zoom, 0.001);

    if (!canvasPoint) {
      return this.cloneWithCamera({
        ...this.state.camera,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }

    const worldPoint = this.canvasToWorld(canvasPoint);

    return this.cloneWithCamera({
      ...this.state.camera,
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.containerWidth, 1),
        canvasPoint[1] / Math.max(this.state.containerHeight, 1),
      ],
      anchorWorld: [worldPoint[0], worldPoint[1]],
      scale: nextZoom,
      scaleMode: 'fit',
    });
  }

  withPan(pan: Point2): VideoComputedCamera {
    return this.cloneWithCamera({
      ...this.state.camera,
      anchorWorld: getAnchorWorldForPan([pan[0], pan[1]], this.getLayout()),
    });
  }

  protected buildICamera(): ICamera {
    const layout = this.getLayout();
    const focalPoint = this.canvasToWorld([
      this.state.containerWidth / 2,
      this.state.containerHeight / 2,
    ]);

    return {
      parallelProjection: true,
      focalPoint,
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale:
        this.state.containerHeight /
        2 /
        Math.max(layout.worldToCanvasRatio, 0.001),
      viewPlaneNormal: [0, 0, 1],
      rotation: this.rotation,
    };
  }

  private getLayout(): VideoCameraLayout {
    this.cachedLayout ||= getVideoLayout({
      camera: this.state.camera,
      containerHeight: this.state.containerHeight,
      containerWidth: this.state.containerWidth,
      intrinsicHeight: this.state.intrinsicHeight,
      intrinsicWidth: this.state.intrinsicWidth,
      objectFit: this.state.objectFit,
    }) || {
      left: 0,
      top: 0,
      width: Math.max(this.state.intrinsicWidth, 1),
      height: Math.max(this.state.intrinsicHeight, 1),
      containerWidth: Math.max(this.state.containerWidth, 1),
      containerHeight: Math.max(this.state.containerHeight, 1),
      intrinsicWidth: Math.max(this.state.intrinsicWidth, 1),
      intrinsicHeight: Math.max(this.state.intrinsicHeight, 1),
      anchorWorld: [0, 0],
      anchorCanvas: [0.5, 0.5],
      worldToCanvasRatio: 1,
    };

    return this.cachedLayout;
  }

  private cloneWithCamera(camera: VideoCamera): VideoComputedCamera {
    return new VideoComputedCamera({
      ...this.state,
      camera,
    });
  }
}

export type { VideoComputedCameraState };
export default VideoComputedCamera;
