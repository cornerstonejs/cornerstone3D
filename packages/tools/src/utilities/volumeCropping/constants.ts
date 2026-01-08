export const PLANEINDEX = {
  XMIN: 0,
  XMAX: 1,
  YMIN: 2,
  YMAX: 3,
  ZMIN: 4,
  ZMAX: 5,
};

export const SPHEREINDEX = {
  // cube faces
  XMIN: 0,
  XMAX: 1,
  YMIN: 2,
  YMAX: 3,
  ZMIN: 4,
  ZMAX: 5,
  // cube corners
  XMIN_YMIN_ZMIN: 6,
  XMIN_YMIN_ZMAX: 7,
  XMIN_YMAX_ZMIN: 8,
  XMIN_YMAX_ZMAX: 9,
  XMAX_YMIN_ZMIN: 10,
  XMAX_YMIN_ZMAX: 11,
  XMAX_YMAX_ZMIN: 12,
  XMAX_YMAX_ZMAX: 13,
};

/**
 * Number of clipping planes (6: XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX)
 */
export const NUM_CLIPPING_PLANES = 6;

/**
 * Tolerance for orientation matching (used when comparing camera normals)
 */
export const ORIENTATION_TOLERANCE = 1e-2;

/**
 * Tolerance for parallel plane detection (used in plane-plane intersection calculations)
 */
export const PARALLEL_PLANE_TOLERANCE = 1e-10;

/**
 * Tolerance for line intersection calculations (used when checking if lines are parallel)
 */
export const LINE_INTERSECTION_TOLERANCE = 1e-8;

/**
 * Large distance used to extend lines for intersection calculations
 */
export const LINE_EXTENSION_DISTANCE = 100000;

/**
 * Minimum line length in pixels for rendering (lines shorter than this are not drawn)
 */
export const MIN_LINE_LENGTH_PIXELS = 1;

/**
 * Pixel distance threshold for point proximity checks
 */
export const POINT_PROXIMITY_THRESHOLD_PIXELS = 6;
