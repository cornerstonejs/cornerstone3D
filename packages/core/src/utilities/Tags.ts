import { MetadataModules } from '../enums';
import * as metaData from '../metaData';

const {
  GENERAL_IMAGE,
  SOP_COMMON,
  IMAGE_PLANE,
  ULTRASOUND_ENHANCED_REGION,
  GENERAL_SERIES,
  GENERAL_STUDY,
  PATIENT,
  PATIENT_STUDY,
  // These should get added once there is a good way to
  // set default configuration values:
  // CALIBRATION,
  // ULTRASOUND_ENHANCED_REGION,
} = MetadataModules;

export const USRegionChild = 'usRegionChild';

export const PIXEL_INSTANCE = 'pixelInstance';

export function vr(vrName, vm: number, tag: string, ...groups) {
  return {
    vr: vrName,
    vm,
    tag,
    groups,
    // To be re-assigned later
    name: null,
    lowerName: null,
  };
}

export const vrUI = vr.bind(null, 'UI', 1);
export const vrCS = vr.bind(null, 'CS', 1);
export const vrDS = vr.bind(null, 'DS', 1);
export const vrDSs = vr.bind(null, 'DS', 0);
export const vrDS2 = vr.bind(null, 'DS', 2);
export const vrDS3 = vr.bind(null, 'DS', 3);
export const vrUS = vr.bind(null, 'US', 1);
export const vrSQs = vr.bind(null, 'SQ', 0);
export const vrFD = vr.bind(null, 'FD', 1);
export const vrUL = vr.bind(null, 'UL', 1);
export const vrSL = vr.bind(null, 'SL', 1);
export const vrLO = vr.bind(null, 'LO', 1);
export const vrDA = vr.bind(null, 'DA', 1);
export const vrTM = vr.bind(null, 'TM', 1);
export const vrSH = vr.bind(null, 'SH', 1);
export const vrIS = vr.bind(null, 'IS', 1);
export const vrPN = vr.bind(null, 'PN', 1);
export const vrAS = vr.bind(null, 'AS', 1);

export interface TagEntry {
  name: string;
  lowerName: string;
  xTag: string;
  vm: number;
  tag: string;
  vr: string;
  primaryGroup: string;
  groups: string[];
}

export const CLINICAL_TRIAL = 'clinicalTrialModule';

/**
 * The TagsArray is an array of the available standardized tag values which
 * can be read from any of the supported data sources.
 * Each tag is registered with the standard group it belongs to first, followed
 * by the other groups it belongs to.
 *
 */
