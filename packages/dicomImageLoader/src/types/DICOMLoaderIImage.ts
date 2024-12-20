import type { Types } from '@cornerstonejs/core';
import type { ByteArray, DataSet } from 'dicom-parser';
export interface DICOMLoaderIImage extends Types.IImage {
  decodeTimeInMS: number;
  floatPixelData?: ByteArray | Float32Array;
  loadTimeInMS?: number;
  totalTimeInMS?: number;
  data?: DataSet;
  imageFrame?: Types.IImageFrame;
  transferSyntaxUID?: string;
}
