/**
 * Returns true if the DICOM Photometric Interpretation describes color pixel
 * data (RGB, palette color or any of the YBR color spaces).
 *
 * @param photometricInterpretation - DICOM Photometric Interpretation (0028,0004)
 */
export default function isColorImage(
  photometricInterpretation: string
): boolean {
  return (
    photometricInterpretation === 'RGB' ||
    photometricInterpretation === 'PALETTE COLOR' ||
    photometricInterpretation === 'YBR_FULL' ||
    photometricInterpretation === 'YBR_FULL_422' ||
    photometricInterpretation === 'YBR_PARTIAL_422' ||
    photometricInterpretation === 'YBR_PARTIAL_420' ||
    photometricInterpretation === 'YBR_RCT' ||
    photometricInterpretation === 'YBR_ICT'
  );
}
