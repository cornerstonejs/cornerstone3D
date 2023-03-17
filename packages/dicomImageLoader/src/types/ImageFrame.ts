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
  decodeTimeInMS?: number;
  pixelDataLength?: number;
  preScale?: any;
  minAfterScale?: number;
  maxAfterScale?: number;
}

export default ImageFrame;
