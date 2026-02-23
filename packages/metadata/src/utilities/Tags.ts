import { MetadataModules } from '../enums';
import * as metaData from '../metaData';
import { lookupTagHex } from 'dcmjs';

const {
  GENERAL_IMAGE,
  SOP_COMMON,
  IMAGE_PLANE,
  IMAGE_PIXEL,
  ULTRASOUND_ENHANCED_REGION,
  GENERAL_SERIES,
  GENERAL_STUDY,
  PATIENT,
  PATIENT_STUDY,
  VOI_LUT,
  MODALITY_LUT,
  TRANSFER_SYNTAX,
  PET_SERIES,
  PET_IMAGE,
  PET_ISOTOPE,
  CINE,
} = MetadataModules;

export const USRegionChild = 'usRegionChild';

/**
 * Creates a tag entry defining module membership only.
 * VR and VM are resolved from the dcmjs dictionary in addTag().
 */
export function tag(hexTag: string, ...groups: string[]): TagEntry {
  return {
    tag: hexTag,
    groups,
    xTag: null,
    primaryGroup: null,
    name: null,
    lowerName: null,
    vr: null,
    vm: null,
  };
}

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

/**
 * Parses a DICOM VM string (e.g. "1", "1-n", "2") into a numeric value.
 * Returns 1 for single-valued, the exact count for fixed multi-valued,
 * or 0 for variable-length multi-valued.
 */
export function parseVm(vm: string | number | undefined): number | null {
  if (vm === undefined || vm === null) {
    return null;
  }
  if (typeof vm === 'number') {
    return vm;
  }
  const n = parseInt(vm, 10);
  // If the string is exactly a number (like "1", "2", "3"), return it
  if (String(n) === vm) {
    return n;
  }
  // Otherwise it's a range like "1-n", "2-n", "1-3" → multi-valued
  return 0;
}

/**
 * Looks up a tag in the dcmjs dictionary by hex string (e.g. "00080005").
 * Returns { name, vr, vm } or undefined if not found.
 */
export function dictionaryLookup(
  hexTag: string
): { name: string; vr: string; vm: string } | undefined {
  return lookupTagHex(hexTag.toUpperCase());
}

export const CLINICAL_TRIAL = 'clinicalTrialModule';

export const RadiopharmaceuticalInfoModule = 'RadiopharmaceuticalInfo';

/**
 * The Tags object defines which metadata modules each tag belongs to.
 * VR and VM are resolved from the dcmjs dictionary during addTag().
 */
