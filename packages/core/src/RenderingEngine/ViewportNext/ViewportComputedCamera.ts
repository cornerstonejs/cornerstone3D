import type { ICamera, Point2, Point3 } from '../../types';

/**
 * Immutable viewport-specific camera wrapper that exposes coordinate transforms
 * and a lazily materialized {@link ICamera}.
 *
 * Computed cameras let each viewport family keep its own richer camera state
 * while still providing a shared contract for world/canvas conversion and for
 * interoperability with legacy APIs that consume {@link ICamera}.
 *
 * @typeParam TState - Immutable resolved-camera state owned by the viewport
 * implementation.
 * @typeParam TICamera - Concrete {@link ICamera} shape produced for
 * interoperability.
 */
abstract class ViewportComputedCamera<
  TState,
  TICamera extends ICamera<unknown> = ICamera,
> {
  /** Frozen resolved-camera state captured when this instance was created. */
  readonly state: Readonly<TState>;

  private cachedICamera?: TICamera;

  /**
   * Creates a resolved-camera snapshot.
   *
   * @param state - Viewport-specific resolved-camera state to freeze for this
   * instance.
   */
  constructor(state: TState) {
    this.state = Object.freeze(state);
  }

  /**
   * Converts a canvas-space point into world space using the viewport's active
   * computed camera and transform model.
   */
  abstract canvasToWorld(canvasPos: Point2): Point3;

  /**
   * Converts a world-space point into canvas space using the viewport's active
   * computed camera and transform model.
   */
  abstract worldToCanvas(worldPos: Point3): Point2;

  /** Returns the camera frame of reference when one is available. */
  abstract getFrameOfReferenceUID(): string | undefined;

  /**
   * Returns the legacy-compatible {@link ICamera} projection for this resolved
   * camera, building it once and caching the result for subsequent calls.
   */
  toICamera(): TICamera {
    this.cachedICamera ||= this.buildICamera();

    return this.cachedICamera;
  }

  /** Builds the concrete {@link ICamera} representation for this snapshot. */
  protected abstract buildICamera(): TICamera;
}

export default ViewportComputedCamera;
