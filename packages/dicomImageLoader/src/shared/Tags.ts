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
} from './Module';
import { type ITag } from '../types/TagTypes';
import { PIXEL_INSTANCE } from './ImagePlaneModule';

// Ensure the Module is re-exported so that it gets correctly initialized
export * from './Module';

const {
  GENERAL_IMAGE,
  SOP_COMMON,
  IMAGE_PLANE,
  CALIBRATION,
  ULTRASOUND_ENHANCED_REGION,
} = Enums.MetadataModules;

export const USRegionChild = 'usRegionChild';

export const TagsArray = [
  vrUI('SOPInstanceUID', '00080018', GENERAL_IMAGE, SOP_COMMON),
  vrUI('SOPClassUID', '00080016', GENERAL_IMAGE, SOP_COMMON, PIXEL_INSTANCE),
  vrCS('LossyImageCompression', '00282110', GENERAL_IMAGE),
  vrDS('LossyImageCompressionRatio', '00282112', GENERAL_IMAGE),
  vrCS('LossyImageCompressionMethod', '00282114', GENERAL_IMAGE),
  vrDSs('PixelSpacing', '00280030', 2, IMAGE_PLANE, PIXEL_INSTANCE),
  vrDSs('ImagerPixelSpacing', '00181164', 2, IMAGE_PLANE, PIXEL_INSTANCE),
  vrSQs(
    'SequenceOfUltrasoundRegions',
    '00186011',
    { sqModule: USRegionChild },
    ULTRASOUND_ENHANCED_REGION,
    CALIBRATION,
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

export type FieldTags = (typeof TagsArray)[number]['tag'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TagsType = Record<FieldTags, ITag<any>>;

export function createTags(tagsArray): TagsType {
  const tags = {} as TagsType;
  for (const tag of tagsArray) {
    tags[tag.name] = tag;
  }
  return tags;
}

export const Tags: TagsType = createTags(TagsArray);
