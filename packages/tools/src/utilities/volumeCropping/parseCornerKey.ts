/**
 * Parse corner key to determine which axes are min/max
 * @param uid - The unique identifier for the corner (e.g., 'corner_XMIN_YMIN_ZMIN')
 * @returns Object with flags indicating which axes are min/max
 */
export function parseCornerKey(uid: string): {
  isXMin: boolean;
  isXMax: boolean;
  isYMin: boolean;
  isYMax: boolean;
  isZMin: boolean;
  isZMax: boolean;
} {
  const cornerKey = uid.replace('corner_', '');
  return {
    isXMin: cornerKey.includes('XMIN'),
    isXMax: cornerKey.includes('XMAX'),
    isYMin: cornerKey.includes('YMIN'),
    isYMax: cornerKey.includes('YMAX'),
    isZMin: cornerKey.includes('ZMIN'),
    isZMax: cornerKey.includes('ZMAX'),
  };
}
