import { Enums } from '@cornerstonejs/core';
import {
  vrUI,
  vrCS,
  vrDS,
  vrDSs,
  vrFD,
  vrUS,
  vrUL,
  vrSL,
  vrSQs,
  vrLO,
} from './Module';
import { type ITag } from '../types/TagTypes';
import { PIXEL_INSTANCE } from './ImagePlaneModule';

// Ensure the Module is re-exported so that it gets correctly initialized
export * from './Module';

const {
  GENERAL_IMAGE,
  SOP_COMMON,
  IMAGE_PLANE,
  // These should get added once there is a good way to
  // set default configuration values:
  // CALIBRATION,
  // ULTRASOUND_ENHANCED_REGION,
} = Enums.MetadataModules;

export const USRegionChild = 'usRegionChild';

/**
 * The TagsArray is an array of the available standardized tag values which
 * can be read from any of the supported data sources.
 * Each tag is registered with the standard group it belongs to first, followed
 * by the other groups it belongs to.
 *
 */
export const TagsArray = [
  vrUI('SOPInstanceUID', '00080018', GENERAL_IMAGE, SOP_COMMON),
  vrUI('SOPClassUID', '00080016', GENERAL_IMAGE, SOP_COMMON, PIXEL_INSTANCE),
  vrCS('LossyImageCompression', '00282110', GENERAL_IMAGE),
  vrDS('LossyImageCompressionRatio', '00282112', GENERAL_IMAGE),
  vrCS('LossyImageCompressionMethod', '00282114', GENERAL_IMAGE),

  // Image Plane requirements
  vrDSs('PixelSpacing', '00280030', 2, IMAGE_PLANE, PIXEL_INSTANCE),
  /**
   * The 2 below indicates the value multiplicity is 2.
   */
  vrDSs('ImagerPixelSpacing', '00181164', 2, IMAGE_PLANE, PIXEL_INSTANCE),
  vrDSs('ImageOrientationPatient', '00200037', 3, IMAGE_PLANE, PIXEL_INSTANCE),
  vrDSs('ImagePositionPatient', '00200037', 3, IMAGE_PLANE, PIXEL_INSTANCE),
  vrUI('FrameOfReferenceUID', '00200052', PIXEL_INSTANCE),
  vrUS('Rows', '00280010', PIXEL_INSTANCE),
  vrUS('Columns', '00280011', PIXEL_INSTANCE),
  vrDS('SpacingBetweenSlices', '00180088', PIXEL_INSTANCE),
  vrDS('SliceThickness', '00180050', PIXEL_INSTANCE),
  vrDS('SliceLocation', '00201041', PIXEL_INSTANCE),
  vrDS('EstimatedRadiographicMagnificationFactor', '00181114', PIXEL_INSTANCE),
  vrCS('PixelSpacingCalibrationType', '00280A02', PIXEL_INSTANCE),
  vrLO('PixelSpacingCalibrationDescription', '00280A04', PIXEL_INSTANCE),

  vrSQs(
    'SequenceOfUltrasoundRegions',
    '00186011',
    // The sqModule defines the module for the child elements
    { sqModule: USRegionChild },
    // ULTRASOUND_ENHANCED_REGION,
    // CALIBRATION,
    PIXEL_INSTANCE
  ),

  // US Region child group
  vrFD('PhysicalDeltaX', '0018602C', USRegionChild),
  vrFD('PhysicalDeltaY', '0018602E', USRegionChild),
  vrUS('PhysicalUnitsXDirection', '00186024', USRegionChild),
  vrUS('PhysicalUnitsYDirection', 'x00186026', USRegionChild),
  vrUL('RegionLocationMinY0', '0018601A', USRegionChild),
  vrUL('RegionLocationMaxY1', '0018601E', USRegionChild),
  vrUL('RegionLocationMinX0', '00186018', USRegionChild),
  vrUL('RegionLocationMaxX1', '0018601C', USRegionChild),
  vrSL('ReferencePixelX0', '00186020', USRegionChild),
  vrSL('ReferencePixelY0', '00186022', USRegionChild),
  vrFD('ReferencePhysicalPixelValueY', '0018602A', USRegionChild),
  vrFD('ReferencePhysicalPixelValueX', '00186028', USRegionChild),
  vrUS('RegionSpatialFormat', '00186012', USRegionChild),
  vrUS('RegionDataType', '00186014', USRegionChild),
  vrUL('RegionFlags', '00186016', USRegionChild),
  vrUL('TransducerFrequency', '00186030', USRegionChild),
];

/**
 * The FieldTags is a type of all the tag numbers defined above.
 */
export type FieldTags = (typeof TagsArray)[number]['tag'];

/** The TagsTyep defined an object of tag numbers as strings to ITag values */
export type TagsType = Record<FieldTags, ITag<unknown>>;

export function createTags(tagsArray): TagsType {
  const tags = {} as TagsType;
  for (const tag of tagsArray) {
    tags[tag.name] = tag;
  }
  return tags;
}

export const Tags: TagsType = createTags(TagsArray);
