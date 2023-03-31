export type MetaDataTypes =
  | 'generalSeriesModule'
  | 'patientStudyModule'
  | 'imagePlaneModule'
  | 'imagePixelModule'
  | 'transferSyntax'
  | 'sopCommonModule'
  | string;

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

export interface MetadataGeneralSeriesModule {
  modality: string;
  seriesInstanceUID: string;
  seriesNumber: number;
  studyInstanceUID: string;
  seriesDate: DicomDateObject;
  seriesTime: DicomTimeObject;
}

export interface MetadataPatientStudyModule {
  patientAge: number;
  patientSize: number;
  patientWeight: number;
}

export interface MetadataImagePlaneModule {
  frameOfReferenceUID: string;
  rows: string;
  columns: string;
  imageOrientationPatient: number[];
  rowCosines: number[];
  columnCosines: number[];
  imagePositionPatient: number[];
  sliceThickness: string;
  sliceLocation: string;
  pixelSpacing: number[];
  rowPixelSpacing: number | null;
  columnPixelSpacing: number | null;
}

export interface MetadataImagePixelModule {
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

export interface MetadataSopCommonModule {
  sopClassUID: string;
  sopInstanceUID: string;
}

export interface MetadataTransferSyntax {
  transferSyntaxUID: string;
}
