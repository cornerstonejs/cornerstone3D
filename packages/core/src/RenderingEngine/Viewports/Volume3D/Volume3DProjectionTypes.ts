import { ViewportType } from '../../../enums';
import type { ICamera, Point2, Point3 } from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import type {
  ProjectionFraming,
  ProjectionRequest,
  ProjectionSnapshot,
} from '../ViewportProjectionTypes';
import type {
  Volume3DCamera,
  Volume3DViewportRenderContext,
} from './viewport3DTypes';

export const VOLUME3D_PROJECTION_ID = 'volume3d';

/**
 * The fit of a 3D viewport: the camera that `resetViewState` would give for
 * the content and the direction of the camera now. It is the reference of
 * the zoom and the pan of the projection, and it is computed, not stored.
 */
export type Volume3DProjectionFit = {
  /** The focal point of the fit: the centre of the content. */
  focalPoint: Point3;
  /** The parallel scale of the fit, for a parallel camera. */
  parallelScale: number;
  /** The distance of the camera from its focal point in the fit. */
  distance: number;
  /** The view angle of the fit in degrees, for a perspective camera. */
  viewAngle: number;
};

export type Volume3DResolvedViewLike = {
  /** The size of the canvas in CSS pixels that the view is framed at. */
  canvasSize?: { width: number; height: number };
  /** The fit of the viewport, when it shows something to fit. */
  fit?: Volume3DProjectionFit;
  /** The fit of the viewport for a camera that looks in another direction. */
  getFitFor?(
    direction: Pick<Volume3DCamera, 'viewPlaneNormal' | 'viewUp'>
  ): Volume3DProjectionFit | undefined;
  canvasToWorld(canvasPos: Point2): Point3;
  worldToCanvas(worldPos: Point3): Point2;
  getFrameOfReferenceUID(): string | undefined;
  toICamera(): ICamera;
};

export type Volume3DProjectionViewport = {
  type: ViewportType | string;
  canvas?: HTMLCanvasElement;
  element?: HTMLDivElement;
  /** The options of the viewport: their orientation gives rotation 0. */
  defaultOptions?: Pick<ViewportInputOptions, 'orientation'>;
  getFrameOfReferenceUID?(): string | undefined;
  getResolvedView?(): Volume3DResolvedViewLike;
  getViewState?(): Volume3DCamera & ICamera;
};

export type Volume3DRenderTarget = Pick<Volume3DViewportRenderContext, 'vtk'>;

/**
 * The framing of a 3D viewport. `zoom` and `pan` have the meaning of the
 * planar viewport, measured against the fit that `resetViewState` gives for
 * the direction of the camera now:
 *
 * - `zoom` is 1 for the fit and 2 when the picture is twice as large. For a
 *   parallel camera it is the parallel scale of the fit over the parallel
 *   scale. For a perspective camera (`parallelProjection: false`) it is the
 *   size of what lies at the focal point: the height of the view at the
 *   focal point in the fit over that height now, which the distance of the
 *   camera and its view angle give.
 * - `pan` is the shift of the picture on the canvas, in canvas pixels at
 *   zoom 1: the centre of the fit shows `pan * zoom` pixels from the centre
 *   of the canvas. It is `[0, 0]` for the fit.
 * - `worldPan` is the same shift in world units along the canvas axes: how
 *   far the focal point of the fit is from the focal point of the camera.
 *   A resize keeps it, and a patch takes it in place of `pan`.
 *
 * They are missing when the viewport shows nothing to fit.
 *
 * `camera` is the camera of the view. A patch with it takes the direction
 * and the projection of that camera, and then its `zoom` and its pan
 * against the fit of the viewport for that direction, so that
 * `setViewFraming(getViewFraming())` changes nothing, and gives the same
 * zoom against the fit and the same world point at the centre on a
 * viewport of another size.
 */
export interface Volume3DProjectionFraming extends ProjectionFraming {
  camera: Volume3DCamera & ICamera;
  /** The pan in canvas pixels on the screen, not divided by the zoom. */
  rawPan?: Point2;
}

export interface Volume3DProjectionSnapshot
  extends ProjectionSnapshot<Volume3DCamera, Volume3DProjectionFraming> {
  canvasHeight: number;
  canvasWidth: number;
  fit?: Volume3DProjectionFit;
  resolvedView?: Volume3DResolvedViewLike;
}

export interface Volume3DProjectionRequest
  extends ProjectionRequest<Volume3DProjectionViewport> {
  camera?: Volume3DCamera & ICamera;
  canvasHeight?: number;
  canvasWidth?: number;
  fit?: Volume3DProjectionFit;
  frameOfReferenceUID?: string;
  resolvedView?: Volume3DResolvedViewLike;
}
