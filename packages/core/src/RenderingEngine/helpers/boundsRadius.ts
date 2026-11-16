/**
 * Computes the bounds radius value
 */
export function boundsRadius(bounds: number[]) {
  const w1 = (bounds[1] - bounds[0]) ** 2;
  const w2 = (bounds[3] - bounds[2]) ** 2;
  const w3 = (bounds[5] - bounds[4]) ** 2;

  // If we have just a single point, pick a radius of 1.0
  // compute the radius of the enclosing sphere
  // For 3D viewport, we should increase the radius to make sure the whole
  // volume is visible and we don't get clipping artifacts.
  const radius = Math.sqrt(w1 + w2 + w3 || 1) * 0.5;
  return radius;
}
