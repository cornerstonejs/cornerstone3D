import { ViewportType } from '../../../enums';
import type { ICamera, Point2, Point3 } from '../../../types';
import type { WSIMapViewLike } from '../../../utilities/WSIUtilities';
import type {
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

export const WSI_PROJECTION_ID = 'wsi';

export type WSIResolvedViewLike = {
  state?: {
    canvasHeight?: number;
    canvasWidth?: number;
    view?: WSIMapViewLike;
    viewState: WSIViewState;
  };
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): ICamera;
  withZoom(zoom: number, canvasPoint?: Point2): WSIResolvedViewLike;
};

export type WSIProjectionViewport = {
  type: ViewportType | string;
  element?: HTMLDivElement;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(): WSIResolvedViewLike | undefined;
  getViewState?(): WSIViewState;
};

export interface WSIProjectionPresentation
  extends ProjectionPresentation<never> {}

export interface WSIProjectionSnapshot
  extends ProjectionSnapshot<WSIViewState, WSIProjectionPresentation> {
  canvasHeight: number;
  canvasWidth: number;
  resolvedView?: WSIResolvedViewLike;
}

export interface WSIProjectionRequest
  extends ProjectionRequest<WSIProjectionViewport> {
  canvasHeight?: number;
  canvasWidth?: number;
  frameOfReferenceUID?: string;
  resolvedView?: WSIResolvedViewLike;
  viewState?: WSIViewState;
}
