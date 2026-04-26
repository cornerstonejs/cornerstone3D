import type { ICamera, Point2, Point3 } from '../../../types';
import ResolvedViewportView from '../ResolvedViewportView';
import {
  getAnchorWorldForPan,
  getPanForVideoCanvasMapping,
  resolveVideoCanvasMapping,
  type VideoCanvasMapping,
} from './videoViewportCamera';
import type {
  VideoCamera,
  VideoProperties,
  VideoStreamPayload,
} from './VideoViewportTypes';

type VideoResolvedViewState = {
  viewState: VideoCamera;
  containerHeight: number;
  containerWidth: number;
  frameOfReferenceUID?: string;
  intrinsicHeight: number;
  intrinsicWidth: number;
  objectFit?: VideoProperties['objectFit'];
  payload?: VideoStreamPayload;
};

class VideoResolvedView extends ResolvedViewportView<VideoResolvedViewState> {
  private cachedCanvasMapping?: VideoCanvasMapping;

  get zoom(): number {
    return Math.max(this.state.viewState.scale ?? 1, 0.001);
  }

  get pan(): Point2 {
    return this.getCanvasMapping()
      ? getPanForVideoCanvasMapping(this.getCanvasMapping())
      : [0, 0];
  }

  get rotation(): number {
    return this.state.viewState.rotation ?? 0;
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    const mapping = this.getCanvasMapping();

    return [
      (canvasPos[0] - mapping.left) / mapping.worldToCanvasRatio,
      (canvasPos[1] - mapping.top) / mapping.worldToCanvasRatio,
      0,
    ];
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();

    return [
      mapping.left + worldPos[0] * mapping.worldToCanvasRatio,
      mapping.top + worldPos[1] * mapping.worldToCanvasRatio,
    ];
  }

  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  withZoom(zoom: number, canvasPoint?: Point2): VideoResolvedView {
    const nextZoom = Math.max(zoom, 0.001);

    if (!canvasPoint) {
      return this.cloneWithViewState({
        ...this.state.viewState,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }

    const worldPoint = this.canvasToWorld(canvasPoint);

    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.containerWidth, 1),
        canvasPoint[1] / Math.max(this.state.containerHeight, 1),
      ],
      anchorWorld: [worldPoint[0], worldPoint[1]],
      scale: nextZoom,
      scaleMode: 'fit',
    });
  }

  withPan(pan: Point2): VideoResolvedView {
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
        Math.max(mapping.worldToCanvasRatio, 0.001),
      viewPlaneNormal: [0, 0, 1],
      rotation: this.rotation,
    };
  }

  private getCanvasMapping(): VideoCanvasMapping {
    this.cachedCanvasMapping ||= resolveVideoCanvasMapping({
      camera: this.state.viewState,
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

    return this.cachedCanvasMapping;
  }

  private cloneWithViewState(viewState: VideoCamera): VideoResolvedView {
    return new VideoResolvedView({
      ...this.state,
      viewState,
    });
  }
}

export type { VideoResolvedViewState };
export default VideoResolvedView;
