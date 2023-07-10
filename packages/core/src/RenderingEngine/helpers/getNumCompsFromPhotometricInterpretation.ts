/**
 * Calculates number of components based on the dicom metadata
 *
 * @param photometricInterpretation - string dicom tag
 * @returns number representing number of components
 */
export default function getNumCompsFromPhotometricInterpretation(
  photometricInterpretation: string
): number {
  // TODO: this function will need to have more logic later
  // see http://dicom.nema.org/medical/Dicom/current/output/chtml/part03/sect_C.7.6.3.html#sect_C.7.6.3.1.2
  let numberOfComponents = 1;
  if (
    photometricInterpretation === 'RGB' ||
    photometricInterpretation.indexOf('YBR') !== -1 ||
    photometricInterpretation === 'PALETTE COLOR'
  ) {
    numberOfComponents = 3;
  }

  return numberOfComponents;
}