export const Tags = {
  PatientID: vrLO('00100020', PATIENT),
  PatientName: vrPN('00100010', PATIENT),
  PatientBirthDate: vrDA('00100030', PATIENT),
  PatientBirthTime: vrTM('00100032', PATIENT),

  PatientAge: vrAS('00101010', PATIENT_STUDY),
  PatientSize: vrDS('00101020', PATIENT_STUDY),
  PatientSex: vrCS('00100040', PATIENT_STUDY),
  PatientWeight: vrDS('00101030', PATIENT_STUDY),

  StudyInstanceUID: vrUI('0020000D', GENERAL_STUDY, GENERAL_SERIES),
  StudyDescription: vrLO('00081030', GENERAL_STUDY),
  StudyDate: vrDA('00080020', GENERAL_STUDY),
  StudyTime: vrTM('00080030', GENERAL_STUDY),
  AccessionNumber: vrSH('00080050', GENERAL_STUDY),

  SeriesInstanceUID: vrUI('0020000E', GENERAL_SERIES),
  Modality: vrCS('00080060', GENERAL_SERIES),
  SeriesDescription: vrLO('0008103e', GENERAL_SERIES),
  SeriesNumber: vrIS('00200011', GENERAL_SERIES),
  SeriesDate: vrDA('00080021', GENERAL_SERIES),
  SeriesTime: vrTM('00080031', GENERAL_SERIES),
  AcquisitionDate: vrDA('00080022', GENERAL_SERIES),
  AcquisitionTime: vrTM('00080032', GENERAL_SERIES),

  ClinicalTrialSponsorName: vrLO('00120010', CLINICAL_TRIAL),
  ClinicalTrialSiteID: vrLO('00120030', CLINICAL_TRIAL),
  ClinicalTrialSiteName: vrLO('00120031', CLINICAL_TRIAL),

  SOPInstanceUID: vrUI('00080018', SOP_COMMON, GENERAL_IMAGE),
  SOPClassUID: vrUI('00080016', SOP_COMMON, GENERAL_IMAGE),

  // ReferencedImageSequence: vrSQs('00081140'),

  InstanceNumber: vrIS('00200013', GENERAL_IMAGE),
  InstanceCreationDate: vrDA('00080012', GENERAL_IMAGE),
  InstanceCreationTime: vrTM('00080013', GENERAL_IMAGE),
  ContentTime: vrTM('00080033', GENERAL_IMAGE),
  LossyImageCompression: vrCS('00282110', GENERAL_IMAGE),
  LossyImageCompressionRatio: vrDS('00282112', GENERAL_IMAGE),
  LossyImageCompressionMethod: vrCS('00282114', GENERAL_IMAGE),

  // Image Plane requirements
  PixelSpacing: vrDS2('00280030', GENERAL_IMAGE),
  ImagerPixelSpacing: vrDS2('00181164', IMAGE_PLANE),

  ImageOrientationPatient: vrDS3('00200037', IMAGE_PLANE),
  ImagePositionPatient: vrDSs('00200032', IMAGE_PLANE),
  FrameOfReferenceUID: vrUI('00200052', PIXEL_INSTANCE),
  Rows: vrUS('00280010', PIXEL_INSTANCE),
  Columns: vrUS('00280011', PIXEL_INSTANCE),
  SpacingBetweenSlices: vrDS('00180088', PIXEL_INSTANCE),
  SliceThickness: vrDS('00180050', PIXEL_INSTANCE),
  SliceLocation: vrDS('00201041', PIXEL_INSTANCE),
  EstimatedRadiographicMagnificationFactor: vrDS('00181114', PIXEL_INSTANCE),
  PixelSpacingCalibrationType: vrCS('00280A02', PIXEL_INSTANCE),
  PixelSpacingCalibrationDescription: vrLO('00280A04', PIXEL_INSTANCE),

  SequenceOfUltrasoundRegions: vrSQs(
    '00186011',
    ULTRASOUND_ENHANCED_REGION,
    PIXEL_INSTANCE
  ),

  // US Region child group
  PhysicalDeltaX: vrFD('0018602C', USRegionChild),
  PhysicalDeltaY: vrFD('0018602E', USRegionChild),
  PhysicalUnitsXDirection: vrUS('00186024', USRegionChild),
  PhysicalUnitsYDirection: vrUS('x00186026', USRegionChild),
  RegionLocationMinY0: vrUL('0018601A', USRegionChild),
  RegionLocationMaxY1: vrUL('0018601E', USRegionChild),
  RegionLocationMinX0: vrUL('00186018', USRegionChild),
  RegionLocationMaxX1: vrUL('0018601C', USRegionChild),
  ReferencePixelX0: vrSL('00186020', USRegionChild),
  ReferencePixelY0: vrSL('00186022', USRegionChild),
  ReferencePhysicalPixelValueY: vrFD('0018602A', USRegionChild),
  ReferencePhysicalPixelValueX: vrFD('00186028', USRegionChild),
  RegionSpatialFormat: vrUS('00186012', USRegionChild),
  RegionDataType: vrUS('00186014', USRegionChild),
  RegionFlags: vrUL('00186016', USRegionChild),
  TransducerFrequency: vrUL('00186030', USRegionChild),
};

export const mapModuleTags = new Map<string, TagEntry[]>();

export const mapTagInfo = new Map<string, TagEntry>();

/**
 * Adds a tag name/type
 */
export function addTag(name: string, value: TagEntry) {
  if (name && value.name && name !== value.name) {
    throw new Error(
      `Tag name provided and value don't match: ${name} !== ${value.name}`
    );
  }
  value.name ||= name;
  value.lowerName ||= metaData.toLowerCamelTag(name);
  Tags[name] = value;
  const { tag } = value;
  value.primaryGroup ||= value.groups?.[0];
  const { primaryGroup } = value;
  mapTagInfo.set(name, value);
  if (tag) {
    // Store both xTag and info values as well
    value.xTag = `x${tag.toLowerCase()}`;
    value.tag = tag.toUpperCase();
    mapTagInfo.set(value.xTag, value);
    mapTagInfo.set(value.tag, value);
  }
  if (primaryGroup) {
    let moduleEntries = mapModuleTags.get(primaryGroup);
    if (!moduleEntries) {
      moduleEntries = [value];
      mapModuleTags.set(primaryGroup, moduleEntries);
      return;
    }
    const foundIndex = moduleEntries.findIndex((it) => it.name === name);
    if (foundIndex === -1) {
      moduleEntries.push(value);
    } else {
      moduleEntries[foundIndex] = value;
    }
  }
}

Object.entries(Tags).forEach(([tag, value]) => {
  addTag(tag, value);
});
