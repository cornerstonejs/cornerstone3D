import { Enums } from '@cornerstonejs/core';
import { vrUI, vrCS, vrDS, vrDSs } from './Module';
import { type ITag } from '../types/TagTypes';
import { PIXEL_INSTANCE } from './ImagePlaneModule';

// Ensure the Module is re-exported so that it gets correctly initialized
export * from './Module';

const { GENERAL_IMAGE, SOP_COMMON, IMAGE_PLANE } = Enums.MetadataModules;

export const TagsArray = [
  vrUI('SOPInstanceUID', '00080018', GENERAL_IMAGE, SOP_COMMON),
  vrUI('SOPClassUID', '00080016', GENERAL_IMAGE, SOP_COMMON, PIXEL_INSTANCE),
  vrCS('LossyImageCompression', '00282110', GENERAL_IMAGE),
  vrDS('LossyImageCompressionRatio', '00282112', GENERAL_IMAGE),
  vrCS('LossyImageCompressionMethod', '00282114', GENERAL_IMAGE),
  vrDSs('PixelSpacing', '00280030', 2, IMAGE_PLANE, PIXEL_INSTANCE),
  vrDSs('ImagerPixelSpacing', '00181164', 2, IMAGE_PLANE, PIXEL_INSTANCE),
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
