import type { ICamera, Point2, Point3 } from '../../types';
import type DisplayArea from '../../types/displayArea';
import type { ViewPresentationSelector } from '../../types/IViewport';
import type ViewportType from '../../enums/ViewportType';

/**
 * Semantic scale declarations exposed by projection snapshots.
 *
 * These tags describe the intent of the scale instead of forcing callers to
 * treat every viewport family as if it had a single universal zoom value.
 */
export type ProjectionScale =
  | { kind: 'fit'; value: number }
  | { kind: 'fitWidth'; value: number }
  | { kind: 'fitHeight'; value: number }
  | { kind: 'displayArea'; value: number; area: DisplayArea }
  | { kind: 'nativePixel'; pixelsPerCanvasPixel: number }
  | { kind: 'physical'; mmPerCanvasPixel: number };

/**
 * Semantic position declarations exposed by projection snapshots.
 *
 * A viewport can report the positioning model it actually supports, such as a
 * planar anchor or a 3D focal point, without pretending those models are the
 * same thing.
 */
export type ProjectionPosition =
  | { kind: 'anchor'; worldPoint?: Point3; canvasPoint: Point2 }
  | { kind: 'imagePoint'; imagePoint: Point2; canvasPoint: Point2 }
  | { kind: 'focalPoint'; worldPoint: Point3 };

/**
 * Cross-viewport presentation fields shared by projection adapters.
 *
 * Adapter-specific presentations may extend this shape with compatibility
 * fields, but scale and position should remain tagged so their semantics stay
 * explicit at call sites.
 */
export interface ProjectionPresentation<TDisplayArea = DisplayArea> {
  rotation?: number;
  displayArea?: TDisplayArea;
  zoom?: number;
  pan?: Point2;
  scale?: ProjectionScale;
  position?: ProjectionPosition;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

/**
 * Spaces that the snapshot can currently reason about.
 *
 * Missing capabilities are intentionally represented by omitted or false flags
 * rather than no-op transforms.
 */
export interface ProjectionSpaces {
  canvas?: boolean;
  world?: boolean;
  image?: boolean;
  renderer?: boolean;
}

/**
 * Coordinate transforms available for the resolved snapshot.
 */
export interface ProjectionTransforms {
  canvasToWorld?(point: Point2): Point3;
  worldToCanvas?(point: Point3): Point2;
}

/**
 * Resolved mapping from a viewport's semantic state to presentation,
 * coordinate transforms, and optional renderer-camera output.
 */
export interface ProjectionSnapshot<
  TViewState = unknown,
  TProjectionPresentation extends
    ProjectionPresentation<unknown> = ProjectionPresentation,
> {
  kind: string;
  adapterId: string;
  viewportType?: ViewportType | string;
  dataId?: string;
  frameOfReferenceUID?: string;
  spaces: ProjectionSpaces;
  transforms?: ProjectionTransforms;
  presentation: TProjectionPresentation;
  rendererCamera?: ICamera<unknown>;
  viewState?: TViewState;
}

/**
 * Request passed to the projection service or an adapter when resolving a
 * projection.
 */
export interface ProjectionRequest<TViewport = unknown> {
  viewport: TViewport;
  kind?: string;
  dataId?: string;
  viewportType?: ViewportType | string;
  selector?: ViewPresentationSelector;
}

/**
 * Options that can influence reverse projection from presentation back to
 * semantic viewport state.
 */
export interface ProjectionWriteOptions {
  anchorCanvas?: Point2;
  preserveDisplayArea?: boolean;
}

/**
 * Adapter contract for a viewport family that can expose a projection snapshot.
 */
export interface ViewportProjectionAdapter<
  TViewState = unknown,
  TPresentation = unknown,
  TSnapshot extends ProjectionSnapshot<
    TViewState,
    ProjectionPresentation<unknown>
  > = ProjectionSnapshot<TViewState>,
> {
  id: string;
  viewportTypes: Array<ViewportType | string>;

  /**
   * Resolve the current viewport projection snapshot, or return undefined when
   * the viewport does not have enough state to describe one.
   */
  getSnapshot(request: ProjectionRequest): TSnapshot | undefined;

  /**
   * Convert a snapshot into the viewport family's public view-presentation
   * shape, honoring the selector when the presentation supports one.
   */
  getPresentation(
    snapshot: TSnapshot,
    selector?: ViewPresentationSelector
  ): TPresentation;

  /**
   * Apply presentation changes to a snapshot and return the next semantic
   * viewport state without mutating the viewport directly.
   */
  withPresentation(
    snapshot: TSnapshot,
    presentation: Partial<TPresentation>,
    options?: ProjectionWriteOptions
  ): TViewState;

  /**
   * Push the snapshot's renderer output into a render target when the adapter
   * knows how to do so.
   */
  applyToRenderer?(snapshot: TSnapshot, target: unknown): void;
}
