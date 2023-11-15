import { Types } from '@cornerstonejs/core';
import { ByteArray, DataSet } from 'dicom-parser';
export interface DICOMLoaderIImage extends Types.IImage {
  decodeTimeInMS: number;
  floatPixelData?: ByteArray | Float32Array;
  loadTimeInMS?: number;
  totalTimeInMS?: number;
  data?: DataSet;
  imageFrame?: ImageFrame;
  voiLUTFunction: string | undefined;
  transferSyntaxUID?: string;
}