export const Tags = {
  // FMI information:
  TransferSyntaxUID: tag('00020010', TRANSFER_SYNTAX),
  AvailableTransferSyntaxUID: tag('00083002', TRANSFER_SYNTAX),

  FrameTime: tag('00181063', CINE),
  RecommendedDisplayFrameRate: tag('00082144', CINE),

  RadiopharmaceuticalInfo: tag('00540016', PET_ISOTOPE),
  RadiopharmaceuticalStartTime: tag('00181072', RadiopharmaceuticalInfoModule),
  RadiopharmaceuticalStopTime: tag('00181073', RadiopharmaceuticalInfoModule),
  RadionuclideTotalDose: tag('00181074', RadiopharmaceuticalInfoModule),
  RadionuclideHalfLife: tag('00181075', RadiopharmaceuticalInfoModule),

  FrameReferenceTime: tag('00541300', PET_IMAGE),
  ActualFrameDuration: tag('00181242', PET_IMAGE),

  CorrectedImage: tag('00280051', PET_SERIES),
  Units: tag('00541001', PET_SERIES),
  DecayCorrection: tag('00541102', PET_SERIES),

  PatientID: tag('00100020', PATIENT),
  PatientName: tag('00100010', PATIENT),
  PatientBirthDate: tag('00100030', PATIENT),
  PatientBirthTime: tag('00100032', PATIENT),

  PatientAge: tag('00101010', PATIENT_STUDY),
  PatientSize: tag('00101020', PATIENT_STUDY),
  PatientSex: tag('00100040', PATIENT_STUDY),
  PatientWeight: tag('00101030', PATIENT_STUDY),

  StudyInstanceUID: tag('0020000D', GENERAL_SERIES, GENERAL_STUDY),
  StudyDescription: tag('00081030', GENERAL_STUDY),
  StudyDate: tag('00080020', GENERAL_STUDY),
  StudyTime: tag('00080030', GENERAL_STUDY),
  AccessionNumber: tag('00080050', GENERAL_STUDY),

  SeriesInstanceUID: tag('0020000E', GENERAL_SERIES),
  Modality: tag('00080060', GENERAL_SERIES),
  SeriesDescription: tag('0008103e', GENERAL_SERIES),
  SeriesNumber: tag('00200011', GENERAL_SERIES),
  SeriesDate: tag('00080021', GENERAL_SERIES),
  SeriesTime: tag('00080031', GENERAL_SERIES),
  AcquisitionDate: tag('00080022', GENERAL_SERIES),
  AcquisitionTime: tag('00080032', GENERAL_SERIES),

  ClinicalTrialSponsorName: tag('00120010', CLINICAL_TRIAL),
  ClinicalTrialSiteID: tag('00120030', CLINICAL_TRIAL),
  ClinicalTrialSiteName: tag('00120031', CLINICAL_TRIAL),

  SOPInstanceUID: tag('00080018', SOP_COMMON, GENERAL_IMAGE),
  SOPClassUID: tag('00080016', SOP_COMMON, GENERAL_IMAGE),

  ReferencedImageSequence: tag('00081140'),
  ReferencedSOPClassUID: tag('00081150'),
  ReferencedSOPInstanceUID: tag('00081155'),
  ReferencedFrameNumber: tag('00081160'),

  InstanceNumber: tag('00200013', GENERAL_IMAGE),
  InstanceCreationDate: tag('00080012', GENERAL_IMAGE),
  InstanceCreationTime: tag('00080013', GENERAL_IMAGE),
  ContentTime: tag('00080033', GENERAL_IMAGE),
  LossyImageCompression: tag('00282110', GENERAL_IMAGE),
  LossyImageCompressionRatio: tag('00282112', GENERAL_IMAGE),
  LossyImageCompressionMethod: tag('00282114', GENERAL_IMAGE),

  ImagerPixelSpacing: tag('00181164', IMAGE_PLANE),

  ImageOrientationPatient: tag('00200037', IMAGE_PLANE),
  ImagePositionPatient: tag('00200032', IMAGE_PLANE),

  FrameOfReferenceUID: tag('00200052', GENERAL_IMAGE),

  SamplesPerPixel: tag('00280002', IMAGE_PIXEL),
  PhotometricInterpretation: tag('00280004', IMAGE_PIXEL),
  PlanarConfiguration: tag('00280006', IMAGE_PIXEL),
  NumberOfFrames: tag('00280008', GENERAL_IMAGE),
  Rows: tag('00280010', IMAGE_PIXEL),
  Columns: tag('00280011', IMAGE_PIXEL),
  PixelSpacing: tag('00280030', GENERAL_IMAGE),
  BitsAllocated: tag('00280100', IMAGE_PIXEL),
  BitsStored: tag('00280101', IMAGE_PIXEL),
  HighBit: tag('00280102', IMAGE_PIXEL),
  PixelRepresentation: tag('00280103', IMAGE_PIXEL),
  SmallestPixelValue: tag('00280106', IMAGE_PIXEL),
  LargestPixelValue: tag('00280107', IMAGE_PIXEL),
  PixelPaddingValue: tag('00280120', IMAGE_PIXEL),
  PixelPaddingRangeLimit: tag('00280121', IMAGE_PIXEL),

  // VOI LUT module
  WindowCenter: tag('00281050', VOI_LUT),
  WindowWidth: tag('00281051', VOI_LUT),
  VOILUTFunction: tag('00281056', VOI_LUT),
  WindowCenterWidthExplanation: tag('00281055', VOI_LUT),

  // Modality LUT Module
  RescaleIntercept: tag('00281052', MODALITY_LUT),
  RescaleSlope: tag('00281053', MODALITY_LUT),
  RescaleType: tag('00281054', MODALITY_LUT),

  RedPaletteColorLookupTableDescriptor: tag('00281101', IMAGE_PIXEL),
  GreenPaletteColorLookupTableDescriptor: tag('00281102', IMAGE_PIXEL),
  BluePaletteColorLookupTableDescriptor: tag('00281103', IMAGE_PIXEL),
  AlphaPaletteColorLookupTableDescriptor: tag('00281104', IMAGE_PIXEL),
  RedPaletteColorLookupTableData: tag('00281201', IMAGE_PIXEL),
  GreenPaletteColorLookupTableData: tag('00281202', IMAGE_PIXEL),
  BluePaletteColorLookupTableData: tag('00281203', IMAGE_PIXEL),
  AlphaPaletteColorLookupTableData: tag('00281204', IMAGE_PIXEL),
  PaletteColorLookupTableUID: tag('00281104', IMAGE_PIXEL),

  SpacingBetweenSlices: tag('00180088', IMAGE_PLANE),
  SliceThickness: tag('00180050', IMAGE_PLANE),
  SliceLocation: tag('00201041', IMAGE_PLANE),
  DistanceSourceToDetector: tag('00181110', IMAGE_PIXEL),
  DistanceSourceToPatient: tag('00181111', IMAGE_PIXEL),
  EstimatedRadiographicMagnificationFactor: tag('00181114', IMAGE_PIXEL),
  DistanceSourceToEntrance: tag('00400306', IMAGE_PIXEL),
  PixelSpacingCalibrationType: tag('00280A02', IMAGE_PIXEL),
  PixelSpacingCalibrationDescription: tag('00280A04', IMAGE_PIXEL),

  SequenceOfUltrasoundRegions: tag(
    '00186011',
    ULTRASOUND_ENHANCED_REGION,
    IMAGE_PIXEL
  ),

  // US Region child group
  PhysicalDeltaX: tag('0018602C', USRegionChild),
  PhysicalDeltaY: tag('0018602E', USRegionChild),
  PhysicalUnitsXDirection: tag('00186024', USRegionChild),
  PhysicalUnitsYDirection: tag('00186026', USRegionChild),
  RegionLocationMinY0: tag('0018601A', USRegionChild),
  RegionLocationMaxY1: tag('0018601E', USRegionChild),
  RegionLocationMinX0: tag('00186018', USRegionChild),
  RegionLocationMaxX1: tag('0018601C', USRegionChild),
  ReferencePixelX0: tag('00186020', USRegionChild),
  ReferencePixelY0: tag('00186022', USRegionChild),
  ReferencePhysicalPixelValueY: tag('0018602A', USRegionChild),
  ReferencePhysicalPixelValueX: tag('00186028', USRegionChild),
  RegionSpatialFormat: tag('00186012', USRegionChild),
  RegionDataType: tag('00186014', USRegionChild),
  RegionFlags: tag('00186016', USRegionChild),
  TransducerFrequency: tag('00186030', USRegionChild),

  // Functional Groups
  SharedFunctionalGroupsSequence: tag('52009229'),
  PerFrameFunctionalGroupsSequence: tag('52009230'),
  PlanePositionSequence: tag('00209113'),
  AnatomicRegionSequence: tag('00082218'),
  PlaneOrientationSequence: tag('00209116'),
  PixelMeasuresSequence: tag('00289110'),
  PixelValueTransformationSequence: tag('00289145'),
  ParametricMapFrameTypeSequence: tag('00409092'),
  RealWorldValueMappingSequence: tag('00409096'),
};

export const mapModuleTags = new Map<string, TagEntry[]>();

export const mapTagInfo = new Map<string, TagEntry>();

/**
 * Adds a tag name/type, resolving vr/vm from the dcmjs dictionary.
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
  const { tag: hexTag } = value;
  value.primaryGroup ||= value.groups?.[0];
  const { groups } = value;
  mapTagInfo.set(name, value);
  if (hexTag) {
    value.xTag = `x${hexTag.toLowerCase()}`;
    value.tag = hexTag.toUpperCase();
    mapTagInfo.set(value.xTag, value);
    mapTagInfo.set(value.tag, value);

    // Resolve vr/vm from dcmjs dictionary if not already set
    if (!value.vr) {
      const dictEntry = lookupTagHex(value.tag);
      if (dictEntry) {
        value.vr = dictEntry.vr;
        value.vm = parseVm(dictEntry.vm);
      }
    }
  }
  if (groups?.length) {
    for (const group of groups) {
      let moduleEntries = mapModuleTags.get(group);
      if (!moduleEntries) {
        moduleEntries = [value];
        mapModuleTags.set(group, moduleEntries);
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
}

Object.entries<TagEntry>(Tags).forEach(([tagName, value]) => {
  addTag(tagName, value);
});
