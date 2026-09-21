export const MINIMUM_AREA_ANNOTATION_DIMENSION = 1e-12;

/**
 * Whether every supplied world-space dimension can define a stable area
 * annotation shape. This also rejects invalid numeric values such as `NaN`,
 * because they fail the strict greater-than comparison.
 */
export function hasValidAreaAnnotationDimensions(
  dimension: number,
  ...additionalDimensions: number[]
): boolean {
  return [dimension, ...additionalDimensions].every(
    (value) => value > MINIMUM_AREA_ANNOTATION_DIMENSION
  );
}
