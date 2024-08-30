export interface DicomDateObject {
  year: number;
  month: number;
  day: number;
}

export interface DicomTimeObject {
  hours: number;
  minutes?: number;
  seconds?: number;
  fractionalSeconds?: number;
}

export interface GeneralSeriesModuleMetadata {
  modality: string;
  seriesInstanceUID: string;
  seriesNumber: number;
  studyInstanceUID: string;
  seriesDate: DicomDateObject;
  seriesTime: DicomTimeObject;
}

export interface PatientStudyModuleMetadata {
  patientAge: number;
  patientSize: number;
  patientWeight: number;
}

export interface ImagePlaneModuleMetadata {
  frameOfReferenceUID: string;
  rows: number;
  columns: number;
  imageOrientationPatient: number[];
  rowCosines: number[];
  columnCosines: number[];
  imagePositionPatient: number[];
  sliceThickness: number;
  sliceLocation: number;
  pixelSpacing: number[];
  rowPixelSpacing: number | null;
  columnPixelSpacing: number | null;
  usingDefaultValues: boolean;
}

export interface ImagePixelModuleMetadata {
  samplesPerPixel: number;
  photometricInterpretation: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  planarConfiguration: number;
  pixelAspectRatio: string;
  redPaletteColorLookupTableDescriptor: number[];
  greenPaletteColorLookupTableDescriptor: number[];
  bluePaletteColorLookupTableDescriptor: number[];
  redPaletteColorLookupTableData: number[];
  greenPaletteColorLookupTableData: number[];
  bluePaletteColorLookupTableData: number[];
  smallestPixelValue?: number;
  largestPixelValue?: number;
}

export interface SopCommonModuleMetadata {
  sopClassUID: string;
  sopInstanceUID: string;
}

export interface TransferSyntaxMetadata {
  transferSyntaxUID: string;
}
