import { PLANEINDEX } from './constants';

/**
 * Gets the color key (orientation name) for a given plane index.
 * Color configuration uses orientation names (SAGITTAL, CORONAL, AXIAL) as keys
 * for historical/API compatibility, but these refer to the volume's X, Y, Z axes,
 * not viewport orientations.
 *
 * @param planeIndex - The plane index (0-5: XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX)
 * @returns The color key ('SAGITTAL', 'CORONAL', 'AXIAL') or null if invalid
 */
export function getColorKeyForPlaneIndex(
  planeIndex: number
): 'SAGITTAL' | 'CORONAL' | 'AXIAL' | null {
  if (planeIndex === PLANEINDEX.XMIN || planeIndex === PLANEINDEX.XMAX) {
    return 'SAGITTAL'; // X-axis planes
  } else if (planeIndex === PLANEINDEX.YMIN || planeIndex === PLANEINDEX.YMAX) {
    return 'CORONAL'; // Y-axis planes
  } else if (planeIndex === PLANEINDEX.ZMIN || planeIndex === PLANEINDEX.ZMAX) {
    return 'AXIAL'; // Z-axis planes
  }
  return null;
}
