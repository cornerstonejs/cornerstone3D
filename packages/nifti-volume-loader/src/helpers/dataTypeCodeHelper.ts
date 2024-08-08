import * as NIFTICONSTANTS from './niftiConstants';

export function getArrayConstructor(datatypeCode: number): any {
  switch (datatypeCode) {
    case NIFTICONSTANTS.NIFTI_TYPE_UINT8:
      return Uint8Array;
    case NIFTICONSTANTS.NIFTI_TYPE_INT16:
      return Int16Array;
    case NIFTICONSTANTS.NIFTI_TYPE_INT32:
      return Int32Array;
    case NIFTICONSTANTS.NIFTI_TYPE_FLOAT32: {
      return Float32Array;
    }
    case NIFTICONSTANTS.NIFTI_TYPE_INT8:
      return Int8Array;
    case NIFTICONSTANTS.NIFTI_TYPE_UINT16:
      return Uint16Array;
    case NIFTICONSTANTS.NIFTI_TYPE_UINT32:
      return Uint32Array;
    default:
      throw new Error(
        `NIFTI datatypeCode ${datatypeCode} is not yet supported`
      );
  }
}
