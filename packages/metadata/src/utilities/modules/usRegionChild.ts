import type { ModuleTagEntry } from './index';

/** US Region child tags (nested within SequenceOfUltrasoundRegions). */
export const tags: ModuleTagEntry[] = [
  'PhysicalDeltaX',
  'PhysicalDeltaY',
  'PhysicalUnitsXDirection',
  'PhysicalUnitsYDirection',
  'RegionLocationMinY0',
  'RegionLocationMaxY1',
  'RegionLocationMinX0',
  'RegionLocationMaxX1',
  'ReferencePixelX0',
  'ReferencePixelY0',
  ['ReferencePhysicalPixelValueY', '0018602A'],
  ['ReferencePhysicalPixelValueX', '00186028'],
  'RegionSpatialFormat',
  'RegionDataType',
  'RegionFlags',
  'TransducerFrequency',
];
