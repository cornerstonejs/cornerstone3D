import type { Types } from '@cornerstonejs/core';
import { ByteArray, DataSet } from 'dicom-parser';
import { CornerstoneWadoImageFrame } from '../shared/image-frame';

export interface CornerstoneWadoLoaderIImage extends Types.IImage {
  decodeTimeInMS: number;
  floatPixelData?: ByteArray | Float32Array;
  loadTimeInMS?: number;
  totalTimeInMS?: number;
  data?: DataSet;
  imageFrame?: CornerstoneWadoImageFrame;
  voiLUTFunction?: string | undefined;
}

export interface CornerstoneWadoLoaderIImageLoadObject
  extends Types.IImageLoadObject {
  promise: Promise<CornerstoneWadoLoaderIImage>;
  decache?: () => void;
}
