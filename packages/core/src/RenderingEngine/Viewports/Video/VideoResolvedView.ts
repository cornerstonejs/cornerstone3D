import type { ICamera, Point2, Point3 } from '../../../types';
import ResolvedViewportView from '../ResolvedViewportView';
import {
  getAnchorWorldForPan,
  getPanForVideoCanvasMapping,
  resolveVideoCanvasMapping,
  rotateVideoCanvasPoint,
  type VideoCanvasMapping,
} from './videoViewportCamera';
import type {
  VideoViewState,
  VideoProperties,
  VideoStreamPayload,
} from './VideoViewportTypes';

type VideoResolvedViewState = {
  viewState: VideoViewState;
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

  /**
   * The pan in canvas pixels on the screen, as on the planar viewport: where
   * the centre of the video shows, less the centre of the canvas. It is
   * `[0, 0]` for the fitted view, and a canvas delta added to it moves the
   * picture by that delta at any rotation and zoom.
   */
  get canvasPan(): Point2 {
    const [x, y] = this.worldToCanvas([
      this.state.intrinsicWidth / 2,
      this.state.intrinsicHeight / 2,
      0,
    ]);

    return [
      x - this.state.containerWidth / 2,
      y - this.state.containerHeight / 2,
    ];
  }

  get rotation(): number {
    return this.state.viewState.rotation ?? 0;
  }

  /** The canvas pixels of one media pixel, with the zoom of the view. */
  get worldToCanvasRatio(): number {
    return this.getCanvasMapping().worldToCanvasRatio;
  }

  /**
   * The world point of a canvas point. The video turns by the rotation of the
   * view state about the anchor canvas point, as the render path turns it.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const mapping = this.getCanvasMapping();
    const [x, y] = rotateVideoCanvasPoint(canvasPos, mapping, -this.rotation);

    return [
      (x - mapping.left) / mapping.worldToCanvasRatio,
      (y - mapping.top) / mapping.worldToCanvasRatioY,
      0,
    ];
  }

  /**
   * The canvas point of a world point, with the rotation of the view state
   * about the anchor canvas point.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();

    return rotateVideoCanvasPoint(
      [
        mapping.left + worldPos[0] * mapping.worldToCanvasRatio,
        mapping.top + worldPos[1] * mapping.worldToCanvasRatioY,
      ],
      mapping,
      this.rotation
    );
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

  /**
   * The view moved so that {@link canvasPan} gives this pan. The move on the
   * screen is turned back by the rotation into the frame of the video, and
   * the rotation keeps its pivot.
   */
  withCanvasPan(pan: Point2): VideoResolvedView {
    const currentPan = this.canvasPan;
    const radians = (-this.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = pan[0] - currentPan[0];
    const dy = pan[1] - currentPan[1];
    const mapping = this.getCanvasMapping();
    const ratioX = Math.max(mapping.worldToCanvasRatio, 0.000001);
    const ratioY = Math.max(mapping.worldToCanvasRatioY, 0.000001);
    const rawPan = this.pan;

    return this.withPan([
      rawPan[0] + (dx * cos - dy * sin) / ratioX,
      rawPan[1] + (dx * sin + dy * cos) / ratioY,
    ]);
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
        Math.max(mapping.worldToCanvasRatioY, 0.001),
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
      worldToCanvasRatioY: 1,
    };

    return this.cachedCanvasMapping;
  }

  private cloneWithViewState(viewState: VideoViewState): VideoResolvedView {
    return new VideoResolvedView({
      ...this.state,
      viewState,
    });
  }
}

export type { VideoResolvedViewState };
export default VideoResolvedView;
