import { ViewportType } from '../../../enums';
import type { ICamera, Point2, Point3 } from '../../../types';
import type {
  ProjectionPresentation,
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
  rotation: number;
  zoom: number;
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): ICamera;
  withPan(pan: Point2): VideoResolvedViewLike;
  withZoom(zoom: number, canvasPoint?: Point2): VideoResolvedViewLike;
};

export type VideoProjectionViewport = {
  type: ViewportType | string;
  element?: HTMLDivElement;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(): VideoResolvedViewLike | undefined;
  getViewState?(): VideoViewState;
};

export interface VideoProjectionPresentation
  extends ProjectionPresentation<never> {
  rawPan: Point2;
}

export interface VideoProjectionSnapshot
  extends ProjectionSnapshot<VideoViewState, VideoProjectionPresentation> {
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
