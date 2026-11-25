import type { ICamera, Point2, Point3 } from '../../types';
import type DisplayArea from '../../types/displayArea';
import type { ViewFramingSelector } from '../../types/IViewport';
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
  | { kind: 'physical'; mmPerCanvasPixel: number }
  | {
      kind: 'signal';
      samplesPerCanvasPixel: number;
      valueUnitsPerCanvasPixel: number;
    };

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
  | { kind: 'mediaPoint'; mediaPoint: Point2; canvasPoint: Point2 }
  | {
      kind: 'signalPoint';
      sampleIndex: number;
      value: number;
      channelIndex: number;
      canvasPoint: Point2;
    }
  | { kind: 'focalPoint'; worldPoint: Point3 };

/**
 * Cross-viewport framing fields shared by projection adapters.
 *
 * Adapter-specific framings may extend this shape with compatibility
 * fields, but scale and position should remain tagged so their semantics stay
 * explicit at call sites.
 */
export interface ProjectionFraming<TDisplayArea = DisplayArea> {
  rotation?: number;
  displayArea?: TDisplayArea;
  zoom?: number;
  pan?: Point2;
  /** The pan in world units, see `ViewFraming.worldPan`. */
  worldPan?: Point2;
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
 * Resolved mapping from a viewport's semantic state to framing,
 * coordinate transforms, and optional renderer-camera output.
 */
export interface ProjectionSnapshot<
  TViewState = unknown,
  TProjectionFraming extends ProjectionFraming<unknown> = ProjectionFraming,
> {
  kind: string;
  adapterId: string;
  viewportType?: ViewportType | string;
  displaySetId?: string;
  frameOfReferenceUID?: string;
  spaces: ProjectionSpaces;
  transforms?: ProjectionTransforms;
  framing: TProjectionFraming;
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
  displaySetId?: string;
  viewportType?: ViewportType | string;
  selector?: ViewFramingSelector;
}

/**
 * Options that can influence reverse projection from framing back to
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
  TFraming = unknown,
  TSnapshot extends ProjectionSnapshot<
    TViewState,
    ProjectionFraming<unknown>
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
   * Convert a snapshot into the viewport family's public view-framing
   * shape, honoring the selector when the framing supports one.
   */
  getFraming(snapshot: TSnapshot, selector?: ViewFramingSelector): TFraming;

  /**
   * Apply framing changes to a snapshot and return the next semantic
   * viewport state without mutating the viewport directly.
   */
  withFraming(
    snapshot: TSnapshot,
    framing: Partial<TFraming>,
    options?: ProjectionWriteOptions
  ): TViewState;

  /**
   * Push the snapshot's renderer output into a render target when the adapter
   * knows how to do so.
   */
  applyToRenderer?(snapshot: TSnapshot, target: unknown): void;
}
