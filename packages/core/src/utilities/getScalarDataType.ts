import { ScalingParameters } from '../types';

/**
 * If the scalar data is a Uint8Array, return 'Uint8Array'. If the scalar data is a
 * Float32Array, return 'Float32Array'. If the scalar data is a Int16Array, return
 * 'Int16Array'. If the scalar data is a Uint16Array, return 'Uint16Array'. If the
 * scalar data is none of the above, throw an error.
 * @param {ScalingParameters} scalingParameters - {
 * @param {any} [scalarData] - The data to be converted.
 * @returns The data type of the scalar data.
 */
export default function getScalarDataType(
  scalingParameters: ScalingParameters,
  scalarData?: any
): string {
  let type;

  if (scalarData && scalarData instanceof Uint8Array) {
    type = 'Uint8Array';
  } else if (scalarData instanceof Float32Array) {
    type = 'Float32Array';
  } else if (scalarData instanceof Int16Array) {
    type = 'Int16Array';
  } else if (scalarData instanceof Uint16Array) {
    type = 'Uint16Array';
  } else {
    throw new Error('Unsupported array type');
  }

  return type;
}
