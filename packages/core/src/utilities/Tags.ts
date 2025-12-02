import { MetadataModules } from '../enums';
import * as metaData from '../metaData';

const {
  GENERAL_IMAGE,
  SOP_COMMON,
  IMAGE_PLANE,
  ULTRASOUND_ENHANCED_REGION,
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
 * The TagsArray is an array of the available standardized tag values which
 * can be read from any of the supported data sources.
 * Each tag is registered with the standard group it belongs to first, followed
 * by the other groups it belongs to.
 *
 */
export const Tags = {
  SOPInstanceUID: vrUI('00080018', GENERAL_IMAGE, SOP_COMMON),
  SOPClassUID: vrUI('00080016', GENERAL_IMAGE, SOP_COMMON),
  LossyImageCompression: vrCS('00282110', GENERAL_IMAGE),
  LossyImageCompressionRatio: vrDS('00282112', GENERAL_IMAGE),
  LossyImageCompressionMethod: vrCS('00282114', GENERAL_IMAGE),

  // Image Plane requirements
  PixelSpacing: vrDS2('00280030'),
  ImagerPixelSpacing: vrDS2('00181164', IMAGE_PLANE),

  ImageOrientationPatient: vrDS3('00200037', IMAGE_PLANE),
  ImagePositionPatient: vrDSs('00200037', IMAGE_PLANE),
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

/**
 * Adds a tag name/type
 */
export function addTag(tag: string, value: TagEntry) {
  if (tag && value.name && tag !== value.name) {
    throw new Error(
      `Tag name provided and value don't match: ${tag} !== ${value.name}`
    );
  }
  value.name ||= tag;
  value.lowerName ||= metaData.toLowerCamelTag(tag);
  Tags[tag] = value;
  value.xTag ||= (tag && `x${tag.toLowerCase}`) || undefined;
  value.primaryGroup ||= value.groups?.[0];
  const { primaryGroup } = value;
  if (primaryGroup) {
    let moduleEntries = mapModuleTags.get(primaryGroup);
    if (!moduleEntries) {
      moduleEntries = [value];
      mapModuleTags.set(primaryGroup, moduleEntries);
      return;
    }
    const foundIndex = moduleEntries.findIndex((it) => it.name === tag);
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
