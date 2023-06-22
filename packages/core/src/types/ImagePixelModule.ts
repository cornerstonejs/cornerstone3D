import { VOILUTFunctionType } from '../enums';

export interface ImagePixelModule {
  bitsAllocated: number;
  bitsStored: number;
  samplesPerPixel: number;
  highBit: number;
  photometricInterpretation: string;
  pixelRepresentation: string;
  windowWidth: number | number[];
  windowCenter: number | number[];
  voiLUTFunction: VOILUTFunctionType;
  modality: string;
}
