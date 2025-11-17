export type SimpleData = string | number | null | undefined | boolean;

/**
 * General module type
 */
export type SimpleModule = {
  StudyInstanceUID?: string;
  SeriesInstanceUID?: string;
  SeriesDescription?: string;
  SeriesNumber?: number | string;
  SeriesDate?: string;
  SeriesTime?: string;
  Modality?: string;
  SOPInstanceUID?: string;
  SOPClassUID?: string;
  InstanceNumber?: string | number;
  FrameOfReferenceUID?: string;
  [key: string]: SimpleData;
};

export type FunctionalGroups = {
  [key: string]: NormalModule;
};

export type NormalModule = SimpleModule & {
  PerFrameFunctionalGroupsSequence?: FunctionalGroups[];
  SharedFunctionalGroupsSequence?: FunctionalGroups;
};

export type RtssModule = NormalModule & {
  StructureSetROISequence: NormalModule[];
  ROIContourSequence: NormalModule[];
  RTROIObservationsSequence: NormalModule[];
  ReferencedSeriesSequence: NormalModule[];
  ReferencedFrameOfReferenceSequence: NormalModule[];
  Modality: 'RTSTRUCT';
  PositionReferenceIndicator: string;
  StructureSetLabel: string;
  StructureSetName: string;
  StructureSetDate: string;
  StructureSetTime: string;
};
