import { cache, Enums, Types } from '@cornerstonejs/core';
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
  if (!scl_slope || scl_slope === 0 || Number.isNaN(scl_slope)) {
    slope = 1;
  }
  if (!scl_inter || Number.isNaN(scl_inter)) {
    inter = 0;
  }
  const hasNegativeRescale = inter < 0 || slope < 0;
  const hasFloatRescale = inter % 1 !== 0 || slope % 1 !== 0;
  let niiBuffer;
  let scalarData;
  let pixelRepresentation = 1;
  switch (datatypeCode) {
    case NIFTICONSTANTS.NIFTI_TYPE_UINT8:
      niiBuffer = new Uint8Array(niftiImageBuffer);
      if (hasFloatRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else if (hasNegativeRescale) {
        scalarData = allocateScalarData('Int16Array', niiBuffer);
      } else {
        pixelRepresentation = 0;
        scalarData = allocateScalarData('Uint8Array', niiBuffer);
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_INT16:
      niiBuffer = new Int16Array(niftiImageBuffer);
      if (hasFloatRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else {
        scalarData = allocateScalarData('Int16Array', niiBuffer);
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
        scalarData = allocateScalarData('Int8Array', niiBuffer);
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_UINT16:
      niiBuffer = new Uint16Array(niftiImageBuffer);
      if (hasFloatRescale || hasNegativeRescale) {
        scalarData = allocateScalarData('Float32Array', niiBuffer);
      } else {
        pixelRepresentation = 0;
        scalarData = allocateScalarData('Uint16Array', niiBuffer);
      }
      break;
    case NIFTICONSTANTS.NIFTI_TYPE_UINT32:
      niiBuffer = new Uint32Array(niftiImageBuffer);
      scalarData = allocateScalarData('Float32Array', niiBuffer);
      break;
    default:
      throw new Error(
        `NIFTI datatypeCode ${datatypeCode} is not yet supported`
      );
  }
  const nVox = scalarData.length;
  if (slope !== 1 && inter !== 0) {
    for (let i = 0; i < nVox; i++) {
      scalarData[i] = intensityRaw2Scaled(scalarData[i], slope, inter);
    }
  }
  niftiHeader.numBitsPerVoxel = (scalarData.byteLength / scalarData.length) * 8;
  return {
    scalarData,
    pixelRepresentation,
  };
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
    default:
      throw new Error(`TypedArray ${types} is not yet supported`);
  }
  scalarData.set(niiBuffer);
  return scalarData;
}
