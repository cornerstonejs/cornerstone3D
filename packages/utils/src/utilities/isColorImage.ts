/**
 * Color Photometric Interpretations for DICOM images.
 *
 * @todo review if these can be imported from `dcmjs` instead of being
 * hardcoded.
 */
export const COLOR_PHOTOMETRIC_INTERPRETATIONS = [
  'RGB',
  'PALETTE COLOR',
  'YBR_FULL',
  'YBR_FULL_422',
  'YBR_PARTIAL_422',
  'YBR_PARTIAL_420',
  'YBR_RCT',
  'YBR_ICT',
];

/**
 * Grayscale Photometric Interpretations for DICOM images.
 *
 * @todo review if these can be imported from `dcmjs` instead of being
 * hardcoded.
 */
export const GRAYSCALE_PHOTOMETRIC_INTERPRETATIONS = [
  'MONOCHROME1',
  'MONOCHROME2',
];
/**
 * Returns true if the DICOM Photometric Interpretation describes color pixel
 * data (RGB, palette color or any of the YBR color spaces).
 *
 * @param photometricInterpretation - DICOM Photometric Interpretation (0028,0004)
 */
export default function isColorImage(
  photometricInterpretation: string
): boolean {
  return COLOR_PHOTOMETRIC_INTERPRETATIONS.includes(photometricInterpretation);
}
