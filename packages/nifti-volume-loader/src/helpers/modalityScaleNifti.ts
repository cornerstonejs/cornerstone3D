import type { Types } from '@cornerstonejs/core';
import { cache, Enums } from '@cornerstonejs/core';
import * as NIFTICONSTANTS from './niftiConstants';
/**
 * Given a pixel array, rescale the pixel values using the rescale slope and
 * intercept
 *
 * Todo: add the scaling of PT and SUV
 * @param niftiHeader- The header of nifti file
 * @param niftiImageBuffer - The array buffer of nifti file
 * @returns {object} TypedArray and pixelRepresentation is 0 if scala data is unsigned
 */
export default function modalityScaleNifti(
  niftiHeader,
  niftiImageBuffer
): {
  scalarData: Types.PixelDataTypedArray;
  pixelRepresentation: number;
} {
  const { datatypeCode, scl_slope, scl_inter } = niftiHeader;

  let slope = scl_slope;
  let inter = scl_inter;
  // NIfTI-1 scales voxel values only when scl_slope is nonzero, so a missing
  // slope also means no intercept.
  if (!scl_slope || scl_slope === 0 || Number.isNaN(scl_slope)) {
    slope = 1;
    inter = 0;
  }
  if (!scl_inter || Number.isNaN(scl_inter)) {
    inter = 0;
  }
  const hasNegativeRescale = inter < 0 || slope < 0;
  const hasFloatRescale = inter % 1 !== 0 || slope % 1 !== 0;
  let niiBuffer;
  let scalarData;
  switch (datatypeCode) {
    case NIFTICONSTANTS.NIFTI_TYPE_UINT8:
      niiBuffer = new Uint8Array(niftiImageBuffer);
      if (hasFloatRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else if (hasNegativeRescale) {
        scalarData = allocateScalarData(
          fitScaledRange('Int16Array', niiBuffer, slope, inter),
          niiBuffer
        );
      } else {
        scalarData = allocateScalarData(
          fitScaledRange('Uint8Array', niiBuffer, slope, inter),
          niiBuffer
        );
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_INT16:
      niiBuffer = new Int16Array(niftiImageBuffer);
      if (hasFloatRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else {
        scalarData = allocateScalarData(
          fitScaledRange('Int16Array', niiBuffer, slope, inter),
          niiBuffer
        );
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_INT32:
      niiBuffer = new Int32Array(niftiImageBuffer);
      scalarData = allocateScalarData('Float32Array', niiBuffer);
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_FLOAT32: {
      niiBuffer = new Float32Array(niftiImageBuffer);
      scalarData = allocateScalarData('Float32Array', niiBuffer);
      break;
    }
    case NIFTICONSTANTS.NIFTI_TYPE_INT8:
      niiBuffer = new Int8Array(niftiImageBuffer);
      if (hasFloatRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else {
        scalarData = allocateScalarData(
          fitScaledRange('Int8Array', niiBuffer, slope, inter),
          niiBuffer
        );
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_UINT16:
      niiBuffer = new Uint16Array(niftiImageBuffer);
      if (hasFloatRescale || hasNegativeRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else {
        scalarData = allocateScalarData(
          fitScaledRange('Uint16Array', niiBuffer, slope, inter),
          niiBuffer
        );
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_UINT32:
      niiBuffer = new Uint32Array(niftiImageBuffer);
      scalarData = allocateScalarData('Float32Array', niiBuffer);
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_FLOAT64:
      niiBuffer = new Float64Array(niftiImageBuffer);
      scalarData = allocateScalarData('Float64Array', niiBuffer);
      break;
    default:
      throw new Error(
        `NIFTI datatypeCode ${datatypeCode} is not yet supported`
      );
  }
  const nVox = scalarData.length;
  if (slope !== 1 || inter !== 0) {
    for (let i = 0; i < nVox; i++) {
      scalarData[i] = intensityRaw2Scaled(scalarData[i], slope, inter);
    }
  }
  niftiHeader.numBitsPerVoxel = (scalarData.byteLength / scalarData.length) * 8;
  // Unsigned arrays only hold non-negative values (fitScaledRange checks the
  // scaled range), so they are the unsigned pixel representation.
  const pixelRepresentation =
    scalarData instanceof Uint8Array || scalarData instanceof Uint16Array
      ? 0
      : 1;
  return {
    scalarData,
    pixelRepresentation,
  };
}

/**
 * Value range of the array that allocateScalarData creates for each integer
 * type. allocateScalarData allocates an Int16Array for 'Int8Array'.
 */
const INTEGER_TYPE_RANGES: Partial<
  Record<Types.PixelDataTypedArrayString, [number, number]>
> = {
  Uint8Array: [0, 255],
  Int8Array: [-32768, 32767],
  Int16Array: [-32768, 32767],
  Uint16Array: [0, 65535],
};

/**
 * Returns the integer array type when the scaled values of the data fit in
 * it, otherwise 'Float32Array', so that scaling does not wrap the values.
 */
function fitScaledRange(
  type: Types.PixelDataTypedArrayString,
  niiBuffer: Types.PixelDataTypedArray,
  slope: number,
  inter: number
): Types.PixelDataTypedArrayString {
  const range = INTEGER_TYPE_RANGES[type];
  if (!range || (slope === 1 && inter === 0) || !niiBuffer.length) {
    return type;
  }
  let min = niiBuffer[0];
  let max = niiBuffer[0];
  for (let i = 1; i < niiBuffer.length; i++) {
    const value = niiBuffer[i];
    if (value < min) {
      min = value;
    } else if (value > max) {
      max = value;
    }
  }
  const scaledMin = Math.min(min * slope + inter, max * slope + inter);
  const scaledMax = Math.max(min * slope + inter, max * slope + inter);
  return scaledMin < range[0] || scaledMax > range[1] ? 'Float32Array' : type;
}

function intensityRaw2Scaled(
  raw: number,
  scl_slope: number,
  scl_inter: number
): number {
  return raw * scl_slope + scl_inter;
}

function checkCacheAvailable(bitsAllocated: number, length: number): number {
  const sizeInBytes: number = (bitsAllocated / 8) * length;
  const isCacheable = cache.isCacheable(sizeInBytes);
  if (!isCacheable) {
    throw new Error(Enums.Events.CACHE_SIZE_EXCEEDED);
  }
  cache.decacheIfNecessaryUntilBytesAvailable(sizeInBytes);
  return sizeInBytes;
}

function allocateScalarData(
  types: Types.PixelDataTypedArrayString,
  niiBuffer: Types.PixelDataTypedArray
): Types.PixelDataTypedArray {
  let bitsAllocated;
  let scalarData;
  const nVox = niiBuffer.length;
  switch (types) {
    case 'Float32Array':
      bitsAllocated = 32;
      checkCacheAvailable(bitsAllocated, nVox);
      scalarData = new Float32Array(nVox);
      break;
    case 'Int16Array':
      bitsAllocated = 16;
      checkCacheAvailable(bitsAllocated, nVox);
      scalarData = new Int16Array(nVox);
      break;
    case 'Int8Array':
      bitsAllocated = 8;
      checkCacheAvailable(bitsAllocated, nVox);
      scalarData = new Int16Array(nVox);
      break;
    case 'Uint16Array':
      bitsAllocated = 16;
      checkCacheAvailable(bitsAllocated, nVox);
      scalarData = new Uint16Array(nVox);
      break;
    case 'Uint8Array':
      bitsAllocated = 8;
      checkCacheAvailable(bitsAllocated, nVox);
      scalarData = new Uint8Array(nVox);
      break;
    case 'Float64Array':
      bitsAllocated = 64;
      checkCacheAvailable(bitsAllocated, nVox);
      scalarData = new Float64Array(nVox);
      break;
    default:
      throw new Error(`TypedArray ${types} is not yet supported`);
  }
  scalarData.set(niiBuffer);
  return scalarData;
}
