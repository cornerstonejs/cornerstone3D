import { ViewportType } from '../../../enums';
import type { ICamera, Point2, Point3 } from '../../../types';
import type {
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type { ECGViewState } from './ECGViewportTypes';

export const ECG_PROJECTION_ID = 'ecg';

export type ECGResolvedViewLike = {
  state?: {
    canvas?: HTMLCanvasElement;
    viewState: ECGViewState;
  };
  pan: Point2;
  zoom: number;
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): ICamera;
  withPan(pan: Point2): ECGResolvedViewLike;
  withZoom(zoom: number, canvasPoint?: Point2): ECGResolvedViewLike;
};

export type ECGProjectionViewport = {
  type: ViewportType | string;
  canvas?: HTMLCanvasElement;
  element?: HTMLDivElement;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(): ECGResolvedViewLike | undefined;
  getViewState?(): ECGViewState;
};

export interface ECGProjectionPresentation
  extends ProjectionPresentation<never> {
  rawPan: Point2;
}

export interface ECGProjectionSnapshot
  extends ProjectionSnapshot<ECGViewState, ECGProjectionPresentation> {
  canvasHeight: number;
  canvasWidth: number;
  resolvedView?: ECGResolvedViewLike;
}

export interface ECGProjectionRequest
  extends ProjectionRequest<ECGProjectionViewport> {
  canvasHeight?: number;
  canvasWidth?: number;
  frameOfReferenceUID?: string;
  resolvedView?: ECGResolvedViewLike;
  viewState?: ECGViewState;
}
