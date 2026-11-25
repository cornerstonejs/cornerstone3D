import { ViewportType } from '../../../enums';
import type { ICamera, Point2, Point3 } from '../../../types';
import type {
  ProjectionPresentation,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type {
  Volume3DCamera,
  Volume3DViewportRenderContext,
} from './viewport3DTypes';

export const VOLUME3D_PROJECTION_ID = 'volume3d';

export type Volume3DResolvedViewLike = {
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): ICamera;
};

export type Volume3DProjectionViewport = {
  type: ViewportType | string;
  canvas?: HTMLCanvasElement;
  element?: HTMLDivElement;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(): Volume3DResolvedViewLike;
  getViewState?(): Volume3DCamera & ICamera;
};

export type Volume3DRenderTarget = Pick<Volume3DViewportRenderContext, 'vtk'>;

export interface Volume3DProjectionPresentation extends ProjectionPresentation {
  camera: Volume3DCamera & ICamera;
}

export interface Volume3DProjectionSnapshot
  extends ProjectionSnapshot<Volume3DCamera, Volume3DProjectionPresentation> {
  canvasHeight: number;
  canvasWidth: number;
  resolvedView?: Volume3DResolvedViewLike;
}

export interface Volume3DProjectionRequest
  extends ProjectionRequest<Volume3DProjectionViewport> {
  camera?: Volume3DCamera & ICamera;
  canvasHeight?: number;
  canvasWidth?: number;
  frameOfReferenceUID?: string;
  resolvedView?: Volume3DResolvedViewLike;
}
