/**
 * Given a pixel array, rescale the pixel values using the rescale slope and
 * intercept
 *
 * Todo: add the scaling of PT and SUV
 * @param array - The array to be scaled.
 * @param scalingParameters - The scaling parameters
 * @returns The array being scaled
 */
export default function modalityScaleNifti(
  array:
    | Uint8Array
    | Int16Array
    | Int32Array
    | Float32Array
    | Float64Array
    | Int8Array
    | Uint16Array
    | Uint32Array,
  niftiHeader
): void {
  const arrayLength = array.length;
  const { scl_slope, scl_inter } = niftiHeader;

  if (!scl_slope || scl_slope === 0 || Number.isNaN(scl_slope)) {
    // No scaling encoded in NIFTI header
    return;
  }

  for (let i = 0; i < arrayLength; i++) {
    array[i] = array[i] * scl_slope + scl_inter;
  }
}
