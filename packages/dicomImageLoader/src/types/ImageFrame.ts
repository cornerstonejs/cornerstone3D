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
  pixelData:
    | Float32Array
    | Int16Array
    | Uint16Array
    | Uint8Array
    | Uint8ClampedArray
    | undefined;
  imageData?: ImageData;
  decodeTimeInMS?: number;
  pixelDataLength?: number;
  preScale?: any;
}

export default ImageFrame;
