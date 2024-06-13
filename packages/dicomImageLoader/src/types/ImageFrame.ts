import { Enums } from '@cornerstonejs/core';
import PixelDataTypedArray from './PixelDataTypedArray';

interface ImageFrame {
  samplesPerPixel: number;
  photometricInterpretation: string;
  planarConfiguration: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  pixelRepresentation: number;
  smallestPixelValue: number;
  largestPixelValue: number;
  redPaletteColorLookupTableDescriptor: number[];
  greenPaletteColorLookupTableDescriptor: number[];
  bluePaletteColorLookupTableDescriptor: number[];
  redPaletteColorLookupTableData: number[];
  greenPaletteColorLookupTableData: number[];
  bluePaletteColorLookupTableData: number[];
  // populated later after decoding
  pixelData: PixelDataTypedArray;
  imageData?: ImageData;
  pixelDataLength?: number;
  preScale?: {
    enabled: boolean;
    scaled: boolean;
    scalingParameters?: {
      intercept?: number;
      slope?: number;
      rescaleSlope?: number;
      rescaleIntercept?: number;
      modality?: string;
      suvbw?: number;
    };
  };
  minAfterScale?: number;
  maxAfterScale?: number;
  imageId: string;

  // Remaining information is about the general load process
  decodeTimeInMS?: number;
  loadTimeInMS?: number;
  /**
   * imageQualityStatus is used for differentiating between
   * higher loss images and full resolution/lossless images so that a higher
   * loss image can be replaced by a lower loss one.
   */
  imageQualityStatus?: Enums.ImageQualityStatus;
  decodeLevel?: any;
}

export default ImageFrame;
