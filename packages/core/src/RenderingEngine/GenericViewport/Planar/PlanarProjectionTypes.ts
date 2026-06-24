import { ViewportType } from '../../../enums';
import type { Point2, Point3 } from '../../../types';
import type {
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type {
  PlanarDisplayArea,
  PlanarResolvedICamera,
  PlanarViewPresentation,
  PlanarViewState,
} from './PlanarViewportTypes';

export const PLANAR_PROJECTION_ID = 'planar';

export type PlanarResolvedViewLike = {
  state: {
    viewState: PlanarViewState;
    canvasWidth: number;
    canvasHeight: number;
  };
  pan: Point2;
  scale: Point2;
  zoom: number;
  rotation: number;
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): PlanarResolvedICamera;
  withPan(pan: Point2): { state: { viewState: PlanarViewState } };
};

export type PlanarProjectionViewport = {
  type: ViewportType | string;
  element?: HTMLDivElement;
  getDisplayArea?(): PlanarDisplayArea | undefined;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(args?: {
    frameOfReferenceUID?: string;
    sliceIndex?: number;
  }): PlanarResolvedViewLike | undefined;
  getViewState?(): PlanarViewState;
};

export interface PlanarProjectionPresentation
  extends ProjectionPresentation<PlanarDisplayArea> {
  rawPan: Point2;
  scaleVector: Point2;
}

export interface PlanarProjectionSnapshot
  extends ProjectionSnapshot<PlanarViewState, PlanarProjectionPresentation> {
  canvasHeight: number;
  canvasWidth: number;
  displayArea?: PlanarDisplayArea;
  resolvedView?: PlanarResolvedViewLike;
  resolveViewState?: (
    viewState: PlanarViewState
  ) => PlanarResolvedViewLike | undefined;
}

export interface PlanarProjectionRequest
  extends ProjectionRequest<PlanarProjectionViewport> {
  canvasHeight?: number;
  canvasWidth?: number;
  displayArea?: PlanarDisplayArea;
  frameOfReferenceUID?: string;
  resolvedView?: PlanarResolvedViewLike;
  resolveViewState?: (
    viewState: PlanarViewState
  ) => PlanarResolvedViewLike | undefined;
  sliceIndex?: number;
  viewState?: PlanarViewState;
}

export type PlanarProjectionAdapterPresentation = PlanarViewPresentation;
