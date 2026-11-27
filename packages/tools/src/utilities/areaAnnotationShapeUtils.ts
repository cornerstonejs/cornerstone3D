export const MINIMUM_AREA_ANNOTATION_DIMENSION = 1e-12;

/**
 * Whether every supplied world-space dimension can define a stable area
 * annotation shape. This also rejects invalid numeric values such as `NaN`,
 * because they fail the strict greater-than comparison.
 *
 * Area annotations can be transiently degenerate during creation or resizing:
 * coincident handles produce zero or numerically negligible radii or
 * half-lengths. Such shapes cover no voxels and do not define stable geometry
 * for the factories.
 *
 * Use this function to check for valid dimensions before creating the shape,
 * otherwise it will be rejected by the shape creation factory and throw errors.
 */
export function hasValidAreaAnnotationDimensions(
  dimension: number,
  ...additionalDimensions: number[]
): boolean {
  return [dimension, ...additionalDimensions].every(
    (value) => value > MINIMUM_AREA_ANNOTATION_DIMENSION
  );
}
