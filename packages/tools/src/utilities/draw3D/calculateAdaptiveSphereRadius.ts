/**
 * Calculate an adaptive sphere radius based on the diagonal of the volume.
 * This allows the sphere size to scale with the volume size.
 * @param diagonal The diagonal length of the volume in world coordinates.
 * @param config Configuration object with sphere radius settings
 * @returns The calculated adaptive radius, clamped between min and max limits.
 */
export function calculateAdaptiveSphereRadius(
  diagonal: number,
  config: {
    sphereRadius?: number;
    sphereRadiusScale?: number;
    minSphereRadius?: number;
    maxSphereRadius?: number;
  }
): number {
  // Scale radius as a percentage of diagonal (adjustable factor)
  const scaleFactor = config.sphereRadiusScale || 0.01; // 1% of diagonal by default
  const adaptiveRadius = diagonal * scaleFactor;

  // Apply min/max limits to prevent too small or too large spheres
  const minRadius = config.minSphereRadius || 2;
  const maxRadius = config.maxSphereRadius || 50;

  return Math.max(minRadius, Math.min(maxRadius, adaptiveRadius));
}
