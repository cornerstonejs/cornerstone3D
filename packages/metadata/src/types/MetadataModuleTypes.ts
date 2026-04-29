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
  seriesDate: string;
  seriesTime: string;
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
  sliceThickness?: number;
  sliceLocation: number;
  pixelSpacing: number[];
  rowPixelSpacing: number | null;
  columnPixelSpacing: number | null;
  usingDefaultValues?: boolean;
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

/** ECG module: instance-derived fields used for ECG display sets (e.g. modality, series/study/sop UIDs). */
export interface EcgModuleMetadata {
  modality: string;
  sopInstanceUID: string;
  sopClassUID: string;
  seriesDescription?: string;
  seriesNumber?: number;
  seriesDate?: string;
  seriesTime?: string;
  seriesInstanceUID: string;
  studyInstanceUID: string;
}

export interface FrameMetadata extends SopCommonModuleMetadata {
  // This is a 1 based frame number
  frameNumber: number;
  numberOfFrames: number;
}

export interface TransferSyntaxMetadata {
  transferSyntaxUID: string;
}

/**
 * Compressed frame data when NATURALIZED has pixel data as a Value.
 * pixelData may be a single buffer or an array of per-frame data.
 */
export interface CompressedFrameDataMetadata {
  transferSyntaxUid: string;
  frameOfInterest: number;
  frameNumber: number;
  pixelData: ArrayBufferView | ArrayBufferView[];
}

/**
 * Maps metadata module names (MetadataModules enum values or literal strings) to their
 * return types. Used by getTyped() to infer the return type from the module type argument.
 * Names must match MetadataModules enum values (e.g. 'transferSyntax', 'imagePlaneModule').
 */
export interface MetadataModuleType {
  generalSeriesModule: GeneralSeriesModuleMetadata;
  patientStudyModule: PatientStudyModuleMetadata;
  imagePlaneModule: ImagePlaneModuleMetadata;
  imagePixelModule: ImagePixelModuleMetadata;
  sopCommonModule: SopCommonModuleMetadata;
  ecgModule: EcgModuleMetadata;
  frameModule: FrameMetadata;
  transferSyntax: TransferSyntaxMetadata;
  compressedFrameData: CompressedFrameDataMetadata;
}
