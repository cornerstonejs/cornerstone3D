/**
 * Interpolation types for image rendering
 */
export enum VoiLutFunctionType {
  LINEAR = 'LINEAR',
  SAMPLED_SIGMOID = 'SIGMOID', // SIGMOID is sampled in 1024 even steps so we call it SAMPLED_SIGMOID
  LINEAR_EXACT = 'LINEAR_EXACT',
}

export default VoiLutFunctionType;
