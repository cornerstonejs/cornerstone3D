import { MetadataModules } from '../enums';
import { addTypedProvider, toLowerCamelTag } from '../metaData';

/**
 * Converts the calibration object if any to lower case
 */
export function calibrationModuleProvider(next, query, data, options) {
  if (!data) {
    return next(query, data, options);
  }
  if (!data.SequenceOfUltrasoundRegions?.length) {
    return;
  }
  const { SequenceOfUltrasoundRegions } = data;
  const sequenceOfUltrasoundRegions = [];

  for (const sequenceItem of SequenceOfUltrasoundRegions) {
    const newItem = {};
    sequenceOfUltrasoundRegions.push(newItem);
    for (const [key, value] of Object.entries(sequenceItem)) {
      newItem[toLowerCamelTag(key)] = value;
    }
  }
  return {
    sequenceOfUltrasoundRegions,
  };
}

addTypedProvider(MetadataModules.CALIBRATION, calibrationModuleProvider);
