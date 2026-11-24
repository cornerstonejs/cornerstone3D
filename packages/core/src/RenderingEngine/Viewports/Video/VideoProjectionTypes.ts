import { ViewportType } from '../../../enums';
import type { ICamera, Point2, Point3 } from '../../../types';
import type {
  ProjectionFraming,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type { VideoViewState } from './VideoViewportTypes';

export const VIDEO_PROJECTION_ID = 'video';

export type VideoResolvedViewLike = {
  state?: {
    containerHeight?: number;
    containerWidth?: number;
    intrinsicHeight?: number;
    intrinsicWidth?: number;
    viewState: VideoViewState;
  };
  pan: Point2;
  /**
   * The pan in canvas pixels on the screen: `[0, 0]` for the fitted view,
   * and a canvas delta added to it moves the picture by that delta at any
   * rotation and zoom.
   */
  canvasPan?: Point2;
  rotation: number;
  zoom: number;
  /** The canvas pixels of one media pixel, with the zoom of the view. */
  worldToCanvasRatio?: number;
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): ICamera;
  withPan(pan: Point2): VideoResolvedViewLike;
  /** The view moved so that `canvasPan` gives this pan. */
  withCanvasPan?(pan: Point2): VideoResolvedViewLike;
  withZoom(zoom: number, canvasPoint?: Point2): VideoResolvedViewLike;
};

export type VideoProjectionViewport = {
  type: ViewportType | string;
  element?: HTMLDivElement;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(): VideoResolvedViewLike | undefined;
  getViewState?(): VideoViewState;
};

export interface VideoProjectionFraming extends ProjectionFraming<never> {
  /** The pan in canvas pixels on the screen, not divided by the zoom. */
  rawPan: Point2;
}

export interface VideoProjectionSnapshot
  extends ProjectionSnapshot<VideoViewState, VideoProjectionFraming> {
  canvasHeight: number;
  canvasWidth: number;
  resolvedView?: VideoResolvedViewLike;
}

export interface VideoProjectionRequest
  extends ProjectionRequest<VideoProjectionViewport> {
  canvasHeight?: number;
  canvasWidth?: number;
  frameOfReferenceUID?: string;
  resolvedView?: VideoResolvedViewLike;
  viewState?: VideoViewState;
}
