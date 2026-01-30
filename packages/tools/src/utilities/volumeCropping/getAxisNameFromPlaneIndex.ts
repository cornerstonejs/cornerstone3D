import { PLANEINDEX } from './constants';

/**
 * Gets the axis name ('X', 'Y', or 'Z') for a given plane index.
 *
 * @param planeIndex - The plane index (0-5: XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX)
 * @returns The axis name ('X', 'Y', or 'Z')
 */
export function getAxisNameFromPlaneIndex(planeIndex: number): 'X' | 'Y' | 'Z' {
  if (planeIndex === PLANEINDEX.XMIN || planeIndex === PLANEINDEX.XMAX) {
    return 'X';
  } else if (planeIndex === PLANEINDEX.YMIN || planeIndex === PLANEINDEX.YMAX) {
    return 'Y';
  } else {
    return 'Z';
  }
}
