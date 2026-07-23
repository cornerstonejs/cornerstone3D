import type { Types } from '@cornerstonejs/core';

/**
 * A 4x4 matrix in column-major order (gl-matrix layout), used for
 * inter-frame-of-reference registration transforms.
 */
export type Mat4 = number[] | Float32Array;

/**
 * An infinite plane in world (patient) space, defined in point-normal form.
 */
export type Plane = {
  /** Unit-length plane normal. */
  normal: Types.Point3;
  /** Any point on the plane. */
  point: Types.Point3;
};

/**
 * An infinite line in world (patient) space.
 */
export type WorldLine = {
  /** A point on the line. */
  point: Types.Point3;
  /** Unit-length direction of the line. */
  direction: Types.Point3;
};

/**
 * How two viewports are decided to be spatially linked, i.e. whether it is
 * meaningful to draw spatial overlays (reference points, plane intersection
 * lines) from one viewport into the other.
 */
export type SpatialLinkPolicy =
  | 'toolGroup'
  | 'frameOfReferenceUID'
  | 'explicit';

export type SpatialLinkOptions = {
  policy: SpatialLinkPolicy;
  /** Explicitly configured viewport links, used when policy is 'explicit'. */
  explicitLinks?: Array<{
    sourceViewportId: string;
    targetViewportId: string;
  }>;
  /**
   * Registration transforms between frames of reference, keyed by
   * `${sourceFrameOfReferenceUID}:${targetFrameOfReferenceUID}`. The presence
   * of a transform for a pair of frames of reference links them even when the
   * UIDs differ.
   */
  registrationTransforms?: Map<string, Mat4>;
};
