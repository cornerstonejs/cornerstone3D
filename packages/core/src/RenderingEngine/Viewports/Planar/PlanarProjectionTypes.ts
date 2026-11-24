import { ViewportType } from '../../../enums';
import type { Point2, Point3 } from '../../../types';
import type {
  ProjectionFraming,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type { PlanarScaleInput } from './planarCameraScale';
import type { PlanarSliceBasis } from './planarSliceBasis';
import type {
  PlanarDisplayArea,
  PlanarResolvedICamera,
  PlanarViewFraming,
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
  /**
   * The view at another scale. With a canvas point, the world point under it
   * stays under it. Without one, the zoom is about the centre of the canvas.
   */
  withScale?(
    scale: PlanarScaleInput,
    canvasPoint?: Point2
  ): { state: { viewState: PlanarViewState } };
  /** The geometry of the slice that the view shows. */
  getSliceBasis?(): PlanarSliceBasis;
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

export interface PlanarProjectionFraming
  extends ProjectionFraming<PlanarDisplayArea> {
  rawPan: Point2;
  scaleVector: Point2;
}

export interface PlanarProjectionSnapshot
  extends ProjectionSnapshot<PlanarViewState, PlanarProjectionFraming> {
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

export type PlanarProjectionAdapterFraming = PlanarViewFraming;
