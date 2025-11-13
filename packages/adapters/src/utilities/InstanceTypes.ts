export interface IStudyData {
  StudyInstanceUID: string;
}

export interface ISeriesData {
  SeriesInstanceUID: string;
  SeriesDescription: string;
  SeriesNumber: number | string;
  SeriesDate: string;
  SeriesTime?: string;
  Modality: string;
}

export interface IInstanceData {
  SOPInstanceUID: string;
  SOPClassUID: string;
  InstanceNumber: string | number;
  FrameOfReferenceUID?: string;
}

export type InstanceData = ISeriesData & IStudyData & IInstanceData;

export type NormalData = string | number | null | undefined | boolean;

export type NormalModule = {
  FrameOfReferenceUID?: string;
  Modality?: string;
  [key: string]: NormalData | NormalModule | NormalModule[];
};

export type RtssModule = InstanceData & {
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
