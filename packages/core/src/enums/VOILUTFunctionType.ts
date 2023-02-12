/**
 * Interpolation types for image rendering
 */
enum VOILUTFunctionType {
  LINEAR = 'LINEAR',
  SAMPLED_SIGMOID = 'SIGMOID', // SIGMOID is sampled in 1024 even steps so we call it SAMPLED_SIGMOID
  // EXACT_LINEAR = 'EXACT_LINEAR', TODO: Add EXACT_LINEAR option from DICOM NEMA
}

export default VOILUTFunctionType;
