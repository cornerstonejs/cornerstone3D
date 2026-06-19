import type { ModuleTagEntry } from './index';

/**
 * Tags registered for lookup but not assigned to any specific metadata module.
 * Includes referenced image sequences and functional group sequences.
 */
export const tags: ModuleTagEntry[] = [
  'ReferencedImageSequence',
  'ReferencedSOPClassUID',
  'ReferencedSOPInstanceUID',
  'ReferencedFrameNumber',
  'SharedFunctionalGroupsSequence',
  'PerFrameFunctionalGroupsSequence',
  'PlanePositionSequence',
  'AnatomicRegionSequence',
  'PlaneOrientationSequence',
  'PixelMeasuresSequence',
  'PixelValueTransformationSequence',
  'ParametricMapFrameTypeSequence',
  'RealWorldValueMappingSequence',
];
